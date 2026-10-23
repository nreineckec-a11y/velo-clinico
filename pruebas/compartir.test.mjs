// Sin clave API: el caso se prepara (prompt + texto anonimizado) y el médico lo comparte como .txt con su app de IA;
// después pega la respuesta para verla con los datos reales. La hoja de compartir y el portapapeles se simulan.
// Requiere Playwright y Chromium (npm install); sin ellos se saltan. Todos los datos son ficticios.
import test from "node:test";
import assert from "node:assert/strict";
import {saltar, abrir, AJ_CLAUDE, archivoTexto, esperar, esperarCasos, estados, guardados} from "./navegador.mjs";

const CASO = "Paciente: Juan Pérez Soto, RUT 12.345.678-5. Fecha de nacimiento: 14/07/1958. Creatinina 1,1 mg/dL. Fecha de toma: 12/03/2025.";
const DATOS = ["Juan", "Pérez", "Soto", "12.345.678", "14/07/1958"];
// Hoja de compartir y portapapeles simulados: queda registrado lo compartido y lo copiado
const SIMULAR = () => {
  window.__compartido = []; window.__copiado = null; window.__portapapeles = "";
  navigator.canShare = () => true;
  navigator.share = async d => { window.__compartido.push({nombre: d.files ? d.files[0].name : null, tipo: d.files ? d.files[0].type : null, texto: d.files ? await d.files[0].text() : d.text}); };
  Object.defineProperty(navigator, "clipboard", {value: {
    readText: async () => { if (window.__portapapeles === null) throw new Error("sin permiso"); return window.__portapapeles; },
    writeText: async t => { window.__copiado = t; }
  }});
};
const esperarEstado = (pg, e) => esperar(pg, e => (document.querySelector(".caso-auto .insignia") || {}).textContent === e, e);

test("por omisión, sin clave: el caso queda «Listo para compartir», no se conecta a nada y se comparte como .txt", {skip: saltar}, async () => {
  const pg = await abrir({auto: true, tarea: "exam"}, null, SIMULAR);
  assert.match(await pg.textContent("#autoInfo"), /para compartirlo con tu app de IA · Prompt: Transcriptor de exámenes\./);
  await pg.setInputFiles("#adjuntoAuto", archivoTexto(CASO));
  await esperarEstado(pg, "Listo para compartir");
  assert.equal(pg.envios.length, 0, "la app no envía nada");
  await pg.click("[data-compartir]");
  await esperarEstado(pg, "Compartido");
  const [c] = await pg.evaluate(() => window.__compartido);
  assert.equal(c.nombre, "velo-transcriptor-de-examenes.txt", "nombre genérico, sin datos");
  assert.equal(c.tipo, "text/plain");
  assert.match(c.texto, /INSTRUCCIONES DEL PROYECTO «TRANSCRIPTOR DE EXÁMENES»/);
  assert.match(c.texto, /=== TEXTO DEL MÉDICO ===\nPaciente: \[NOMBRE_1\], RUT \[RUT_1\]\. edad: 66 años\. Creatinina 1,1 mg\/dL\. Fecha de toma: 12\/03\/2025\./);
  assert.deepEqual(DATOS.filter(d => c.texto.includes(d)), []);
  assert.doesNotMatch(c.texto, /no puedes crear archivos/, "con su app de IA, el médico sí puede recibir archivos (.docx)");
  assert.equal(c.texto, await pg.evaluate(() => document.querySelector(".caso-auto details pre").textContent), "lo compartido es lo que se ve en «Ver lo enviado»");
  // La respuesta de la IA vuelve desde el portapapeles y se ve con los datos reales
  await pg.evaluate(() => { window.__portapapeles = "Laboratorio 12/03/2025\nCrea 1,1 mg/dL de [NOMBRE_1]"; });
  await pg.click("[data-pegar]");
  await esperarEstado(pg, "Listo");
  assert.match(await pg.textContent(".caso-auto .resp"), /Crea 1,1 mg\/dL de Juan Pérez Soto/);
  const [g] = await guardados(pg);
  assert.equal(g.estado, "listo"); assert.ok(g.tieneRespuesta);
  await pg.click("[data-copiar-caso]");
  assert.match(await pg.evaluate(() => window.__copiado), /Crea 1,1 mg\/dL de Juan Pérez Soto/);
  assert.deepEqual(pg.errores, []);
  await pg.context().close();
});

