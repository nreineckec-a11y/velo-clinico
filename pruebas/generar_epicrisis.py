# Genera una epicrisis FICTICIA de 4 páginas "fotografiadas" con el teléfono: en ángulo, con la hoja curvada,
# sombras y sobre fondos con textura (alfombra, madera, tela). Todos los nombres, RUN, fechas, direcciones y
# números son inventados. Guarda las fotos y, por cada página, dónde quedó cada dato (para las pruebas).
# La página 4 (registro de enfermería) no trae el encabezado con el nombre: su apellido aparece suelto en el
# texto y solo se puede tapar buscando en ella lo que se encontró en las otras páginas.
#
# Uso:  python3 pruebas/generar_epicrisis.py pruebas/epicrisis
# Requiere Pillow, numpy y scipy.
import glob, json, os, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont
from scipy import ndimage

SALIDA = sys.argv[1] if len(sys.argv) > 1 else "pruebas/epicrisis"
os.makedirs(SALIDA, exist_ok=True)

def fuente(nombre, tam):
    for p in glob.glob(f"/usr/share/fonts/truetype/**/{nombre}", recursive=True):
        return ImageFont.truetype(p, tam)
    raise SystemExit("falta la fuente " + nombre)

# --- Datos inventados (caso clínico, personas, lugares, fechas y números: nada viene de un documento real) ---
P = dict(
    nombre="HUMBERTO ELADIO TRECAHUEL ORELLANA", run="6.482.917-3", run_sin="6482917-3", nac="17/06/1946", edad="79a 4m 25d",
    dir="LOS ALERCES, 3187", comuna="Peñalolén", registro="000584316", episodio="H0000748203",
    medico="Rodrigo Esteban Quiroga Viveros", medico_corto="Rodrigo Quiroga", interna="Javiera Toledo",
    f_imp="11/11/2025", f_ing="03/11/2025", f_egr="11/11/2025", fi1="3157204", fi2="664318",
)
# Palabras que identifican y por eso deben quedar tapadas
IDENT = set("HUMBERTO ELADIO TRECAHUEL ORELLANA Trecahuel Rodrigo Esteban Quiroga Viveros Javiera Toledo ALERCES 3187".split()) | {
    P["run"], P["run_sin"], P["nac"], P["registro"], P["episodio"], P["f_imp"], P["f_ing"], P["f_egr"], P["fi1"], P["fi2"], "4m", "25d"}
# Palabras clínicas (y otras que no son datos, como el día de la semana al comienzo de una nota) que deben seguir a la vista
CLINICAS = ["Neumonía", "Ceftriaxona", "Furosemida", "Insuficiencia", "Hiponatremia", "Hombre", "FONASA", "Hemoglobina",
            "Creatinina", "Diagnóstico", "Antecedentes", "Urgencia", "Martes", "Paracetamol", "deambula", "Glasgow"]

R = fuente("LiberationSans-Regular.ttf", 23); B = fuente("LiberationSans-Bold.ttf", 23)
T = fuente("LiberationSans-Bold.ttf", 31); S = fuente("LiberationSans-Regular.ttf", 21)

class Hoja:
    def __init__(self):
        self.W, self.H = 1700, 2200
        self.im = Image.new("RGB", (self.W, self.H), "white"); self.d = ImageDraw.Draw(self.im)
        self.marcas = []   # (texto, tipo, caja)
    def txt(self, x, y, s, f=R, color=(28, 28, 28)):
        self.d.text((x, y), s, font=f, fill=color)
        # Una caja por palabra: así se sabe dónde quedó cada una
        pos = 0
        for w in s.split(" "):
            if w:
                i = s.index(w, pos); x0 = x + self.d.textlength(s[:i], font=f); x1 = x0 + self.d.textlength(w, font=f)
                bb = self.d.textbbox((x, y), s, font=f)
                limpia = w.strip(":,.;()/")
                if limpia in IDENT or w in IDENT:
                    self.marcas.append((limpia if limpia in IDENT else w, "dato", [x0, bb[1], x1, bb[3]]))
                elif limpia in CLINICAS:
                    self.marcas.append((limpia, "clinica", [x0, bb[1], x1, bb[3]]))
                pos = i + len(w)

