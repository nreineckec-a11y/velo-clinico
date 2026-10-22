// Pruebas de las piezas del tapado de fotos que no necesitan el lector: la hoja sobre un fondo con textura, la
// perspectiva, el campo rotulado (rótulo → valor), los patrones nuevos, la búsqueda de un dato en otras páginas y la
// unión de lecturas. Todo es ficticio.  Ejecutar con:  node --test pruebas/*.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import {cargarMotor} from "./cargar-motor.mjs";

const Anon = cargarMotor();
// (los arreglos del motor vienen de otro contexto: se copian para compararlos)
const dets = (t, o) => [...Anon.analizar(t, o || {}).dets].map(d => d.tipo + ":" + t.slice(d.s, d.e));
const foto = t => dets(t, {foto: true});
function azar(semilla){ let s = semilla; return () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648; }

/* ---------- la hoja en la foto ---------- */
// Hoja clara girada 4° sobre una "alfombra" (manchas de todos los tamaños), con renglones de letras sintéticas
const W = 1000, H = 1400, ANG = 4 * Math.PI / 180, CX = 500, CY = 720, AN = 640, AL = 900;
const girar = (u, v) => ({x: CX + u * Math.cos(ANG) - v * Math.sin(ANG), y: CY + u * Math.sin(ANG) + v * Math.cos(ANG)});
const ESQUINAS = [girar(-AN / 2, -AL / 2), girar(AN / 2, -AL / 2), girar(AN / 2, AL / 2), girar(-AN / 2, AL / 2)];
function fotoDeHoja(semilla = 9){
  const r = azar(semilla), ruido = new Float32Array(W * H);
  for (let i = 0; i < ruido.length; i++) ruido[i] = r();
  const g = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++){
    const i = y * W + x, v = (ruido[i] + ruido[y * W + ((x + 3) % W)] + ruido[((y + 2) % H) * W + x]) / 3;
    g[i] = 95 + 110 * v;
  }
  // Letras: trazos en renglones cada 22 px dentro de la hoja (coordenadas de la hoja u, v)
  const letras = new Set();
  for (let v = -AL / 2 + 70; v < AL / 2 - 120; v += 22){
    let u = -AN / 2 + 60;
    while (u < AN / 2 - 60){
      const ancho = 14 + Math.floor(r() * 60);
      for (let uu = u; uu < Math.min(AN / 2 - 60, u + ancho); uu++) if (r() > 0.35) for (let vv = v; vv < v + 11; vv++) if (r() < 0.8) letras.add(Math.round(uu) + "," + Math.round(vv));
      u += ancho + 8 + Math.floor(r() * 10);
    }
  }
  const c = Math.cos(ANG), s = Math.sin(ANG);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++){
    const dx = x - CX, dy = y - CY, u = dx * c + dy * s, v = -dx * s + dy * c;
    if (Math.abs(u) <= AN / 2 && Math.abs(v) <= AL / 2) g[y * W + x] = letras.has(Math.round(u) + "," + Math.round(v)) ? 35 : 228 + 10 * (u / AN);
  }
  return g;
}
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

test("encuentra los bordes de una hoja girada sobre una alfombra", () => {
  const g = fotoDeHoja(), hoja = Anon.analizarHoja(g, W, H);
  const q = Anon.detectarHoja(g, W, H, hoja);
  assert.ok(q, "no encontró la hoja");
  // Cada esquina cerca de la verdadera (el cuadrilátero lleva un margen hacia afuera de unos 30 px)
  q.forEach((p, i) => assert.ok(dist(p, ESQUINAS[i]) < 70, `esquina ${i}: ${JSON.stringify(p)} lejos de ${JSON.stringify(ESQUINAS[i])}`));
  // La hoja completa queda adentro y casi nada de alfombra
  for (const e of ESQUINAS) assert.ok(Anon.dentroCuad(Anon.agrandarCuad(q, 3), e.x, e.y), "una esquina de la hoja quedó fuera");
  const t = Anon.tamanoCuad(q);
  assert.ok(t.ancho * t.alto < AN * AL * 1.25, `cuadrilátero de ${Math.round(t.ancho)}×${Math.round(t.alto)}: incluye demasiado fondo`);
});

