// Modo automático en un navegador: cámara (simulada con las fotos de la epicrisis FICTICIA) → lectura en el
// teléfono → anonimizado → validador → envío (la API del proveedor se intercepta: nada sale a internet) → resultado.
// Requiere Playwright y Chromium (npm install); sin ellos se saltan. Todos los datos son ficticios.
import {test, before, after} from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {cargarMotor} from "./cargar-motor.mjs";

const Anon = cargarMotor();
const RAIZ = fileURLToPath(new URL("..", import.meta.url));
const verdad = JSON.parse(fs.readFileSync(new URL("./epicrisis/verdad.json", import.meta.url), "utf8"));
const ESPERA = 6 * 60 * 1000;
let chromium = null, navegador = null, motivo = "";
try { ({chromium} = await import("playwright")); } catch { motivo = "falta Playwright (npm install)"; }
if (chromium){ try { navegador = await chromium.launch(); } catch { motivo = "no se pudo abrir Chromium"; } }
const saltar = navegador ? false : motivo;

const TIPOS = {".html": "text/html; charset=utf-8", ".js": "text/javascript", ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg",
  ".webmanifest": "application/manifest+json", ".wasm": "application/wasm", ".txt": "text/plain; charset=utf-8"};
let servidor = null, base = "";
before(async () => {
  if (!navegador) return;
  servidor = http.createServer((req, res) => {
    const ruta = decodeURIComponent(new URL(req.url, "http://x").pathname);
    const archivo = path.join(RAIZ, ruta === "/" ? "index.html" : ruta);
    if (!archivo.startsWith(RAIZ) || !fs.existsSync(archivo) || fs.statSync(archivo).isDirectory()){ res.writeHead(404); res.end(); return; }
    res.writeHead(200, {"Content-Type": TIPOS[path.extname(archivo)] || "application/octet-stream"});
    fs.createReadStream(archivo).pipe(res);
  });
  await new Promise(r => servidor.listen(0, "127.0.0.1", r));
  base = "http://127.0.0.1:" + servidor.address().port;
});
after(async () => {
  if (navegador) await navegador.close();
  if (servidor) await new Promise(r => servidor.close(r));
});

