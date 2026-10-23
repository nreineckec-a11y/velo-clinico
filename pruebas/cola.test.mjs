// Cola de casos del modo automático: reintentos, reanudar tras un cierre, varios casos a la vez y borrado.
// La "IA" se intercepta (nada sale a internet). Requiere Playwright y Chromium (npm install); sin ellos se saltan.
// Todos los datos son ficticios.
import test from "node:test";
import assert from "node:assert/strict";
import {saltar, abrir, AJ_CLAUDE, RESPUESTA_CLAUDE, archivoTexto, RAIZ_APP, estados, esperar, esperarCasos, guardados, compuerta} from "./navegador.mjs";

const CASO = "Paciente: Juan Pérez Soto, RUT 12.345.678-5. Creatinina 1,1 mg/dL. Fecha de toma: 12/03/2025.";
const rapido = pg => pg.evaluate(() => { window.__velo.esperaBase = 20; });   // reintentos en ms, no en segundos

test("un corte de conexión se reintenta solo y el caso se completa", {skip: saltar}, async () => {
  const pg = await abrir(AJ_CLAUDE, (e, n) => n <= 2 ? {cortar: true} : RESPUESTA_CLAUDE);
  await rapido(pg);
  await pg.setInputFiles("#adjuntoAuto", archivoTexto(CASO));
  await esperarCasos(pg);
  assert.deepEqual(await estados(pg), ["Listo"]);
  assert.equal(pg.envios.length, 3);
  assert.ok(pg.envios.every(e => e.cuerpo.messages[0].content === pg.envios[0].cuerpo.messages[0].content), "cada reintento envía lo mismo");
  await pg.context().close();
});

test("tras 3 reintentos queda en «Error» con «Reintentar»; un error del servidor también se reintenta", {skip: saltar}, async () => {
  let caida = true;
  const pg = await abrir(AJ_CLAUDE, (e, n) => caida ? (n % 2 ? {cortar: true} : {status: 503, json: {error: {type: "overloaded_error"}}}) : RESPUESTA_CLAUDE);
  await rapido(pg);
  await pg.setInputFiles("#adjuntoAuto", archivoTexto(CASO));
  await esperarCasos(pg);
  assert.deepEqual(await estados(pg), ["Error"]);
  assert.equal(pg.envios.length, 4, "1 intento y 3 reintentos");
  caida = false;
  await pg.click("[data-reintentar]");
  await esperarCasos(pg);
  assert.deepEqual(await estados(pg), ["Listo"]);
  await pg.context().close();
});

test("una clave inválida no se reintenta: queda en «Error» de inmediato", {skip: saltar}, async () => {
  const pg = await abrir(AJ_CLAUDE, () => ({status: 401, json: {error: {type: "authentication_error", message: "invalid x-api-key"}}}));
  await rapido(pg);
  await pg.setInputFiles("#adjuntoAuto", archivoTexto(CASO));
  await esperarCasos(pg);
  assert.deepEqual(await estados(pg), ["Error"]);
  assert.equal(pg.envios.length, 1);
  await pg.context().close();
});

test("si la app se cierra esperando la respuesta, al abrirla de nuevo se envía lo mismo y se completa", {skip: saltar}, async () => {
  const g = compuerta();
  const pg = await abrir(AJ_CLAUDE, (e, n) => n === 1 ? g.espera() : RESPUESTA_CLAUDE);
  await pg.setInputFiles("#adjuntoAuto", archivoTexto(CASO));
  await esperar(pg, () => /Enviado/.test(document.querySelector(".caso-auto .insignia").textContent));
  const antes = await guardados(pg);
  assert.equal(antes.length, 1); assert.equal(antes[0].estado, "enviado"); assert.equal(antes[0].fotos, 0);
  await pg.reload();                       // iOS cerró la app
  await esperarCasos(pg);
  assert.deepEqual(await estados(pg), ["Listo"]);
  assert.equal(pg.envios.length, 2);
  assert.equal(pg.envios[1].cuerpo.messages[0].content, pg.envios[0].cuerpo.messages[0].content);
  assert.match(await pg.textContent(".caso-auto .resp"), /Resumen de Juan Pérez Soto: neumonía\./);
  const despues = await guardados(pg);
  assert.equal(despues[0].estado, "listo"); assert.ok(despues[0].tieneRespuesta);
  g.soltar(); await pg.context().close();
});

test("si la app se cierra mientras lee la foto, al abrirla se vuelve a leer desde la foto guardada", {skip: saltar}, async () => {
  const pg = await abrir(AJ_CLAUDE);
  await pg.setInputFiles("#adjuntoAuto", RAIZ_APP + "pruebas/epicrisis/pagina1.jpg");
  await esperar(pg, () => /Procesando/.test(document.querySelector(".caso-auto .insignia").textContent));
  const antes = await guardados(pg);
  assert.equal(antes[0].estado, "procesando"); assert.equal(antes[0].fotos, 1, "la foto debe quedar guardada hasta leerla");
  await pg.reload();
  await esperarCasos(pg);
  assert.deepEqual(await estados(pg), ["Listo"]);
  assert.equal(pg.envios.length, 1);
  assert.match(pg.envios[0].cuerpo.messages[0].content, /edad: 79 años/);
  // Ya leída y anonimizada, la foto no se guarda más
  assert.equal((await guardados(pg))[0].fotos, 0);
  await pg.context().close();
});

