// Prueba de punta a punta, en un navegador, con la epicrisis FICTICIA "fotografiada" de pruebas/epicrisis (4 páginas
// en ángulo, con sombras, papel curvado y sobre alfombra, madera y tela; se generan con generar_epicrisis.py).
// La app lee las páginas, tapa, el médico confirma y la app comprueba la imagen ya tapada. Las pruebas fallan si
// algún dato identificable queda a la vista en lo que se enviaría.
//
// Requiere Playwright y Chromium:  npm install  y  npx playwright install chromium
// Sin ellos, estas pruebas se saltan (las demás siguen corriendo con  node --test pruebas/*.test.mjs).
import {test, before, after} from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {cargarMotor} from "./cargar-motor.mjs";

const Anon = cargarMotor();
const RAIZ = fileURLToPath(new URL("..", import.meta.url));
const DIR = fileURLToPath(new URL("./epicrisis/", import.meta.url));
const verdad = JSON.parse(fs.readFileSync(DIR + "verdad.json", "utf8"));
const PAGINAS = verdad.paginas.map(p => DIR + p.archivo);
const ESPERA = 6 * 60 * 1000;

let chromium = null, motivo = "";
try { ({chromium} = await import("playwright")); }
catch { try { ({chromium} = await import("playwright-core")); } catch { motivo = "falta Playwright (npm install)"; } }
let navegador = null;
if (chromium){
  try { navegador = await chromium.launch(); }
  catch { motivo = "no se pudo abrir Chromium (npx playwright install chromium)"; }
}
const saltar = navegador ? false : motivo;

// La app es una página estática: un servidor mínimo para abrirla desde el disco
const TIPOS = {".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json",
  ".png": "image/png", ".jpg": "image/jpeg", ".webmanifest": "application/manifest+json", ".wasm": "application/wasm", ".txt": "text/plain; charset=utf-8"};
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
async function abrir(){
  const ctx = await navegador.newContext({viewport: {width: 390, height: 844}, deviceScaleFactor: 2, isMobile: true, hasTouch: true});
  const pg = await ctx.newPage();
  const errores = [];
  pg.on("pageerror", e => errores.push(String(e)));
  // (estas pruebas son del modo manual: revisar y tapar fotos)
  await pg.addInitScript(() => localStorage.setItem("velo_ajustes", JSON.stringify({auto: false})));
  await pg.goto(base + "/index.html?prueba");
  pg.errores = errores;
  return pg;
}
async function esperar(pg, fn, arg){
  await pg.waitForFunction(fn, arg, {timeout: ESPERA, polling: 250});
}
async function adjuntar(pg, archivos){
  const antes = await pg.evaluate(() => __velo.caso().fotos.length);
  await pg.setInputFiles("#adjunto", archivos);
  await esperar(pg, n => { const fs = __velo.caso().fotos; return fs.length === n && fs.every(f => f.ocr === "listo" || f.ocr === "error"); }, antes + archivos.length);
  // Tras leer cada página se buscan sus datos en las demás: un momento para que termine
  await pg.waitForTimeout(300);
}
const recuadros = (pg, i) => pg.evaluate(i => __velo.caso().fotos[i].tapas.map(t => ({x0: t.x0, y0: t.y0, x1: t.x1, y1: t.y1, poli: t.poli || null,
  tipo: t.tipo, quitada: !!t.quitada, propagada: !!t.propagada})), i);
