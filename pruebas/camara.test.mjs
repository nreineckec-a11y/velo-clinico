// Cámara y lector: ráfaga, foto fija, linterna, poca luz, hojas giradas, calidad de la lectura y lectura en paralelo.
// La cámara se simula (navegador.mjs) con las fotos de la epicrisis FICTICIA; nada sale a internet.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {cargarMotor} from "./cargar-motor.mjs";
import {saltar, abrir, AJ_CLAUDE, RAIZ_APP as RAIZ, esperarCasos, esperar} from "./navegador.mjs";

const Anon = cargarMotor();
const foto = n => fs.readFileSync(RAIZ + "pruebas/epicrisis/pagina" + n + ".jpg");
const textoEnviado = e => e.cuerpo.messages[0].content.split("=== TEXTO DEL MÉDICO ===")[1];
// La foto, girada o desenfocada, hecha en la propia página
const transformar = (pg, n, giro, blur) => pg.evaluate(async ([b64, giro, blur]) => {
  const im = new Image(); im.src = "data:image/jpeg;base64," + b64; await im.decode();
  const c = document.createElement("canvas"), r = giro % 180 !== 0;
  c.width = r ? im.naturalHeight : im.naturalWidth; c.height = r ? im.naturalWidth : im.naturalHeight;
  const g = c.getContext("2d"); if (blur) g.filter = "blur(" + blur + "px)";
  g.translate(c.width / 2, c.height / 2); g.rotate(giro * Math.PI / 180); g.drawImage(im, -im.naturalWidth / 2, -im.naturalHeight / 2);
  return c.toDataURL("image/jpeg", 0.92).split(",")[1];
}, [foto(n).toString("base64"), giro || 0, blur || 0]).then(b => Buffer.from(b, "base64"));

/* ---------- el motor: calidad de la lectura y elección del giro ---------- */
test("calidad de una lectura: cuentan las palabras de verdad, con su confianza", () => {
  const q = Anon.calidadLectura([{texto: "Hemoglobina", conf: 95}, {texto: "13,5", conf: 90}, {texto: "—", conf: 20}, {texto: "|", conf: 10}, {texto: "g/dL", conf: 60}, {texto: "xq", conf: 40}]);
  assert.equal(q.n, 4, "los guiones y rayas sueltos no cuentan");
  assert.equal(q.conf, (95 + 90 + 60 + 40) / 4);
  assert.equal(q.puntaje, 11, "solo las letras de las palabras bien leídas");
  assert.deepEqual({...Anon.calidadLectura([])}, {n: 0, conf: 0, puntaje: 0});
  assert.equal(Anon.lecturaPobre({n: 200, conf: 91, puntaje: 900}), false);
  assert.equal(Anon.lecturaPobre({n: 158, conf: 66, puntaje: 13}), true, "una hoja al revés");
  assert.equal(Anon.lecturaPobre({n: 3, conf: 90, puntaje: 10}), true, "casi nada leído");
  assert.equal(Anon.lecturaDudosa({n: 200, conf: 79, puntaje: 440}), false, "algo suave pero legible: sin aviso");
  assert.equal(Anon.lecturaDudosa({n: 105, conf: 49, puntaje: 0}), true);
  assert.equal(Anon.lecturaDudosa(null), true);
});
test("elección del giro: solo si otro giro se lee claramente mejor", () => {
  assert.equal(Anon.elegirGiro([0, 21, 0, 546]), 270);
  assert.equal(Anon.elegirGiro([13, 0, 517, 0]), 180);
  assert.equal(Anon.elegirGiro([0, 483, 0, 9]), 90);
  assert.equal(Anon.elegirGiro([182, 0, 3, 0]), 0, "ya está al derecho");
  assert.equal(Anon.elegirGiro([0, 0, 0, 0]), 0, "ilegible en todos los giros: no se toca");
  assert.equal(Anon.elegirGiro([0, 0, 7, 0]), 0, "unas pocas letras sueltas no bastan");
  assert.equal(Anon.elegirGiro([100, 0, 150, 0]), 0, "una diferencia chica no basta");
});

