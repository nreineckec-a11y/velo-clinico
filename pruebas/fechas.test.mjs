// Clasificación de fechas: la de nacimiento se oculta (en el texto pasa a "edad: X años"), las clínicas quedan a la
// vista y una sin rótulo queda salvo que sea 10 o más años anterior a la más reciente del documento.
// Todos los datos son ficticios.  Ejecutar con:  node --test pruebas/*.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import {cargarMotor} from "./cargar-motor.mjs";

const Anon = cargarMotor();
const anon = (t, o) => Anon.construir(Anon.analizar(t, o || {})).salida;
const foto = t => [...Anon.analizar(t, {foto: true}).dets].map(d => d.tipo + ":" + t.slice(d.s, d.e));
const igual = (t, esperado, o) => assert.equal(anon(t, o), esperado);
const queda = (t, o) => igual(t, t, o);

test("disparadores de la fecha de nacimiento: rótulo y fecha pasan a la edad", () => {
  const toma = "   Fecha de toma: 12/03/2025";
  for (const r of ["Fecha de nacimiento:", "Fecha de Nacimiento :", "FECHA NACIMIENTO:", "Fecha nac.:", "Fecha Nac:", "F. nac:", "F.Nac.:",
    "F. de nacimiento:", "F. Nacimiento:", "FN:", "F.N.:", "F.N:", "FNac:", "Nacimiento:", "Fecha Nacimiento - Edad:", "nacido el", "nacida el", "Nacido en"])
    igual(r + " 14/07/1958" + toma, "edad: 66 años" + toma);
});

test("fechas clínicas: quedan a la vista aunque sean antiguas", () => {
  for (const r of ["Fecha de toma de muestra:", "Toma de muestra:", "Fecha muestra:", "Fecha de recepción:", "Recepción:", "Fecha de validación:",
    "Validado el", "Fecha de emisión:", "Emitido:", "Fecha de informe:", "Fecha Resultado:", "Control:", "Próximo control:", "Fecha de ingreso:",
    "Ingresa el", "Fecha de alta:", "Alta:", "Fecha del procedimiento:", "Cirugía:", "Operado el", "Fecha Impresión:", "Fecha Creación:",
    "Fecha del examen:", "Fecha de atención:", "Fecha de egreso:", "Biopsia"])
    for (const f of ["12/03/2025", "14/07/2008"]) queda(r + " " + f + "   Fecha de emisión: 20/03/2025");
});

test("fecha sin rótulo: queda, salvo que sea 10 o más años anterior a la más reciente (posible nacimiento)", () => {
  queda("Consulta el 12/03/2025 por disuria.");
  queda("APE 6,4 ng/ml (12/03/2025); previo 4,2 ng/ml (12/03/2016).");          // 9 años antes: queda
  igual("Paciente con control 12/03/2025. Dato: 12/03/2015.", "Paciente con control 12/03/2025. Dato: [FECHA_1].");   // 10 años
  igual("Dato: 14/07/1958, consulta el 12/03/2025.", "Dato: [FECHA_1], consulta el 12/03/2025.");
  // Una palabra clínica lejos de la fecha no la protege; un rótulo pegado a ella, sí
  igual("Paciente en control PSCV, 14/07/1958. Consulta el 12/03/2025.", "Paciente en control PSCV, [FECHA_1]. Consulta el 12/03/2025.");
  queda("Cirugía: RTU de próstata el 06/03/2025. Fecha de alta: 09/03/2025.");
  // Un «nacido» lejos de la fecha la oculta, sin calcular una edad que podría ser falsa
  igual("Nacido en Temuco, 14/07/1958.", "Nacido en [LUGAR_1], [FECHA_1].");
  igual("Nacido en Temuco, consulta el 12/03/2025.", "Nacido en [LUGAR_1], consulta el 12/03/2025.");
  // Sin otra fecha, una sola fecha sin rótulo es la más reciente: queda
  queda("Visto el 14/07/1958.");
  // Una sin rótulo antigua no se convierte en edad (no se sabe si es el nacimiento): solo se oculta
  assert.ok(!anon("12/03/2025\n14/07/1958").includes("edad"));
});

test("formatos: dd/mm/aaaa, dd-mm-aa, dd.mm.aaaa, aaaa-mm-dd, «12 de marzo de 2025», «mar-2025», «marzo 2025» y con hora", () => {
  const fin = "\nFecha de emisión: 20/03/2025";
  for (const f of ["12/03/2025", "12-03-25", "12.03.2025", "2025-03-12", "12 de marzo de 2025", "12 de marzo 2025", "12 de marzo", "12-mar-2025",
    "12 Mar 2025", "mar-2025", "Mar/25", "marzo 2025", "marzo de 2025", "12/03/2025 08:15", "12/03/2025 8:15 hrs", "15/10/2024 01:57 PM",
    "2025-03-12T08:15", "12 de marzo de 2025 a las 10:30"])
    queda("Fecha de toma: " + f + fin);
  for (const [f, edad] of [["14/07/1958", 66], ["14-07-58", 66], ["14.07.1958", 66], ["1958-07-14", 66], ["14 de julio de 1958", 66],
    ["14-jul-1958", 66], ["jul-1958", 66], ["julio de 1958", 66], ["14/07/1958 00:00", 66], ["21/03/1958", 66], ["20/03/1958", 67]])
    igual("Fecha de nacimiento: " + f + fin, "edad: " + edad + " años" + fin);
  // Las formas nuevas sin rótulo y antiguas también se ocultan
  igual("Colecistectomía en marzo de 2010." + fin, "Colecistectomía en [FECHA_1]." + fin);
  igual("IAM (mar-2011)." + fin, "IAM ([FECHA_1])." + fin);
});