def encabezado(h):
    h.txt(90, 60, "Ministerio de Salud", S); h.txt(90, 86, "Servicio de Salud Cordillera Norte", S)
    h.txt(90, 112, "Hospital Base Los Robles (Av. Las Acacias 2280, Puente Alto) (Código:119876)", S)
    h.txt(90, 138, "4A - Unidad de Medicina Indiferenciada (UMI) HBLR", S)
    h.txt(90, 164, "Usuario Impresión:   " + P["medico"], S)
    h.txt(1200, 80, "Fecha Impresión:   " + P["f_imp"], S); h.txt(1200, 106, "Hora Impresión:     16:47", S)
    h.txt(1200, 132, "Fecha Creación:     " + P["f_imp"], S)
    h.txt(760, 214, "Epicrisis (EPI-01)", T)
    # Formulario impreso en dos pasadas: los valores quedan algo más abajo que sus rótulos
    h.txt(90, 236, "RUN", S); h.txt(430, 246, ":  " + P["run"], S)
    h.txt(90, 266, "Nombre del Paciente", S); h.txt(430, 276, ":  " + P["nombre"], S)
    h.txt(1010, 262, "N° Registro  :  " + P["registro"], S); h.txt(1340, 236, "N° Ficha Clínica  :", S)

def pagina1():
    h = Hoja(); encabezado(h); y = 316
    filas = [("Fecha Nacimiento - Edad", P["nac"] + " - " + P["edad"], "Sexo", "Hombre"),
             ("Dirección", P["dir"], "Comuna", P["comuna"]),
             ("Previsión", "FONASA Grupo D", "Procedencia", "Servicio de Urgencia"),
             ("Registrado por", P["medico"], "Tipo de Profesional", "Médico"),
             ("Especialidad", "Medicina Interna", "Subespecialidad", "")]
    for a, va, b, vb in filas:
        h.txt(90, y, a, S); h.txt(430, y + 8, ":  " + va, S); h.txt(1010, y, b, S); h.txt(1290, y + 8, ":  " + vb, S); y += 34
    y += 20; h.txt(90, y, "Detalles del Episodio", B); y += 36
    for a, va, b, vb in [("N° Episodio", P["episodio"], "Tipo de Admisión", "Urgencia"), ("Fecha de Ingreso", P["f_ing"], "Fecha de Egreso", P["f_egr"]),
                         ("Destino de Egreso", "Domicilio", "Tipo de Egreso", "Alta Médica"), ("Fecha Alta Médica", P["f_egr"], "N° días Hospitalización", "8 Días")]:
        h.txt(90, y, a, S); h.txt(430, y + 6, ":  " + va, S); h.txt(1010, y, b, S); h.txt(1340, y + 6, ":  " + vb, S); y += 32
    y += 24; h.txt(90, y, "Diagnósticos", B); y += 36
    h.txt(90, y, "Diagnóstico que motivó el Ingreso: NEUMONÍA ADQUIRIDA EN LA COMUNIDAD, NO ESPECIFICADA"); y += 52
    h.txt(90, y, "Evolución:", B); y += 40
    for l in ["EPICRISIS MÉDICA UMI 4A", "Cama 412-2", P["nombre"], "EDAD: 79 AÑOS", "RUT: " + P["run_sin"], "FI SU HBLR " + P["fi1"], "FI UMI HBLR 4A " + P["fi2"]]:
        h.txt(90, y, l); y += 32
    y += 16
    for l in ["ANTECEDENTES:", "AM: DM2 insulinorrequirente, ERC etapa 3a, FA permanente anticoagulada, Insuficiencia cardíaca con FEVI reducida.",
              "Fcos: Insulina NPH, Furosemida, Espironolactona, Carvedilol, Rivaroxabán, Sacubitril/Valsartán.",
              "Social/Funcional: Vive con su esposa en comuna de " + P["comuna"] + ". Independiente para actividades básicas.",
              "", "DIAGNÓSTICOS DE INGRESO", "1. Neumonía adquirida en la comunidad, CURB-65 de 2 puntos.", "2. Insuficiencia cardíaca descompensada."]:
        if l: h.txt(90, y, l)
        y += 32
    h.txt(90, 2080, "1/4", S)
    return h