/* ---------- ayudas ---------- */
const CORS = {"access-control-allow-origin": "*", "access-control-allow-headers": "*"};
// Abre la app con ajustes guardados y una "IA" que responde lo que diga responder(cuerpo, intento)
async function abrir(ajustes, responder){
  const ctx = await navegador.newContext({viewport: {width: 390, height: 844}});
  const pg = await ctx.newPage();
  pg.errores = []; pg.envios = [];
  pg.on("pageerror", e => pg.errores.push(String(e)));
  // Todo lo que vaya a internet se intercepta; se guarda lo que la app envía
  await ctx.route(u => !u.href.startsWith(base), async rt => {
    const rq = rt.request();
    if (rq.method() === "OPTIONS"){ await rt.fulfill({status: 204, headers: CORS}); return; }
    const envio = {url: rq.url(), headers: rq.headers(), cuerpo: JSON.parse(rq.postData() || "null")};
    pg.envios.push(envio);
    const r = responder ? responder(envio, pg.envios.length) : {status: 200, json: {content: [{type: "text", text: "Resumen de [NOMBRE_1]: neumonía."}], stop_reason: "end_turn"}};
    await rt.fulfill({status: r.status, contentType: "application/json", headers: CORS, body: JSON.stringify(r.json)});
  });
  // Cámara simulada: un lienzo con la foto que se elija (window.__foto(url)), como si el teléfono apuntara a la hoja
  await pg.addInitScript(() => {
    const c = document.createElement("canvas"), g = c.getContext("2d"); let img = null;
    window.__foto = url => new Promise(ok => { const im = new Image(); im.onload = () => { img = im; c.width = im.naturalWidth; c.height = im.naturalHeight; g.drawImage(im, 0, 0); ok(); }; im.src = url; });
    setInterval(() => { if (img) g.drawImage(img, 0, 0); }, 100);
    navigator.mediaDevices.getUserMedia = async () => { if (!img) await window.__foto("/pruebas/epicrisis/pagina1.jpg"); return c.captureStream(10); };
  });
  await pg.addInitScript(a => localStorage.setItem("velo_ajustes", JSON.stringify(a)), ajustes);
  await pg.goto(base + "/index.html?prueba");
  return pg;
}
const AJ_CLAUDE = {auto: true, prov: "claude", claves: {claude: "sk-ant-prueba"}, recordar: true, tarea: "exam"};
const estadoCaso = pg => pg.evaluate(() => { const e = document.querySelector(".caso-auto .insignia"); return e ? e.textContent : ""; });
const esperarCaso = pg => pg.waitForFunction(() => { const e = document.querySelector(".caso-auto .insignia"); return e && /Listo|Error|revisión/.test(e.textContent); }, null, {timeout: ESPERA, polling: 250});
// Palabras de nombres y números (5 o más cifras) de los datos de la página que aparecen en un texto
function datosEn(texto, paginas){
  const norm = s => Anon.plegar(String(s)).replace(/[^\p{L}\p{N}]/gu, "");
  const palabras = new Set((texto.match(/[\p{L}\p{N}][\p{L}\p{N}.\-\/]*/gu) || []).map(norm));
  // Cada número con sus separadores ("6.482.917-3", "17/06/1946", "12 345 678") pasa a solo cifras
  const sinMarcas = texto.replace(/\[[A-Z]+_\d+\]/g, " ");
  const cifras = " " + [...sinMarcas.matchAll(/\d(?:[\d.\-\/]|\s(?=\d{3}\b))*\d|\d/g)].map(m => m[0].replace(/\D/g, "")).join(" ") + " ";
  const out = new Set();
  for (const n of paginas) for (const m of verdad.paginas[n].marcas.filter(m => m.tipo === "dato")){
    const d = m.texto.replace(/\D/g, "");
    if (d.length >= 5 ? cifras.includes(d) : palabras.has(norm(m.texto)) && norm(m.texto).length >= 4) out.add(m.texto);
  }
  return [...out];
}

test("el detector de datos de estas pruebas sí los encuentra (control)", () => {
  assert.deepEqual(datosEn("Paciente HUMBERTO TRECAHUEL, RUN 6.482.917-3, nacido el 17/06/1946", [0]).sort(), ["17/06/1946", "6.482.917-3", "6482917-3", "HUMBERTO", "TRECAHUEL"].sort());
});

