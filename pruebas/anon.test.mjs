// Pruebas del motor de anonimización. Ejecutar con:  node --test pruebas/*.test.mjs
// Todos los datos son ficticios.
import test from "node:test";
import assert from "node:assert/strict";
import {cargarMotor} from "./cargar-motor.mjs";

const Anon = cargarMotor();
const anon = (t, o) => Anon.construir(Anon.analizar(t, o || {})).salida;
const oculta = (t, dato, o) => assert.ok(!anon(t, o).includes(dato), `quedó visible «${dato}» en:\n${anon(t, o)}`);
const conserva = (t, dato, o) => assert.ok(anon(t, o).includes(dato), `se ocultó «${dato}» en:\n${anon(t, o)}`);

// Informe de RM de la epicrisis que dejó pasar el n° de orden y el folio (21-10-2026), con datos ficticios
const EPICRISIS = `gregar una acuvitac
OC: bacterias escasas, real m
18 mm/h
Glucosa 83 mg/dL, Ac. Úrico 4.2 mg/dL, Crea 0.93 mg/dL, VFG 58 mL/min/1,73 m2 (CKD EPI)
Colesterol T 173 mg/dL, HDL 54 mg/dL, TRG 146 mg/dL, LDL 89.8 mg/dL
Examen físico:
Evaluación funcional
GES AATT
REDSALUD
SOMOS CENC
Nombre Paciente: PEREZ SOTO ., MARIA ELENA
Edad: 92 años
RUT Paciente: 4.567.890-1
Fecha de Nacimiento: 12/03/1934
Fecha Examen: 15/10/2026 01:57 PM
Fecha Informe: 15/10/2026 02:31 PM
Número Orden de Pago: 121013870.2
RM PROTOCOLO STROKE
Impresión
Examen sin evidencia de evento isquémico reciente.
Cambios de aspecto microangiopáticos (Fazekas 2).
Atentamente,
Dr. Juan Carlos Fuentes
Médico Radiólogo
Pagina1 De 1
001799876
PACIENTE: PEREZ SOTO ., MARIA ELENA`;

test("epicrisis: oculta n° de orden, folio, nombres, RUT y fecha de nacimiento; deja las fechas del examen", () => {
  for (const d of ["121013870", "001799876", "PEREZ", "MARIA ELENA", "4.567.890-1", "12/03/1934", "Juan Carlos Fuentes"]) oculta(EPICRISIS, d);
  for (const d of ["edad: 92 años", "Fecha Examen: 15/10/2026 01:57 PM", "Fecha Informe: 15/10/2026 02:31 PM"]) conserva(EPICRISIS, d);
});

test("epicrisis: conserva los valores clínicos", () => {
  for (const d of ["Glucosa 83 mg/dL", "Crea 0.93 mg/dL", "VFG 58 mL/min/1,73 m2", "LDL 89.8 mg/dL", "18 mm/h", "Fazekas 2", "Edad: 92 años", "01:57 PM", "Pagina1 De 1"]) conserva(EPICRISIS, d);
});

test("apellidos, nombres en mayúsculas quedan como una sola persona", () => {
  const s = anon(EPICRISIS);
  assert.match(s, /Nombre Paciente: \[NOMBRE_1\]\n/);
  assert.match(s, /PACIENTE: \[NOMBRE_1\]$/);
});

test("números de orden, muestra, bono y similares con rótulo", () => {
  const casos = [
    ["N° de Orden: 4567890123", "4567890123"],
    ["Nro. Orden 98765432", "98765432"],
    ["Orden de atención: 12345678", "12345678"],
    ["Número de muestra: 2026-00012345", "2026-00012345"],
    ["Bono N° 123456789", "123456789"],
    ["N° de examen 556677", "556677"],
    ["ID: 7781234", "7781234"],
    ["Código de barras: 7801234567890", "7801234567890"],
    ["Folio N° 0012345", "0012345"],
    ["Episodio: 5512345", "5512345"],
    ["Cuenta 778899001", "778899001"]
  ];
  for (const [t, d] of casos) oculta(t, d);
});

