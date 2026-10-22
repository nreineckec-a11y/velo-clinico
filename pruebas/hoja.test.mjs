// Pruebas de la lectura de fotos de hojas reales: hoja sobre una alfombra, luz desigual y papel curvado.
// Las imágenes se dibujan aquí mismo (renglones de "letras" sintéticas); no hay datos de nadie.
// Ejecutar con:  node --test pruebas/*.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import {cargarMotor} from "./cargar-motor.mjs";

const Anon = cargarMotor();

function azar(semilla){ let s = semilla; return () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648; }
// Curvatura conocida: el renglón que pasa por (XC, y0) sigue y = y0 + C (x - XC)²  (pendiente 2C (x - XC))
const W = 900, H = 1200, XC = 450, C = 0.00022, PAPEL = {x0: 120, y0: 140, x1: 780, y1: 1060};
const curva = (x, y0) => y0 + C * (x - XC) * (x - XC);
function foto({luz = true, semilla = 5} = {}){
  const r = azar(semilla), g = new Uint8Array(W * H);
  // Alfombra: manchas de todos los tamaños
  const base = new Float32Array(W * H);
  for (let i = 0; i < base.length; i++) base[i] = r();
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++){
    const i = y * W + x, v = (base[i] + base[(y * W + ((x + 1) % W))] + base[(((y + 1) % H) * W + x)]) / 3;
    g[i] = 70 + 120 * v;
  }
  // Hoja clara (con la luz cayendo de un lado si luz = true)
  for (let y = PAPEL.y0; y < PAPEL.y1; y++) for (let x = PAPEL.x0; x < PAPEL.x1; x++) g[y * W + x] = luz ? 175 + 60 * (x - PAPEL.x0) / (PAPEL.x1 - PAPEL.x0) : 235;
  // Renglones de palabras cada 16 px, siguiendo la curvatura
  for (let y0 = 200; y0 < 980; y0 += 16){
    let x = 160;
    while (x < 740){
      const ancho = 12 + Math.floor(r() * 50);
      for (let xx = x; xx < Math.min(740, x + ancho); xx++){
        if (r() < 0.35) continue;   // huecos dentro de las letras
        const yb = Math.round(curva(xx, y0));
        for (let yy = yb; yy < yb + 9; yy++) if (yy > PAPEL.y0 && yy < PAPEL.y1 && r() < 0.8) g[yy * W + xx] = 40;
      }
      x += ancho + 6 + Math.floor(r() * 8);
    }
  }
  return g;
}

test("ubica la hoja, la altura del renglón y la curvatura del papel", () => {
  const h = Anon.analizarHoja(foto(), W, H);
  assert.ok(h.zona, "no encontró la hoja");
  const z = h.zona;
  // Abarca todo el texto…
  assert.ok(z.x0 <= 160 && z.y0 <= 200 && z.x1 >= 740 && z.y1 >= 980, "la zona corta el texto: " + JSON.stringify(z));
  // …y deja fuera la alfombra lejana
  assert.ok(z.x0 >= 0 && z.y0 >= 20 && z.y1 <= H - 20, "la zona se va a la alfombra: " + JSON.stringify(z));
  assert.ok(Math.abs(h.paso - 16) <= 2, "renglón de " + h.paso + " px en vez de 16");
  for (const [x, y] of [[250, 400], [450, 600], [650, 800], [300, 900]]){
    const real = 2 * C * (x - XC), medida = Anon.pendienteEn(h.rejilla, x, y);
    assert.ok(Math.abs(medida - real) < 0.035, `inclinación en (${x}, ${y}): ${medida.toFixed(3)} en vez de ${real.toFixed(3)}`);
  }
});

