// Privacidad: avisos genéricos, borrado automático, fotos originales y nada de registros (logs) ni envíos que no sean
// la consulta ya anonimizada. Las pruebas en el navegador requieren Playwright y Chromium (npm install); sin ellos se
// saltan. Todos los datos son ficticios.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {saltar, abrir, AJ_CLAUDE, RESPUESTA_CLAUDE, archivoTexto, RAIZ_APP, estados, esperar, esperarCasos, guardados, compuerta} from "./navegador.mjs";

const leer = f => fs.readFileSync(RAIZ_APP + f, "utf8");
const HTML = leer("index.html"), SW = leer("sw.js");
// Datos ficticios del caso que nunca deben aparecer donde no corresponde
const CASO = "Paciente: Juan Pérez Soto, RUT 12.345.678-5, fono +56 9 8765 4321. Creatinina 1,1 mg/dL. Fecha de toma: 12/03/2025.";
const DATOS = ["Juan", "Pérez", "Soto", "12.345.678", "8765"];
const conDatos = t => DATOS.filter(d => String(t).includes(d));

/* ---------- en el código ---------- */
test("ningún registro (console), baliza, socket ni analítica; una sola consulta de red (a la IA elegida)", () => {
  for (const [nombre, t] of [["index.html", HTML], ["sw.js", SW]]){
    assert.deepEqual(t.match(/\bconsole\s*\.\s*\w+\s*\(/g) || [], [], nombre + ": no debe escribir en la consola");
    assert.doesNotMatch(t, /sendBeacon|new\s+WebSocket|XMLHttpRequest|EventSource|google-analytics|googletagmanager|gtag\(|sentry|mixpanel|amplitude/i, nombre);
  }
  assert.equal((HTML.match(/\bfetch\s*\(/g) || []).length, 1, "index.html: un solo fetch, el de viaAPI");
  // El service worker no guarda en caché nada que no sea de la propia app (ni las consultas ni las respuestas)
  assert.match(SW, /new URL\(r\.url\)\.origin !== location\.origin\) return/);
  // pdf.js en silencio (sus advertencias irían a la consola)
  assert.equal((HTML.match(/getDocument\(\{[^}]*\}/g) || []).filter(x => !/verbosity\s*:\s*0/.test(x)).length, 0);
});

test("la página solo puede conectarse a las APIs de Claude, OpenAI y Gemini", () => {
  const csp = HTML.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)[1];
  const connect = csp.split(";").map(x => x.trim()).find(x => x.startsWith("connect-src"));
  assert.equal(connect, "connect-src 'self' https://api.anthropic.com https://api.openai.com https://generativelanguage.googleapis.com");
});

test("el aviso del sistema usa solo textos fijos, sin datos del caso", () => {
  const avisos = HTML.match(/const AVISOS = (\{[^}]+\})/)[1];
  assert.equal(avisos, '{listo: "Análisis listo", compartir: "Caso listo para compartir", revision: "Un caso requiere revisión", error: "Un caso no se pudo completar"}');
  // Las dos formas de mostrar el aviso reciben ese título y nada más de texto (sin body)
  const usos = HTML.match(/(?:showNotification|new Notification)\([^)]*\)/g);
  assert.deepEqual(usos, ["showNotification(titulo, op)", "new Notification(titulo, op)"]);
  assert.match(HTML, /const titulo = AVISOS\[c\.estado\]; if \(!titulo\) return;/);
  assert.match(HTML, /const op = \{tag: "velo-" \+ c\.id, icon: "icon-192\.png", badge: "icon-192\.png", lang: "es-CL"\};/);
});

/* ---------- en el navegador ---------- */
// Permiso de avisos concedido y la app "en segundo plano": se registra lo que se mostraría
const AVISOS_SIMULADOS = () => {
  window.__avisos = [];
  const registrar = (titulo, op) => window.__avisos.push({titulo, op: JSON.parse(JSON.stringify(op || {}))});
  window.Notification = function(t, o){ registrar(t, o); };
  window.Notification.permission = "granted";
  window.Notification.requestPermission = async () => "granted";
  Object.defineProperty(navigator, "serviceWorker", {value: {getRegistration: async () => ({showNotification: async (t, o) => registrar(t, o)}), register: async () => ({})}});
  let visible = "visible";
  Object.defineProperty(document, "visibilityState", {get: () => visible});
  window.__ocultar = () => { visible = "hidden"; };
};
const avisos = pg => pg.evaluate(() => window.__avisos);