test("si no se puede leer lo copiado, un cuadro para pegar; lo escrito no se pierde aunque otro caso termine mientras tanto", {skip: saltar}, async () => {
  const pg = await abrir({auto: true, tarea: "exam"}, null, SIMULAR);
  await pg.evaluate(() => { window.__portapapeles = null; });
  await pg.setInputFiles("#adjuntoAuto", archivoTexto(CASO));
  await esperarEstado(pg, "Listo para compartir");
  await pg.click("[data-pegar]");
  await pg.waitForSelector("textarea[data-pegada]");
  await pg.type("textarea[data-pegada]", "Resumen de [NOMBRE_1]");
  // Otro caso termina mientras se escribe: la lista no se repinta (si no, se perdería lo escrito)
  await pg.evaluate(() => document.querySelector("#adjuntoAuto").dispatchEvent(new Event("noop")));
  await pg.setInputFiles("#adjuntoAuto", archivoTexto("Hemoglobina 12,8 g/dL. Fecha de toma: 12/03/2025."));
  await pg.focus("textarea[data-pegada]");
  await pg.waitForTimeout(800);
  assert.equal(await pg.inputValue("textarea[data-pegada]"), "Resumen de [NOMBRE_1]");
  await pg.click("[data-ver-respuesta]");
  await esperar(pg, () => [...document.querySelectorAll(".caso-auto .insignia")].map(e => e.textContent).join() === "Listo para compartir,Listo");
  assert.match(await pg.textContent(".caso-auto:last-child .resp"), /Resumen de Juan Pérez Soto/);
  await pg.context().close();
});

test("sin hoja de compartir (computador), «Compartir» copia el texto", {skip: saltar}, async () => {
  const pg = await abrir({auto: true, tarea: "ic"}, null, () => {
    window.__copiado = null;
    Object.defineProperty(navigator, "share", {value: undefined}); Object.defineProperty(navigator, "canShare", {value: undefined});
    Object.defineProperty(navigator, "clipboard", {value: {writeText: async t => { window.__copiado = t; }, readText: async () => ""}});
  });
  await pg.setInputFiles("#adjuntoAuto", archivoTexto(CASO));
  await esperarEstado(pg, "Listo para compartir");
  await pg.click("[data-compartir]");
  await esperarEstado(pg, "Compartido");
  const t = await pg.evaluate(() => window.__copiado);
  assert.match(t, /INSTRUCCIONES DEL PROYECTO «INTERCONSULTA»/);
  assert.deepEqual(DATOS.filter(d => t.includes(d)), []);
  await pg.context().close();
});

test("quien usaba una clave API pasa una vez a «Compartir» (la clave queda guardada); con clave, la IA recibe el aviso de que no puede crear archivos", {skip: saltar}, async () => {
  const pg = await abrir({auto: true, prov: "claude", claves: {claude: "sk-ant-prueba"}, recordar: true, tarea: "exam"}, null, SIMULAR);
  const aj = await pg.evaluate(() => JSON.parse(localStorage.getItem("velo_ajustes")));
  assert.equal(aj.prov, "compartir"); assert.equal(aj.claves.claude, "sk-ant-prueba"); assert.equal(aj.provV2, true);
  await pg.context().close();
  // Quien vuelve a elegir la clave en Ajustes la conserva; el mensaje directo lleva el aviso de los archivos
  const pg2 = await abrir(AJ_CLAUDE, null, SIMULAR);
  await pg2.setInputFiles("#adjuntoAuto", archivoTexto(CASO));
  await esperarCasos(pg2);
  assert.deepEqual(await estados(pg2), ["Listo"]);
  assert.match(pg2.envios[0].cuerpo.messages[0].content, /En esta app no puedes crear archivos/);
  await pg2.context().close();
});

test("modo manual: «Compartir .txt» comparte el texto anonimizado con el prompt, sin el aviso de archivos", {skip: saltar}, async () => {
  const pg = await abrir({auto: false}, null, SIMULAR);
  await pg.click('#tareas [data-t="cert"]');
  await pg.fill("#entrada", CASO);
  await pg.waitForTimeout(500);
  assert.equal(await pg.evaluate(() => document.querySelector("#otras").open), true, "fuera de Claude, la sección de copiar y compartir viene abierta");
  await pg.click("#compartirAnon");
  await esperar(pg, () => window.__compartido.length === 1);
  const [c] = await pg.evaluate(() => window.__compartido);
  assert.equal(c.nombre, "velo-certificados.txt");
  assert.match(c.texto, /INSTRUCCIONES DEL PROYECTO «CERTIFICADOS»/);
  assert.deepEqual(DATOS.filter(d => c.texto.includes(d)), []);
  assert.doesNotMatch(c.texto, /no puedes crear archivos/);
  await pg.context().close();
});
