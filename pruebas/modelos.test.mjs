// Modelo y esfuerzo de Claude según el prompt, por API (lo que sale en la consulta) y con la cuenta de Claude dentro
// de la app de Claude (la capacidad «sample», simulada en un marco). Todos los datos son ficticios.
import test from "node:test";
import assert from "node:assert/strict";
import {saltar, abrir, AJ_CLAUDE, archivoTexto, esperarCasos} from "./navegador.mjs";

const CASO = "Control. Hemoglobina 13,5 g/dL el 12/03/2025.";
const RESP = j => ({status: 200, json: Object.assign({content: [{type: "text", text: "Listo."}], stop_reason: "end_turn"}, j)});

test("por API: cada prompt sale con su modelo y esfuerzo, y la respuesta dice cuál respondió", {skip: saltar}, async () => {
  const pg = await abrir(Object.assign({}, AJ_CLAUDE, {tarea: "ic"}), e => RESP({model: e.cuerpo.model}));
  const esperados = {ic: ["claude-opus-5-5", "high"], sm: ["claude-opus-5-5", "high"], morb: ["claude-opus-5-5", "high"],
    epi: ["claude-sonnet-5-5", "medium"], exam: ["claude-sonnet-5-5", "medium"], med: ["claude-sonnet-5-5", "medium"], cert: ["claude-sonnet-5-5", "low"]};
  let n = 0;
  for (const [t, [modelo, esfuerzo]] of Object.entries(esperados)){
    if (n) await pg.click('#tareasAuto [data-t="' + t + '"]');
    assert.match(await pg.textContent("#autoInfo"), new RegExp((modelo.includes("opus") ? "Opus" : "Sonnet") + " 5\\.5 · esfuerzo"));
    await pg.setInputFiles("#adjuntoAuto", archivoTexto(CASO));
    await esperarCasos(pg, ++n);
    const {cuerpo} = pg.envios[n - 1];
    assert.equal(cuerpo.model, modelo, t);
    assert.deepEqual(cuerpo.output_config, {effort: esfuerzo}, t);
    assert.equal(cuerpo.fallbacks, "default", "con respaldo si un filtro declina");
  }
  assert.match(await pg.textContent(".caso-auto"), /Respondió Claude Sonnet 5\.5 · esfuerzo bajo\./);
  // Sin prompt: Opus, esfuerzo medio
  await pg.click('#tareasAuto [data-t="cert"]');
  await pg.setInputFiles("#adjuntoAuto", archivoTexto(CASO));
  await esperarCasos(pg, ++n);
  assert.equal(pg.envios[n - 1].cuerpo.model, "claude-opus-5-5");
  assert.deepEqual(pg.envios[n - 1].cuerpo.output_config, {effort: "medium"});
  assert.deepEqual(pg.errores, []);
  await pg.context().close();
});

test("por API, con «Elegir el modelo según el prompt» apagado: el modelo de Ajustes, esfuerzo alto, en todos los prompts", {skip: saltar}, async () => {
  const pg = await abrir(Object.assign({}, AJ_CLAUDE, {tarea: "cert", porTarea: false, modelos: {claude: "claude-opus-5-5"}}));
  await pg.click("#btnAjustes");
  assert.equal(await pg.isChecked("#ajPorTarea"), false);
  assert.equal(await pg.isDisabled("#ajModelo"), false);
  await pg.click("#ajCerrar");
  await pg.setInputFiles("#adjuntoAuto", archivoTexto(CASO));
  await esperarCasos(pg, 1);
  assert.equal(pg.envios[0].cuerpo.model, "claude-opus-5-5");
  assert.deepEqual(pg.envios[0].cuerpo.output_config, {effort: "high"});
  // Encenderlo en Ajustes: el campo del modelo queda «Según el prompt» y se ven los modelos de cada prompt
  await pg.click("#btnAjustes");
  await pg.check("#ajPorTarea");
  assert.equal(await pg.isDisabled("#ajModelo"), true);
  assert.match(await pg.textContent("#ajPerfiles"), /Interconsulta: Opus 5\.5 · esfuerzo alto/);
  assert.match(await pg.textContent("#ajPerfiles"), /Certificados: Sonnet 5\.5 · esfuerzo bajo/);
  await pg.click("#ajCerrar");
  await pg.setInputFiles("#adjuntoAuto", archivoTexto(CASO));
  await esperarCasos(pg, 2);
  assert.equal(pg.envios[1].cuerpo.model, "claude-sonnet-5-5");
  assert.deepEqual(pg.envios[1].cuerpo.output_config, {effort: "low"});
  await pg.context().close();
});