test("al terminar con la app en segundo plano: aviso «Análisis listo», sin ningún dato", {skip: saltar}, async () => {
  const g = compuerta();
  const pg = await abrir(AJ_CLAUDE, () => g.espera(), AVISOS_SIMULADOS);
  await pg.setInputFiles("#adjuntoAuto", archivoTexto(CASO));
  await esperar(pg, () => /Enviado/.test(document.querySelector(".caso-auto .insignia").textContent));
  await pg.evaluate(() => window.__ocultar());   // el médico bloqueó el teléfono o pasó a otra app
  g.soltar();
  await esperarCasos(pg);
  const vs = await avisos(pg);
  assert.equal(vs.length, 1);
  assert.equal(vs[0].titulo, "Análisis listo");
  assert.equal(vs[0].op.body, undefined, "sin texto adicional");
  assert.deepEqual(conDatos(JSON.stringify(vs)), []);
  await pg.context().close();
});

test("«Requiere revisión» también avisa, con su texto fijo; con la app a la vista no hay aviso del sistema", {skip: saltar}, async () => {
  const pg = await abrir(AJ_CLAUDE, null, AVISOS_SIMULADOS);
  await pg.setInputFiles("#adjuntoAuto", archivoTexto(CASO));
  await esperarCasos(pg);
  assert.deepEqual(await avisos(pg), [], "a la vista basta el mensaje en pantalla");
  await pg.evaluate(() => { window.__velo.rondas = 0; window.__ocultar(); });
  await pg.setInputFiles("#adjuntoAuto", archivoTexto("Documento 09 8765 4321 de Juan Pérez Soto."));
  await esperarCasos(pg, 2);
  const vs = await avisos(pg);
  assert.deepEqual(vs.map(v => v.titulo), ["Un caso requiere revisión"]);
  assert.deepEqual(conDatos(JSON.stringify(vs)), []);
  await pg.context().close();
});

test("lo guardado en el teléfono va cifrado: ningún dato ni texto a la vista; la app lo descifra al volver a abrirse", {skip: saltar}, async () => {
  const pg = await abrir(AJ_CLAUDE);
  await pg.setInputFiles("#adjuntoAuto", archivoTexto(CASO));
  await esperarCasos(pg);
  const [crudo] = await pg.evaluate(() => window.__velo.crudos());
  // En IndexedDB no queda ni lo enviado, ni la respuesta, ni los marcadores con los datos reales: solo bytes cifrados
  assert.equal(crudo.cifrado, true);
  for (const k of ["enviado", "respuesta", "mapa", "fechasOcultas", "residuos"]) assert.equal(crudo[k], undefined, k);
  assert.deepEqual(conDatos(JSON.stringify(crudo)), []);
  assert.doesNotMatch(JSON.stringify(crudo), /Creatinina|NOMBRE_1/);
  assert.equal(crudo.archivos, null, "sin fotos");
  // La llave no se puede exportar (ni la propia página puede leerla)
  const exportable = await pg.evaluate(() => new Promise(ok => {
    const rq = indexedDB.open("velo");
    rq.onsuccess = () => { const g = rq.result.transaction("llaves").objectStore("llaves").get("casos"); g.onsuccess = () => crypto.subtle.exportKey("raw", g.result.llave).then(() => ok(true), () => ok(false)); };
  }));
  assert.equal(exportable, false);
  // Al volver a abrir la app, el caso se descifra y la respuesta se ve con los datos reales
  const [c] = await pg.evaluate(() => window.__velo.guardados());
  assert.ok(Object.values(c.mapa).some(v => /Juan Pérez Soto/.test(v)), JSON.stringify(c.mapa));
  await pg.reload();
  await esperarCasos(pg);
  assert.deepEqual(await estados(pg), ["Listo"]);
  assert.deepEqual(pg.errores, []);
  await pg.context().close();
});