test("una fecha tras «biopsia» o «episodio» es una fecha (queda a la vista), no un folio", () => {
  assert.equal(anon("Biopsia 12/05/2026: adenocarcinoma acinar"), "Biopsia 12/05/2026: adenocarcinoma acinar");
  assert.equal(anon("Episodio 2026-10-15 en urgencia"), "Episodio 2026-10-15 en urgencia");
  oculta("Folio 2026/018877.", "018877");
  oculta("Factura N° 0004521 y Bono FONASA 2026-1188774", "1188774");
});

test("códigos sueltos y números largos", () => {
  oculta("Informe final\n001799876\nPágina 1", "001799876");
  oculta("Ver orden 121013870 en recepción", "121013870");
  // Si un código aparece suelto en una línea, se oculta también donde se repite
  oculta("Código impreso: A1234567\nA1234567", "A1234567");
});

test("no oculta resultados de laboratorio ni números clínicos", () => {
  const t = `Hb 13,2 g/dL, Hto 41%, GB 7500, PLQ 250000 /mm3
Eritrocitos 4.500.000 /mm3
Urocultivo: >100.000 UFC/ml E. coli
Carga viral 12000000 copias/ml
Vitamina D 25000 UI semanal
APE 8,5 ng/ml; TSH 2.5 uUI/ml; HbA1c 7.2%
QTc 450 ms; PA 130/80 mmHg; FC 72 lpm
Dg: HTA (CIE-10 I10), DM2 (E11.9). GES problema 32.
Muestra: sangre venosa. Examen 2 de 3.
Ingreso hídrico 2500 ml`;
  for (const d of ["PLQ 250000 /mm3", "4.500.000 /mm3", ">100.000 UFC/ml", "12000000 copias/ml", "25000 UI", "8,5 ng/ml", "7.2%", "450 ms", "130/80", "I10", "E11.9", "problema 32", "Muestra: sangre venosa", "2500 ml"]) conserva(t, d);
});

test("caso ficticio de la app (sin regresiones)", () => {
  const t = `Hazme una interconsulta a Urología.
Caso ficticio de prueba. Paciente: Juan Andrés Pérez Soto, RUT 12.345.678-5, 67 años.
Domicilio: Pasaje Los Aromos 1234, Vitacura. Teléfono: +56 9 8765 4321.
Antecedentes: HTA y DM2. Losartán 50 mg c/12 h, metformina 850 mg c/12 h. Sin alergias conocidas.
Consulta el 15 de marzo de 2026 por nicturia de 3 episodios y chorro débil de 6 meses de evolución.
APE 8,5 ng/ml (12/02/2026); previo 4,2 ng/ml (10/11/2024). Creatinina 1,1 mg/dl.
Tacto rectal: próstata aumentada de tamaño, sin nódulos. Lo acompaña su hija Camila Rojas.`;
  for (const d of ["Juan", "Pérez", "12.345.678-5", "Los Aromos", "8765 4321", "Camila", "Rojas"]) oculta(t, d);
  for (const d of ["15 de marzo de 2026", "(12/02/2026)", "(10/11/2024)", "67 años", "Losartán 50 mg", "metformina 850 mg", "APE 8,5 ng/ml", "4,2 ng/ml", "Creatinina 1,1 mg/dl", "Urología", "3 episodios"]) conserva(t, d);
});

test("restaurar repone los datos reales", () => {
  const res = Anon.analizar(EPICRISIS, {});
  const {salida, mapa} = Anon.construir(res);
  const r = Anon.restaurar("Paciente [NOMBRE_1], orden [FICHA_1], folio [FICHA_2].", mapa);
  assert.equal(r.faltan.length, 0);
  assert.ok(r.salida.includes("121013870.2") && r.salida.includes("001799876") && r.salida.includes("PEREZ SOTO"));
  assert.ok(!salida.includes("121013870"));
});