def pagina2():
    h = Hoja(); encabezado(h); y = 330
    lineas = ["RESUMEN CLÍNICO",
        "Consulta en SAPU el 01/11 por 4 días de tos productiva, fiebre hasta 38.6 °C y disnea progresiva hasta la",
        "ortopnea, con edema de extremidades inferiores. Se inicia Ceftriaxona y Furosemida endovenosa. La radiografía",
        "de tórax muestra condensación basal derecha y signos de congestión pulmonar.",
        "Se decide ingreso de Trecahuel a UMI HBLR para tratamiento.",
        "", "EVOLUCIÓN POR SISTEMAS",
        "RESPIRATORIO: Neumonía con buena respuesta; completa 7 días de Ceftriaxona, sin oxígeno al alta.",
        "CARDIOVASCULAR: Insuficiencia cardíaca descompensada por la infección; balance negativo de 4 litros.",
        "RENAL: Creatinina de ingreso 1.68 mg/dL y de alta 1.31 mg/dL. Hemoglobina estable en 12.4 g/dL.",
        "Hiponatremia leve de 131 mEq/L, corregida con restricción de líquidos.",
        "METABÓLICO: glicemias entre 140 y 220 mg/dL con esquema de insulina.",
        "SOCIAL: la esposa refiere que Trecahuel camina sin ayuda y se maneja solo en su casa.",
        "", "CONDICIÓN ACTUAL",
        "Paciente estable, afebril, sin disnea en reposo; tolera régimen y deambula sin ayuda.",
        "", "EXAMEN FÍSICO",
        "FC 78 lpm, PA 132/76 mmHg, FR 18 rpm, SatO2 95% ambiental, T° 36.8 °C. Crépitos escasos en base derecha.",
        "", "LABORATORIO",
        "10/11: Na 136/K 4.4, Hb 12.4, Hto 37, Leuco 9840, Plq 310 mil, Crea 1.31, BUN 31, PCR 24.6.",
        "03/11: Na 131/K 4.8, Hb 12.9, Leuco 14230, Crea 1.68, PCR 112.5, NT-proBNP 8450 pg/mL."]
    for l in lineas:
        if l: h.txt(90, y, l, B if l.isupper() and len(l) < 40 else R)
        y += 34
    h.txt(90, 2080, "2/4", S)
    return h

def pagina3():
    h = Hoja(); encabezado(h); y = 330
    lineas = ["DIAGNÓSTICOS DE EGRESO", "1. Neumonía adquirida en la comunidad, resuelta.", "2. Insuficiencia cardíaca descompensada, compensada.",
        "3. ERC etapa 3a con deterioro agudo, en recuperación.", "4. Hiponatremia leve corregida.", "", "INDICACIONES Y PLANES",
        "Reposo relativo. Régimen hiposódico, líquidos hasta 1,5 litros al día.", "Control en CESFAM en 7 días con creatinina y electrolitos plasmáticos.",
        "Furosemida 40 mg cada 12 horas por 3 días, luego 40 mg al día.", "Mantener el resto de sus medicamentos habituales.",
        "Consultar en urgencia si presenta fiebre, disnea o sube más de 2 kg en 3 días.", "", "MÉDICO RESPONSABLE",
        "Dr. " + P["medico_corto"] + "/ Médico Internista UMI HBLR.", "Int. " + P["interna"] + "/ Medicina.", "",
        "Especificación del Diagnóstico de Egreso:", "NEUMONÍA BACTERIANA, NO ESPECIFICADA"]
    for l in lineas:
        if l: h.txt(90, y, l, B if (l.isupper() and len(l) < 40) or l.endswith(":") else R)
        y += 34
    h.txt(90, 2080, "3/4", S)
    return h

