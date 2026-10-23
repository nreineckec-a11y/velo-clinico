// Pruebas del tapado de fotos con lecturas OCR guardadas y códigos sintéticos (todo ficticio).
// Ejecutar con:  node --test pruebas/*.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {cargarMotor} from "./cargar-motor.mjs";

const Anon = cargarMotor();
const leer = f => JSON.parse(readFileSync(new URL(f, import.meta.url), "utf8"));
const centro = c => ({x: (c.x0 + c.x1) / 2, y: (c.y0 + c.y1) / 2});
const tapada = (cajas, palabra) => {
  const p = centro(palabra.caja);
  return cajas.some(c => p.x >= c.x0 && p.x <= c.x1 && p.y >= c.y0 && p.y <= c.y1);
};
const buscar = (ocr, texto, n = 0) => {
  const w = ocr.palabras.filter(p => p.texto === texto)[n];
  assert.ok(w, `la lectura no contiene «${texto}»`);
  return w;
};

const CASOS = [
  ["ocr-informe-rm.json",
    ["PEREZ", "MARIA", "ELENA", "4.567.890-1", "12/03/1934", "121013870.2", "001799876", "Fuentes"],
    ["92", "años", "(Fazekas", "microangiopáticos", "STROKE", "Edad:", "15/10/2026", "01:57", "Radiólogo"]],
  ["ocr-laboratorio.json",
    ["GONZALEZ", "ANTONIO", "9.876.543-2", "778812", "Reinecke", "8765", "33445566", "Carolina"],
    ["67", "03/10/2026", "13.5", "245.000", "0.82", "Hemoglobina", "Glucosa", "Nombre:", "RUT:", "Sexo:"]],
  ["ocr-informe-rm-dificil.json",
    ["PEREZ", "MARIA", "ELENA", "4.567.890-1", "12/03/1934", "1210138702", "001799876", "Juan", "Fuentes"],
    ["92", "años", "(Fazekas", "STROKE", "Edad:", "01:57", "Médico", "Radiólogo"]],
  ["ocr-laboratorio-dificil.json",
    ["GONZALEZ", "PEDRO", "ANTONIO", "9.876.543-2", "778812", "Reinecke", "8765", "33445566", "Carolina"],
    ["67", "03/10/2026", "7.540", "245.000", "0.82", "Hemoglobina", "Glucosa", "Nombre:", "RUT:", "Sexo:", "Orden"]]
];

for (const [archivo, tapar, dejar] of CASOS){
  test(`tapa los datos y deja lo clínico: ${archivo}`, () => {
    const ocr = leer(archivo);
    const {cajas} = Anon.zonasATapar(ocr.palabras, null, {});
    for (const t of tapar) assert.ok(tapada(cajas, buscar(ocr, t)), `quedó sin tapar «${t}»`);
    for (const t of dejar) assert.ok(!tapada(cajas, buscar(ocr, t)), `se tapó «${t}»`);
  });
  test(`los recuadros no abarcan varias líneas: ${archivo}`, () => {
    const ocr = leer(archivo);
    const {cajas} = Anon.zonasATapar(ocr.palabras, null, {});
    // (los rellenos entre dos trozos de un nombre tapan un hueco, no palabras)
    for (const c of cajas.filter(c => c.tipo !== "CODIGO" && !c.relleno)){
      // Cada recuadro mide a lo más un poco más que la palabra más alta que tapa
      const hMax = Math.max(...ocr.palabras.filter(p => { const q = centro(p.caja); return q.x >= c.x0 && q.x <= c.x1 && q.y >= c.y0 && q.y <= c.y1; }).map(p => p.caja.y1 - p.caja.y0));
      assert.ok(c.y1 - c.y0 <= hMax * 1.7, `recuadro de ${Math.round(c.y1 - c.y0)} px sobre palabras de hasta ${hMax} px`);
    }
  });
}

test("la inclinación del texto se estima bien", () => {
  // Tangente de la rotación aplicada al simular cada foto
  for (const [archivo, esperada] of [["ocr-informe-rm.json", -0.031], ["ocr-laboratorio.json", 0.021], ["ocr-informe-rm-dificil.json", -0.070], ["ocr-laboratorio-dificil.json", 0.061]]){
    const k = Anon.pendienteTexto(leer(archivo).palabras);
    assert.ok(Math.abs(k - esperada) < 0.015, `${archivo}: ${k.toFixed(4)} en vez de ${esperada}`);
  }
});

test("las filas reúnen el rótulo con su valor aunque estén lejos", () => {
  const ocr = leer("ocr-informe-rm.json");
  const {texto} = Anon.filasOcr(ocr.palabras, Anon.pendienteTexto(ocr.palabras));
  assert.match(texto, /Nombre Paciente:\s{3}PEREZ SOTO/);
  assert.match(texto, /Número Orden de Pago:\s{3}121013870\.2/);
});

test("un nombre desconocido tras un rótulo se tapa igual", () => {
  const h = 30, palabra = (texto, x0, y0) => ({texto, caja: {x0, y0, x1: x0 + texto.length * 16, y1: y0 + h}, conf: 90});
  const palabras = [palabra("Paciente:", 50, 100), palabra("ZQWXT", 400, 101), palabra("KLMNOP", 500, 102), palabra("Edad:", 50, 150), palabra("45", 400, 150)];
  const {cajas} = Anon.zonasATapar(palabras, 0, {});
  assert.ok(tapada(cajas, palabras[1]) && tapada(cajas, palabras[2]));
  assert.ok(!tapada(cajas, palabras[4]));
});