test("borrado automático de los casos terminados a las 24 h (el plazo se cambia en Ajustes)", {skip: saltar}, async () => {
  const pg = await abrir(AJ_CLAUDE);
  await pg.setInputFiles("#adjuntoAuto", archivoTexto(CASO));
  await esperarCasos(pg);
  await pg.evaluate(() => { window.__velo.adelanto = 23 * 3600 * 1000; window.__velo.limpiar(); });
  assert.deepEqual(await estados(pg), ["Listo"], "a las 23 h sigue");
  await pg.evaluate(() => { window.__velo.adelanto = 25 * 3600 * 1000; window.__velo.limpiar(); });
  assert.deepEqual(await estados(pg), []);
  for (let i = 0; i < 50 && (await guardados(pg)).length; i++) await pg.waitForTimeout(50);
  assert.deepEqual(await guardados(pg), []);
  // «No borrarlos»: quedan
  await pg.click("#btnAjustes"); await pg.selectOption("#ajPlazo", "0"); await pg.click("#ajCerrar");
  await pg.setInputFiles("#adjuntoAuto", archivoTexto(CASO));
  await esperarCasos(pg);
  await pg.evaluate(() => { window.__velo.adelanto = 400 * 24 * 3600 * 1000; window.__velo.limpiar(); });
  assert.deepEqual(await estados(pg), ["Listo"]);
  await pg.context().close();
});

test("fotos originales: por omisión se borran al anonimizar; con «Conservar» quedan solo en el teléfono y nunca se envían", {skip: saltar}, async () => {
  const pg = await abrir(Object.assign({}, AJ_CLAUDE, {conservarFotos: true}));
  await pg.setInputFiles("#adjuntoAuto", RAIZ_APP + "pruebas/epicrisis/pagina1.jpg");
  await esperarCasos(pg);
  assert.deepEqual(await estados(pg), ["Listo"]);
  assert.equal((await guardados(pg))[0].fotos, 1);
  assert.match(await pg.textContent(".caso-auto"), /Fotos originales \(solo en este teléfono\)/);
  assert.equal(typeof pg.envios[0].cuerpo.messages[0].content, "string", "solo texto");
  assert.ok(!/data:image|base64/.test(JSON.stringify(pg.envios[0].cuerpo)), "ninguna imagen en lo enviado");
  // «Borrar todos los casos» (con un segundo toque) también las borra
  await pg.click("#btnAjustes"); await pg.click("#ajBorrarCasos"); await pg.click("#ajBorrarCasos"); await pg.click("#ajCerrar");
  for (let i = 0; i < 50 && (await guardados(pg)).length; i++) await pg.waitForTimeout(50);
  assert.deepEqual(await guardados(pg), []);
  assert.deepEqual(pg.errores, []);
  await pg.context().close();
});

/* ---------- protección de datos: aviso, avisos de cada proveedor y registro de envíos ---------- */
test("registro de envíos: anota fecha, destino, prompt y cuántos datos se ocultaron, sin ningún dato del paciente", {skip: saltar}, async () => {
  const pg = await abrir(AJ_CLAUDE);
  await pg.setInputFiles("#adjuntoAuto", archivoTexto(CASO));
  await esperarCasos(pg);
  const reg = await pg.evaluate(() => JSON.parse(localStorage.getItem("velo_registro") || "[]"));
  assert.equal(reg.length, 1);
  assert.deepEqual(conDatos(JSON.stringify(reg)), [], JSON.stringify(reg));
  assert.equal(reg[0].modo, "automático");
  assert.equal(reg[0].destino, "Claude (API)");
  assert.equal(reg[0].prompt, "Transcriptor de exámenes");
  assert.ok(reg[0].ocultos.NOMBRE >= 1 && reg[0].ocultos.RUT === 1 && reg[0].ocultos.TELEFONO === 1, JSON.stringify(reg[0].ocultos));
  // En Ajustes se ve y se descarga como CSV (también sin datos)
  await pg.click("#btnAjustes");
  assert.match(await pg.textContent("#ajRegistroInfo"), /1 envío/);
  const [descarga] = await Promise.all([pg.waitForEvent("download"), pg.click("#ajRegistroBajar")]);
  const csv = fs.readFileSync(await descarga.path(), "utf8");
  assert.match(csv, /"fecha";"modo";"destino";"prompt";"imagenes";"ocultos_nombre"/);
  assert.match(csv, /"automático";"Claude \(API\)";"Transcriptor de exámenes";"0"/);
  assert.deepEqual(conDatos(csv), []);
  // Borrar pide un segundo toque
  await pg.click("#ajRegistroBorrar"); await pg.click("#ajRegistroBorrar");
  assert.equal(await pg.evaluate(() => localStorage.getItem("velo_registro")), null);
  assert.deepEqual(pg.errores, []);
  await pg.context().close();
});