/* ---------- hojas giradas ---------- */
test("modo automático: una hoja de lado o al revés se gira sola antes de leer; no sale texto sin sentido ni datos", {skip: saltar}, async () => {
  const pg = await abrir(AJ_CLAUDE);
  let n = 0;
  for (const giro of [90, 180]){
    await pg.setInputFiles("#adjuntoAuto", {name: "p.jpg", mimeType: "image/jpeg", buffer: await transformar(pg, 2, giro)});
    await esperarCasos(pg, ++n);
    const t = textoEnviado(pg.envios[n - 1]);
    assert.match(t, /Ministerio de Salud/, "se leyó al derecho (giro " + giro + ")");
    assert.match(t, /Fecha [Ii]mpresión: 11\/11\/2025/);
    assert.doesNotMatch(t, /NINVXE|eunnsur/, "nada leído al revés");
    assert.doesNotMatch(t, /QUIROGA|Quiroga|VIVEROS/, "el nombre quedó oculto");
    assert.match(await pg.textContent(".caso-auto"), /venía de lado o al revés: se giró antes de leer/);
  }
  // Una página al derecho no se prueba en otros giros (no pierde tiempo)
  await pg.evaluate(() => { window.__velo.puntajesGiro = null; });
  await pg.setInputFiles("#adjuntoAuto", {name: "p.jpg", mimeType: "image/jpeg", buffer: foto(2)});
  await esperarCasos(pg, ++n);
  assert.equal(await pg.evaluate(() => window.__velo.puntajesGiro), null);
  assert.doesNotMatch(await pg.textContent(".caso-auto"), /de lado o al revés/);
  assert.deepEqual(pg.errores, []);
  await pg.context().close();
});

test("modo manual: una foto de lado se gira, se vuelve a leer y sus datos quedan tapados", {skip: saltar}, async () => {
  const pg = await abrir(Object.assign({}, AJ_CLAUDE, {auto: false}));
  await pg.setInputFiles("#adjunto", {name: "p.jpg", mimeType: "image/jpeg", buffer: await transformar(pg, 2, 270)});
  await esperar(pg, () => { const f = __velo.caso().fotos[0]; return f && f.girada && f.ocr === "listo"; });
  const f = await pg.evaluate(() => { const f = __velo.caso().fotos[0]; return {w: f.w, h: f.h, girada: f.girada, tapas: f.tapas.filter(t => t.auto && !t.quitada).length, palabras: f.palabras.map(p => p.texto).join(" ")}; });
  assert.equal(f.girada, 90, "270 grados de lado: se gira 90 más");
  assert.ok(f.h > f.w, "quedó vertical: " + f.w + "x" + f.h);
  assert.match(f.palabras, /Ministerio/);
  assert.ok(f.tapas >= 3, "con la hoja al derecho se encuentran los datos para tapar: " + f.tapas);
  assert.deepEqual(pg.errores, []);
  await pg.context().close();
});

/* ---------- calidad de la lectura ---------- */
test("una página leída con dificultad se avisa en el caso y a la IA; una legible, no", {skip: saltar}, async () => {
  const pg = await abrir(Object.assign({}, AJ_CLAUDE, {nitidez: "no"}));
  await pg.setInputFiles("#adjuntoAuto", [{name: "a.jpg", mimeType: "image/jpeg", buffer: foto(2)}, {name: "b.jpg", mimeType: "image/jpeg", buffer: await transformar(pg, 3, 0, 2.4)}]);
  await esperarCasos(pg, 1);
  assert.match(await pg.textContent(".caso-auto"), /La página 2 se leyó con dificultad/);
  assert.match(pg.envios[0].cuerpo.messages[0].content, /poca confianza al leer la página 2: ahí puede haber palabras y cifras mal leídas/);
  await pg.setInputFiles("#adjuntoAuto", {name: "a.jpg", mimeType: "image/jpeg", buffer: await transformar(pg, 2, 0, 1.5)});
  await esperarCasos(pg, 2);
  assert.doesNotMatch(await pg.textContent(".caso-auto"), /con dificultad/, "algo suave pero legible: sin aviso");
  assert.doesNotMatch(pg.envios[1].cuerpo.messages[0].content, /poca confianza al leer/);
  await pg.context().close();
});

/* ---------- lectura en paralelo ---------- */
test("con uno o con tres lectores a la vez, el texto que se envía es el mismo", {skip: saltar}, async () => {
  const pg = await abrir(AJ_CLAUDE);
  const textos = [];
  for (const hilos of [1, 3]){
    await pg.evaluate(h => { window.__velo.hilos = h; }, hilos);
    await pg.setInputFiles("#adjuntoAuto", [{name: "a.jpg", mimeType: "image/jpeg", buffer: foto(2)}, {name: "b.jpg", mimeType: "image/jpeg", buffer: foto(3)}]);
    await esperarCasos(pg, textos.length + 1);
    textos.push(pg.envios[textos.length].cuerpo.messages[0].content);
  }
  assert.equal(textos[0], textos[1]);
  assert.deepEqual(pg.errores, []);
  await pg.context().close();
});

