// Fugas reales del modo automático, reproducidas con datos FICTICIOS del mismo formato.
// Cada fuga real que se reporte entra aquí como caso ficticio del mismo formato antes de corregirla.
//
// El modo automático envía solo el texto leído por el lector (Anon.protegerAuto). Cada caso dice qué no debe llegar
// a la IA (ocultos), qué debe seguir a la vista (visibles) y, cuando importa la forma, la salida exacta (esperado).
// Ejecutar con:  node --test pruebas/*.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import {cargarMotor} from "./cargar-motor.mjs";

const Anon = cargarMotor();
const auto = (t, o) => Anon.protegerAuto(t, o || {});

// retenible: un RUT que no se puede normalizar con seguridad; solo en esos casos se acepta ok=false («Requiere revisión»)
const FUGAS = [
  // 1. RUT con OCR malo (28/10 y 29/10)
  {id: "1 · RUT con letras por cifras, tras «RUT - Pasaporte»", texto: "RUT - Pasaporte  4I7T2SI8",
    ocultos: ["4I7T2SI8"], esperado: "RUT - Pasaporte  [RUT_1]"},
  {id: "1 · RUT con letras por cifras, sin rótulo", texto: "I2.3A5.6T8-5", retenible: true,
    ocultos: ["I2.3A5.6T8-5", "3A5", "6T8"], esperado: "[RUT_1]"},
  {id: "1 · RUT con coma como separador", texto: "Hb 15.2 g/dL\n4.567,890-1\nVCM 103 fL",
    ocultos: ["4.567", "567,890", "890-1"], esperado: "Hb 15.2 g/dL\n[RUT_1]\nVCM 103 fL"},
  {id: "1 · RUT con coma: entero, no «4,[FICHA_1]»", texto: "Paciente: X\n4,567890-1\nTSH 4.60",
    ocultos: ["4,", "567890"], esperado: "Paciente: X\n[RUT_1]\nTSH 4.60"},
  {id: "1 · RUT con una O por cero", texto: "RUT 3.141.5O9-2",
    ocultos: ["3.141", "5O9"], esperado: "RUT [RUT_1]"},
  {id: "1 · RUN cortado al final de la línea", texto: "RUN 17.333.",
    ocultos: ["17.333"], esperado: "RUN [RUT_1]."},
  {id: "1 · RUT cortado tras un nombre", texto: "Brisa Vergara 17.333.\nEnfermera",
    ocultos: ["17.333", "Brisa", "Vergara"], esperado: "[NOMBRE_1] [RUT_1].\nEnfermera"},
  // 2. Códigos de acceso al informe (26/10)
  {id: "2 · código de acceso en una frase", texto: "Para ver su examen en línea use el código de acceso: 4821KXPT",
    ocultos: ["4821KXPT"], visibles: ["Para ver su examen en línea use el código de acceso:"]},
  {id: "2 · «Código:»", texto: "Código: 8U2KQXPT", ocultos: ["8U2KQXPT"], visibles: ["Código:"]},
  {id: "2 · «Clave web»", texto: "Clave web 5531ABCD", ocultos: ["5531ABCD"], visibles: ["Clave web"]},
  {id: "2 · «Accession»", texto: "Accession 4821KXPT", ocultos: ["4821KXPT"], visibles: ["Accession"]},
  {id: "2 · código suelto al pie", texto: "Impresión: EPID.\n4821KXPT\nPágina 1 de 1",
    ocultos: ["4821KXPT"], visibles: ["Impresión: EPID.", "Página 1 de 1"]},
  // 3. Nombres del personal (22/10, 23/10 ×2 y 29/10)
  {id: "3 · «Validado por» con nombre poco común e inicial", texto: "Validado por Nayadeth Ulloa M.",
    ocultos: ["Nayadeth", "Ulloa"], esperado: "Validado por [NOMBRE_1]"},
  {id: "3 · «Analista:» y «Validador:» en la misma línea", texto: "Analista: Yesenia Cortés P.    Validador: Yanara Vidal",
    ocultos: ["Yesenia", "Cortés", "Yanara", "Vidal"], esperado: "Analista: [NOMBRE_1]    Validador: [NOMBRE_2]"},
  {id: "3 · tras «Tecnólogo Médico»", texto: "Tecnólogo Médico Daisy Mellado",
    ocultos: ["Daisy", "Mellado"], esperado: "Tecnólogo Médico [NOMBRE_1]"},
  {id: "3 · nombre suelto entre resultados", texto: "Glucosa 92 mg/dL  Daisy Mellado  28/07/2026",
    ocultos: ["Daisy", "Mellado"], esperado: "Glucosa 92 mg/dL  [NOMBRE_1]  28/07/2026"},
  {id: "3 · línea de firma sobre el cargo", texto: "Fuica Aravena\nTecnólogo Médico",
    ocultos: ["Fuica", "Aravena"], esperado: "[NOMBRE_1]\nTecnólogo Médico"},
  {id: "3 · nombre mal leído sobre «Médico Radiólogo», sin «Dr.»", texto: "Bemardo Rivas Ortúzar\nMédico Radiólogo",
    ocultos: ["Bemardo", "Rivas", "Ortúzar"], esperado: "[NOMBRE_1]\nMédico Radiólogo"},
  {id: "3 · nombre cortado por el lector", texto: "Informado por: ristina Rojas",
    ocultos: ["ristina", "Rojas"], esperado: "Informado por: [NOMBRE_1]"},
  {id: "3 · tras «Enfermera»", texto: "Enfermera Brisa Vergara",
    ocultos: ["Brisa", "Vergara"], esperado: "Enfermera [NOMBRE_1]"},
  // 4. Dirección incompleta (26/10)
  {id: "4 · N° en la línea que sigue al domicilio", texto: "Domicilio: Los Aromos\nN°245 La Granja",
    ocultos: ["Aromos", "245", "Granja"], visibles: ["Domicilio:"]},
  {id: "4 · N° junto a la comuna", texto: "N° 245, La Granja", ocultos: ["245", "Granja"]},
];