test("aviso de privacidad: se abre desde el pie y desde Ajustes, con el marco legal y qué sale del dispositivo", {skip: saltar}, async () => {
  const pg = await abrir(AJ_CLAUDE);
  await pg.click("#pieAutoPrivacidad");
  assert.equal(await pg.isVisible("#privacidad"), true);
  const t = await pg.textContent("#privacidad");
  for (const x of ["Ley 21.719", "Ley 19.628", "Ley 20.584", "Estados Unidos", "Requiere revisión", "no es asesoría legal"]) assert.ok(t.includes(x), x);
  await pg.click("#pvCerrar");
  assert.equal(await pg.isVisible("#privacidad"), false);
  await pg.click("#btnAjustes"); await pg.click("#ajPrivacidad");
  assert.equal(await pg.isVisible("#privacidad"), true);
  assert.deepEqual(pg.errores, []);
  await pg.context().close();
});

test("cada proveedor avisa qué hace con lo enviado, también los que no usan clave", {skip: saltar}, async () => {
  const pg = await abrir({auto: true, provV2: true, prov: "compartir", tarea: "exam"});
  await pg.click("#btnAjustes");
  assert.match(await pg.textContent("#ajProvNota"), /no use tus conversaciones para entrenar/);
  assert.equal(await pg.isVisible("#ajProvNota"), true);
  for (const [p, rx] of [["claude", /no se usa para entrenar/], ["openai", /no usa lo enviado para entrenar/], ["gemini", /nivel gratuito/]]){
    await pg.selectOption("#ajProv", p);
    assert.match(await pg.textContent("#ajProvNota"), rx, p);
  }
  await pg.context().close();
});

test("la versión de la app en el aviso es la del service worker", () => {
  assert.equal(HTML.match(/const VERSION_APP = "([^"]+)"/)[1], SW.match(/const CACHE = "([^"]+)"/)[1]);
});

test("un caso guardado antes del cifrado se vuelve a guardar cifrado al abrir la app", {skip: saltar}, async () => {
  const pg = await abrir(AJ_CLAUDE);
  await pg.evaluate(() => new Promise(ok => {
    const rq = indexedDB.open("velo");
    rq.onsuccess = () => { const tx = rq.result.transaction("casos", "readwrite");
      tx.objectStore("casos").put({id: "viejo-1", n: 1, creado: Date.now(), terminado: Date.now(), estado: "listo", prov: "claude", tarea: "exam",
        enviado: "Resumen de [NOMBRE_1]", respuesta: "Ok [NOMBRE_1]", mapa: {"[NOMBRE_1]": "Juan Pérez Soto"}, residuos: [], error: "", archivos: null});
      tx.oncomplete = () => { rq.result.close(); ok(); }; };
  }));
  await pg.reload();
  await esperarCasos(pg);
  await pg.waitForFunction(async () => (await window.__velo.crudos()).every(c => c.cifrado));
  const crudos = await pg.evaluate(() => window.__velo.crudos());
  assert.equal(crudos.length, 1);
  assert.deepEqual(conDatos(JSON.stringify(crudos)), []);
  await pg.context().close();
});

