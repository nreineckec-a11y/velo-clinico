// De punta a punta con los 6 exámenes SINTÉTICOS fotografiados: cada uno se dibuja como una hoja impresa, algo
// girada y sobre un fondo, y entra por la cámara (simulada) del modo automático: lectura en el teléfono →
// anonimizado → validador → envío (interceptado: nada sale a internet). Comprueba lo que salió.
// Con VELO_INFORME=archivo.md, escribe ahí el texto anonimizado final de cada documento.
// Requiere Playwright y Chromium (npm install); sin ellos se saltan. Todos los datos son ficticios.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {cargarMotor} from "./cargar-motor.mjs";
import {DOCUMENTOS} from "./sinteticos.mjs";
import {saltar, abrir, AJ_CLAUDE, esperar, esperarCasos, estados} from "./navegador.mjs";

const Anon = cargarMotor();
const informe = [];

// Dibuja el documento como una foto: hoja blanca con letra de impresora, girada 1,5° sobre un fondo gris con sombra
const FOTOGRAFIAR = texto => {
  const lineas = texto.split("\n"), fs = 24, alto = 40, margen = 110;
  const W = 1800, H = Math.max(2200, lineas.length * alto + 2 * margen);
  const hoja = document.createElement("canvas"); hoja.width = W; hoja.height = H;
  const g = hoja.getContext("2d");
  g.fillStyle = "#fbfaf7"; g.fillRect(0, 0, W, H);
  g.fillStyle = "#1c1c1c"; g.font = fs + "px 'DejaVu Sans Mono', monospace"; g.textBaseline = "top";
  lineas.forEach((l, i) => g.fillText(l, margen, margen + i * alto));
  const foto = document.createElement("canvas"); foto.width = W + 300; foto.height = H + 300;
  const f = foto.getContext("2d");
  const fondo = f.createLinearGradient(0, 0, foto.width, foto.height); fondo.addColorStop(0, "#77706a"); fondo.addColorStop(1, "#4d4843");
  f.fillStyle = fondo; f.fillRect(0, 0, foto.width, foto.height);
  f.save(); f.translate(foto.width / 2, foto.height / 2); f.rotate(1.5 * Math.PI / 180);
  f.shadowColor = "rgba(0,0,0,.45)"; f.shadowBlur = 30; f.drawImage(hoja, -W / 2, -H / 2); f.restore();
  // Luz desigual (más oscuro abajo a la derecha)
  const luz = f.createLinearGradient(0, 0, foto.width, foto.height); luz.addColorStop(0, "rgba(255,255,255,0)"); luz.addColorStop(1, "rgba(0,0,0,.18)");
  f.fillStyle = luz; f.fillRect(0, 0, foto.width, foto.height);
  return foto.toDataURL("image/jpeg", 0.9);
};
// Palabras y números (5 o más cifras) de los identificadores que aparecen en el texto enviado
function identificadoresEn(texto, d){
  const norm = s => Anon.plegar(String(s)).replace(/[^\p{L}\p{N}]/gu, "");
  const palabras = new Set((texto.replace(/\[[A-Z]+_\d+\]/g, " ").match(/[\p{L}\p{N}][\p{L}\p{N}.\-\/@]*/gu) || []).map(norm));
  const cifras = " " + [...texto.replace(/\[[A-Z]+_\d+\]/g, " ").matchAll(/\d(?:[\d.\-\/]|\s(?=\d{3,4}\b))*\d|\d/g)].map(m => m[0].replace(/\D/g, "")).join(" ") + " ";
  const out = [];
  for (const id of d.identificadores.concat(d.nacimiento.texto)){
    const dig = id.replace(/\D/g, "");
    if (dig.length >= 5){ if (cifras.includes(dig.replace(/[kK]$/, ""))) out.push(id); continue; }
    // Cada parte (también las de un correo: lo que va antes y después de la «@»), exacta o, si es larga, dentro de una
    // palabra leída ("lgonzalez.ficticioecorreo.cl" contiene "lgonzalezficticio")
    for (const w of id.split(/[\s@]+/)){
      const n = norm(w);
      if (n.length >= 4 && (palabras.has(n) || (n.length >= 6 && [...palabras].some(p => p.includes(n))))) out.push(w);
    }
  }
  return out;
}