/* ---------- 1. De la cámara al resultado sin tocar la pantalla ---------- */
test("cámara con 2 páginas → «Listo» → lectura, anonimizado, validador, envío y resultado, sin confirmaciones", {skip: saltar}, async () => {
  const pg = await abrir(AJ_CLAUDE);
  assert.equal(await pg.isVisible("#bloqueAuto"), true);
  assert.equal(await pg.isVisible("#entrada"), false, "con el modo automático, la pantalla manual no se muestra");
  await pg.click("#btnCamara");
  await pg.waitForFunction(() => !document.querySelector("#camDisparo").disabled);
  await pg.click("#camDisparo");
  await pg.waitForFunction(() => document.querySelectorAll("#camMini img").length === 1);
  await pg.evaluate(() => window.__foto("/pruebas/epicrisis/pagina2.jpg"));
  await pg.waitForTimeout(300);
  await pg.click("#camDisparo");
  await pg.waitForFunction(() => document.querySelectorAll("#camMini img").length === 2);
  await pg.click("#camListo");
  assert.equal(await pg.isVisible("#camara"), false);
  await esperarCaso(pg);
  assert.equal(await estadoCaso(pg), "Listo", await pg.textContent("#casos"));
  assert.equal(await pg.isVisible("#editor"), false, "no debe abrirse el editor de imágenes");

  // Lo que salió: un solo envío, solo texto (ninguna imagen), al modelo elegido
  assert.equal(pg.envios.length, 1);
  const {url, headers, cuerpo} = pg.envios[0];
  assert.equal(url, "https://api.anthropic.com/v1/messages");
  assert.equal(headers["x-api-key"], "sk-ant-prueba");
  assert.equal(headers["anthropic-dangerous-direct-browser-access"], "true");
  assert.equal(cuerpo.model, "claude-opus-5-5");
  assert.deepEqual(cuerpo.output_config, {effort: "high"});
  assert.equal(cuerpo.fallbacks, "default");
  assert.equal(cuerpo.messages.length, 1);
  const enviado = cuerpo.messages[0].content;
  assert.equal(typeof enviado, "string", "solo texto: ninguna imagen");
  assert.deepEqual(datosEn(enviado, [0, 1]), [], "salió un dato identificable:\n" + enviado.slice(enviado.indexOf("=== TEXTO DEL MÉDICO")));
  // La fecha de nacimiento pasó a edad (al 11/11/2025) y las fechas clínicas quedaron
  assert.match(enviado, /edad: 79 años/);
  assert.match(enviado, /11\/11\/2025/);
  assert.match(enviado, /INSTRUCCIONES DEL PROYECTO «TRANSCRIPTOR DE EXÁMENES»/);
  assert.match(enviado, /--- Página 2 ---/);

  // Auditoría: «Ver lo enviado» es exactamente lo enviado; la respuesta se ve con los datos reales
  const visto = await pg.evaluate(() => document.querySelector(".caso-auto details pre").textContent);
  assert.equal(visto, enviado);
  const resp = await pg.textContent(".caso-auto .resp");
  assert.ok(!/\[NOMBRE_1\]/.test(resp) && /Resumen de .+: neumonía/.test(resp), resp);
  // Las imágenes ya no se guardan en el caso
  assert.equal(await pg.evaluate(() => document.querySelectorAll(".caso-auto img").length), 0);
  assert.deepEqual(pg.errores, []);
  await pg.context().close();
});

/* ---------- 2. El validador es la única excepción ---------- */
test("con un residuo que no se puede ocultar, el caso queda en «Requiere revisión» y no se envía", {skip: saltar}, async () => {
  const pg = await abrir(AJ_CLAUDE);
  await pg.evaluate(() => { window.__velo.rondas = 0; });   // simula que volver a ocultar no bastó
  await pg.setInputFiles("#adjuntoAuto", {name: "caso.txt", mimeType: "text/plain", buffer: Buffer.from("Documento del paciente 12 345 678-5, control el 12/03/2025.")});
  await esperarCaso(pg);
  assert.equal(await estadoCaso(pg), "Requiere revisión");
  assert.match(await pg.textContent("#casos"), /quedó a la vista RUT «12 345 678-5»/);
  assert.equal(pg.envios.length, 0, "no debe salir nada");
  assert.equal(await pg.$(".caso-auto details"), null, "no hay nada enviado que ver");
  await pg.context().close();
});

test("lo que el anonimizador deja pasar lo oculta el validador y el caso se envía", {skip: saltar}, async () => {
  const pg = await abrir(AJ_CLAUDE);
  await pg.setInputFiles("#adjuntoAuto", {name: "caso.txt", mimeType: "text/plain", buffer: Buffer.from("Documento del paciente 12 345 678-5, control el 12/03/2025.")});
  await esperarCaso(pg);
  assert.equal(await estadoCaso(pg), "Listo");
  const enviado = pg.envios[0].cuerpo.messages[0].content;
  assert.ok(enviado.includes("Documento del paciente [RUT_1], control el 12/03/2025.") && !enviado.includes("345 678"), enviado);
  await pg.context().close();
});

