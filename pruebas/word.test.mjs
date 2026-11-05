// Documentos Word y archivos de los proyectos: la IA escribe el documento en un bloque «<<<WORD …>>>» y la app arma el
// .docx en el dispositivo, con los datos reales; los archivos de referencia (mapa de derivación, plantillas) van con el
// prompt. Las pruebas en el navegador requieren Playwright y Chromium; sin ellos se saltan. Todos los datos son ficticios.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {cargarMotor} from "./cargar-motor.mjs";
import {saltar, abrir, AJ_CLAUDE, archivoTexto, RAIZ_APP, estados, esperarCasos} from "./navegador.mjs";

const Anon = cargarMotor();
// El contenido de un archivo de un .zip sin comprimir (como los que crea la app)
function deZip(u8, nombre){
  const ent = Anon.entradasZip(u8).find(e => e.nombre === nombre); assert.ok(ent, "falta " + nombre);
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength), ini = ent.off + 30 + dv.getUint16(ent.off + 26, true) + dv.getUint16(ent.off + 28, true);
  assert.equal(ent.metodo, 0);
  return new TextDecoder().decode(u8.subarray(ini, ini + ent.csize));
}
const RESPUESTA = "<<<WORD Telecardiología [NOMBRE_1].docx>>>\n# SOLICITUD DE TELECARDIOLOGÍA\n| Campo | Dato |\n|---|---|\n| Paciente | [NOMBRE_1] |\n| ECG | Ritmo sinusal<br>BRD completo |\n**Plan:** presentar en telecardiología.\n<<<FIN WORD>>>\nDATOS FALTANTES: ecocardiograma";