test("modo institucional: una vía sin contrato no envía nada; con contrato, el caso sigue", {skip: saltar}, async () => {
  const pg = await abrir(Object.assign({}, AJ_CLAUDE, {inst: true, vias: []}));
  assert.match(await pg.textContent("#autoInfo"), /no está entre las vías contratadas/);
  await pg.setInputFiles("#adjuntoAuto", archivoTexto(CASO));
  await esperarCasos(pg);
  assert.deepEqual(await estados(pg), ["Error"]);
  assert.match(await pg.textContent(".caso-auto"), /Modo institucional/);
  assert.equal(pg.envios.length, 0, "no debe salir nada");
  // Se marca la vía como contratada en Ajustes: el siguiente caso se envía
  await pg.click("#btnAjustes");
  await pg.check('#ajInstVias [data-via="claude"]');
  await pg.click("#ajCerrar");
  await pg.setInputFiles("#adjuntoAuto", archivoTexto(CASO));
  await esperarCasos(pg, 2);
  assert.ok((await estados(pg)).includes("Listo"), JSON.stringify(await estados(pg)));
  assert.equal(pg.envios.length, 1);
  assert.deepEqual(pg.errores, []);
  await pg.context().close();
});

test("registro de incidentes: no guarda un texto con datos del paciente; sin ellos, se guarda y se descarga", {skip: saltar}, async () => {
  const pg = await abrir(AJ_CLAUDE);
  await pg.click("#btnAjustes"); await pg.click("#ajIncNuevo");
  await pg.fill("#incDesc", "Se envió a la IA el informe de Juan Pérez Soto, RUT 12.345.678-5.");
  await pg.click("#incGuardar");
  assert.match(await pg.textContent("#incEstado"), /No se guardó: quita los datos del paciente/);
  assert.equal(await pg.evaluate(() => localStorage.getItem("velo_incidentes")), null);
  await pg.fill("#incDesc", "En un informe de laboratorio quedó a la vista el apellido del paciente; se envió por API.");
  await pg.fill("#incMedidas", "Se borró la conversación en el proveedor y se informó a la dirección.");
  await pg.check('#incDatos input[value="Nombre"]');
  await pg.click("#incGuardar");
  assert.equal(await pg.isVisible("#incidente"), false);
  assert.match(await pg.textContent("#ajIncInfo"), /1 incidente/);
  const [d] = await Promise.all([pg.waitForEvent("download"), pg.click("#ajIncBajar")]);
  const csv = fs.readFileSync(await d.path(), "utf8");
  assert.match(csv, /"Un dato identificable llegó a la IA";"Nombre";"1";"En un informe de laboratorio/);
  assert.deepEqual(conDatos(csv), []);
  await pg.context().close();
});

test("respaldo de las medidas: configuración, cifrado, autoprueba del anonimizador y registros, sin datos", {skip: saltar}, async () => {
  const pg = await abrir(Object.assign({}, AJ_CLAUDE, {responsable: "CESFAM de prueba", contacto: "delegado@ejemplo.cl", inst: true, vias: ["claude"]}));
  await pg.setInputFiles("#adjuntoAuto", archivoTexto(CASO));
  await esperarCasos(pg);
  await pg.click("#btnAjustes");
  const [d] = await Promise.all([pg.waitForEvent("download"), pg.click("#ajRespaldo")]);
  const t = fs.readFileSync(await d.path(), "utf8");
  for (const x of ["Responsable del tratamiento: CESFAM de prueba", "delegado@ejemplo.cl", "Modo institucional: activo; vías contratadas: Claude por API",
    "AES-GCM 256", "Resultado: todos correctos", "Claude (API): 1", "15 ter", "VELO CLÍNICO"]) assert.ok(t.includes(x), x + "\n" + t);
  assert.deepEqual(conDatos(t), []);
  // El aviso de privacidad muestra versión, fecha y el responsable configurado
  await pg.click("#ajPrivacidad");
  const av = await pg.textContent("#privacidad");
  assert.match(av, /Versión 2\.0 del 4 de noviembre de 2026/);
  assert.ok(av.includes("CESFAM de prueba") && av.includes("delegado@ejemplo.cl") && av.includes("Decisiones automatizadas"));
  assert.deepEqual(pg.errores, []);
  await pg.context().close();
});
