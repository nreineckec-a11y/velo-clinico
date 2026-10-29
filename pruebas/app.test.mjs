// Pruebas de la app en un navegador (sin fotos): el validador final antes de copiar o enviar.
// Requiere Playwright y Chromium (npm install); sin ellos se saltan. Todos los datos son ficticios.
import test from "node:test";
import assert from "node:assert/strict";
import {saltar, abrir as abrirApp} from "./navegador.mjs";

// (estas pruebas son del modo manual)
async function abrir(antes){
  const pg = await abrirApp({auto: false});
  if (antes) await pg.evaluate(antes);
  return pg;
}
async function escribir(pg, texto){
  await pg.fill("#entrada", texto);
  await pg.waitForTimeout(500);   // la vista previa se recalcula 250 ms después de escribir
}
// Un celular con el 0 de antes y sin rótulo: el anonimizador lo deja pasar; el validador no
const CASO = "Documento del paciente 09 8765 4321, viene a control el 12/03/2025.";

test("el validador oculta lo que se le escapó al anonimizador antes de copiar", {skip: saltar}, async () => {
  const pg = await abrir();
  await escribir(pg, CASO);
  const previa = await pg.textContent("#previa");
  assert.ok(previa.includes("[TELEFONO_1]") && !previa.includes("8765 4321"), previa);
  assert.ok(previa.includes("12/03/2025"), "la fecha clínica debería quedar a la vista");
  assert.equal(await pg.isDisabled("#copiarAnon"), false);
  await pg.click("#copiarAnon");
  const enviado = await pg.evaluate(() => __velo.caso().turnos[0].anon);
  assert.ok(enviado.includes("Documento del paciente [TELEFONO_1], viene a control el 12/03/2025.") && !enviado.includes("8765 4321"), enviado);
  assert.deepEqual(pg.errores, []);
  await pg.context().close();
});

test("si el residuo persiste: «Requiere revisión», no se puede copiar ni enviar", {skip: saltar}, async () => {
  const pg = await abrir(() => { window.__velo.rondas = 0; });   // simula que volver a ocultar no bastó
  await escribir(pg, CASO);
  const estado = await pg.textContent("#estado");
  assert.match(estado, /^Requiere revisión: quedó a la vista Teléfono «09 8765 4321»/);
  assert.equal(await pg.isDisabled("#copiarAnon"), true);
  // Aunque se fuerce el toque, no se arma ningún mensaje
  await pg.evaluate(() => { const b = document.querySelector("#copiarAnon"); b.disabled = false; b.click(); });
  await pg.waitForTimeout(200);
  assert.equal(await pg.evaluate(() => __velo.caso().turnos.length), 0);
  assert.deepEqual(pg.errores, []);
  await pg.context().close();
});

test("modo manual: elegir el prompt sigue igual; se cuenta su uso al copiar", {skip: saltar}, async () => {
  const pg = await abrir();
  await pg.click('#tareas [data-t="cert"]');
  await escribir(pg, "Certificado de reposo. Paciente: Juan Pérez Soto, 3 días.");
  await pg.click("#copiarAnon");
  assert.match(await pg.evaluate(() => __velo.caso().turnos[0].anon), /INSTRUCCIONES DEL PROYECTO «CERTIFICADOS»/);
  assert.deepEqual(await pg.evaluate(() => JSON.parse(localStorage.getItem("velo_ajustes")).usos), {cert: 1});
  await pg.context().close();
});
