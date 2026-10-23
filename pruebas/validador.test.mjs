// Validador final: revisa lo que se va a enviar (ya anonimizado) con reglas propias. Lo que encuentra se vuelve a
// ocultar y se valida de nuevo; si aun así queda, el caso requiere revisión y no se envía.
// Todos los datos son ficticios.  Ejecutar con:  node --test pruebas/*.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import {cargarMotor} from "./cargar-motor.mjs";
import {DOCUMENTOS} from "./sinteticos.mjs";

const Anon = cargarMotor();
const residuos = (t, nombres) => [...Anon.validar(t, {nombres})].map(r => r.tipo + ":" + r.texto);
const limpio = t => assert.deepEqual(residuos(t), [], t);

test("dígito verificador del RUT (módulo 11)", () => {
  for (const [c, dv] of [["12345678", "5"], ["11223344", "K"], ["10203040", "0"], ["9876543", "3"], ["6.789.012", "4"]]) assert.equal(Anon.dvRut(c), dv);
});

test("RUT: con dígito verificador válido en cualquier formato; con puntos y guion aunque el dígito no calce", () => {
  for (const r of ["12.345.678-5", "12345678-5", "12 345 678-5", "12.345.678-5".replace("-", " - "), "11.223.344-k", "9.876.543-3", "12.345.6785"])
    assert.deepEqual(residuos("Paciente " + r + " consulta"), ["RUT:" + r], r);
  assert.deepEqual(residuos("Doc 12.345.678-9"), ["RUT:12.345.678-9"]);          // dígito errado, formato completo
  assert.deepEqual(residuos("Ref 12345678-9"), []);                             // sin puntos y dígito errado: no
  assert.deepEqual(residuos("RUT: 12345678"), ["RUT:12345678"]);                // tras su rótulo, siempre
});

test("correo, teléfonos chilenos y número de ficha", () => {
  assert.deepEqual(residuos("Escribir a juan.perez@correo.cl hoy"), ["CORREO:juan.perez@correo.cl"]);
  for (const f of ["+56 9 8765 4321", "+56987654321", "9 8765 4321", "987654321", "+56 2 2345 6789", "2 2345 6789", "(2) 2345 6789", "56 9 8765 4321"])
    assert.deepEqual(residuos("Contacto hija " + f + " en la tarde"), ["TELEFONO:" + f], f);
  assert.deepEqual(residuos("Fono: 41 223 3445"), ["TELEFONO:41 223 3445"]);
  for (const [t, v] of [["Ficha clínica: 4471208", "4471208"], ["N° Ficha 778812", "778812"], ["Episodio: 88123456", "88123456"],
    ["HC 123456", "123456"], ["Folio N° 0012345", "0012345"], ["Registro: A-55123", "A-55123"]])
    assert.deepEqual(residuos(t), ["FICHA:" + v], t);
});

test("fecha de nacimiento con su rótulo, en cualquier formato", () => {
  for (const [t, v] of [["F. Nac: 14/07/1958", "14/07/1958"], ["Fecha de nacimiento: 14 de julio de 1958", "14 de julio de 1958"],
    ["FN 14-07-58", "14-07-58"], ["nacido en 1958", "1958"], ["F.N.: 1958-07-14", "1958-07-14"], ["Nacimiento (registro): jul-1958", "jul-1958"]])
    assert.deepEqual(residuos(t), ["FECHA:" + v], t);
});

test("nombres del original que reaparecen; las palabras comunes solo con mayúscula; los marcadores no cuentan", () => {
  assert.deepEqual(residuos("Control: [NOMBRE_1] refiere que pérez no vino", ["perez"]), ["NOMBRE:pérez"]);
  assert.deepEqual(residuos("Orina color rosa", ["rosa"]), []);
  assert.deepEqual(residuos("Rosa refiere dolor", ["rosa"]), ["NOMBRE:Rosa"]);
  assert.deepEqual(residuos("[NOMBRE_1] [RUT_1] [TELEFONO_2] [FICHA_3]", ["nombre"]), []);
});

test("no confunde lo clínico con un dato (sin falsos positivos)", () => {
  limpio(`Eritrocitos 4.500.000 /mm3; Plaquetas 245.000 /mm3 (150.000 - 450.000); Carga viral 12000000 copias/ml
PA 130/80 mmHg; FC 72 lpm; Losartán 50 mg 1-0-1; Urocultivo >100.000 UFC/ml
edad: 66 años   Fecha de toma: 12/03/2025 08:15   Fecha de registro: 12/03/2025
Dg: HTA (I10), DM2 (E11.9). GES problema 32. Densidad 1.020. HbA1c 6,9 %.`);
  for (const d of DOCUMENTOS) limpio(Anon.construir(Anon.analizar(d.texto, {})).salida);
});

test("proteger: lo que el anonimizador dejó pasar se oculta, se valida de nuevo y la respuesta lo repone", () => {
  const t = "Documento del paciente 12 345 678-5, viene a control el 12/03/2025.";
  assert.ok(Anon.construir(Anon.analizar(t, {})).salida.includes("12 345 678-5"), "el anonimizador ya no deja pasar este RUT: cambiar el ejemplo");
  const p = Anon.proteger(t, {});
  assert.equal(p.ok, true);
  assert.equal(p.cons.salida, "Documento del paciente [RUT_1], viene a control el 12/03/2025.");
  assert.deepEqual([...p.agregados].map(a => a.tipo + ":" + a.texto), ["RUT:12 345 678-5"]);
  assert.equal(Anon.restaurar(p.cons.salida, p.cons.mapa).salida, t);
});