test("Ajustes: «Lectura en paralelo» se puede apagar y queda guardado", {skip: saltar}, async () => {
  const pg = await abrir(AJ_CLAUDE);
  await pg.click("#btnAjustes");
  assert.match(await pg.textContent("#ajParaleloNota"), /Ahora: \d lector/);
  await pg.uncheck("#ajParalelo");
  assert.match(await pg.textContent("#ajParaleloNota"), /Ahora: 1 lector\./);
  assert.equal(await pg.evaluate(() => JSON.parse(localStorage.getItem("velo_ajustes")).paralelo), false);
  await pg.check("#ajParalelo");
  assert.match(await pg.textContent("#ajParaleloNota"), /Ahora: [23] lectores/);
  await pg.context().close();
});

/* ---------- la cámara ---------- */
// (la cámara simulada dibuja la foto con el desenfoque que pida la prueba)
const camaraBorrosa = () => {
  const orig = CanvasRenderingContext2D.prototype.drawImage;
  CanvasRenderingContext2D.prototype.drawImage = function(img, ...r){
    if (img instanceof HTMLVideoElement && window.__desenfoque){ this.filter = "blur(" + window.__desenfoque + "px)"; orig.call(this, img, ...r); this.filter = "none"; return; }
    return orig.call(this, img, ...r);
  };
};
const abrirCam = async (pg, boton) => { await pg.click(boton || "#btnCamara"); await pg.waitForFunction(() => !document.querySelector("#camDisparo").disabled); };

test("ráfaga: si el primer cuadro sale movido y los siguientes nítidos, queda el nítido (sin aviso de foto borrosa)", {skip: saltar}, async () => {
  const pg = await abrir(AJ_CLAUDE, null, camaraBorrosa);
  await abrirCam(pg);
  // El desenfoque dura solo el primer cuadro: como el pulso al tocar el botón
  await pg.evaluate(() => { window.__velo.esperaCuadro = 300; window.__desenfoque = 8; setTimeout(() => { window.__desenfoque = 0; }, 150); });
  await pg.evaluate(() => { document.querySelector("#camDisparo").click(); });
  await pg.waitForFunction(() => document.querySelectorAll("#camMini img").length === 1);
  assert.equal(await pg.isHidden("#camAviso"), true);
  assert.equal(await pg.locator("#camMini .cam-mini.borrosa").count(), 0);
  // Y si todos los cuadros salen borrosos, se avisa como siempre
  await pg.evaluate(() => { window.__desenfoque = 8; });
  await pg.click("#camDisparo");
  await pg.waitForFunction(() => !document.querySelector("#camAviso").hidden);
  assert.match(await pg.textContent("#camAviso"), /La foto salió borrosa/);
  await pg.context().close();
});

// Un teléfono con foto fija a resolución completa (ImageCapture), linterna y enfoque continuo
const TELEFONO = () => {
  window.__fija = {llamadas: 0, modo: "ok"}; window.__restricciones = [];
  const gum = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  navigator.mediaDevices.getUserMedia = async r => {
    const s = await gum(r), t = s.getVideoTracks()[0];
    t.getCapabilities = () => ({torch: true, focusMode: ["manual", "continuous"]});
    t.applyConstraints = async c => { window.__restricciones.push(c); };
    return s;
  };
  window.ImageCapture = class {
    constructor(t){ this.track = t; }
    async takePhoto(){
      window.__fija.llamadas++;
      if (window.__fija.modo === "falla") throw new Error("no disponible");
      if (window.__fija.modo === "cuelga") return new Promise(() => {});
      // (una foto más grande que el cuadro del video: 1,5 veces por lado)
      const im = new Image(); im.src = "/pruebas/epicrisis/pagina3.jpg"; await im.decode();
      const c = document.createElement("canvas"); c.width = Math.round(im.naturalWidth * 1.5); c.height = Math.round(im.naturalHeight * 1.5);
      c.getContext("2d").drawImage(im, 0, 0, c.width, c.height);
      return new Promise(r => c.toBlob(r, "image/jpeg", 0.9));
    }
  };
};