test("ocultar a mano tiene prioridad y usa el tipo pedido", () => {
  const t = "Paciente: Xiomarita Ñancupil, consulta por tos. Xiomarita refiere fiebre.";
  const s = anon(t, {ocultar:[{texto:"Xiomarita Ñancupil", tipo:"NOMBRE"}, {texto:"Xiomarita", tipo:"NOMBRE"}]});
  assert.ok(!s.includes("Xiomarita") && !s.includes("Ñancupil"), s);
  assert.match(s, /\[NOMBRE_\d\]/);
});

test("revisar avisa campos rotulados con el valor visible", () => {
  const t = `Nombre: X10MARITA ÑANCUP1L
Fecha de nacimiento: 1934
Correo: xio arroba gmail
Médico tratante: Radiólogo de turno
Paciente: Femenina de 45 años`;
  const avisos = Anon.revisar(Anon.analizar(t, {})).map(a => a.tipo + ":" + a.texto);
  assert.ok(avisos.includes("NOMBRE:X10MARITA ÑANCUP1L"), avisos.join(" · "));
  assert.ok(avisos.includes("FECHA:1934"), avisos.join(" · "));
  assert.ok(avisos.includes("CORREO:xio arroba gmail"), avisos.join(" · "));
  assert.ok(!avisos.some(a => a.includes("Femenina") || a.includes("Radiólogo")), avisos.join(" · "));
});

test("formatos de rótulo que antes se escapaban", () => {
  const casos = [
    "Paciente.......: Xiomarita Ñancupil",
    "Nombre del usuario(a): Xiomarita Ñancupil",
    "Sr(a). Xiomarita Ñancupil",
    "Usuario(a): Xiomarita Ñancupil",
    "Paciente:\nXIOMARITA ÑANCUPIL",
    "NOMBRE: ÑANCUPIL HUENCHUMIL, XIOMARITA",
    "Nombre Completo : Xiomarita Ñancupil"
  ];
  for (const t of casos){ oculta(t, "XIOMARITA"); oculta(t, "Xiomarita"); }
  conserva("Nombre Completo : Xiomarita Ñancupil", "Nombre Completo :");
  conserva("Paciente: Femenina de 45 años", "Femenina de 45 años");
  assert.match(anon("NOMBRE: ÑANCUPIL HUENCHUMIL, XIOMARITA"), /^NOMBRE: \[NOMBRE_1\]$/);
});

test("revisar no avisa cuando todo quedó oculto", () => {
  const res = Anon.analizar(EPICRISIS, {});
  assert.equal(Anon.revisar(res).length, 0, JSON.stringify(Anon.revisar(res)));
});

test("revisar separa campos de una misma línea", () => {
  for (const t of ["Nombre: X10MARITA ÑANCUP1L   Edad: 45 años   Sexo: F", "Nombre: X10MARITA ÑANCUP1L Edad: 45 años Sexo: F", "Paciente: X10MARITA | RUT: 11.222.333-4 | Fecha de nacimiento: 1981"]){
    const avisos = Anon.revisar(Anon.analizar(t, {})).map(a => a.texto);
    assert.ok(avisos.includes("X10MARITA ÑANCUP1L") || avisos.includes("X10MARITA"), t + " → " + avisos.join(" · "));
    assert.ok(!avisos.some(a => /Edad|Sexo|RUT/.test(a)), t + " → " + avisos.join(" · "));
  }
});

test("un dato que el médico decide mostrar no se avisa", () => {
  const t = "Paciente: Juan Pérez, 67 años";
  const res = Anon.analizar(t, {});
  const off = new Set(res.dets.map(d => d.k));
  assert.equal(Anon.construir(res, off).salida, t);
  assert.equal(Anon.revisar(res, off).length, 0);
});