test("el contorno de la hoja deja fuera la alfombra lejana y adentro todo el papel", () => {
  const g = fotoDeHoja(4), hoja = Anon.analizarHoja(g, W, H);
  assert.ok(Anon.detectarHoja(g, W, H, hoja));
  const cont = hoja.contorno, dentro = (p, pts) => { let d = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++){ const a = pts[i], b = pts[j]; if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) d = !d; } return d; };
  // Puntos del papel cerca de cada esquina (20 px hacia adentro) quedan dentro del contorno
  for (const e of ESQUINAS){ const p = {x: e.x + (CX - e.x) * 0.06, y: e.y + (CY - e.y) * 0.06}; assert.ok(dentro(p, cont), "el contorno corta el papel en " + JSON.stringify(p)); }
  // Las esquinas de la foto (alfombra) quedan fuera
  for (const p of [{x: 5, y: 5}, {x: W - 5, y: 5}, {x: W - 5, y: H - 5}, {x: 5, y: H - 5}]) assert.ok(!dentro(p, cont), "el contorno incluye la alfombra en " + JSON.stringify(p));
});

test("un grupito de 'renglones' en la alfombra, lejos de la hoja, no la agranda", () => {
  const g = fotoDeHoja(6);
  // Tres trozos de "texto" en la alfombra, abajo a la izquierda
  for (let k = 0; k < 3; k++) for (let y = 1300 + k * 22; y < 1311 + k * 22; y++) for (let x = 40; x < 120; x += 2) g[y * W + x] = 40;
  const hoja = Anon.analizarHoja(g, W, H), q = Anon.detectarHoja(g, W, H, hoja);
  assert.ok(q && q.every(p => p.y < 1240), "el cuadrilátero se estiró hacia la alfombra: " + JSON.stringify(q && q.map(p => [Math.round(p.x), Math.round(p.y)])));
});

test("perspectiva: la homografía lleva el cuadrilátero al rectángulo y vuelve", () => {
  const q = [{x: 120, y: 80}, {x: 860, y: 140}, {x: 900, y: 1200}, {x: 60, y: 1150}], R = [{x: 0, y: 0}, {x: 700, y: 0}, {x: 700, y: 1000}, {x: 0, y: 1000}];
  const h = Anon.homografia(R, q), inv = Anon.homografia(q, R);
  for (let i = 0; i < 4; i++){
    const p = Anon.aplicarH(h, R[i].x, R[i].y), b = Anon.aplicarH(inv, p.x, p.y);
    assert.ok(dist(p, q[i]) < 1e-6 && dist(b, R[i]) < 1e-6);
  }
  // Rectificar: un punto oscuro en el centro del cuadrilátero queda en el centro del rectángulo
  const g = new Uint8Array(1000 * 1300).fill(255), c = Anon.aplicarH(h, 350, 500);
  for (let y = Math.round(c.y) - 3; y <= Math.round(c.y) + 3; y++) for (let x = Math.round(c.x) - 3; x <= Math.round(c.x) + 3; x++) g[y * 1000 + x] = 0;
  const r = Anon.rectificar(g, 1000, 1300, q, 700, 1000, 1);
  assert.ok(r.img[500 * 700 + 350] < 60, "el punto no quedó en su lugar");
});

test("blanquearFuera deja en blanco solo lo de fuera del polígono", () => {
  const g = new Uint8Array(100 * 80).fill(50);
  Anon.blanquearFuera(g, 100, 80, [{x: 20, y: 10}, {x: 80, y: 10}, {x: 80, y: 70}, {x: 20, y: 70}]);
  assert.equal(g[40 * 100 + 50], 50); assert.equal(g[5 * 100 + 5], 255); assert.equal(g[40 * 100 + 90], 255);
});

/* ---------- patrones (punto 4) ---------- */
test("folio alfanumérico largo, FI de cada servicio y n° de episodio", () => {
  assert.ok(dets("N° Episodio : H0000127458").includes("FICHA:H0000127458"));
  assert.ok(dets("Episodio H0000127458 en UMI").some(d => d.includes("H0000127458")));
  assert.ok(dets("FI SU HBLR 3157204").includes("FICHA:3157204"));
  assert.ok(dets("FI UMI HBLR 4A 664318").includes("FICHA:664318"));
  assert.deepEqual(dets("FI UMI HBLR 4A"), [], "sin número no hay ficha");
});