for (const c of FUGAS){
  test(`fuga ${c.id}: no llega a la IA`, () => {
    const p = auto(c.texto), s = p.cons.salida;
    for (const x of c.ocultos) assert.ok(!s.includes(x), `quedó a la vista «${x}» en:\n${s}`);
    for (const x of c.visibles || []) assert.ok(s.includes(x), `se ocultó «${x}» en:\n${s}`);
    if (!p.ok) assert.ok(c.retenible, `quedó retenido (ok=false) sin ser un RUT imposible de normalizar: ${JSON.stringify(p.residuos)}`);
    else if (c.esperado) assert.equal(s, c.esperado);
  });
  test(`fuga ${c.id}: en el modo manual no sale sin aviso`, () => {
    const p = Anon.proteger(c.texto, {}), s = p.cons.salida;
    const avisos = Anon.revisar(p.res).concat(p.residuos);
    for (const x of c.ocultos){
      if (!s.includes(x)) continue;
      assert.ok(avisos.some(a => a.texto.includes(x) || x.includes(a.texto)), `«${x}» quedó a la vista sin aviso en:\n${s}`);
    }
  });
}

test("fugas: el RUT se oculta entero, nunca en parte", () => {
  for (const c of FUGAS.filter(c => c.id.startsWith("1"))){
    const p = auto(c.texto), lineas = p.cons.salida.split("\n");
    const l = lineas.find(x => x.includes("[RUT_"));
    assert.ok(l, `sin [RUT_n] en:\n${p.cons.salida}`);
    // A los lados del marcador no queda ninguna cifra ni letra pegada
    assert.ok(!/[\p{L}\p{N}][.,]?\[RUT_|\[RUT_\d+\][.,]?[\p{L}\p{N}]/u.test(l), l);
    assert.equal(p.res.dets.filter(d => d.tipo === "RUT").length, 1, c.texto);
  }
});

test("fugas: tras RUT/RUN/Pasaporte/C.I. se oculta el valor completo aunque no tenga forma de RUT", () => {
  for (const [t, esp] of [["RUN: 1234S67", "RUN: [RUT_1]"], ["Pasaporte: P4821KX9", "Pasaporte: [RUT_1]"],
    ["C.I. 4I7T2SI8   Sexo: F", "C.I. [RUT_1]   Sexo: F"], ["RUT: 12.345.67B-K Edad: 40 años", "RUT: [RUT_1] Edad: 40 años"]])
    assert.equal(auto(t).cons.salida, esp);
});

test("fugas: un RUT con puntos y guion se oculta aunque el lector le pegue una letra delante", () => {
  assert.equal(auto("Documento x12.345.678-5 adjunto").cons.salida, "Documento x[RUT_1] adjunto");
  assert.ok(Anon.validar("Documento x12.345.678-5", {}).some(r => r.tipo === "RUT"));
});

test("fugas: el validador encuentra los RUT con OCR malo que se le escapen al anonimizador", () => {
  for (const t of ["4.567,890-1", "4,567890-1", "3.141.5O9-2", "I2.3A5.6T8-5", "RUT 4I7T2SI8", "[NOMBRE_1] 17.333."]){
    const r = Anon.validar(t, {aproximado: true});
    assert.ok(r.some(x => x.tipo === "RUT"), `${t}: ${JSON.stringify(r)}`);
  }
});

test("fugas: el validador marca una palabra con mayúscula desconocida pegada a un nombre oculto", () => {
  const r = Anon.validar("Validador: Yanara [NOMBRE_2]", {aproximado: true});
  assert.ok(r.some(x => x.tipo === "NOMBRE" && x.texto === "Yanara"), JSON.stringify(r));
  // (no un cargo ni una palabra de uso común)
  for (const t of ["[NOMBRE_1]\nTecnólogo Médico", "Médico Radiólogo [NOMBRE_1] Informe"])
    assert.equal(Anon.validar(t, {aproximado: true}).length, 0, t);
});

// ---------- no sobre-ocultar ----------
const VISIBLES = ["Fazekas 2", "IDDSI 4", "SRS-ASHA 5", "T10", "L1", "CKD-EPI", "HbA1c 7,2 %", "Losartán 50 mg", "Quinox",
  "Optive", "Aquadrops", "FONASA C", "Médico Radiólogo", "Tecnólogo Médico", "Página 3 de 5", "25-OH vitamina D 32 ng/mL",
  "SARS-CoV-2", "Vitamina B12 450 pg/mL", "Fecha toma muestra: 28/07/2026"];

for (const t of VISIBLES){
  test(`no sobre-ocultar: «${t}» queda a la vista`, () => {
    assert.equal(auto(t).cons.salida, t);
    assert.equal(auto(t, {escrito: true}).cons.salida, t);
    assert.equal(Anon.proteger(t, {}).cons.salida, t);
  });
}
test("no sobre-ocultar: la lista completa, una por línea, queda a la vista", () => {
  const t = VISIBLES.join("\n");
  assert.equal(auto(t).cons.salida, t);
  assert.equal(auto(t, {escrito: true}).cons.salida, t);
});

test("lista blanca clínica: está en el motor y sus términos quedan a la vista", () => {
  const lista = [...Anon.LISTA_BLANCA];
  for (const x of ["hba1c", "ckd-epi", "t10", "l1", "b12", "25-oh", "iddsi", "sars-cov-2", "covid-19", "vih-1"])
    assert.ok(lista.includes(x), "falta en la lista blanca: " + x);
  for (const x of lista){
    // (en una línea suelta y en una frase)
    for (const t of [x.toUpperCase(), "Resultado " + x.toUpperCase() + " negativo"])
      assert.equal(auto(t).cons.salida, t, t);
  }
  for (const t of ["T2N0M0", "pT3aN1M0", "T12-L1", "L5-S1", "G3P2A1", "BIRADS-4", "PI-RADS-5", "CA19-9", "COVID-19", "IIEF-5",
    "CHA2DS2-VASc", "500mg", "10x12mm", "12avo", "c/8hrs", "Grado3"]){
    assert.equal(auto(t).cons.salida, t, t);
    assert.equal(auto("Informe: " + t + " sin cambios").cons.salida, "Informe: " + t + " sin cambios");
  }
});

test("códigos sin rótulo: en el modo automático se oculta un token de 6 a 12 caracteres con letras y cifras", () => {
  for (const x of ["4821KXPT", "8U2KQXPT", "XK29QP7", "A1B2C3D4E5"]){
    const s = auto("Informe validado\n" + x + "\nfin").cons.salida;
    assert.ok(!s.includes(x), s);
  }
  // (más corto o más largo, o sin cifras, no)
  for (const x of ["AB12C", "ABCDEFGH", "Quinox"]) assert.equal(auto("Valor " + x + " ok").cons.salida, "Valor " + x + " ok");
});

// ---------- regresión: hoy funcionan y deben seguir funcionando ----------
const REGRESION = [
  ["TM: Nayadeth Ulloa", "TM: [NOMBRE_1]"],
  ["Responsable: Yeimy Fuica Aravena", "Responsable: [NOMBRE_1]"],
  ["Paciente\n: ROSA ELVIRA MUÑOZ TAPIA\nEdad 66 años", "Paciente\n: [NOMBRE_1]\nEdad 66 años"],
  ["Nombre\n: MUÑOZ TAPIA ROSA ELVIRA\nSexo F", "Nombre\n: [NOMBRE_1]\nSexo F"],
  ["N° Solicitud: 45678912", "N° Solicitud: [FICHA_1]"],
  ["Solicitud 45678912   Procedencia: CESFAM", "Solicitud [FICHA_1]   Procedencia: CESFAM"],
  ["Edad: 79a 4m 25d", "Edad: 79a [EDAD_1]"],
];
for (const [t, esp] of REGRESION){
  test(`regresión: ${JSON.stringify(t)}`, () => {
    const p = auto(t);
    assert.ok(p.ok, JSON.stringify(p.residuos));
    assert.equal(p.cons.salida, esp);
  });
}
