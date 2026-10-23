// Pruebas de la app en un navegador (sin fotos): el validador final antes de copiar o enviar.
// Requiere Playwright y Chromium (npm install); sin ellos se saltan. Todos los datos son ficticios.
import {test, before, after} from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const RAIZ = fileURLToPath(new URL("..", import.meta.url));
let chromium = null, navegador = null, motivo = "";
try { ({chromium} = await import("playwright")); } catch { motivo = "falta Playwright (npm install)"; }
if (chromium){ try { navegador = await chromium.launch(); } catch { motivo = "no se pudo abrir Chromium"; } }
const saltar = navegador ? false : motivo;

const TIPOS = {".html": "text/html; charset=utf-8", ".js": "text/javascript", ".json": "application/json", ".png": "image/png", ".webmanifest": "application/manifest+json"};
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

async function abrir(antes){
  const ctx = await navegador.newContext({viewport: {width: 390, height: 844}});
  const pg = await ctx.newPage();
  pg.errores = [];
  pg.on("pageerror", e => pg.errores.push(String(e)));
  await pg.goto(base + "/index.html?prueba");
  if (antes) await pg.evaluate(antes);
  return pg;
}
async function escribir(pg, texto){
  await pg.fill("#entrada", texto);
  await pg.waitForTimeout(500);   // la vista previa se recalcula 250 ms después de escribir
}
// Un RUT con espacios y sin rótulo: el anonimizador lo deja pasar; el validador no
const CASO = "Documento del paciente 12 345 678-5, viene a control el 12/03/2025.";

test("el validador oculta lo que se le escapó al anonimizador antes de copiar", {skip: saltar}, async () => {
  const pg = await abrir();
  await escribir(pg, CASO);
  const previa = await pg.textContent("#previa");
  assert.ok(previa.includes("[RUT_1]") && !previa.includes("12 345 678"), previa);
  assert.ok(previa.includes("12/03/2025"), "la fecha clínica debería quedar a la vista");
  assert.equal(await pg.isDisabled("#copiarAnon"), false);
  await pg.click("#copiarAnon");
  const enviado = await pg.evaluate(() => __velo.caso().turnos[0].anon);
  assert.ok(enviado.includes("Documento del paciente [RUT_1], viene a control el 12/03/2025.") && !enviado.includes("345 678"), enviado);
  assert.deepEqual(pg.errores, []);
  await pg.context().close();
});

test("si el residuo persiste: «Requiere revisión», no se puede copiar ni enviar", {skip: saltar}, async () => {
  const pg = await abrir(() => { window.__velo.rondas = 0; });   // simula que volver a ocultar no bastó
  await escribir(pg, CASO);
  const estado = await pg.textContent("#estado");
  assert.match(estado, /^Requiere revisión: quedó a la vista RUT «12 345 678-5»/);
  assert.equal(await pg.isDisabled("#copiarAnon"), true);
  // Aunque se fuerce el toque, no se arma ningún mensaje
  await pg.evaluate(() => { const b = document.querySelector("#copiarAnon"); b.disabled = false; b.click(); });
  await pg.waitForTimeout(200);
  assert.equal(await pg.evaluate(() => __velo.caso().turnos.length), 0);
  assert.deepEqual(pg.errores, []);
  await pg.context().close();
});