/* ---------- 3. Errores, otros proveedores y modo manual ---------- */
test("un error del proveedor deja el caso en «Error» con «Reintentar», y al reintentar se completa", {skip: saltar}, async () => {
  const pg = await abrir(AJ_CLAUDE, (e, n) => n === 1 ? {status: 401, json: {error: {type: "authentication_error", message: "invalid x-api-key"}}}
    : {status: 200, json: {content: [{type: "text", text: "Listo."}], stop_reason: "end_turn"}});
  await pg.setInputFiles("#adjuntoAuto", {name: "caso.txt", mimeType: "text/plain", buffer: Buffer.from("Hemoglobina 13,5 g/dL. Fecha de toma: 12/03/2025.")});
  await esperarCaso(pg);
  assert.equal(await estadoCaso(pg), "Error");
  assert.match(await pg.textContent("#casos"), /clave API de Claude no es válida/);
  await pg.click("[data-reintentar]");
  await esperarCaso(pg);
  assert.equal(await estadoCaso(pg), "Listo");
  assert.equal(pg.envios.length, 2);
  assert.equal(pg.envios[0].cuerpo.messages[0].content, pg.envios[1].cuerpo.messages[0].content, "se reenvía exactamente lo mismo");
  await pg.context().close();
});

test("OpenAI y Gemini: cada uno recibe el texto anonimizado con su clave y su modelo", {skip: saltar}, async () => {
  for (const [prov, clave, modelo, url, extraer, respuesta] of [
    ["openai", "sk-prueba", "gpt-prueba", "https://api.openai.com/v1/chat/completions", c => c.messages[0].content,
      {choices: [{message: {content: "Respuesta para [NOMBRE_1]."}, finish_reason: "stop"}]}],
    ["gemini", "AIza-prueba", "gemini-prueba", "https://generativelanguage.googleapis.com/v1beta/models/gemini-prueba:generateContent", c => c.contents[0].parts[0].text,
      {candidates: [{content: {parts: [{text: "Respuesta para [NOMBRE_1]."}]}, finishReason: "STOP"}]}]]){
    const pg = await abrir({auto: true, prov, claves: {[prov]: clave}, modelos: {[prov]: modelo}, recordar: true, tarea: null}, () => ({status: 200, json: respuesta}));
    await pg.setInputFiles("#adjuntoAuto", {name: "caso.txt", mimeType: "text/plain", buffer: Buffer.from("Paciente: Juan Pérez Soto, RUT 12.345.678-5. Creatinina 1,1 mg/dL.")});
    await esperarCaso(pg);
    assert.equal(await estadoCaso(pg), "Listo", prov);
    const {url: u, headers, cuerpo} = pg.envios[0];
    assert.equal(u, url);
    if (prov === "openai"){ assert.equal(headers.authorization, "Bearer sk-prueba"); assert.equal(cuerpo.model, "gpt-prueba"); }
    else assert.equal(headers["x-goog-api-key"], "AIza-prueba");
    const t = extraer(cuerpo);
    assert.ok(t.includes("Paciente: [NOMBRE_1], RUT [RUT_1]. Creatinina 1,1 mg/dL.") && !/P[ée]rez|345\.678/.test(t), t);
    assert.match(await pg.textContent(".caso-auto .resp"), /Respuesta para Juan Pérez Soto\./);
    await pg.context().close();
  }
});

test("con el modo automático apagado, la app manual de siempre (sin cámara ni casos)", {skip: saltar}, async () => {
  const pg = await abrir(Object.assign({}, AJ_CLAUDE, {auto: false}));
  assert.equal(await pg.isVisible("#bloqueAuto"), false);
  assert.equal(await pg.isVisible("#entrada"), true);
  // y el interruptor de Ajustes lo vuelve a encender (queda guardado)
  await pg.click("#btnAjustes");
  await pg.check("#ajAuto");
  await pg.click("#ajCerrar");
  assert.equal(await pg.isVisible("#bloqueAuto"), true);
  assert.equal(await pg.evaluate(() => JSON.parse(localStorage.getItem("velo_ajustes")).auto), true);
  assert.equal(pg.envios.length, 0);
  assert.deepEqual(pg.errores, []);
  await pg.context().close();
});