test("RUN tras su rótulo aunque el lector lea los dos puntos como raya y un punto como espacio", () => {
  assert.ok(foto("RUN - 9.882 8484").includes("RUT:9.882 8484"));
  assert.ok(foto("RUN — 6.482.917-3").includes("RUT:6.482.917-3"));
  assert.deepEqual(foto("RUN 2 tabletas cada 8 horas"), []);
});

test("dirección sin rótulo: calle y número, con o sin coma; un examen con su valor no es dirección", () => {
  assert.ok(dets("Alta a domicilio en LOS ALERCES, 3187 con su esposa.").includes("DIRECCION:LOS ALERCES, 3187"));
  assert.ok(dets("Vive en Los Alerces 3187, Peñalolén").some(d => d.startsWith("DIRECCION:Los Alerces 3187")));
  for (const t of ["Leuco 14230", "Plq 310 mil", "Hb 12.4, Hto 37", "Sala 4A 1450 mg", "PCR 112.5", "Cama 1450"]) assert.ok(!dets(t).some(d => d.startsWith("DIRECCION")), t + " → " + dets(t));
});

test("edad exacta: quedan los años; meses y días se tapan (también si el lector los pega o pierde los años)", () => {
  assert.deepEqual(dets("Fecha Nacimiento - Edad : 17/06/1946 - 79a 4m 25d").filter(d => d.startsWith("EDAD")), ["EDAD:4m 25d"]);
  assert.ok(dets("77 años 2 meses 11 días").includes("EDAD:2 meses 11 días"));
  assert.ok(dets("79a4m 25d").includes("EDAD:4m 25d"));
  assert.ok(foto("17/06/1946 3m 9d").includes("EDAD:3m 9d"));
  // Con una segunda lectura de los meses entre medio (el lector leyó "4m" y también "Am")
  assert.ok(foto("- 79a 4m Am 25d").includes("EDAD:4m Am 25d"));
  assert.ok(foto(":   - 79a Am 25d   - Hombre").includes("EDAD:Am 25d"), "meses mal leídos");
  assert.ok(!dets("EDAD: 79 AÑOS").some(d => d.startsWith("EDAD")), "la edad en años queda a la vista");
});

test("en fotos: números largos rotos por el lector y fechas a medias se tapan; resultados y dosis no", () => {
  assert.ok(foto("Fecha Creación: 1210/2028").some(d => d.includes("1210/2028")));
  assert.ok(foto("Hospital X (Código:119876)").includes("FICHA:119876"));
  assert.ok(foto("Folio 1234567").some(d => d.includes("1234567")));
  assert.ok(foto("Fecha 03/11/2 Hora 09:41").includes("FECHA:03/11/2"));
  for (const t of ["Plaquetas 310000", "Recuento 1.200.000", "CD4 350000", "Plaquetas 150000 - 450000", "Paracetamol 1-1-1", "Losartán 50 mg 1-0-1", "1.5.2 Diagnósticos", "PA 132/76 mmHg"])
    assert.deepEqual(foto(t), [], t + " → " + foto(t));
  // En el texto escrito estas reglas no corren
  assert.deepEqual(dets("Fecha Creación: 1210/2028"), []);
});

/* ---------- rótulo → valor (punto 2) ---------- */
const palabra = (texto, x0, y0, h = 24, conf = 92) => ({texto, caja: {x0, y0, x1: x0 + texto.length * 13, y1: y0 + h}, conf});
const tapada = (cajas, p) => { const x = (p.caja.x0 + p.caja.x1) / 2, y = (p.caja.y0 + p.caja.y1) / 2; return cajas.some(c => x >= c.x0 && x <= c.x1 && y >= c.y0 && y <= c.y1); };

test("un rótulo de identificación tapa todo su valor hasta el campo siguiente de la fila", () => {
  const ws = [palabra("Nombre", 40, 100), palabra("del", 130, 100), palabra("Paciente", 180, 100), palabra(":", 330, 102), palabra("ZQWX", 350, 102), palabra("KLMNO", 420, 102),
    palabra("N°", 700, 100), palabra("Registro", 735, 100), palabra(":", 850, 100), palabra("000771249", 870, 100)];
  const {cajas} = Anon.zonasATapar(ws, 0, {});
  assert.ok(tapada(cajas, ws[4]) && tapada(cajas, ws[5]) && tapada(cajas, ws[9]));
  assert.ok(!tapada(cajas, ws[6]) && !tapada(cajas, ws[7]), "el rótulo del campo siguiente quedó tapado");
  // Lo de en medio (espacio vacío) también va tapado: si el lector leyó solo parte del valor, el resto no queda a la vista
  assert.ok(cajas.some(c => c.relleno && c.x0 <= 500 && c.x1 >= 600), "no se prolongó el recuadro hasta el campo siguiente");
});