/* ---------- PDF de laboratorio: rótulo y valor a alturas levemente distintas (datos ficticios) ---------- */
test("PDF: el rótulo y su valor quedan en la misma línea", () => {
  const it = (x, y, s, h = 9) => ({x, y, s, w: s.length * 4.6, h});
  const items = [
    it(40, 700, "Nombre"), it(120, 701.8, ": BAYRON ALBERTO VIAL PINTO"), it(330, 700, "Fecha/Hora Solicitud :"), it(440, 700, "28/10/2025 10:01"),
    it(40, 686, "F.Nacimiento :"), it(120, 686, "02/01/1959"), it(200, 686, "Edad: 66 Años"),
    it(40, 672, "RUT :"), it(120, 673.2, "11.222.333-4"),
    it(40, 640, "Leucocitos"), it(200, 640, "25-50"), it(300, 640, "x campo")
  ];
  const t = Anon.textoItemsPdf(items);
  assert.match(t, /^Nombre\s+: BAYRON ALBERTO VIAL PINTO\s{3}Fecha\/Hora Solicitud : 28\/10\/2025 10:01\n/);
  assert.match(t, /\nRUT :\s+11\.222\.333-4\n/);
  const s = anon(t);
  for (const d of ["BAYRON", "ALBERTO", "VIAL", "PINTO", "11.222.333", "02/01/1959", "F.Nacimiento"]) assert.ok(!s.includes(d), `quedó visible «${d}»:\n${s}`);
  for (const d of ["edad: 66 años", "Edad: 66 Años", "Fecha/Hora Solicitud : 28/10/2025 10:01", "Leucocitos", "25-50"]) assert.ok(s.includes(d), `se ocultó «${d}»:\n${s}`);
});

test("nombre en mayúsculas sin rótulo, con un nombre y un apellido poco comunes", () => {
  oculta(": BAYRON ALBERTO VIAL PINTO", "BAYRON");
  oculta(": BAYRON ALBERTO VIAL PINTO", "VIAL");
  conserva("Paciente con HTA, DM2 y ERC etapa 3. EPOC GOLD 2 en control.", "HTA, DM2 y ERC etapa 3. EPOC GOLD 2");
  conserva("Control JUAN: TSH VHS PCR normales", "TSH VHS PCR");
});

/* ---------- texto leído de fotos: lo que el lector del teléfono suele estropear (datos ficticios) ---------- */
test("RUN con puntos aunque el lector pierda el guion o pegue el dígito verificador", () => {
  oculta("RUN : 9.882.8484", "9.882");
  oculta("Paciente 9.882.8484 control", "9.882");
  oculta("RUN 12.345.678 K", "12.345.678");
  oculta("cédula 12.345.678", "12.345.678");
  // Recuentos y montos no son RUN
  conserva("Eritrocitos 4.500.000 /mm3", "4.500.000");
  conserva("Recuento 1.200.000", "1.200.000");
  conserva("Urocultivo >100.000 UFC/ml", "100.000");
});

test("títulos de profesionales (Int., EU, TM, TENS) anteceden un nombre", () => {
  oculta("Int. Femanda Huenchumil/ Medicina UNAB.", "Femanda");
  oculta("Int. Femanda Huenchumil/ Medicina UNAB.", "Huenchumil");
  oculta("Validado por EU Rocío Quilodrán", "Quilodrán");
  oculta("TENS Marcelo Ancavil", "Ancavil");
  conserva("Int. Femanda Huenchumil/ Medicina UNAB.", "Medicina UNAB");
});

test("N* (así lee el teléfono N°) también es rótulo de folio o registro", () => {
  oculta("N* Registro : 000771", "000771");
});

test("en una foto, el nombre rotulado sigue tras un hueco hasta el próximo campo", () => {
  const t = "Nombre del Paciente   : JUANA ISIDORA PEREI   ROA\nNombre: JUAN PEREZ   N* Registro : 000771249";
  const res = Anon.analizar(t, {});
  const foto = Anon.revisar(res, null, {foto: true}).map(a => a.texto);
  assert.ok(foto.includes("ROA"), "no avisó del trozo de apellido: " + JSON.stringify(foto));
  assert.ok(!foto.some(x => /Registro/.test(x)), "tomó el rótulo siguiente como nombre: " + JSON.stringify(foto));
  // En texto escrito, el hueco grande sí separa campos
  assert.ok(!Anon.revisar(res).map(a => a.texto).includes("ROA"));
});