def pagina4():
    # Hoja de enfermería anexa: sin encabezado del paciente
    h = Hoja(); y = 120
    h.txt(90, 60, "Hospital Base Los Robles - 4A Unidad de Medicina Indiferenciada", S)
    lineas = ["REGISTRO DE ENFERMERÍA (anexo a la epicrisis)", "",
        "Martes 04/11 08:00  Usuario vigil, orientado, Glasgow 15. Febril 38.4 °C, se toman hemocultivos.",
        "04/11 20:00  Disnea leve en decúbito, se administra Paracetamol 1 g EV según indicación.",
        "06/11 09:30  Trecahuel deambula con apoyo hasta el baño, tolera régimen liviano.",
        "08/11 11:00  Se educa a la esposa en control de peso diario y signos de alarma.",
        "10/11 16:00  Se mantienen indicaciones de Quiroga; control de electrolitos mañana.",
        "11/11 10:15  Alta a domicilio en LOS ALERCES, 3187 con su esposa. Retira copia de epicrisis.",
        "", "Observaciones:", "Usuario con buena adherencia, sin caídas durante la hospitalización."]
    for l in lineas:
        if l: h.txt(90, y, l, B if l.isupper() or l.endswith(":") else R)
        y += 36
    h.txt(90, 2080, "4/4", S)
    return h