test("un valor cortado por el lector ('12/11' de '12/10/2026') tras «Fecha …:» se tapa y se prolonga", () => {
  const ws = [palabra("Fecha", 40, 100), palabra("Creación:", 120, 100), palabra("12/11", 260, 100), palabra("Hora", 40, 140), palabra("Impresión:", 110, 140), palabra("10:22", 260, 140)];
  const {cajas} = Anon.zonasATapar(ws, 0, {});
  assert.ok(tapada(cajas, ws[2]), "no se tapó la fecha a medias");
  assert.ok(cajas.some(c => c.relleno && c.x1 > ws[2].caja.x1 + 30), "el recuadro no siguió más allá de lo leído");
  assert.ok(!tapada(cajas, ws[5]), "la hora sola no se tapa");
});

test("un rótulo de un dato sin ningún valor leído: se tapa donde debería ir el valor (al comprobar, no)", () => {
  const ws = [palabra("Hora", 40, 100, 20), palabra("Impresión:", 100, 100, 20), palabra("16:47", 260, 100, 20),
    palabra("Fecha", 40, 128, 20), palabra("Creación:", 120, 128, 20),
    palabra("Subespecialidad", 40, 156, 20), palabra(":", 260, 156, 20)];
  const cajas = [...Anon.zonasATapar(ws, 0, {}).cajas], v = cajas.filter(c => c.vacio);
  assert.equal(v.length, 1, JSON.stringify(cajas));
  assert.equal(v[0].tipo, "FECHA");
  // A la derecha del rótulo, con el largo de un valor, sin montarse sobre la hora de arriba ni sobre la línea de abajo
  assert.ok(v[0].x0 >= ws[4].caja.x1 && v[0].x1 - v[0].x0 >= 150, JSON.stringify(v[0]));
  assert.ok(v[0].y0 >= ws[2].caja.y1 && v[0].y1 <= ws[5].caja.y0, JSON.stringify(v[0]));
  assert.ok(!Anon.zonasATapar(ws, 0, {comprobando: true}).cajas.some(c => c.vacio));
});

test("con el valor ya tapado, el rótulo del campo vecino no pasa por dato (falsas alarmas al comprobar)", () => {
  assert.deepEqual(foto("Dirección   :   Comuna   ."), []);
  assert.deepEqual(foto("Registrado por   :   Tipo de Profesional   - Servicio de Urgencia"), []);
  assert.deepEqual(foto("Fecha Alta Médica   : Domicilo   Tipo de Egreso   - Alta Médica"), []);
  assert.deepEqual(foto("Tipo de Profesional   : Médi Médico co"), []);
  assert.deepEqual([...Anon.revisar(Anon.analizar("Tipo de Profesional   : Médi Médico co", {foto: true}), null, {foto: true})], []);
  assert.ok(foto("Profesional: Xiomara Ñancupil").includes("NOMBRE:Xiomara Ñancupil"));
  assert.deepEqual([...Anon.revisar(Anon.analizar("RUN   :   N* Registro -", {foto: true}), null, {foto: true})], []);
  // Los rótulos de verdad siguen funcionando
  assert.ok(foto("Médico: Xiomara Ñancupil").includes("NOMBRE:Xiomara Ñancupil"));
  assert.ok(foto("Nombre del médico: Xiomara Ñancupil").includes("NOMBRE:Xiomara Ñancupil"));
  assert.ok(foto("Dirección: Los Alerces 3187").includes("DIRECCION:Los Alerces 3187"));
});

test("un espacio grande seguido de un rótulo conocido corta el valor aunque falten los dos puntos", () => {
  const t = "Dirección   : LOS ALERCES, 3187      Comuna\nTipo de Profesional   : Médico";
  const campos = Anon.revisar(Anon.analizar(t, {foto: true}), null, {foto: true}).map(c => c.texto);
  assert.ok(!campos.some(c => /Comuna/.test(c)), JSON.stringify(campos));
});

