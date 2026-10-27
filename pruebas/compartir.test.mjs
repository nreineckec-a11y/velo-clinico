// Sin clave API: el caso se prepara (prompt + texto anonimizado) y el médico lo comparte como .txt con su app de IA;
// después pega la respuesta para verla con los datos reales. La hoja de compartir y el portapapeles se simulan.
// Requiere Playwright y Chromium (npm install); sin ellos se saltan. Todos los datos son ficticios.
import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {saltar, abrir, AJ_CLAUDE, archivoTexto, esperar, esperarCasos, estados, guardados, RAIZ_APP} from "./navegador.mjs";

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

/* ---------- caso escrito, pegado o dictado ---------- */
const ESCRITO = "Hazme una interconsulta a urología.\nPaciente Juan Pérez Soto, RUT 12.345.678-5, F. Nac 14/07/1958, fono +56 9 8765 4321.\nAPE 6,4 ng/ml (12/02/2026). Creatinina 1,1 mg/dL. Orden 4471208.";

test("escribir el caso en la pantalla principal: mismo flujo (ocultar, validar, compartir), sin fotos", {skip: saltar}, async () => {
  const pg = await abrir({auto: true, tarea: "ic"}, null, SIMULAR);
  assert.equal(await pg.isDisabled("#btnProcesarTexto"), true, "sin texto no hay nada que procesar");
  await pg.fill("#entradaAuto", ESCRITO);
  assert.equal(await pg.isDisabled("#btnProcesarTexto"), false);
  await pg.click("#btnProcesarTexto");
  assert.equal(await pg.inputValue("#entradaAuto"), "", "el cuadro se vacía: el texto no queda a la vista");
  await esperarEstado(pg, "Listo para compartir");
  assert.equal(pg.envios.length, 0);
  await pg.click("[data-compartir]");
  await esperarEstado(pg, "Compartido");
  const [c] = await pg.evaluate(() => window.__compartido);
  assert.equal(c.nombre, "velo-interconsulta.txt");
  assert.match(c.texto, /INSTRUCCIONES DEL PROYECTO «INTERCONSULTA»/);
  // Lo que pidió el médico viaja; lo personal no; las fechas clínicas y los valores quedan
  assert.match(c.texto, /Hazme una interconsulta a urología\./);
  assert.match(c.texto, /Paciente \[NOMBRE_1\], RUT \[RUT_1\], edad: 67 años, fono \[TELEFONO_1\]\./);
  assert.match(c.texto, /APE 6,4 ng\/ml \(12\/02\/2026\)\. Creatinina 1,1 mg\/dL\. Orden \[FICHA_1\]\./);
  assert.deepEqual([...DATOS, "8765", "4471208"].filter(d => c.texto.includes(d)), []);
  // La respuesta vuelve con los datos reales
  await pg.evaluate(() => { window.__portapapeles = "Se deriva a [NOMBRE_1] (RUT [RUT_1])."; });
  await pg.click("[data-pegar]");
  await esperarEstado(pg, "Listo");
  assert.match(await pg.textContent(".caso-auto .resp"), /Se deriva a Juan Pérez Soto \(RUT 12\.345\.678-5\)\./);
  // El texto original no queda guardado en el teléfono
  const [g] = await guardados(pg);
  assert.equal(g.fotos, 0);
  await pg.context().close();
});

test("texto escrito con un dato que no se puede ocultar: «Requiere revisión» y no se envía", {skip: saltar}, async () => {
  const pg = await abrir(AJ_CLAUDE, null, SIMULAR);
  await pg.evaluate(() => { window.__velo.rondas = 0; });
  await pg.fill("#entradaAuto", "Documento del paciente 12 345 678-5. Creatinina 1,1 mg/dL.");
  await pg.click("#btnProcesarTexto");
  await esperarEstado(pg, "Requiere revisión");
  assert.equal(pg.envios.length, 0);
  await pg.context().close();
});

test("«Conservar las fotos originales» guarda solo imágenes: el texto escrito y los archivos de texto se borran siempre", {skip: saltar}, async () => {
  const pg = await abrir({auto: true, tarea: "exam", conservarFotos: true}, null, SIMULAR);
  await pg.fill("#entradaAuto", ESCRITO);
  await pg.click("#btnProcesarTexto");
  await esperarEstado(pg, "Listo para compartir");
  assert.equal((await guardados(pg))[0].fotos, 0, "el texto escrito no se conserva");
  // (un caso con un .txt y una foto: el lector de fotos pone el texto de la foto y el archivo de texto va aparte)
  await pg.setInputFiles("#adjuntoAuto", [{name: "caso.txt", mimeType: "text/plain", buffer: Buffer.from(ESCRITO)},
    {name: "p.jpg", mimeType: "image/jpeg", buffer: readFileSync(RAIZ_APP + "pruebas/epicrisis/pagina2.jpg")}]);
  await esperar(pg, () => [...document.querySelectorAll(".caso-auto .insignia")].filter(e => /compartir/.test(e.textContent)).length === 2);
  const casos = await guardados(pg);
  assert.deepEqual(casos.map(c => c.fotos).sort(), [0, 1], "del caso con un .txt y una foto, solo queda la foto");
  await pg.context().close();
});

/* ---------- los prompts siempre se alcanzan (sin desplazar de lado) ---------- */
test("pantalla angosta o ancha: todos los botones de prompt quedan dentro de la página, en ambos modos", {skip: saltar}, async () => {
  for (const ancho of [320, 390, 700, 1280]){
    const pg = await abrir({auto: true, tarea: "ic"}, null, SIMULAR);
    await pg.setViewportSize({width: ancho, height: 800});
    for (const [modo, fila] of [["auto", "#tareasAuto"], ["manual", "#tareas"]]){
      if (modo === "manual"){ await pg.click("#btnManual"); }
      const r = await pg.evaluate(f => {
        const fila = document.querySelector(f), caja = fila.getBoundingClientRect();
        return {n: fila.querySelectorAll(".chip").length, desborda: fila.scrollWidth > fila.clientWidth + 1,
          fuera: [...fila.querySelectorAll(".chip")].filter(c => { const b = c.getBoundingClientRect(); return b.right > innerWidth + 1 || b.left < -1 || b.right > caja.right + 1; }).length,
          pagina: document.documentElement.scrollWidth > innerWidth + 1};
      }, fila);
      assert.equal(r.n, 7);
      assert.deepEqual([r.desborda, r.fuera, r.pagina], [false, 0, false], `${modo} a ${ancho} px: ${JSON.stringify(r)}`);
    }
    // El último prompt se puede tocar con un clic normal
    await pg.click('#tareas [data-t="cert"]');
    await pg.context().close();
  }
});
