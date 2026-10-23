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
  assert.equal(avisos, '{listo: "Análisis listo", revision: "Un caso requiere revisión", error: "Un caso no se pudo completar"}');
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
  await pg.setInputFiles("#adjuntoAuto", archivoTexto("Documento 12 345 678-5 de Juan Pérez Soto."));
  await esperarCasos(pg, 2);
  const vs = await avisos(pg);
  assert.deepEqual(vs.map(v => v.titulo), ["Un caso requiere revisión"]);
  assert.deepEqual(conDatos(JSON.stringify(vs)), []);
  await pg.context().close();
});

test("lo guardado en el teléfono: lo enviado y la respuesta van anonimizados; los datos reales solo en los marcadores", {skip: saltar}, async () => {
  const pg = await abrir(AJ_CLAUDE);
  await pg.setInputFiles("#adjuntoAuto", archivoTexto(CASO));
  await esperarCasos(pg);
  const registro = await pg.evaluate(() => new Promise(ok => {
    const rq = indexedDB.open("velo", 1);
    rq.onsuccess = () => { const g = rq.result.transaction("casos").objectStore("casos").getAll(); g.onsuccess = () => ok(g.result[0]); };
  }));
  const {mapa, ...resto} = registro;
  assert.deepEqual(conDatos(JSON.stringify(resto)), [], "fuera de los marcadores no debe quedar ningún dato real");
  assert.equal(resto.archivos, null, "sin fotos");
  assert.ok(Object.values(mapa).some(v => /Juan Pérez Soto/.test(v)), "los marcadores permiten mostrar la respuesta con los datos reales");
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
