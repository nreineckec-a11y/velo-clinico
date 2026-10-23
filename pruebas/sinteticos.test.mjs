// Red de seguridad de la anonimización con exámenes SINTÉTICOS (pruebas/sinteticos.mjs): hemograma, perfil
// bioquímico, orina completa, PSA, informe de imagen y epicrisis. Se prueban las tres entradas: texto (pegado o
// Word), PDF con texto y foto (palabras leídas por el lector, con su posición).
// Ejecutar con:  node --test pruebas/*.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import {cargarMotor} from "./cargar-motor.mjs";
import {DOCUMENTOS, dvRut} from "./sinteticos.mjs";

const Anon = cargarMotor();
const anon = t => Anon.construir(Anon.analizar(t, {})).salida;

// Una "foto" sintética: cada palabra del documento con su caja (13 px por letra, un renglón cada 34 px)
function palabrasDe(texto){
  const ws = [];
  texto.split("\n").forEach((l, i) => {
    for (const m of l.matchAll(/\S+/g))
      ws.push({texto: m[0], fila: i, col: m.index, caja: {x0: 30 + m.index * 13, y0: 40 + i * 34, x1: 30 + (m.index + m[0].length) * 13, y1: 64 + i * 34}, conf: 92});
  });
  return ws;
}
const tapada = (cajas, p) => { const x = (p.caja.x0 + p.caja.x1) / 2, y = (p.caja.y0 + p.caja.y1) / 2; return cajas.some(c => x >= c.x0 && x <= c.x1 && y >= c.y0 && y <= c.y1); };
// Lo que queda a la vista en la foto, como texto (lo tapado va en █)
function fotoTapada(texto){
  const ws = palabrasDe(texto), {cajas} = Anon.zonasATapar(ws, 0, {});
  const lineas = texto.split("\n").map(l => l.split(""));
  for (const p of ws) if (tapada(cajas, p)) for (let k = 0; k < p.texto.length; k++) lineas[p.fila][p.col + k] = "█";
  return lineas.map(l => l.join("")).join("\n");
}
// ¿Todos los caracteres de este trozo (cada vez que aparece) quedaron tapados? ¿Ninguno?
function ocurrencias(texto, trozo){ const out = []; let p = 0; while ((p = texto.indexOf(trozo, p)) !== -1){ out.push(p); p += trozo.length; } return out; }
const todoTapado = (orig, vista, trozo) => ocurrencias(orig, trozo).every(p => [...trozo].every((c, k) => /\s/.test(c) || vista[p + k] === "█"));
const nadaTapado = (orig, vista, trozo) => ocurrencias(orig, trozo).every(p => vista.slice(p, p + trozo.length) === trozo);

test("sintéticos: los RUT tienen dígito verificador válido", () => {
  for (const d of DOCUMENTOS){
    const ruts = d.texto.match(/\d{1,2}\.?\d{3}\.?\d{3}-[\dkK]/g) || [];
    assert.ok(ruts.length, d.nombre + ": sin RUT");
    for (const r of ruts){ const [c, v] = r.split("-"); assert.equal(dvRut(c), v.toUpperCase(), d.nombre + ": " + r); }
  }
});

for (const d of DOCUMENTOS){
  test(`texto · ${d.nombre}: oculta los identificadores y la fecha de nacimiento`, () => {
    const s = anon(d.texto);
    for (const x of d.identificadores.concat(d.nacimiento.texto)) assert.ok(!s.includes(x), `quedó visible «${x}» en:\n${s}`);
  });
  test(`texto · ${d.nombre}: conserva los valores clínicos`, () => {
    const s = anon(d.texto);
    for (const x of d.clinicos) assert.ok(s.includes(x), `se ocultó «${x}» en:\n${s}`);
  });
  test(`texto · ${d.nombre}: ningún campo rotulado queda con su valor a la vista`, () => {
    const avisos = [...Anon.revisar(Anon.analizar(d.texto, {}))];
    assert.deepEqual(avisos.map(a => a.rotulo + ": " + a.texto), []);
  });
  test(`texto · ${d.nombre}: la respuesta de la IA recupera los datos reales`, () => {
    const {salida, mapa} = Anon.construir(Anon.analizar(d.texto, {}));
    const r = Anon.restaurar(salida, mapa);
    assert.equal(r.faltan.length, 0);
    assert.equal(r.salida, d.texto);
  });
  test(`PDF · ${d.nombre}: el texto del PDF se anonimiza igual que el pegado`, () => {
    // Cada renglón como lo entrega pdf.js: trozos con su posición (y hacia arriba), separados donde hay 3+ espacios
    const items = [];
    d.texto.split("\n").forEach((l, i) => {
      for (const m of l.matchAll(/\S+(?: {1,2}\S+)*/g)) items.push({x: 40 + m.index * 6, y: 800 - i * 14, s: m[0], w: m[0].length * 6, h: 10});
    });
    const t = Anon.textoItemsPdf(items), s = anon(t);
    for (const x of d.identificadores.concat(d.nacimiento.texto)) assert.ok(!s.includes(x), `quedó visible «${x}» en:\n${s}`);
    for (const x of d.clinicos.map(c => c.replace(/\s+/g, " "))) assert.ok(s.replace(/\s+/g, " ").includes(x), `se ocultó «${x}» en:\n${s}`);
  });
  test(`foto · ${d.nombre}: tapa los identificadores y la fecha de nacimiento; deja lo clínico`, () => {
    const v = fotoTapada(d.texto);
    for (const x of d.identificadores.concat(d.nacimiento.texto)) assert.ok(todoTapado(d.texto, v, x), `quedó a la vista «${x}» en:\n${v}`);
    for (const x of d.clinicos) assert.ok(nadaTapado(d.texto, v, x), `se tapó «${x}» en:\n${v}`);
  });
  // Comportamiento actual, que cambia en el paso 2 (clasificación de fechas): hoy toda fecha se oculta
  test(`hoy · ${d.nombre}: las fechas clínicas también se ocultan (texto y foto)`, () => {
    const s = anon(d.texto), v = fotoTapada(d.texto);
    for (const f of d.clinicas){
      const fecha = f.replace(/\s+\d{1,2}:\d{2}$/, "");
      assert.ok(!s.includes(fecha), `«${fecha}» visible en el texto`);
      assert.ok(todoTapado(d.texto, v, fecha), `«${fecha}» a la vista en la foto`);
    }
  });
}