async function confirmar(pg, i){
  await pg.evaluate(i => document.querySelectorAll("#fotos [data-tachar]")[i].click(), i);
  await pg.waitForSelector("#editor:not([hidden])");
  await pg.click("#fotoListo");
  await pg.waitForTimeout(400);
  if (await pg.isVisible("#editor")){ await pg.click("#edCancelar"); await pg.waitForTimeout(300); }
}
const esperarComprobacion = pg => esperar(pg, () => __velo.caso().fotos.every(f => f.verif !== "comprobando" && (f.pendiente || f.verif)));
function dentroPoli(x, y, pts){
  let d = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++){
    const a = pts[i], b = pts[j];
    if ((a.y > y) !== (b.y > y) && x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x) d = !d;
  }
  return d;
}
const centro = m => ({x: (m.x0 + m.x1) / 2, y: (m.y0 + m.y1) / 2});
const cubre = (t, m) => { const c = centro(m); return t.poli ? dentroPoli(c.x, c.y, t.poli) : c.x >= t.x0 && c.x <= t.x1 && c.y >= t.y0 && c.y <= t.y1; };
const datos = n => verdad.paginas[n].marcas.filter(m => m.tipo === "dato");
const clinicas = n => verdad.paginas[n].marcas.filter(m => m.tipo === "clinica");
// Fechas clínicas y del documento (impresión, creación, ingreso, egreso, alta): deben quedar a la vista
const fechas = n => verdad.paginas[n].marcas.filter(m => m.tipo === "fecha");
const enHoja = (n, x, y) => { const f = verdad.paginas[n].hoja[Math.floor(y / 10)]; return !!f && f[Math.floor(x / 10)] === "1"; };

// ¿Alguna palabra leída es uno de los datos de la página (aunque el lector haya errado una o dos letras)?
function palabrasConDatos(palabras, marcas){
  const norm = s => Anon.plegar(String(s)).replace(/[^\p{L}\p{N}]/gu, "");
  const fichas = [...new Set(marcas.map(m => m.texto))].map(t => ({t, n: norm(t), dig: t.replace(/\D/g, "")}));
  const hallados = new Set();
  for (const w of palabras){
    const n = norm(w); if (!n) continue;
    for (const f of fichas){
      if (/\d/.test(f.t)){
        // Números (RUN, fechas, folios): 5 o más cifras seguidas del dato
        const d = n.replace(/\D/g, "");
        if (f.dig.length >= 5 ? d.length >= 5 && f.dig.includes(d) || d.includes(f.dig) : n === f.n) hallados.add(f.t);
      } else if (f.n.length >= 4){
        const tol = f.n.length >= 8 ? 2 : f.n.length >= 5 ? 1 : 0;
        if (Math.abs(n.length - f.n.length) <= tol && Anon.distancia(n, f.n, tol) <= tol) hallados.add(f.t);
      }
    }
  }
  return [...hallados];
}

/* ---------- 1. Lectura y tapado de las 4 páginas ---------- */
let pagina = null;
test("lee las 4 páginas, tapa cada dato y ningún recuadro queda fuera de la hoja", {skip: saltar}, async () => {
  pagina = await abrir();
  await adjuntar(pagina, PAGINAS);
  const estados = await pagina.evaluate(() => __velo.caso().fotos.map(f => f.ocr));
  assert.deepEqual(estados, PAGINAS.map(() => "listo"), "no se pudieron leer todas las páginas");
  for (let n = 0; n < PAGINAS.length; n++){
    const ts = (await recuadros(pagina, n)).filter(t => !t.quitada);
    const sinTapar = datos(n).filter(m => !ts.some(t => cubre(t, m))).map(m => m.texto);
    assert.deepEqual(sinTapar, [], `página ${n + 1}: quedaron sin tapar ${JSON.stringify(sinTapar)}`);
    const tapadas = clinicas(n).filter(m => ts.some(t => cubre(t, m))).map(m => m.texto);
    assert.deepEqual(tapadas, [], `página ${n + 1}: se taparon palabras clínicas ${JSON.stringify(tapadas)}`);
    const fechasTapadas = fechas(n).filter(m => ts.some(t => cubre(t, m))).map(m => m.texto);
    assert.deepEqual(fechasTapadas, [], `página ${n + 1}: se taparon fechas clínicas ${JSON.stringify(fechasTapadas)}`);
    const fuera = ts.filter(t => { const c = centro(t); return !enHoja(n, c.x, c.y); });
    assert.equal(fuera.length, 0, `página ${n + 1}: ${fuera.length} recuadros fuera de la hoja`);
  }
  // La página 4 no trae el encabezado: su "Trecahuel" solo se tapa buscando lo que se leyó en las otras páginas
  const ts4 = await recuadros(pagina, 3), q4 = datos(3).find(m => m.texto === "Trecahuel");
  assert.ok(ts4.some(t => t.propagada && cubre(t, q4)), "el apellido de la página 4 no se tapó por estar en las otras páginas");
  assert.deepEqual(pagina.errores, []);
});