test("nombre o dirección que siguen en la línea de abajo también se tapan", () => {
  const ws = [palabra("Nombre", 40, 100), palabra("del", 130, 100), palabra("Paciente:", 180, 100), palabra("ZQWX", 350, 100), palabra("KLMNOP", 420, 100),
    palabra("XIOMARA", 352, 130), palabra("Edad:", 40, 180), palabra("45", 120, 180)];
  const {cajas} = Anon.zonasATapar(ws, 0, {});
  assert.ok(tapada(cajas, ws[5]), "no se tapó la continuación del nombre");
  assert.ok(!tapada(cajas, ws[7]));
});

test("encabezado leído con poca confianza: se tapa entero; bien leído o en la comprobación, no", () => {
  const filas = ["Hospital Clínico Ficticio", "Nombre del Paciente : ZQWX KLMN", "RUN : 1.111.111-1", "Fecha : 01/01/2020"], ws = [];
  filas.forEach((f, i) => { let x = 40; for (const w of f.split(" ")){ ws.push(palabra(w, x, 60 + i * 34, 24, 30)); x += w.length * 13 + 12; } });
  for (let i = 0; i < 14; i++) ws.push(palabra("Diagnóstico" + i, 40, 300 + i * 34, 24, 95));
  assert.ok(Anon.zonasATapar(ws, 0, {}).cajas.some(c => c.tipo === "ENCABEZADO"));
  assert.ok(!Anon.zonasATapar(ws, 0, {sinEncabezado: true}).cajas.some(c => c.tipo === "ENCABEZADO"));
  for (const w of ws) w.conf = 95;
  assert.ok(!Anon.zonasATapar(ws, 0, {}).cajas.some(c => c.tipo === "ENCABEZADO"));
});

test("recuadros: palabras completas, mismo dato en la misma línea se junta; en otra línea no", () => {
  const c = (x0, y0, x1, y1, grupo) => ({x0, y0, x1, y1, tipo: "NOMBRE", grupo});
  const f = Anon.fusionarCajas([c(10, 100, 60, 124, 0), c(70, 101, 130, 125, 0), c(10, 140, 60, 164, 0), c(200, 100, 260, 124, 1)]);
  assert.equal(f.length, 3);
  assert.ok(f.some(b => b.x0 === 10 && b.x1 === 130 && b.y1 - b.y0 <= 26), JSON.stringify(f));
});

test("renglones apretados: el recuadro de una línea no se monta sobre la de abajo ni sobre la de arriba", () => {
  // "N° Episodio : H0000748203" sobre "Fecha de Ingreso : 03/11/2025", 6 px entre una y otra
  const ws = [palabra("N°", 40, 100, 20), palabra("Episodio", 80, 100, 20), palabra(":", 300, 100, 20), palabra("H0000748203", 330, 100, 20),
    palabra("Fecha", 40, 126, 20), palabra("de", 120, 126, 20), palabra("Ingreso", 160, 126, 20), palabra(":", 300, 126, 20), palabra("03/11/2025", 330, 126, 20),
    palabra("Destino", 40, 152, 20), palabra(":", 300, 152, 20), palabra("Domicilio", 330, 152, 20)];
  const m = [...Anon.margenesCajas(ws, 20)];
  assert.ok(m[3].abajo <= 3 && m[8].arriba <= 3 && m[8].abajo <= 3, JSON.stringify(m));
  // Sin vecinos cerca, el margen es el de siempre (un cuarto del alto)
  assert.equal(m[11].abajo, 5);
  // Aunque se tape solo el episodio (la fecha "se olvidó"), su recuadro no toca la fecha
  const sinFecha = ws.slice(), cajas = Anon.zonasATapar(sinFecha, 0, {}).cajas;
  const fecha = ws[8].caja, ficha = cajas.filter(c => c.tipo === "FICHA");
  assert.ok(ficha.length && ficha.every(c => c.y1 <= fecha.y0), JSON.stringify(ficha));
  // Y el relleno de un campo rotulado (que se estira hasta el campo vecino, más allá de lo leído) tampoco baja a la
  // línea siguiente donde esta trae algo más a la derecha
  const ws2 = [palabra("Nombre", 40, 100, 20), palabra("del", 130, 100, 20), palabra("Paciente", 180, 100, 20), palabra(":", 300, 100, 20), palabra("ZQWX", 330, 100, 20),
    palabra("Fecha", 40, 124, 20), palabra("Ingreso", 120, 124, 20), palabra(":", 300, 124, 20), palabra("03/11/2025", 420, 124, 20)];
  const rellenos = [...Anon.zonasATapar(ws2, 0, {}).cajas].filter(c => c.relleno && c.tipo === "NOMBRE" && c.x1 > 420);
  assert.ok(rellenos.length && rellenos.every(c => c.y1 <= 124), JSON.stringify(rellenos));
});