test("el detector de estas pruebas encuentra un correo con la «@» mal leída (control)", () => {
  const psa = DOCUMENTOS.find(d => d.nombre === "PSA");
  assert.deepEqual(identificadoresEn("Correo de contacto: lgonzalez.ficticioecorreo.cl", psa), ["GONZÁLEZ", "lgonzalez.ficticio", "correo.cl"]);
});

for (const d of DOCUMENTOS){
  test(`foto del ${d.nombre}: sin identificadores, con la edad y las fechas clínicas, sin tocar la pantalla`, {skip: saltar}, async () => {
    const pg = await abrir(AJ_CLAUDE);
    const foto = await pg.evaluate(FOTOGRAFIAR, d.texto);
    await pg.evaluate(u => window.__foto(u), foto);
    await pg.click("#btnCamara");
    await esperar(pg, () => !document.querySelector("#camDisparo").disabled);
    await pg.click("#camDisparo");
    await esperar(pg, () => document.querySelectorAll("#camMini img").length === 1);
    await pg.click("#camListo");
    await esperarCasos(pg);
    const estado = (await estados(pg))[0];
    const enviado = pg.envios.length ? pg.envios[0].cuerpo.messages[0].content : "";
    const caso = enviado.slice(enviado.indexOf("=== TEXTO DEL MÉDICO ===") + 25);
    const fechas = d.clinicas.map(f => f.replace(/\s+\d{1,2}:\d{2}$/, ""));
    informe.push({d, estado, caso, fechasVistas: fechas.filter(f => caso.includes(f)), fechas});
    assert.equal(estado, "Listo", await pg.textContent("#casos"));
    assert.equal(pg.envios.length, 1);
    assert.deepEqual(identificadoresEn(caso, d), [], "salió un identificador:\n" + caso);
    assert.match(caso, new RegExp("edad: " + d.nacimiento.edad + " años"), "la fecha de nacimiento no pasó a la edad:\n" + caso);
    // Fechas clínicas: a la vista (la lectura del teléfono puede errar alguna cifra; se exige la mayoría)
    assert.ok(informe[informe.length - 1].fechasVistas.length >= Math.ceil(fechas.length / 2), "faltan fechas clínicas:\n" + caso);
    await pg.context().close();
  });
}

test("un caso con un RUT que no se puede ocultar queda en «Requiere revisión» y no se envía", {skip: saltar}, async () => {
  const pg = await abrir(AJ_CLAUDE);
  // (simula que volver a ocultar no bastó: en la práctica, el validador lo oculta y el caso sigue)
  await pg.evaluate(() => { window.__velo.rondas = 0; });
  const texto = "ORINA COMPLETA\nDocumento del paciente 12 345 678-5\nFecha de toma de muestra: 28/04/2025\nNitritos: positivo";
  const foto = await pg.evaluate(FOTOGRAFIAR, texto);
  await pg.evaluate(u => window.__foto(u), foto);
  await pg.click("#btnCamara");
  await esperar(pg, () => !document.querySelector("#camDisparo").disabled);
  await pg.click("#camDisparo");
  await esperar(pg, () => document.querySelectorAll("#camMini img").length === 1);
  await pg.click("#camListo");
  await esperarCasos(pg);
  assert.deepEqual(await estados(pg), ["Requiere revisión"]);
  const msg = await pg.textContent(".caso-auto");
  assert.match(msg, /quedó a la vista RUT «12 345 678-5»/);
  assert.equal(pg.envios.length, 0, "no debe salir nada");
  informe.push({revision: msg.replace(/\s+/g, " ").trim()});
  await pg.context().close();
});

test.after(() => {
  if (!process.env.VELO_INFORME || !informe.length) return;
  const md = informe.map(r => r.revision ? "## Caso con RUT residual\n\n" + r.revision + "\n\nEnvíos a la IA: 0.\n" :
    "## " + r.d.nombre + " · " + r.estado + "\n\nFechas clínicas a la vista: " + r.fechasVistas.length + " de " + r.fechas.length +
    (r.fechasVistas.length < r.fechas.length ? " (faltan: " + r.fechas.filter(f => !r.fechasVistas.includes(f)).join(", ") + ")" : "") +
    "\n\n```\n" + r.caso.trim() + "\n```\n").join("\n");
  fs.writeFileSync(process.env.VELO_INFORME, "# Texto anonimizado final de cada documento sintético (fotografiado)\n\n" + md);
});