test("se puede fotografiar el siguiente caso mientras el anterior se procesa", {skip: saltar}, async () => {
  const g = compuerta();
  const pg = await abrir(AJ_CLAUDE, () => g.espera());
  await pg.setInputFiles("#adjuntoAuto", archivoTexto(CASO));
  await esperar(pg, () => /Enviado/.test(document.querySelector(".caso-auto .insignia").textContent));
  await pg.click("#btnCamara");
  await esperar(pg, () => !document.querySelector("#camDisparo").disabled);
  await pg.click("#camDisparo");
  await esperar(pg, () => document.querySelectorAll("#camMini img").length === 1);
  await pg.click("#camListo");
  await esperar(pg, () => document.querySelectorAll(".caso-auto").length === 2 && /Enviado/.test(document.querySelector(".caso-auto .insignia").textContent));
  assert.deepEqual(await estados(pg), ["Enviado", "Enviado"]);
  g.soltar();
  await esperarCasos(pg, 2);
  assert.deepEqual(await estados(pg), ["Listo", "Listo"]);
  assert.equal(pg.envios.length, 2);
  await pg.context().close();
});

test("una captura interrumpida no se pierde: al volver, «Procesar» la envía", {skip: saltar}, async () => {
  const pg = await abrir(AJ_CLAUDE);
  await pg.click("#btnCamara");
  await esperar(pg, () => !document.querySelector("#camDisparo").disabled);
  await pg.click("#camDisparo");
  await esperar(pg, () => document.querySelectorAll("#camMini img").length === 1);
  for (let i = 0; i < 50 && !(await guardados(pg)).length; i++) await pg.waitForTimeout(50);
  assert.equal((await guardados(pg))[0].estado, "capturando");
  await pg.reload();
  await esperar(pg, () => !!document.querySelector("[data-procesar]"));
  assert.deepEqual(await estados(pg), ["Capturando"]);
  assert.equal(pg.envios.length, 0, "una captura a medias no se envía sola");
  await pg.click("[data-procesar]");
  await esperarCasos(pg);
  assert.deepEqual(await estados(pg), ["Listo"]);
  await pg.context().close();
});

test("«Borrar» (con un segundo toque) quita el caso también del dispositivo; «Cancelar» en la cámara no deja nada", {skip: saltar}, async () => {
  const pg = await abrir(AJ_CLAUDE);
  await pg.setInputFiles("#adjuntoAuto", archivoTexto(CASO));
  await esperarCasos(pg);
  await pg.click("[data-borrar]");
  assert.equal((await estados(pg)).length, 1, "el primer toque solo pide confirmar");
  await pg.click("[data-borrar]");
  assert.deepEqual(await estados(pg), []);
  assert.deepEqual(await guardados(pg), []);
  await pg.click("#btnCamara");
  await esperar(pg, () => !document.querySelector("#camDisparo").disabled);
  await pg.click("#camDisparo");
  await esperar(pg, () => document.querySelectorAll("#camMini img").length === 1);
  await pg.click("#camCancelar");
  // (el borrado en el dispositivo es asíncrono: se espera a que quede hecho antes de cerrar la app)
  for (let i = 0; i < 50 && (await guardados(pg)).length; i++) await pg.waitForTimeout(50);
  assert.deepEqual(await guardados(pg), []);
  await pg.reload();
  await pg.waitForTimeout(500);
  assert.deepEqual(await estados(pg), []);
  assert.deepEqual(await guardados(pg), []);
  assert.deepEqual(pg.errores, []);
  await pg.context().close();
});

test("sin saldo en la cuenta de API: mensaje claro en español, sin reintentos; «Reintentar» envía lo mismo cuando hay saldo", {skip: saltar}, async () => {
  for (const [prov, aj, sinSaldo, ok] of [
    ["claude", AJ_CLAUDE, {status: 400, json: {type: "error", error: {type: "invalid_request_error", message: "Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits."}}}, RESPUESTA_CLAUDE],
    ["openai", {auto: true, provV2: true, prov: "openai", claves: {openai: "sk-prueba"}, recordar: true, tarea: "exam"},
      {status: 429, json: {error: {message: "You exceeded your current quota, please check your plan and billing details.", type: "insufficient_quota", code: "insufficient_quota"}}},
      {status: 200, json: {choices: [{message: {content: "Listo."}, finish_reason: "stop"}]}}]]){
    let saldo = false;
    const pg = await abrir(aj, () => saldo ? ok : sinSaldo);
    await rapido(pg);
    await pg.setInputFiles("#adjuntoAuto", archivoTexto(CASO));
    await esperarCasos(pg);
    assert.deepEqual(await estados(pg), ["Error"], prov);
    assert.equal(pg.envios.length, 1, prov + ": sin saldo no se reintenta solo");
    const msg = await pg.textContent(".caso-auto .estado.error");
    assert.match(msg, /no tiene saldo/, prov);
    assert.doesNotMatch(msg, /credit balance|quota/i, prov + ": el mensaje va en español");
    saldo = true;
    await pg.click("[data-reintentar]");
    await esperarCasos(pg);
    assert.deepEqual(await estados(pg), ["Listo"], prov);
    assert.equal(pg.envios[1].cuerpo.messages[0].content, pg.envios[0].cuerpo.messages[0].content);
    await pg.context().close();
  }
});