test("el alto de cada palabra se ajusta a su tinta (la caja del lector puede abarcar media línea vecina)", () => {
  // Imagen 300×120 con tres renglones de "letra" (filas 20–37, 50–67 y 80–97) y una tilde sobre el del medio
  const W = 300, H = 120, g = new Uint8Array(W * H).fill(240);
  const tinta = (x0, x1, y0, y1) => { for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if ((x + y) % 3) g[y * W + x] = 30; };
  tinta(20, 280, 20, 38); tinta(20, 200, 50, 68); tinta(20, 280, 80, 98); tinta(60, 66, 45, 48);
  const p = (texto, y0, y1) => ({texto, conf: 90, caja: {x0: 20, x1: 200, y0, y1}});
  const [a, b, c] = [...Anon.ajustarAltoPalabras([p("03/11/2025", 33, 72), p("Domicilio", 52, 66), p("raya", 0, 120)], g, W, H, 30)];
  // Caja inflada: queda en su renglón (con la tilde), sin el trozo del renglón de arriba
  assert.ok(a.caja.y0 >= 43 && a.caja.y0 <= 46 && a.caja.y1 >= 68 && a.caja.y1 <= 70, JSON.stringify(a.caja));
  // Caja que ya era justa: no cambia; nunca se agranda
  assert.deepEqual({...b.caja}, {x0: 20, x1: 200, y0: 52, y1: 66});
  // Caja que abarca tres renglones parejos: ninguna franja tiene casi toda la tinta, se deja como está
  assert.deepEqual({...c.caja}, {x0: 20, x1: 200, y0: 0, y1: 120});
  // Si lo más cargado de la caja no pasa por su medio (una línea vecina en negrita pesa más), tampoco se toca
  const negrita = new Uint8Array(W * H).fill(240);
  for (let y = 10; y < 40; y++) for (let x = 20; x < 280; x++) negrita[y * W + x] = 20;
  for (let y = 50; y < 60; y++) for (let x = 20; x < 120; x++) if ((x + y) % 4 === 0) negrita[y * W + x] = 60;
  assert.deepEqual({...Anon.ajustarAltoPalabras([p("Pérez", 30, 62)], negrita, W, H, 30)[0].caja}, {x0: 20, x1: 200, y0: 30, y1: 62});
  // Sin contraste (papel parejo) tampoco se toca
  const lisa = new Uint8Array(W * H).fill(200);
  assert.deepEqual({...Anon.ajustarAltoPalabras([p("x", 10, 90)], lisa, W, H, 30)[0].caja}, {x0: 20, x1: 200, y0: 10, y1: 90});
});

test("«Medicina Interna» es una especialidad: lo que sigue no es el nombre de una interna", () => {
  assert.ok(!foto("Especialidad : Medicina interna Inte").some(d => d.startsWith("NOMBRE:")));
  assert.ok(!foto("Servicio de Medicina Interna Geriatría").some(d => d.startsWith("NOMBRE:")));
  assert.ok(foto("Interna Xiomara Ñancupil").some(d => d.startsWith("NOMBRE:") && d.includes("Xiomara")));
});

