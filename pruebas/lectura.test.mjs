// Lectura de documentos largos y escaneados: todas las páginas, rangos de referencia y fechas clínicas a la vista,
// decimales y tablas en los PDF de baja resolución. Origen: un informe de laboratorio de 14 páginas escaneadas
// (72 ppi) en el que faltaron resultados. Todos los datos de estas pruebas son FICTICIOS.
import test from "node:test";
import assert from "node:assert/strict";
import {cargarMotor} from "./cargar-motor.mjs";
import {saltar, abrir, AJ_CLAUDE, estados, esperarCasos} from "./navegador.mjs";

const Anon = cargarMotor();
const auto = t => Anon.protegerAuto(t, {}).cons.salida;

test("lectura: los rangos de referencia leídos sin espacios no se ocultan como folios ni como códigos", () => {
  for (const t of ["Adultos :0.40-4.05", "Niños 1-2años :0.59-6.88", "2-12años :0.73-4.40", "Densidad 1014 1005-1030", "Aceptable 5.7-6.4", "Leucocitos 4-10 x10^3/uL"])
    assert.equal(auto(t), t);
  // (un RUT sin puntos o un folio largo sí)
  assert.equal(auto("RUT 12345678-9"), "RUT [RUT_1]");
  assert.equal(auto("Paciente 12345678-5 control"), "Paciente [RUT_1] control");
  assert.equal(auto("Folio 2026-00012345"), "Folio [FICHA_1]");
});

test("lectura: la fecha de autorización o validación del examen es clínica y queda a la vista en todo el informe", () => {
  const t = "Toma de Muestra : 19/10/2026 07:54\nRecepcion Muestra : 19/10/2026 09:20\nFecha autorización : 19/10/2026\nFecha aprobación: 19/10/2026";
  assert.equal(auto(t), t);
});

test("lectura: un término con número y guion («25-HIDROXI») no se oculta como código; un código sí", () => {
  assert.equal(auto("VITAMINA D, 25-HIDROXI 17.2 ng/mL"), "VITAMINA D, 25-HIDROXI 17.2 ng/mL");
  assert.equal(auto("Informe validado\n4821KXPT\nfin"), "Informe validado\n[FICHA_1]\nfin");
  assert.equal(auto("Código: 4821-KXPT"), "Código: [FICHA_1]");
});

test("lectura: las líneas de una tabla se borran antes de leer; el texto queda", () => {
  const W = 400, H = 200, img = new Uint8Array(W * H).fill(255);
  for (let x = 20; x < 380; x++) img[50 * W + x] = img[51 * W + x] = 0;      // línea horizontal
  for (let y = 10; y < 190; y++) img[y * W + 200] = 0;                       // línea vertical
  for (let y = 80; y < 100; y++) for (let x = 100; x < 104; x++) img[y * W + x] = 0;   // un trazo de letra
  assert.ok(Anon.borrarLineas(img, W, H) > 500);
  assert.equal(img[50 * W + 150], 255); assert.equal(img[120 * W + 200], 255);
  assert.equal(img[90 * W + 101], 0, "un trazo corto (una letra) queda");
});