# --- Fondos ---
def fondo(tipo, OW, OH, rng):
    if tipo == "alfombra":
        base = rng.normal(0, 1, (OH // 2, OW // 2))
        f = ndimage.gaussian_filter(base, (1.6, 0.8)) * 2.4 + ndimage.gaussian_filter(base, 7) * 1.2
        f = np.kron(f, np.ones((2, 2)))[:OH, :OW]; v = np.clip(178 + 30 * f / f.std(), 0, 255)
        return np.stack([v, v * 0.96, v * 0.9], -1)
    if tipo == "madera":
        y, x = np.mgrid[0:OH, 0:OW]
        vetas = np.sin((x * 0.035 + 6 * np.sin(y * 0.004) + rng.normal(0, 0.4, (OH, OW)).cumsum(0) * 0.002) * 3.0)
        v = np.clip(120 + 25 * vetas + 8 * ndimage.gaussian_filter(rng.normal(0, 1, (OH, OW)), 2), 0, 255)
        return np.stack([v * 1.25, v * 0.95, v * 0.7], -1)
    # tela (cuadrillé verde oscuro)
    y, x = np.mgrid[0:OH, 0:OW]
    tram = ((x // 22) % 2) ^ ((y // 22) % 2)
    v = 70 + 18 * tram + 10 * ndimage.gaussian_filter(rng.normal(0, 1, (OH, OW)), 1.2)
    return np.stack([v * 0.7, v * 1.05, v * 0.75], -1)

def fotografiar(h, semilla, tipo_fondo, Pg):
    rng = np.random.default_rng(semilla)
    Wp, Hp = h.W, h.H; OW, OH = 1450, 2576
    Y, X = np.mgrid[0:OH, 0:OW].astype(np.float64)
    th = np.deg2rad(Pg["ang"]); cx, cy = OW / 2, OH / 2
    Xr = (X - cx) * np.cos(th) + (Y - cy) * np.sin(th) + cx
    Yr = -(X - cx) * np.sin(th) + (Y - cy) * np.cos(th) + cy
    ox, oy, esc = Pg["ox"], Pg["oy"], 0.8
    t = (Yr - oy) / (Hp * esc)
    persp = 1 - Pg["persp"] * (1 - np.clip(t, 0, 1))          # en ángulo: arriba se ve más angosta
    s = (Xr - ox - (1 - persp) * Wp * esc / 2) / (Wp * esc * persp)
    curva = Pg["A"] * (np.clip(s, 0, 1) - Pg["c"]) ** 2 * np.clip(1 - t / 0.45, 0, 1) ** 2
    ys = (Yr - oy - curva) / (esc * (1 + 0.06 * (1 - np.clip(t, 0, 1))))
    xs = s * Wp
    pa = np.asarray(h.im, dtype=np.float64)
    dentro = (xs >= 0) & (xs < Wp - 1) & (ys >= 0) & (ys < Hp - 1)
    out = np.empty((OH, OW, 3))
    for c in range(3):
        out[..., c] = ndimage.map_coordinates(pa[..., c], [ys, xs], order=1, cval=255)
    # Luz desigual y la sombra del teléfono sobre una esquina de la hoja
    luz = 0.8 + Pg["luz"] * (X / OW) - 0.06 * (Y / OH)
    sx, sy, sr = Pg["sombra"]
    sombra = 1 - 0.38 * np.exp(-(((X - sx) / sr) ** 2 + ((Y - sy) / (sr * 1.4)) ** 2))
    papel = out * (0.94 * luz * sombra)[..., None]
    bordes = ndimage.gaussian_filter(dentro.astype(float), 16)
    fon = fondo(tipo_fondo, OW, OH, rng) * (1 - 0.35 * bordes[..., None]) * sombra[..., None]
    foto = np.where(dentro[..., None], papel, fon)
    img = Image.fromarray(np.clip(foto, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(Pg["blur"]))
    # Dónde quedó cada palabra marcada (máscara deformada con el mismo mapa) y la hoja, en el lienzo de la app (2000 px)
    masc = Image.new("I", (Wp, Hp), 0); md = ImageDraw.Draw(masc)
    for k, (_, _, b) in enumerate(h.marcas): md.rectangle(b, fill=k + 1)
    ma = np.asarray(masc)
    lab = ma[np.clip(np.round(ys).astype(int), 0, Hp - 1), np.clip(np.round(xs).astype(int), 0, Wp - 1)] * dentro
    k2000 = 2000 / max(OW, OH)
    marcas = []
    for k, (texto, tipo, _) in enumerate(h.marcas):
        yy, xx = np.nonzero(lab == k + 1)
        if not len(xx): continue
        marcas.append({"texto": texto, "tipo": tipo, "x0": round(xx.min() * k2000, 1), "y0": round(yy.min() * k2000, 1),
                       "x1": round(xx.max() * k2000, 1), "y1": round(yy.max() * k2000, 1)})
    # La hoja a 1/10 del lienzo: filas de 0 y 1
    chica = Image.fromarray((dentro * 255).astype(np.uint8)).resize((round(OW * k2000 / 10), round(OH * k2000 / 10)), Image.BILINEAR)
    hoja = ["".join("1" if v > 127 else "0" for v in fila) for fila in np.asarray(chica)]
    return img, marcas, hoja

PAGINAS = [
    (pagina1, 11, "alfombra", dict(ang=-3.0, ox=70, oy=300, persp=0.08, A=140, c=0.62, luz=0.18, blur=0.9, sombra=(1250, 520, 260))),
    (pagina2, 22, "madera", dict(ang=2.5, ox=100, oy=250, persp=0.06, A=90, c=0.35, luz=0.12, blur=1.0, sombra=(250, 2050, 300))),
    (pagina3, 33, "tela", dict(ang=-1.5, ox=60, oy=330, persp=0.1, A=160, c=0.7, luz=0.2, blur=0.8, sombra=(1150, 1500, 240))),
    (pagina4, 44, "alfombra", dict(ang=3.5, ox=95, oy=280, persp=0.07, A=120, c=0.4, luz=0.15, blur=0.9, sombra=(300, 700, 280))),
]
verdad = {"nota": "Epicrisis ficticia: todos los datos son inventados", "paginas": []}
for i, (hacer, semilla, tipo, Pg) in enumerate(PAGINAS):
    h = hacer()
    img, marcas, hoja = fotografiar(h, semilla, tipo, Pg)
    nombre = f"pagina{i + 1}.jpg"
    img.save(os.path.join(SALIDA, nombre), quality=80)
    verdad["paginas"].append({"archivo": nombre, "fondo": tipo, "marcas": marcas, "hoja": hoja})
    print(nombre, tipo, sum(1 for m in marcas if m["tipo"] == "dato"), "datos,", sum(1 for m in marcas if m["tipo"] == "clinica"), "clínicas")
json.dump(verdad, open(os.path.join(SALIDA, "verdad.json"), "w"), ensure_ascii=False, indent=0)