test("enderezar deja derechos los renglones curvos", () => {
  const g = foto({luz: false}), h = Anon.analizarHoja(g, W, H);
  const p = Anon.aplanarLuz(g, W, H);
  const E = Anon.enderezar(p, W, H, (x, y) => Anon.pendienteEn(h.rejilla, x, y));
  // Un renglón queda a la misma altura a la izquierda y al centro (en la foto estaba ~7 px más abajo; menos de
  // medio renglón para que la comparación no se confunda con el renglón vecino)
  const perfil = (img, alto, x0, x1) => { const v = new Float64Array(alto); for (let y = 0; y < alto; y++){ let s = 0; for (let x = x0; x < x1; x++) s += 255 - img[y * W + x]; v[y] = s; } return v; };
  const desfase = (img, alto) => {
    const izq = perfil(img, alto, 230, 320), cen = perfil(img, alto, 410, 500);
    // Correlación de los perfiles con distintos corrimientos; con los renglones derechos coinciden sin correrse
    let mejor = 0, max = -1;
    for (let d = -15; d <= 15; d++){ let s = 0; for (let y = 60; y < alto - 60; y++) s += izq[y] * cen[y + d]; if (s > max){ max = s; mejor = d; } }
    return mejor;
  };
  const antes = desfase(p, H), despues = desfase(E.img, E.H);
  assert.ok(Math.abs(antes) >= 5, "la prueba no tiene curvatura que enderezar (" + antes + ")");
  assert.ok(Math.abs(despues) <= 2, "los renglones quedaron corridos " + despues + " px (antes " + antes + ")");
  // Volver a la original: un punto del renglón enderezado cae sobre la curva conocida
  const yp = 600 + (E.H - H) / 2;
  const a = E.original(250, yp), b = E.original(650, yp);
  assert.ok(Math.abs((b - a) - (curva(650, 0) - curva(250, 0))) < 6, `desnivel ${(b - a).toFixed(1)} en vez de ${(curva(650, 0) - curva(250, 0)).toFixed(1)}`);
});

test("la luz desigual se aplana: el papel queda parejo", () => {
  const g = foto({luz: true}), p = Anon.aplanarLuz(g, W, H);
  // Papel sin texto a la izquierda (más oscuro) y a la derecha (más claro)
  const media = (x0, y0) => { let s = 0, n = 0; for (let y = y0; y < y0 + 20; y++) for (let x = x0; x < x0 + 20; x++){ s += p[y * W + x]; n++; } return s / n; };
  const a = media(125, 1020), b = media(750, 1020);
  assert.ok(a > 225 && b > 225 && Math.abs(a - b) < 15, `papel en ${a.toFixed(0)} y ${b.toFixed(0)}`);
});

test("el fondo lejano se blanquea y la hoja no", () => {
  const g = foto(), h = Anon.analizarHoja(g, W, H), p = Anon.aplanarLuz(g, W, H);
  Anon.blanquearFondo(p, W, H, h, 1, 0, 0);
  const blanco = (x0, y0, lado) => { for (let y = y0; y < y0 + lado; y++) for (let x = x0; x < x0 + lado; x++) if (p[y * W + x] !== 255) return false; return true; };
  assert.ok(blanco(10, 1140, 40), "la alfombra de abajo no se blanqueó");
  // Las letras siguen ahí
  let tinta = 0; for (let y = 200; y < 980; y++) for (let x = 160; x < 740; x++) if (p[y * W + x] < 120) tinta++;
  assert.ok(tinta > 20000, "se borró texto de la hoja (" + tinta + ")");
});

test("una foto sin texto no propone hoja", () => {
  const r = azar(3), g = new Uint8Array(400 * 300);
  for (let i = 0; i < g.length; i++) g[i] = 60 + 140 * r();
  assert.equal(Anon.analizarHoja(g, 400, 300).zona, null);
});

test("cajaOriginal lleva un recuadro de la imagen enderezada a la original", () => {
  // Sin curvatura: el recuadro vuelve igual (corrido solo por el margen agregado arriba)
  const g = new Uint8Array(300 * 200).fill(255);
  const E = Anon.enderezar(g, 300, 200, () => 0.1);
  const pad = (E.H - 200) / 2;
  const c = Anon.cajaOriginal(E, {x0: 140, y0: 100 + pad, x1: 160, y1: 110 + pad, tipo: "NOMBRE"});
  // Con inclinación 0,1 constante, desde el centro (x = 150) la altura cambia 0,1 por píxel
  assert.ok(Math.abs(c.y0 - (100 - 1)) < 1.5 && Math.abs(c.y1 - (110 + 1)) < 1.5, JSON.stringify(c));
  assert.equal(c.tipo, "NOMBRE");
});