test("foto fija: se usa la resolución completa del teléfono; si falla o no responde, el video", {skip: saltar}, async () => {
  const pg = await abrir(AJ_CLAUDE, null, TELEFONO);
  await abrirCam(pg);
  await pg.click("#camDisparo");
  await pg.waitForFunction(() => document.querySelectorAll("#camMini img").length === 1);
  const tam = () => pg.evaluate(async () => (await window.__velo.guardados())[0].fotos);
  assert.equal(await pg.evaluate(() => window.__fija.llamadas), 1);
  await pg.waitForFunction(() => document.querySelector("#camMini img").naturalWidth > 0);
  const [ancho, video] = await pg.evaluate(() => [document.querySelector("#camMini img").naturalWidth, document.querySelector("#camVideo").videoWidth]);
  assert.equal(ancho, Math.round(video * 1.5), "la página guardada es la foto fija, no un cuadro del video");
  assert.equal(await tam(), 1);
  // La foto fija falla: esa página sale del video y no se intenta de nuevo
  await pg.evaluate(() => { window.__fija.modo = "falla"; });
  await pg.click("#camDisparo");
  await pg.waitForFunction(() => document.querySelectorAll("#camMini img").length === 2);
  await pg.click("#camDisparo");
  await pg.waitForFunction(() => document.querySelectorAll("#camMini img").length === 3);
  assert.equal(await pg.evaluate(() => window.__fija.llamadas), 2, "tras fallar, no se vuelve a intentar");
  await pg.click("#camCancelar");
  // El teléfono no responde: a los 2,5 segundos se usa el video
  await pg.evaluate(() => { window.__fija.modo = "cuelga"; });
  await abrirCam(pg);
  const t0 = Date.now();
  await pg.click("#camDisparo");
  assert.equal(await pg.isDisabled("#camDisparo"), true, "mientras se saca la foto no se puede sacar otra");
  await pg.waitForFunction(() => document.querySelectorAll("#camMini img").length === 1);
  assert.ok(Date.now() - t0 >= 2400, "esperó a la foto fija");
  assert.deepEqual(pg.errores, []);
  await pg.context().close();
});

test("linterna y enfoque continuo: solo si el teléfono los tiene", {skip: saltar}, async () => {
  let pg = await abrir(AJ_CLAUDE, null, TELEFONO);
  await abrirCam(pg);
  await pg.waitForFunction(() => !document.querySelector("#camLinterna").hidden);
  assert.deepEqual(await pg.evaluate(() => window.__restricciones[0].advanced), [{focusMode: "continuous"}]);
  await pg.click("#camLinterna");
  await pg.waitForFunction(() => document.querySelector("#camLinterna").getAttribute("aria-pressed") === "true");
  assert.deepEqual(await pg.evaluate(() => window.__restricciones[1].advanced), [{torch: true}]);
  await pg.click("#camLinterna");
  await pg.waitForFunction(() => document.querySelector("#camLinterna").getAttribute("aria-pressed") === "false");
  await pg.context().close();
  // Sin esas capacidades (la cámara simulada corriente): no hay botón y la cámara funciona igual
  pg = await abrir(AJ_CLAUDE);
  await abrirCam(pg);
  await pg.click("#camDisparo");
  await pg.waitForFunction(() => document.querySelectorAll("#camMini img").length === 1);
  assert.equal(await pg.isHidden("#camLinterna"), true);
  assert.equal(await pg.isVisible("#camSistema"), true, "la cámara del sistema queda siempre a mano");
  await pg.context().close();
});

test("poca luz: la cámara avisa mientras se encuadra, y deja de avisar cuando hay luz", {skip: saltar}, async () => {
  const pg = await abrir(AJ_CLAUDE, null, () => {
    // (la cámara "ve" casi negro mientras window.__oscuro)
    const orig = CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage = function(img, ...r){
      orig.call(this, img, ...r);
      if (img instanceof HTMLVideoElement && window.__oscuro){ this.fillStyle = "rgba(0,0,0,.9)"; this.fillRect(0, 0, this.canvas.width, this.canvas.height); }
    };
    window.__oscuro = true;
  });
  await abrirCam(pg);
  await pg.waitForFunction(() => !document.querySelector("#camPista").hidden, null, {timeout: 8000});
  assert.match(await pg.textContent("#camPista"), /Hay poca luz/);
  await pg.evaluate(() => { window.__oscuro = false; });
  await pg.waitForFunction(() => document.querySelector("#camPista").hidden, null, {timeout: 8000});
  await pg.context().close();
});

test("tocar una miniatura muestra la página en grande; otro toque vuelve a la cámara", {skip: saltar}, async () => {
  const pg = await abrir(AJ_CLAUDE);
  await abrirCam(pg);
  await pg.click("#camDisparo");
  await pg.waitForFunction(() => document.querySelectorAll("#camMini img").length === 1);
  await pg.click("#camMini img");
  assert.equal(await pg.isVisible("#camVista"), true);
  assert.equal(await pg.getAttribute("#camVista", "src"), await pg.getAttribute("#camMini img", "src"));
  await pg.click("#camVista");
  assert.equal(await pg.isHidden("#camVista"), true);
  await pg.context().close();
});