test("tabla de exámenes seriados con varias fechas: todas quedan; el nacimiento pasa a edad", () => {
  const t = `Paciente: [ya oculto]      Fecha de nacimiento: 30/01/1950
Exámenes seriados      12/01/2024   15/06/2024   10/02/2025
Creatinina (mg/dL)     1,1          1,2          1,3
APE (ng/ml)            4,2          5,1          6,4
Resultados anteriores:
10/09/2023             3,9 ng/ml
15/03/2022             3,1 ng/ml`;
  const s = anon(t);
  for (const f of ["12/01/2024   15/06/2024   10/02/2025", "10/09/2023             3,9 ng/ml", "15/03/2022             3,1 ng/ml", "1,1          1,2          1,3"])
    assert.ok(s.includes(f), `se ocultó «${f}»:\n${s}`);
  assert.ok(s.includes("edad: 75 años") && !s.includes("30/01/1950"), s);
});

test("ambas fechas en la misma línea, en cualquier orden", () => {
  igual("Fecha de nacimiento: 14/07/1958   Fecha de toma: 12/03/2025 08:15", "edad: 66 años   Fecha de toma: 12/03/2025 08:15");
  igual("Fecha toma: 12/03/2025   F. Nac: 14/07/1958", "Fecha toma: 12/03/2025   edad: 66 años");
  igual("F.N. 14/07/1958 | Toma 12/03/2025 | Validación 13/03/2025", "edad: 66 años | Toma 12/03/2025 | Validación 13/03/2025");
  // Sin valor en el campo de nacimiento, la fecha que sigue es de otro campo
  queda("Fecha de nacimiento:    Fecha examen: 12/03/2025");
});

test("el rótulo de nacimiento manda aunque le siga una palabra clínica; también en la línea de arriba", () => {
  igual("Fecha de nacimiento (según registro): 14/07/1958\nFecha de toma: 12/03/2025", "edad: 66 años\nFecha de toma: 12/03/2025");
  igual("Fecha de nacimiento:\n14/07/1958\nFecha de toma: 12/03/2025", "edad: 66 años\nFecha de toma: 12/03/2025");
  // «recién nacido» no es un rótulo de nacimiento
  queda("Control de recién nacido el 12/03/2025.");
});

test("la edad se calcula respecto de la fecha del documento (no de hoy); en lactantes, en meses", () => {
  igual("Fecha de nacimiento: 14/07/1958\nFecha de informe: 13/07/2020", "edad: 61 años\nFecha de informe: 13/07/2020");
  igual("Fecha de nacimiento: 01/12/2024   Fecha de atención: 15/03/2025", "edad: 3 meses   Fecha de atención: 15/03/2025");
  // El próximo control no fecha el documento
  igual("Fecha de nacimiento: 14/07/1958\nFecha de informe: 13/07/2020\nPróximo control: 20/09/2020", "edad: 61 años\nFecha de informe: 13/07/2020\nPróximo control: 20/09/2020");
  // Sin otra fecha en el documento, respecto de hoy
  igual("Fecha de nacimiento: 14/07/1958", "edad: 67 años", {hoy: "2026-01-10T12:00:00"});
  // Una fecha de nacimiento imposible para la del documento solo se oculta
  igual("F. Nac: 12/03/2026\nFecha de informe: 13/07/2020", "F. Nac: [FECHA_1]\nFecha de informe: 13/07/2020");
});

test("la edad no es un marcador: no se repone y se puede dejar visible la fecha real", () => {
  const res = Anon.analizar("Fecha de nacimiento: 14/07/1958   Fecha de toma: 12/03/2025", {});
  const {salida, mapa} = Anon.construir(res);
  assert.equal(salida, "edad: 66 años   Fecha de toma: 12/03/2025");
  assert.deepEqual(Object.keys(mapa), []);
  assert.equal(Anon.construir(res, new Set(res.dets.map(d => d.k))).salida, "Fecha de nacimiento: 14/07/1958   Fecha de toma: 12/03/2025");
  // y no genera avisos de campo visible
  assert.equal(Anon.revisar(res).length, 0);
});

test("en fotos: se tapa solo la fecha de nacimiento (no su rótulo); las clínicas no pasan por folio", () => {
  assert.deepEqual(foto("Fecha de nacimiento: 14/07/1958   Fecha de toma: 12/03/2025 08:15"), ["FECHA:14/07/1958"]);
  assert.deepEqual(foto("Fecha de toma: 12/03/2025"), []);
  assert.deepEqual(foto("Exámenes 12/01/2024 15/06/2024 10/02/2025"), []);
  // A medias: queda tras un rótulo clínico; si no, se tapa (no se puede saber si es antigua)
  assert.deepEqual(foto("Fecha de toma: 03/11/2 08:15"), []);
  assert.deepEqual(foto("Fecha 03/11/2 Hora 09:41"), ["FECHA:03/11/2"]);
  assert.deepEqual(foto("F. Nac: 03/11/19"), ["FECHA:03/11/19"]);
});