test("proteger: un apellido suelto que reaparece recibe el marcador de su nombre completo", () => {
  const p = Anon.proteger("Paciente: Juan Pérez Soto. Refiere que soto es su apellido materno.", {});
  assert.equal(p.ok, true);
  assert.equal(p.cons.salida, "Paciente: [NOMBRE_1]. Refiere que [NOMBRE_1] es su apellido materno.");
});

test("proteger: un RUT o teléfono que el médico dejó visible se vuelve a ocultar; un nombre visible a propósito, no", () => {
  const t = "Paciente: Juan Pérez, RUT 12.345.678-5, fono +56 9 8765 4321";
  const res = Anon.analizar(t, {}), off = new Set(res.dets.map(d => d.k));
  const p = Anon.proteger(t, {off});
  assert.equal(p.ok, true);
  assert.equal(p.cons.salida, "Paciente: Juan Pérez, RUT [RUT_1], fono [TELEFONO_1]");
});

test("proteger: si el residuo persiste, el caso requiere revisión (no se envía)", () => {
  // rondas: 0 simula que volver a ocultar no resolvió el residuo
  const p = Anon.proteger("Documento 12 345 678-5 y contacto juan@correo.cl", {rondas: 0});
  assert.equal(p.ok, false);
  assert.deepEqual([...p.residuos].map(r => r.tipo + ":" + r.texto), ["RUT:12 345 678-5"]);
});

test("los sintéticos pasan el validador sin tener que volver a ocultar nada", () => {
  for (const d of DOCUMENTOS){
    const p = Anon.proteger(d.texto, {});
    assert.equal(p.ok, true, d.nombre);
    assert.deepEqual([...p.agregados], [], d.nombre);
  }
});

/* ---------- modo automático: texto leído de fotos, sin revisión del médico ---------- */
test("protegerAuto: un campo rotulado con su valor a la vista se oculta solo (como «Ocultar todos»)", () => {
  const p = Anon.protegerAuto("Nombre: ZQWX KLMNO   Sexo: Masculino\nHemoglobina 13,5 g/dL", {});
  assert.equal(p.ok, true);
  assert.ok(!/ZQWX|KLMNO/.test(p.cons.salida) && p.cons.salida.includes("Sexo: Masculino") && p.cons.salida.includes("Hemoglobina 13,5 g/dL"), p.cons.salida);
});

test("protegerAuto: un nombre mal leído («PERE2», «Sepulbeda») se oculta si se parece a uno detectado", () => {
  const p = Anon.protegerAuto("Paciente: PEREZ SOTO, MARIA\nControl: Sra. PERE2 refiere dolor. Visto por Sepulbeda.\nNombre: Juan Sepulveda", {});
  assert.equal(p.ok, true);
  assert.ok(!/PERE2|Sepulbeda|Sepulveda|PEREZ/.test(p.cons.salida), p.cons.salida);
  // en minúscula o en palabras corrientes no se busca por parecido
  assert.deepEqual(residuos("refiere dolor y pereza", ["perez"]), []);
});

test("protegerAuto: los sintéticos llegan con lo clínico y las fechas clínicas, sin identificadores", () => {
  for (const d of DOCUMENTOS){
    const s = Anon.protegerAuto(d.texto, {}).cons.salida;
    for (const x of d.identificadores.concat(d.nacimiento.texto)) assert.ok(!s.includes(x), d.nombre + ": quedó «" + x + "»\n" + s);
    for (const x of d.clinicos.concat(d.clinicas)) assert.ok(s.includes(x), d.nombre + ": se perdió «" + x + "»\n" + s);
    assert.ok(s.includes("edad: " + d.nacimiento.edad + " años"), d.nombre);
  }
});

test("correo con la «@» mal leída por el lector: el anonimizador (en fotos) y el validador lo ocultan", () => {
  for (const t of ["Correo de contacto: lgonzalez.ficticioecorreo.cl", "Escribir a juan.perez©correo.cl hoy", "Mail: jperez.gmail.com"]){
    const p = Anon.protegerAuto(t, {});
    assert.ok(p.ok && !/gonzalez|perez/i.test(p.cons.salida), p.cons.salida);
  }
  assert.deepEqual(residuos("contacto lgonzalez.ficticioecorreo.cl"), [], "en texto escrito se exige la «@»");
  assert.deepEqual([...Anon.validar("contacto lgonzalez.ficticioecorreo.cl", {aproximado: true})].map(r => r.texto), ["lgonzalez.ficticioecorreo.cl"]);
  // lo clínico no tiene forma de dominio
  assert.deepEqual([...Anon.validar("E. coli; 1.020; HbA1c 6,9 %; 12,5 mg/dL; Na 140 mEq/L; 0.5 mg c/12 h", {aproximado: true})], []);
});

test("protegerAuto: en el texto que se envía, la edad reemplaza también el rótulo de la fecha de nacimiento", () => {
  assert.equal(Anon.protegerAuto("Fecha de Nacimiento: 14/07/1958   Edad: 66 años\nFecha de toma: 12/03/2025", {}).cons.salida,
    "edad: 66 años   Edad: 66 años\nFecha de toma: 12/03/2025");
});