test("una mancha ilegible (alfombra, letra manuscrita, código) no se tapa por sí sola", () => {
  // Los códigos de barras y QR se buscan en los píxeles; una palabra ilegible no basta para tapar
  const ocr = leer("ocr-informe-rm.json");
  const {cajas} = Anon.zonasATapar(ocr.palabras, null, {});
  assert.ok(!cajas.some(c => c.tipo === "CODIGO"));
});

/* ---------- códigos de barras y QR en píxeles ---------- */
function lienzo(W, H, fondo = 238){ return {W, H, g: new Uint8Array(W * H).fill(fondo)}; }
const pintar = (L, x0, y0, w, h, v = 25) => { for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) if (x >= 0 && y >= 0 && x < L.W && y < L.H) L.g[y * L.W + x] = v; };
function azar(semilla){ let s = semilla; return () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648; }
function textoFalso(L, x0, y0, filas, cols, r){
  // Letras de 7×10 px con trazos horizontales y verticales, como una página escrita
  for (let f = 0; f < filas; f++) for (let c = 0; c < cols; c++){
    if (r() < 0.15) continue;
    const x = x0 + c * 9, y = y0 + f * 16;
    pintar(L, x, y, 2, 10); if (r() < 0.6) pintar(L, x + 5, y, 2, 10);
    if (r() < 0.7) pintar(L, x, y, 7, 2); if (r() < 0.5) pintar(L, x, y + 8, 7, 2); if (r() < 0.4) pintar(L, x, y + 4, 6, 2);
  }
}
const contiene = (k, x, y) => x >= k.x0 && x <= k.x1 && y >= k.y0 && y <= k.y1;

test("encuentra un código de barras y no confunde texto con barras", () => {
  const L = lienzo(900, 700), r = azar(7);
  textoFalso(L, 40, 40, 20, 60, r);
  let x = 120; while (x < 520){ const w = 2 + Math.floor(r() * 5); pintar(L, x, 470, w, 90); x += w + 2 + Math.floor(r() * 4); }
  const k = Anon.codigosEnImagen(L.g, L.W, L.H);
  assert.equal(k.length, 1, JSON.stringify(k));
  assert.ok(contiene(k[0], 125, 475) && contiene(k[0], 510, 555), JSON.stringify(k[0]));
  assert.ok(k[0].y0 > 380, "el recuadro no debe llegar al texto: " + JSON.stringify(k[0]));
});

test("encuentra un código QR", () => {
  const {filas} = leer("qr-ficticio.json"), m = 6, L = lienzo(800, 600);
  textoFalso(L, 30, 40, 30, 40, azar(3));
  const ox = 520, oy = 200;
  filas.forEach((f, y) => [...f].forEach((b, x) => { if (b === "1") pintar(L, ox + x * m, oy + y * m, m, m); }));
  const k = Anon.codigosEnImagen(L.g, L.W, L.H).filter(c => c.x0 > 400);
  assert.ok(k.length >= 1, "no encontró el QR");
  const lado = filas.length * m;
  assert.ok(contiene(k[0], ox + 2, oy + 2) && contiene(k[0], ox + lado - 2, oy + lado - 2), JSON.stringify(k[0]));
});

test("no marca códigos en un electrocardiograma ni en texto", () => {
  const L = lienzo(1000, 420, 250);
  for (let x = 0; x < 1000; x += 10) pintar(L, x, 0, 1, 420, x % 50 ? 225 : 200);
  for (let y = 0; y < 420; y += 10) pintar(L, 0, y, 1000, 1, y % 50 ? 225 : 200);
  for (let f = 0; f < 3; f++) for (let x = 0; x < 1000; x++){
    const t = (x / 250) % 0.8, base = 90 + f * 130;
    const v = t > 0.24 && t < 0.27 ? -120 * (t - 0.24) / 0.03 : t > 0.27 && t < 0.3 ? -120 + 150 * (t - 0.27) / 0.03 : 0;
    pintar(L, x, Math.round(base + v), 2, 3, 20);
  }
  textoFalso(L, 20, 380, 2, 100, azar(11));
  assert.equal(Anon.codigosEnImagen(L.g, L.W, L.H).length, 0);
});

test("el hueco entre dos trozos de un nombre en la misma fila también se tapa", () => {
  // "PEREIRA ROA" leído como "PEREI" … "ROA" porque otra impresión tapa el medio (nombre ficticio)
  const h = 30, palabra = (texto, x0) => ({texto, caja: {x0, y0: 100, x1: x0 + texto.length * 18, y1: 100 + h}, conf: 90, linea: 0});
  const palabras = [palabra("Paciente:", 20), palabra("JUANA", 220), palabra("ISIDORA", 330), palabra("PEREI", 480), palabra("ROA", 660)];
  const {cajas} = Anon.zonasATapar(palabras, 0, {});
  // (el relleno entre "PEREI" y "ROA"; los campos rotulados también se prolongan con rellenos a sus lados)
  const relleno = cajas.find(c => c.relleno && c.x0 > 480 + 5 * 18 - 30 && c.x1 < 660 + 30);
  assert.ok(relleno, "no tapó el hueco");
  // De "PEREI" a "ROA" no queda ningún punto de la fila sin tapar
  for (let x = 480; x <= 660 + 3 * 18; x += 2) assert.ok(cajas.some(c => c.x0 <= x && x <= c.x1 && c.y0 <= 115 && 115 <= c.y1), "quedó visible x = " + x);
  // Se destapa junto con el trozo de la izquierda
  const izq = cajas.find(c => !c.relleno && c.x0 < 480 + 5 * 18 && c.x1 > 480);
  assert.equal(relleno.grupo, izq.grupo);
});