/* ---------- 2. Lo que se enviaría ---------- */
test("lo que se envía no deja ningún dato a la vista: comprobación, píxeles y una lectura aparte", {skip: saltar}, async () => {
  assert.ok(pagina, "falta la prueba anterior");
  for (let i = 0; i < PAGINAS.length; i++) await confirmar(pagina, i);
  await esperarComprobacion(pagina);
  const comp = await pagina.evaluate(() => __velo.caso().fotos.map(f => ({verif: f.verif, fugas: (f.fugas || []).map(t => t.tipo + ": " + t.texto)})));
  comp.forEach((c, i) => assert.equal(c.verif, "ok", `página ${i + 1}: la comprobación encontró ${JSON.stringify(c.fugas)}`));
  // La fecha de nacimiento va tapada en la imagen: la edad calculada (al 11/11/2025) va escrita junto a las imágenes
  const previa = await pagina.evaluate(() => document.querySelector("#previa").textContent);
  assert.ok(previa.includes("Edad según la fecha de nacimiento tapada en las imágenes: 79 años."), previa);

  // a) En los píxeles de la imagen enviada, cada dato está bajo negro
  const oscuros = await pagina.evaluate(async marcas => {
    const out = [];
    for (const [i, f] of __velo.caso().fotos.entries()){
      const u = URL.createObjectURL(f.blob), im = new Image();
      await new Promise((ok, mal) => { im.onload = ok; im.onerror = mal; im.src = u; });
      const W = im.naturalWidth, H = im.naturalHeight, c = document.createElement("canvas"); c.width = W; c.height = H;
      const g = c.getContext("2d"); g.drawImage(im, 0, 0); const px = g.getImageData(0, 0, W, H).data; URL.revokeObjectURL(u);
      // Del lienzo de la foto a la imagen enviada (la inversa de lo que usa la app para ubicar las fugas)
      const {h, bx0, by0, e} = f.exportacion, rect = [{x: 0, y: 0}, {x: W, y: 0}, {x: W, y: H}, {x: 0, y: H}];
      const inv = Anon.homografia(rect.map(p => Anon.aplicarH(h, p.x, p.y)), rect);
      const aEnviada = (x, y) => Anon.aplicarH(inv, (x - bx0) * e, (y - by0) * e);
      out.push(marcas[i].map(m => {
        let n = 0, negros = 0;
        for (let a = 0.2; a <= 0.81; a += 0.15) for (let b = 0.25; b <= 0.76; b += 0.25){
          const p = aEnviada(m.x0 + (m.x1 - m.x0) * a, m.y0 + (m.y1 - m.y0) * b), x = Math.round(p.x), y = Math.round(p.y);
          if (x < 0 || y < 0 || x >= W || y >= H) continue;
          const k = (y * W + x) * 4; n++; if (px[k] * 0.299 + px[k + 1] * 0.587 + px[k + 2] * 0.114 < 70) negros++;
        }
        return {texto: m.texto, n, negros};
      }));
    }
    return out;
  }, verdad.paginas.map(p => p.marcas.filter(m => m.tipo === "dato")));
  oscuros.forEach((pag, i) => {
    const claros = pag.filter(r => !r.n || r.negros < r.n).map(r => r.texto);
    assert.deepEqual(claros, [], `página ${i + 1}: en la imagen enviada no quedaron bajo negro ${JSON.stringify(claros)}`);
  });

  // b) Una lectura aparte de cada imagen enviada (modos 11 y 6, y al 150 %) no encuentra ningún dato
  for (let i = 0; i < PAGINAS.length; i++){
    const palabras = await pagina.evaluate(async i => {
      const f = __velo.caso().fotos[i], out = [];
      const u = URL.createObjectURL(f.blob), im = new Image();
      await new Promise((ok, mal) => { im.onload = ok; im.onerror = mal; im.src = u; });
      const c = document.createElement("canvas"); c.width = Math.round(im.naturalWidth * 1.5); c.height = Math.round(im.naturalHeight * 1.5);
      const g = c.getContext("2d"); g.imageSmoothingQuality = "high"; g.drawImage(im, 0, 0, c.width, c.height); URL.revokeObjectURL(u);
      const grande = await new Promise(r => c.toBlob(r, "image/jpeg", 0.92));
      for (const [img, modo] of [[f.blob, "11"], [f.blob, "6"], [grande, "11"], [grande, "6"]]) for (const w of await __velo.leer(img, modo)) out.push(w.texto);
      return out;
    }, i);
    const vistos = palabrasConDatos(palabras, datos(i));
    assert.deepEqual(vistos, [], `página ${i + 1}: una lectura aparte de la imagen enviada encontró ${JSON.stringify(vistos)}`);
  }
  assert.deepEqual(pagina.errores, []);
  await pagina.context().close(); pagina = null;
});

