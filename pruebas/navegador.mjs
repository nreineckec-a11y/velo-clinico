// Ayudas para probar la app en un navegador (Playwright + Chromium): un servidor local para la página y una "IA"
// interceptada (nada sale a internet). Sin Playwright, las pruebas que las usan se saltan.
import {before, after} from "node:test";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const RAIZ = fileURLToPath(new URL("..", import.meta.url));
let chromium = null, navegador = null, motivo = "";
try { ({chromium} = await import("playwright")); } catch { motivo = "falta Playwright (npm install)"; }
if (chromium){ try { navegador = await chromium.launch(); } catch { motivo = "no se pudo abrir Chromium"; } }
export const saltar = navegador ? false : motivo;

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

const CORS = {"access-control-allow-origin": "*", "access-control-allow-headers": "*"};
export const RESPUESTA_CLAUDE = {status: 200, json: {content: [{type: "text", text: "Resumen de [NOMBRE_1]: neumonía."}], stop_reason: "end_turn"}};
// Abre la app con estos ajustes. responder(envio, n) decide qué contesta la "IA" a la n-ésima consulta:
// {status, json}, {cortar: true} (falla la conexión) o una promesa de eso (para dejarla esperando).
// En pg.envios queda todo lo que la app envió. window.__foto(url) cambia lo que "ve" la cámara simulada.
// inicio: código que corre en la página antes que la app (por ejemplo, para simular permisos)
export async function abrir(ajustes, responder, inicio){
  const ctx = await navegador.newContext({viewport: {width: 390, height: 844}});
  const pg = await ctx.newPage();
  pg.errores = []; pg.envios = [];
  pg.on("pageerror", e => pg.errores.push(String(e)));
  await ctx.route(u => !u.href.startsWith(base), async rt => {
    const rq = rt.request();
    try {
      if (rq.method() === "OPTIONS"){ await rt.fulfill({status: 204, headers: CORS}); return; }
      const envio = {url: rq.url(), headers: rq.headers(), cuerpo: JSON.parse(rq.postData() || "null")};
      pg.envios.push(envio);
      const r = await (responder ? responder(envio, pg.envios.length) : RESPUESTA_CLAUDE);
      if (r.cortar){ await rt.abort("failed"); return; }
      await rt.fulfill({status: r.status, contentType: "application/json", headers: CORS, body: JSON.stringify(r.json)});
    } catch(e){}   // la página se recargó mientras esperaba: esa consulta ya no existe
  });
  await pg.addInitScript(() => {
    const c = document.createElement("canvas"), g = c.getContext("2d"); let img = null;
    window.__foto = url => new Promise(ok => { const im = new Image(); im.onload = () => { img = im; c.width = im.naturalWidth; c.height = im.naturalHeight; g.drawImage(im, 0, 0); ok(); }; im.src = url; });
    setInterval(() => { if (img) g.drawImage(img, 0, 0); }, 100);
    navigator.mediaDevices.getUserMedia = async () => { if (!img) await window.__foto("/pruebas/epicrisis/pagina1.jpg"); return c.captureStream(10); };
  });
  if (inicio) await pg.addInitScript(inicio);
  // Los ajustes se escriben solo la primera vez (al recargar, la app conserva los suyos)
  await pg.addInitScript(a => { if (!sessionStorage.getItem("__aj")){ localStorage.setItem("velo_ajustes", JSON.stringify(a)); sessionStorage.setItem("__aj", "1"); } }, ajustes);
  await pg.goto(base + "/index.html?prueba");
  return pg;
}
export const AJ_CLAUDE = {auto: true, prov: "claude", claves: {claude: "sk-ant-prueba"}, recordar: true, tarea: "exam"};
export const archivoTexto = (texto, name = "caso.txt") => ({name, mimeType: "text/plain", buffer: Buffer.from(texto)});
export const RAIZ_APP = RAIZ;
// Estado de cada caso en pantalla (del más nuevo al más antiguo)
export const estados = pg => pg.evaluate(() => [...document.querySelectorAll(".caso-auto .insignia")].map(e => e.textContent));
export const esperar = (pg, fn, arg) => pg.waitForFunction(fn, arg, {timeout: 6 * 60 * 1000, polling: 200});
// Espera a que todos los casos (o n de ellos) terminen: listo, error o requiere revisión
export const esperarCasos = (pg, n) => esperar(pg, n => { const es = [...document.querySelectorAll(".caso-auto .insignia")]; return es.length >= (n || 1) && es.every(e => /Listo|Error|revisión/.test(e.textContent)); }, n);
// Lo guardado en el dispositivo (IndexedDB), resumido
export const guardados = pg => pg.evaluate(() => new Promise(ok => {
  const rq = indexedDB.open("velo", 1);
  rq.onupgradeneeded = () => { if (!rq.result.objectStoreNames.contains("casos")) rq.result.createObjectStore("casos", {keyPath: "id"}); };
  rq.onsuccess = () => { const g = rq.result.transaction("casos").objectStore("casos").getAll(); g.onsuccess = () => ok(g.result.map(c => ({n: c.n, estado: c.estado, fotos: c.archivos ? c.archivos.length : 0, enviado: c.enviado || "", tieneRespuesta: !!c.respuesta}))); };
}));
// Una "IA" que deja esperando las consultas hasta que se la suelte
export function compuerta(){
  let soltar; const p = new Promise(r => { soltar = r; });
  return {espera: () => p.then(() => RESPUESTA_CLAUDE), soltar: () => soltar()};
}