test("bloques Word: nombre del archivo sin marcadores, contenido, varios bloques y bloque cortado", () => {
  const b = Anon.bloquesWord("Antes\n" + RESPUESTA + "\n<<<WORD consultoría COSAM>>>\n# Consultoría\nTexto cortado");
  assert.equal(b.length, 2);
  assert.equal(b[0].nombre, "Telecardiologia.docx");
  assert.match(b[0].contenido, /^# SOLICITUD DE TELECARDIOLOGÍA\n/);
  assert.doesNotMatch(b[0].contenido, /FIN WORD|DATOS FALTANTES/);
  assert.equal(b[1].nombre, "consultoria COSAM.docx");
  assert.equal(b[1].contenido, "# Consultoría\nTexto cortado");
  assert.equal(Anon.bloquesWord("Una IC narrativa, sin Word.").length, 0);
});

test("crearDocx: un .docx válido con título, tabla, negrita, saltos de línea y caracteres especiales", () => {
  const u8 = Anon.crearDocx("# Título\n| A | B |\n|---|---|\n| 1 & 2 | x<br>y |\n**Rótulo:** valor <5\n- viñeta");
  assert.deepEqual([...Anon.entradasZip(u8)].map(e => e.nombre), ["[Content_Types].xml", "_rels/.rels", "word/_rels/document.xml.rels", "word/document.xml", "word/styles.xml"]);
  const doc = deZip(u8, "word/document.xml");
  assert.match(doc, /<w:pStyle w:val="Titulo"\/><\/w:pPr><w:r><w:t xml:space="preserve">Título<\/w:t>/);
  assert.equal((doc.match(/<w:tr>/g) || []).length, 2);
  assert.match(doc, /1 &amp; 2/);
  assert.match(doc, /<w:br\/><w:t xml:space="preserve">y<\/w:t>/);
  assert.match(doc, /<w:rPr><w:b\/><\/w:rPr><w:t xml:space="preserve">Rótulo:<\/w:t>/);
  assert.match(doc, /valor &lt;5/);
  assert.match(doc, /• viñeta/);
});

test("el prompt «Interconsulta» es el del proyecto y la app pide los Word en su formato", () => {
  const html = fs.readFileSync(RAIZ_APP + "index.html", "utf8");
  const P = JSON.parse(html.match(/^const P = (\{.*\});$/m)[1]);
  assert.match(P.ic, /^# PROMPT — GENERADOR DE INTERCONSULTAS APS \(CHILE\)/);
  for (const x of ["REGLA CERO", "Televascular", "Telecardiología", "Consultoría COSAM", "máximo 2000 caracteres", "DATOS FALTANTES"]) assert.ok(P.ic.includes(x), x);
  assert.match(html, /const NOTA_WORD = /);
});

const AJ_IC = Object.assign({}, AJ_CLAUDE, {tarea: "ic"});
const responderWord = () => ({status: 200, json: {content: [{type: "text", text: RESPUESTA}], stop_reason: "end_turn"}});

test("archivos del proyecto: un Excel se agrega en Ajustes y su texto va con el prompt; un archivo con RUT no se acepta", {skip: saltar}, async () => {
  const pg = await abrir(AJ_IC, responderWord);
  await pg.click("#btnAjustes");
  await pg.selectOption("#ajArchTarea", "ic");
  await pg.setInputFiles("#ajArchInput", {name: "mapa-ficticio.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: fs.readFileSync(new URL("./mapa-ficticio.xlsx", import.meta.url))});
  await pg.waitForFunction(() => /agregado/.test(document.querySelector("#ajArchEstado").textContent));
  assert.match(await pg.textContent("#ajArchLista"), /mapa-ficticio\.xlsx/);
  await pg.setInputFiles("#ajArchInput", archivoTexto("Paciente con RUT 12.345.678-5", "lista.txt"));
  await pg.waitForFunction(() => /no se agregó/.test(document.querySelector("#ajArchEstado").textContent));
  assert.match(await pg.textContent("#ajArchEstado"), /trae un RUT/);
  await pg.click("#ajCerrar");
  await pg.setInputFiles("#adjuntoAuto", archivoTexto("Paciente: Juan Pérez Soto, 67 años. FA paroxística. Derivar a Telecardiología."));
  await esperarCasos(pg);
  const enviado = pg.envios[0].cuerpo.messages[0].content;
  assert.match(enviado, /=== ARCHIVOS DEL PROYECTO «INTERCONSULTA»/);
  assert.match(enviado, /--- mapa-ficticio\.xlsx ---\n## Hoja: HOSPITAL FICTICIO\n/);
  // (las columnas con el mismo valor en todas las filas se dicen una vez; los saltos de línea de una celda no parten la fila)
  assert.match(enviado, /Origen: CESFAM Ficticio \(en todas las filas\)/);
  assert.match(enviado, /I48 \| FIBRILACION Y ALETEO AURICULAR \| Cardiologia \| Derivar con ECG y Holter de ritmo\. Presentar en telecardiología\./);
  assert.match(enviado, /## Hoja: COSAM FICTICIO/);
  assert.match(enviado, /DOCUMENTOS WORD \(nota de la app\)/);
  assert.match(enviado, /# PROMPT — GENERADOR DE INTERCONSULTAS APS/);
  assert.ok(!enviado.includes("Pérez"), "el caso va anonimizado");
  assert.deepEqual(pg.errores, []);
  await pg.context().close();
});

test("modo automático: «Descargar Word» arma el .docx en el dispositivo con los datos reales", {skip: saltar}, async () => {
  const pg = await abrir(AJ_IC, responderWord);
  await pg.setInputFiles("#adjuntoAuto", archivoTexto("Paciente: Juan Pérez Soto, 67 años. FA paroxística. Derivar a Telecardiología."));
  await esperarCasos(pg);
  assert.deepEqual(await estados(pg), ["Listo"]);
  const vista = await pg.textContent(".caso-auto .resp");
  assert.match(vista, /Documento Word: Telecardiologia\.docx/);
  assert.doesNotMatch(vista, /<<<|FIN WORD/);
  const [d] = await Promise.all([pg.waitForEvent("download"), pg.click(".caso-auto [data-word]")]);
  assert.equal(d.suggestedFilename(), "Telecardiologia.docx");
  const doc = deZip(new Uint8Array(fs.readFileSync(await d.path())), "word/document.xml");
  assert.match(doc, /Juan Pérez Soto/, "en el Word van los datos reales");
  assert.doesNotMatch(doc, /\[NOMBRE_1\]/);
  assert.match(doc, /SOLICITUD DE TELECARDIOLOGÍA/);
  assert.doesNotMatch(doc, /DATOS FALTANTES/, "lo que va fuera del bloque no entra al documento");
  // Copiar deja el texto sin las líneas del bloque
  assert.deepEqual(pg.errores, []);
  await pg.context().close();
});

test("modo manual: con la respuesta pegada, «Descargar Word» también arma el .docx con los datos reales", {skip: saltar}, async () => {
  const pg = await abrir({auto: false, provV2: true, prov: "compartir", tarea: "ic"});
  await pg.fill("#entrada", "Paciente: Juan Pérez Soto, 67 años. FA paroxística. Derivar a Telecardiología.");
  await pg.waitForTimeout(500);
  await pg.click("#copiarAnon");
  await pg.fill("#pegada", RESPUESTA);
  await pg.click("#agregarResp");
  const [d] = await Promise.all([pg.waitForEvent("download"), pg.click("#hilo [data-word]")]);
  const doc = deZip(new Uint8Array(fs.readFileSync(await d.path())), "word/document.xml");
  assert.match(doc, /Juan Pérez Soto/);
  assert.deepEqual(pg.errores, []);
  await pg.context().close();
});

/* ---------- plantillas Word del médico: la app rellena el archivo original ---------- */
import zlib from "node:zlib";
// Un .docx como los de Word: con sus partes comprimidas (deflate)
function zipComprimido(partes){
  const loc = [], cen = []; let off = 0;
  for (const [n, txt] of partes){
    const nb = Buffer.from(n), datos = Buffer.from(txt), comp = zlib.deflateRawSync(datos), crc = zlib.crc32(datos);
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(8, 8); lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(datos.length, 22); lh.writeUInt16LE(nb.length, 26);
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(8, 10); ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(datos.length, 24); ch.writeUInt16LE(nb.length, 28); ch.writeUInt32LE(off, 42);
    loc.push(lh, nb, comp); cen.push(ch, nb); off += 30 + nb.length + comp.length;
  }
  const c = Buffer.concat(cen), fin = Buffer.alloc(22); fin.writeUInt32LE(0x06054b50, 0); fin.writeUInt16LE(partes.length, 8); fin.writeUInt16LE(partes.length, 10); fin.writeUInt32LE(c.length, 12); fin.writeUInt32LE(off, 16);
  return new Uint8Array(Buffer.concat([...loc, c, fin]));
}
// Una plantilla FICTICIA: identificación en una tabla, un campo en una frase, uno solo en su párrafo y uno partido en
// trozos (como queda en Word al escribir), dentro de un .docx comprimido
function plantillaFicticia(){
  const u8 = Anon.crearDocx("# FICHA FICTICIA DE PRUEBA\n| Nombre: {{NOMBRE}} |\n|---|\n| Edad: {{EDAD: años}} |\nMotivo: {{MOTIVO}}\n{{DESCRIPCION: anamnesis y luego la historia}}\nDiagnóstico: {{DIAG**NOS**TICO}}\nFirma del profesional");
  return zipComprimido([...Anon.entradasZip(u8)].map(e => [e.nombre, deZip(u8, e.nombre)]));
}

test("plantillas: detecta los campos con su indicación, también uno partido en trozos, en un .docx comprimido", async () => {
  const c = [...await Anon.camposPlantilla(plantillaFicticia())].map(x => x.id + (x.indicacion ? ":" + x.indicacion : ""));
  assert.deepEqual(c, ["NOMBRE", "EDAD:años", "MOTIVO", "DESCRIPCION:anamnesis y luego la historia", "DIAGNOSTICO"]);
});

test("plantillas: el bloque «| plantilla: ID» trae los campos; la app rellena el original", async () => {
  const [w] = Anon.bloquesWord("<<<WORD Ficha [NOMBRE_1].docx | plantilla: Ficha ficticia>>>\n## NOMBRE\nJuan Pérez Soto\n## Edad\n67\n## DESCRIPCION\n67 años\nAM: HTA\n\nPaciente con **ánimo bajo** & insomnio.\n## DIAGNÓSTICO\nTEPT\n<<<FIN WORD>>>");
  assert.equal(w.plantilla, "FICHA_FICTICIA");
  assert.deepEqual(Object.keys(w.campos), ["NOMBRE", "EDAD", "DESCRIPCION", "DIAGNOSTICO"]);
  const doc = deZip(await Anon.rellenarPlantilla(plantillaFicticia(), w.campos), "word/document.xml");
  assert.match(doc, /FICHA FICTICIA DE PRUEBA/, "el resto de la plantilla queda igual");
  assert.match(doc, /Nombre: Juan Pérez Soto/);
  assert.match(doc, /Edad: 67/);
  assert.match(doc, /Motivo: <\/w:t>/, "un campo sin valor queda vacío");
  // El campo solo en su párrafo pasa a un párrafo por línea, con la negrita y los caracteres especiales
  assert.match(doc, />67 años<\/w:t><\/w:r><\/w:p><w:p>(<w:pPr>[^]*?<\/w:pPr>)?<w:r>(<w:rPr>[^]*?<\/w:rPr>)?<w:t xml:space="preserve">AM: HTA</);
  assert.match(doc, /<w:b\/>[^]*?ánimo bajo/);
  assert.match(doc, /&amp; insomnio/);
  assert.match(doc, /Diagnóstico: TEPT/, "el campo partido en trozos también se rellena");
  assert.doesNotMatch(doc, /\{\{|\}\}/);
});

test("plantillas: al agregar un Word con campos se guarda como plantilla; «Descargar Word» rellena el original con los datos reales", {skip: saltar}, async () => {
  const resp = "<<<WORD Ficha [NOMBRE_1].docx | plantilla: PLANTILLA_FICTICIA>>>\n## NOMBRE\n[NOMBRE_1]\n## EDAD\n67\n## DESCRIPCION\n67 años\n\nCuadro ansioso de 3 meses.\n## DIAGNOSTICO\nTAG\n<<<FIN WORD>>>";
  const pg = await abrir(AJ_IC, () => ({status: 200, json: {content: [{type: "text", text: resp}], stop_reason: "end_turn"}}));
  await pg.click("#btnAjustes"); await pg.selectOption("#ajArchTarea", "ic");
  await pg.setInputFiles("#ajArchInput", {name: "plantilla ficticia.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", buffer: Buffer.from(plantillaFicticia())});
  await pg.waitForFunction(() => /agregado/.test(document.querySelector("#ajArchEstado").textContent));
  assert.match(await pg.textContent("#ajArchEstado"), /como plantilla Word con 5 campos/);
  assert.match(await pg.textContent("#ajArchLista"), /plantilla Word/);
  await pg.click("#ajCerrar");
  await pg.setInputFiles("#adjuntoAuto", archivoTexto("Paciente: Juan Pérez Soto, 67 años. Ansiedad. Presentar en consultoría COSAM."));
  await esperarCasos(pg);
  const enviado = pg.envios[0].cuerpo.messages[0].content;
  assert.match(enviado, /PLANTILLA WORD «plantilla ficticia\.docx» \(identificador: PLANTILLA_FICTICIA\)/);
  assert.match(enviado, /<<<WORD plantilla ficticia\.docx \| plantilla: PLANTILLA_FICTICIA>>>\n## NOMBRE\n\(valor\)/);
  assert.match(enviado, /- DESCRIPCION: anamnesis y luego la historia/);
  const [d] = await Promise.all([pg.waitForEvent("download"), pg.click(".caso-auto [data-word]")]);
  const doc = deZip(new Uint8Array(fs.readFileSync(await d.path())), "word/document.xml");
  assert.match(doc, /FICHA FICTICIA DE PRUEBA/);
  assert.match(doc, /Nombre: Juan Pérez Soto/, "en la plantilla van los datos reales");
  assert.match(doc, /Cuadro ansioso de 3 meses/);
  assert.deepEqual(pg.errores, []);
  await pg.context().close();
});