/* ---------- 3. La comprobación como red de seguridad ---------- */
test("si un dato queda a la vista, la comprobación lo marca y no deja enviar", {skip: saltar}, async () => {
  const pg = await abrir();
  await adjuntar(pg, [PAGINAS[0]]);
  // Se simula que el lector no vio tres datos: se quitan sus recuadros (la fecha de nacimiento, el RUN de la evolución
  // y el apellido de la evolución)
  const marcas = datos(0), elegir = (texto, cual = 0) => marcas.filter(m => m.texto === texto)[cual];
  const expuestas = [elegir("17/06/1946"), elegir("6482917-3"), marcas.filter(m => m.texto === "TRECAHUEL").sort((a, b) => b.y0 - a.y0)[0]];
  for (const m of expuestas) assert.ok(m, "falta una marca en verdad.json");
  const ts = await recuadros(pg, 0);
  const quitar = ts.map((t, i) => expuestas.some(m => cubre(t, m)) ? i : -1).filter(i => i >= 0);
  assert.ok(quitar.length >= 3, "no se encontraron los recuadros a quitar");
  await pg.evaluate(q => { const f = __velo.caso().fotos[0]; const s = new Set(q); f.tapas = f.tapas.filter((t, i) => !s.has(i)); }, quitar);
  await confirmar(pg, 0);
  await esperarComprobacion(pg);
  const r = await pg.evaluate(() => { const f = __velo.caso().fotos[0];
    return {verif: f.verif, pendiente: f.pendiente, fugas: (f.fugas || []).map(t => ({x0: t.x0, y0: t.y0, x1: t.x1, y1: t.y1, tipo: t.tipo})),
      copiar: document.querySelector("#copiarAnon").disabled, estado: document.querySelector("#estado") ? document.querySelector("#estado").textContent : ""}; });
  assert.equal(r.verif, "fugas", "la comprobación no encontró los datos a la vista");
  assert.equal(r.pendiente, true, "la imagen debería volver a «revisar»");
  for (const m of expuestas){
    const c = centro(m);
    assert.ok(r.fugas.some(t => c.x >= t.x0 - 4 && c.x <= t.x1 + 4 && c.y >= t.y0 - 4 && c.y <= t.y1 + 4), `no se marcó en rojo «${m.texto}»`);
  }
  assert.equal(r.copiar, true, "con datos a la vista no se debe poder copiar ni enviar");
  assert.deepEqual(pg.errores, []);
  await pg.context().close();
});

/* ---------- 4. Un dato de una página se busca en las demás ---------- */
test("una página sin encabezado: su apellido suelto se tapa al leer otra página que lo trae", {skip: saltar}, async () => {
  const pg = await abrir();
  await adjuntar(pg, [PAGINAS[3]]);
  const q4 = datos(3).find(m => m.texto === "Trecahuel");
  assert.ok(!(await recuadros(pg, 0)).some(t => !t.quitada && cubre(t, q4)), "sin las otras páginas no debería saber que «Trecahuel» es un apellido");
  await adjuntar(pg, [PAGINAS[0]]);
  assert.ok((await recuadros(pg, 0)).some(t => !t.quitada && t.propagada && cubre(t, q4)), "al agregar la página 1 no se tapó el apellido en la página 4");
  assert.deepEqual(pg.errores, []);
  await pg.context().close();
});