/* ---------- un dato en todas las páginas (punto 3) ---------- */
test("los datos de una página (con o sin rótulo) se buscan en las otras aunque el lector yerre letras", () => {
  const ws = [palabra("Nombre", 40, 100), palabra("del", 130, 100), palabra("Paciente:", 180, 100), palabra("ZQWX", 330, 100), palabra("QUILAQUEO", 400, 100),
    palabra("RUN:", 40, 140), palabra("8.765.432-1", 120, 140), palabra("Dr.", 40, 180), palabra("Rodrigo", 90, 180), palabra("Ignacio", 170, 180), palabra("Valdés", 270, 180)];
  const ents = [...Anon.entidadesDe(Anon.zonasATapar(ws, 0, {}).res)];
  const tokens = ents.map(e => e.token);
  for (const t of ["zqwx", "quilaqueo", "87654321", "ignacio", "valdes"]) assert.ok(tokens.includes(t), "falta la entidad " + t + " en " + JSON.stringify(tokens));
  const otra = ["Quilaqueo", "QUILAQEO", "quilaqueo", "lgnacio", "Valdes", "8765432-1", "Vera", "vena", "Martes", "Zqwx", "Paciente", "14230"].map(t => ({texto: t}));
  const hall = [...Anon.coincidencias(otra, ents)].map(m => otra[m.i].texto);
  assert.deepEqual(hall.sort(), ["8765432-1", "QUILAQEO", "Quilaqueo", "Valdes", "Zqwx", "lgnacio", "quilaqueo"].sort());
  // Al comprobar lo enviado también cuenta un trozo (4 letras al comienzo o al final, 5 cifras)
  const trozos = ["Quila", "laqueo", "765432", "Quil"].map(t => ({texto: t}));
  assert.equal(Anon.coincidencias(trozos, ents, {parcial: true}).length, 4);
  assert.equal(Anon.coincidencias(trozos, ents).length, 0);
  // Se avisa qué es solo un trozo y de cuántas letras: la comprobación descarta un trozo corto suelto ("Vive" de
  // "Viveros"), que suele ser otra palabra que empieza igual
  const vv = [...Anon.coincidencias([{texto: "Vive"}, {texto: "Viveros"}], [{tipo: "NOMBRE", token: "viveros", num: false}], {parcial: true})];
  assert.deepEqual(vv.map(m => [m.i, m.trozo, m.largo]), [[0, true, 4], [1, false, 7]]);
});

test("«Vera» no tapa «vena» y una palabra corta en minúscula nunca cuenta", () => {
  const ents = [{tipo: "NOMBRE", token: "vera", num: false}, {tipo: "NOMBRE", token: "rosa", num: false}];
  const ws = ["vena", "Vena", "rosa", "Vera", "VERA"].map(t => ({texto: t}));
  assert.deepEqual([...Anon.coincidencias(ws, ents)].map(m => ws[m.i].texto), ["Vera", "VERA"]);
});

test("nombres: la I inicial leída como «i» o «l» sigue siendo nombre; tras «su hija.» empieza otra oración", () => {
  assert.ok(foto("Dr. Rodrigo ignacio Valdés").some(d => d.startsWith("NOMBRE:") && d.includes("ignacio")));
  assert.deepEqual(dets("Alta con su hija. Retira copia de epicrisis."), []);
  assert.ok(dets("Lo acompaña su hija Camila Rojas.").includes("NOMBRE:Camila Rojas"));
  assert.ok(dets("Hija: Camila Rojas").includes("NOMBRE:Camila Rojas"));
});

/* ---------- dos lecturas de la misma imagen ---------- */
test("al unir dos lecturas, una raya dudosa no tapa una palabra bien leída y las lecturas distintas quedan las dos", () => {
  const p = (texto, x0, y0, x1, y1, conf) => ({texto, conf, caja: {x0, y0, x1, y1}, linea: 0});
  const a = [p("Fecha", 10, 10, 80, 30, 95), p("—", 100, 5, 260, 40, 27), p("14/05/2023", 300, 10, 420, 30, 80)];
  const b = [p("Fecha", 11, 10, 80, 30, 96), p("14/05/2025", 110, 12, 250, 32, 96), p("14/05/2025", 300, 10, 421, 30, 90), p("Domicilio", 500, 10, 600, 30, 90)];
  const u = [...Anon.unirLecturas(a, b)].map(w => w.texto);
  assert.ok(!u.includes("—"), "la raya dudosa siguió tapando");
  assert.equal(u.filter(t => t === "Fecha").length, 1, "una palabra igual se repitió");
  assert.ok(u.includes("14/05/2023") && u.filter(t => t === "14/05/2025").length === 2, JSON.stringify(u));
  assert.ok(u.includes("Domicilio"));
});