// Un PDF escaneado ficticio: cada página es una imagen JPEG de baja resolución (831 x 998 px, 72 ppi), sin texto
function pdfDeImagenes(jpegs, W, H){
  const partes = [], offs = []; let largo = 0;
  const push = b => { const x = Buffer.isBuffer(b) ? b : Buffer.from(b, "latin1"); partes.push(x); largo += x.length; };
  const obj = (n, cuerpo, flujo) => { offs[n] = largo; push(n + " 0 obj\n" + cuerpo + (flujo ? "\nstream\n" : "\nendobj\n")); if (flujo){ push(flujo); push("\nendstream\nendobj\n"); } };
  push("%PDF-1.4\n");
  const n = jpegs.length, paginas = [...Array(n).keys()].map(i => 3 + i * 3);
  obj(1, "<< /Type /Catalog /Pages 2 0 R >>");
  obj(2, "<< /Type /Pages /Count " + n + " /Kids [" + paginas.map(p => p + " 0 R").join(" ") + "] >>");
  jpegs.forEach((j, i) => {
    const p = 3 + i * 3, cont = "q " + W + " 0 0 " + H + " 0 0 cm /Im0 Do Q";
    obj(p, "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 " + W + " " + H + "] /Resources << /XObject << /Im0 " + (p + 2) + " 0 R >> >> /Contents " + (p + 1) + " 0 R >>");
    obj(p + 1, "<< /Length " + cont.length + " >>", Buffer.from(cont));
    obj(p + 2, "<< /Type /XObject /Subtype /Image /Width " + W + " /Height " + H + " /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length " + j.length + " >>", j);
  });
  const xref = largo, total = 3 + n * 3;
  push("xref\n0 " + total + "\n0000000000 65535 f \n" + [...Array(total - 1).keys()].map(i => String(offs[i + 1]).padStart(10, "0") + " 00000 n \n").join(""));
  push("trailer\n<< /Size " + total + " /Root 1 0 R >>\nstartxref\n" + xref + "\n%%EOF\n");
  return Buffer.concat(partes);
}
// Las páginas: un informe con el valor de cada página y una tabla con celdas (como el recuento diferencial)
const PAGINAS = n => [...Array(n).keys()].map(i => ({titulo: "Examen " + (i + 1), valor: (2 + i / 100).toFixed(2)}));
async function pdfFicticio(pg, n){
  const jpegs = await pg.evaluate(paginas => Promise.all(paginas.map(async p => {
    const c = document.createElement("canvas"); c.width = 831; c.height = 998; const g = c.getContext("2d");
    g.fillStyle = "#fff"; g.fillRect(0, 0, 831, 998); g.fillStyle = "#111"; g.font = "15px Arial";
    g.fillText("LABORATORIO CLINICO FICTICIO", 40, 60);
    g.fillText("Fecha autorizacion: 19/10/2026      Toma de Muestra: 19/10/2026 07:54", 40, 100);
    g.font = "bold 20px Arial"; g.fillText(p.titulo, 330, 180); g.font = "15px Arial";
    g.fillText("TSH Ultrasensible        " + p.valor + "        mIU/L        0.40 - 4.05", 40, 260);
    g.strokeStyle = "#000"; g.lineWidth = 1.2;
    const cols = ["Segmentados", "Eosinofilos", "Basofilos", "Monocitos", "Linfocitos"], vals = ["50", "7", "1", "6", "36"];
    for (let k = 0; k < 5; k++){ g.strokeRect(40 + k * 150, 320, 150, 90); g.beginPath(); g.moveTo(40 + k * 150, 365); g.lineTo(190 + k * 150, 365); g.stroke(); g.fillText(cols[k], 50 + k * 150, 350); g.font = "bold 15px Arial"; g.fillText(vals[k], 105 + k * 150, 395); g.font = "15px Arial"; }
    const b = await new Promise(r => c.toBlob(r, "image/jpeg", 0.8));
    return [...new Uint8Array(await b.arrayBuffer())];
  })), PAGINAS(n));
  return pdfDeImagenes(jpegs.map(j => Buffer.from(j)), 831, 998);
}
const esperaLarga = {timeout: 20 * 60 * 1000};

test("PDF escaneado de 9 páginas y baja resolución: se leen todas, con decimales y la tabla, y se avisa de la baja resolución", {skip: saltar, ...esperaLarga}, async () => {
  const pg = await abrir(Object.assign({}, AJ_CLAUDE, {tarea: "exam"}));
  const pdf = await pdfFicticio(pg, 9);
  await pg.setInputFiles("#adjuntoAuto", {name: "informe.pdf", mimeType: "application/pdf", buffer: pdf});
  await pg.waitForFunction(() => { const e = document.querySelector(".caso-auto .insignia"); return e && /Listo|Error|revisión/.test(e.textContent); }, null, {timeout: 20 * 60 * 1000, polling: 1000});
  assert.deepEqual(await estados(pg), ["Listo"]);
  const enviado = pg.envios[0].cuerpo.messages[0].content;
  for (let i = 1; i <= 9; i++) assert.match(enviado, new RegExp("--- Página " + i + " ---"), "falta la página " + i);
  const leidas = PAGINAS(9).filter(p => enviado.includes(p.valor)).length;
  assert.ok(leidas >= 8, "decimales leídos: " + leidas + " de 9");
  assert.match(enviado, /0\.40\s*-\s*4\.05/, "el rango de referencia queda");
  assert.match(enviado, /19\/10\/2026/, "la fecha de autorización (clínica) queda");
  assert.match(enviado, /50\s+7\s+1\s+6\s+36/, "la fila de la tabla se lee");
  assert.match(enviado, /PDF escaneado con poca resolución/, "la IA sabe que la lectura puede tener errores");
  assert.match(await pg.textContent(".caso-auto"), /baja resolución/);
  assert.deepEqual(pg.errores, []);
  await pg.context().close();
});

test("PDF con más páginas que el máximo: se dice cuántas quedaron fuera, nunca se omiten en silencio", {skip: saltar, ...esperaLarga}, async () => {
  const pg = await abrir(Object.assign({}, AJ_CLAUDE, {tarea: "exam"}), null, () => { window.addEventListener("DOMContentLoaded", () => { if (window.__velo) window.__velo.maxPaginas = 2; }); });
  await pg.evaluate(() => { window.__velo.maxPaginas = 2; });
  const pdf = await pdfFicticio(pg, 3);
  await pg.setInputFiles("#adjuntoAuto", {name: "informe.pdf", mimeType: "application/pdf", buffer: pdf});
  await esperarCasos(pg);
  assert.match(await pg.textContent(".caso-auto"), /Se leyeron 2 páginas; 1 página quedó fuera/);
  await pg.context().close();
});