// La app dentro de un marco (como en la app de Claude), con la capacidad «sample» simulada: guarda lo que se le pidió
const SAMPLE = () => {
  window.__llamadas = []; window.__aplicar = true;
  if (window.self === window.top) return;
  const sample = async (input, o) => {
    window.__llamadas.push({model: o.model, effort: o.effort, modelTier: o.modelTier, imagenes: (o.images || []).length});
    return {text: "Listo.", truncated: false, modelTierApplied: o.modelTier, modelApplied: window.__aplicar ? o.model : undefined};
  };
  sample.limits = async () => ({images: {maxCount: 20}});
  window.claude = {use: async n => n === "sample" ? sample : null};
};
async function abrirEnMarco(ajustes){
  const pg = await abrir(ajustes, null, SAMPLE);
  const url = pg.url();
  await pg.route(u => u.pathname === "/__marco.html", r => r.fulfill({contentType: "text/html", body: '<iframe src="/index.html?prueba" style="width:390px;height:800px;border:0"></iframe>'}));
  await pg.goto(url.replace(/\/index\.html.*$/, "/__marco.html"));
  await pg.waitForFunction(() => document.querySelector("iframe").contentWindow.__velo);
  const fr = pg.frames().find(f => /index\.html/.test(f.url()));
  return {pg, fr};
}

test("con la cuenta de Claude: el modelo y el esfuerzo del prompt, y si el modelo no está, lo dice", {skip: saltar}, async () => {
  const {pg, fr} = await abrirEnMarco({auto: true, provV2: true, prov: "claude-app", tarea: "sm"});
  await fr.waitForFunction(() => /Opus 5\.5 · esfuerzo alto, según el prompt/.test(document.querySelector("#autoInfo").textContent));
  await fr.setInputFiles("#adjuntoAuto", archivoTexto(CASO));
  await esperarCasos(fr, 1);
  assert.deepEqual(await fr.evaluate(() => window.__llamadas[0]), {model: "claude-opus-5-5", effort: "high", modelTier: "complex", imagenes: 0});
  assert.match(await fr.textContent(".caso-auto"), /Respondió Claude Opus 5\.5 · esfuerzo alto\./);
  // El plan no tiene ese modelo: responde el nivel y la respuesta lo dice
  await fr.evaluate(() => { window.__aplicar = false; });
  await fr.click('#tareasAuto [data-t="exam"]');
  await fr.setInputFiles("#adjuntoAuto", archivoTexto(CASO));
  await esperarCasos(fr, 2);
  assert.deepEqual(await fr.evaluate(() => window.__llamadas[1]), {model: "claude-sonnet-5-5", effort: "medium", modelTier: "default", imagenes: 0});
  assert.match(await fr.textContent(".caso-auto"), /nivel estándar\): Sonnet 5\.5 no estaba disponible/);
  await pg.context().close();
});

test("modo manual con la cuenta de Claude: el prompt marcado fija el modelo, también para el seguimiento", {skip: saltar}, async () => {
  const {pg, fr} = await abrirEnMarco({auto: false, provV2: true, prov: "claude-app", tarea: null});
  await fr.fill("#entrada", "Hazme una interconsulta. " + CASO);
  await fr.click('#tareas [data-t="ic"]');
  await fr.waitForFunction(() => !document.querySelector("#enviar").disabled && !document.querySelector("#perfilEnvio").hidden);
  assert.match(await fr.textContent("#perfilEnvio"), /Claude Opus 5\.5 · esfuerzo alto: decide pertinencia/);
  await fr.click("#enviar");
  await fr.waitForFunction(() => /Respondió Claude Opus 5\.5/.test(document.querySelector("#hilo").textContent));
  assert.deepEqual(await fr.evaluate(() => window.__llamadas[0]), {model: "claude-opus-5-5", effort: "high", modelTier: "complex", imagenes: 0});
  // Cambiar el prompt marcado después no cambia el modelo de esta conversación
  await fr.click('#tareas [data-t="cert"]');
  await fr.fill("#seguimiento", "Agrega que es hipertenso.");
  await fr.click("#enviarSeg");
  await fr.waitForFunction(() => window.__llamadas.length === 2);
  assert.equal(await fr.evaluate(() => window.__llamadas[1].model), "claude-opus-5-5");
  await pg.context().close();
});
