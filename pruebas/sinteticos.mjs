// Exámenes SINTÉTICOS para las pruebas: todos los nombres, RUT, fechas, folios, direcciones y teléfonos son
// inventados. Los RUT llevan dígito verificador válido (módulo 11) para que se prueben como uno real.
//
// Cada documento trae lo que debe quedar oculto (identificadores), lo clínico que debe llegar intacto, la fecha de
// nacimiento (con su rótulo y la edad que corresponde a la fecha del documento) y las fechas clínicas (toma, informe,
// alta…), que deben llegar a la vista.

// Dígito verificador de un RUT (módulo 11)
export function dvRut(cuerpo){
  let s = 0, m = 2;
  for (const c of String(cuerpo).replace(/\D/g, "").split("").reverse()){ s += +c * m; m = m === 7 ? 2 : m + 1; }
  const r = 11 - (s % 11);
  return r === 11 ? "0" : r === 10 ? "K" : String(r);
}

export const HEMOGRAMA = {
  nombre: "hemograma",
  texto: `LABORATORIO CLÍNICO CENTRAL
Paciente: ROJAS MUÑOZ, CARMEN GLORIA
RUT: 9.876.543-3
Fecha de Nacimiento: 14/07/1958          Edad: 66 años
Sexo: Femenino          Procedencia: CESFAM
N° de Orden: 20250314557
Fecha de toma de muestra: 12/03/2025 08:15
Fecha de validación: 12/03/2025 14:40

HEMOGRAMA
Hemoglobina          12,8     g/dL       (12,0 - 16,0)
Hematocrito          38,9     %          (36 - 46)
VCM                  88,2     fL         (80 - 100)
Leucocitos           6.800    /mm3       (4.500 - 11.000)
Neutrófilos          4.080    /mm3
Linfocitos           1.950    /mm3
Plaquetas            245.000  /mm3       (150.000 - 450.000)
VHS                  22       mm/h

Validado por: TM Paula Fuentes Araya`,
  identificadores: ["ROJAS", "CARMEN GLORIA", "9.876.543-3", "20250314557", "Paula", "Fuentes Araya"],
  clinicos: ["Hemoglobina          12,8     g/dL", "38,9", "VCM                  88,2", "6.800    /mm3", "4.080", "1.950",
    "245.000  /mm3", "(150.000 - 450.000)", "VHS                  22       mm/h", "Edad: 66 años", "Sexo: Femenino"],
  nacimiento: {texto: "14/07/1958", rotulo: "Fecha de Nacimiento: 14/07/1958", edad: 66},
  clinicas: ["12/03/2025 08:15", "12/03/2025 14:40"]
};

export const BIOQUIMICO = {
  nombre: "perfil bioquímico",
  texto: `Laboratorio Red Salud Norte
Nombre del Paciente: Héctor Andrés Valenzuela Tapia
RUN: 11.223.344-K        F. Nac: 03-11-62
Médico solicitante: Dra. Ximena Cáceres
Fecha de recepción: 02/06/2025      Fecha de emisión: 03/06/2025
Teléfono: +56 9 6123 4567
PERFIL BIOQUÍMICO
Glucosa                 112 mg/dL      (70 - 100)
Creatinina              1,34 mg/dL     (0,7 - 1,3)
BUN                     21 mg/dL
Ácido úrico             7,1 mg/dL
Colesterol total        214 mg/dL
HDL                     38 mg/dL
LDL                     139 mg/dL
Triglicéridos           186 mg/dL
GOT                     28 U/L
GPT                     34 U/L
Sodio                   139 mEq/L
Potasio                 4,6 mEq/L
Cloro                   102 mEq/L
HbA1c                   6,9 %
TSH                     2,1 uUI/mL`,
  identificadores: ["Héctor", "Valenzuela", "Tapia", "11.223.344-K", "Ximena", "Cáceres", "6123 4567"],
  clinicos: ["Glucosa                 112 mg/dL", "1,34 mg/dL", "(0,7 - 1,3)", "BUN                     21 mg/dL",
    "Ácido úrico             7,1 mg/dL", "214 mg/dL", "HDL                     38 mg/dL", "139 mg/dL", "186 mg/dL",
    "GOT                     28 U/L", "4,6 mEq/L", "102 mEq/L", "6,9 %", "2,1 uUI/mL"],
  nacimiento: {texto: "03-11-62", rotulo: "F. Nac: 03-11-62", edad: 62},
  clinicas: ["02/06/2025", "03/06/2025"]
};

export const ORINA = {
  nombre: "orina completa",
  texto: `ORINA COMPLETA
Paciente: Sra. Rosa Elena Contreras Pino
RUT 7654321-6
Fecha nacimiento: 21 de agosto de 1949
Ficha clínica: 4471208
Fecha de toma de muestra: 28 de abril de 2025
EXAMEN FÍSICO-QUÍMICO
Color: amarillo        Aspecto: turbio
Densidad: 1.020        pH: 6,0
Proteínas: negativo    Glucosa: negativo
Nitritos: positivo     Leucocitos: 2+
SEDIMENTO
Leucocitos: 10-15 x campo
Hematíes: 0-2 x campo
Bacterias: abundantes
Cristales: no se observan
Urocultivo: >100.000 UFC/ml E. coli`,
  identificadores: ["Rosa Elena", "Contreras Pino", "7654321-6", "4471208"],
  clinicos: ["Densidad: 1.020", "pH: 6,0", "Nitritos: positivo", "10-15 x campo", "0-2 x campo", "Bacterias: abundantes",
    ">100.000 UFC/ml E. coli", "Leucocitos: 2+"],
  nacimiento: {texto: "21 de agosto de 1949", rotulo: "Fecha nacimiento: 21 de agosto de 1949", edad: 75},
  clinicas: ["28 de abril de 2025"]
};

export const PSA = {
  nombre: "PSA",
  texto: `ANTÍGENO PROSTÁTICO ESPECÍFICO
Paciente: GONZÁLEZ SEPÚLVEDA, LUIS ALBERTO     RUT: 6.789.012-4
F.N.: 30/01/1950          Edad: 75 años
Episodio: 88123456
Fecha de muestra: 10/02/2025 09:30     Fecha de informe: 11/02/2025
APE total            6,4 ng/ml     (0,0 - 4,0)
APE libre            0,9 ng/ml
Índice APE libre/total   14 %
Resultados anteriores:
10/09/2024           4,8 ng/ml
15/03/2024           3,9 ng/ml
Correo de contacto: lgonzalez.ficticio@correo.cl`,
  identificadores: ["GONZÁLEZ", "LUIS ALBERTO", "6.789.012-4", "88123456", "lgonzalez.ficticio@correo.cl"],
  clinicos: ["APE total            6,4 ng/ml", "(0,0 - 4,0)", "APE libre            0,9 ng/ml", "14 %", "4,8 ng/ml", "3,9 ng/ml", "Edad: 75 años"],
  nacimiento: {texto: "30/01/1950", rotulo: "F.N.: 30/01/1950", edad: 75},
  clinicas: ["10/02/2025 09:30", "11/02/2025", "10/09/2024", "15/03/2024"]
};

export const IMAGEN = {
  nombre: "informe de imagen",
  texto: `CENTRO DE IMÁGENES
ECOTOMOGRAFÍA RENAL Y VESICAL
Nombre: Patricio Ignacio Saavedra Lagos
RUN: 15.432.198-5
Fecha de nacimiento: 09/09/1985
N° de examen: 7710045
Fecha del examen: 05 de mayo de 2025
Médico solicitante: Dr. Rodrigo Bustamante
HALLAZGOS:
Riñón derecho de 10,8 cm, de ecogenicidad conservada, sin dilatación de la vía urinaria.
Riñón izquierdo de 11,2 cm con imagen ecogénica de 6 mm con sombra acústica en el grupo calicial inferior.
Vejiga de paredes regulares. Próstata de 48 cc. Residuo postmiccional 85 ml.
IMPRESIÓN DIAGNÓSTICA:
Litiasis renal izquierda no obstructiva de 6 mm.
Crecimiento prostático (48 cc).
Dra. Mónica Herrera Vidal
Médico Radiólogo`,
  identificadores: ["Patricio Ignacio", "Saavedra Lagos", "15.432.198-5", "7710045", "Rodrigo", "Bustamante", "Mónica", "Herrera Vidal"],
  clinicos: ["10,8 cm", "11,2 cm", "6 mm", "Próstata de 48 cc", "Residuo postmiccional 85 ml", "Litiasis renal izquierda no obstructiva de 6 mm",
    "ECOTOMOGRAFÍA RENAL Y VESICAL"],
  nacimiento: {texto: "09/09/1985", rotulo: "Fecha de nacimiento: 09/09/1985", edad: 39},
  clinicas: ["05 de mayo de 2025"]
};

export const EPICRISIS = {
  nombre: "epicrisis",
  texto: `HOSPITAL REGIONAL
EPICRISIS
Nombre: Juan Carlos Muñoz Riquelme
RUN: 13.579.246-2      Fecha de nacimiento: 17/05/1956
Ficha clínica: 3302291
Domicilio: Pasaje Los Alerces 3187, La Florida
Teléfono: +56 9 8765 4321
Fecha de ingreso: 03/03/2025      Fecha de alta: 09/03/2025
Servicio: Urología
Diagnóstico de ingreso: retención urinaria aguda e ITU febril.
Antecedentes: HTA, DM2. Hiperplasia prostática benigna.
Evolución: Ingresa con globo vesical, se instala sonda Foley con salida de 900 ml. Hemocultivos negativos.
Urocultivo: E. coli multisensible. Tratado con ceftriaxona 1 g EV c/24 h por 5 días.
Crea ingreso 1,8 mg/dL, al alta 1,1 mg/dL.
Cirugía: RTU de próstata el 06/03/2025, sin incidentes. Biopsia pendiente.
Indicaciones al alta: tamsulosina 0,4 mg VO 0-0-1. Retiro de sonda en domicilio.
Control en policlínico de urología el 20/03/2025.
Médico tratante: Dra. Carolina Pizarro Olivares`,
  identificadores: ["Juan Carlos", "Muñoz Riquelme", "13.579.246-2", "3302291", "Los Alerces 3187", "8765 4321", "Carolina", "Pizarro Olivares"],
  clinicos: ["900 ml", "ceftriaxona 1 g EV c/24 h por 5 días", "Crea ingreso 1,8 mg/dL", "al alta 1,1 mg/dL", "RTU de próstata",
    "tamsulosina 0,4 mg VO 0-0-1", "HTA, DM2", "Servicio: Urología", "E. coli multisensible"],
  nacimiento: {texto: "17/05/1956", rotulo: "Fecha de nacimiento: 17/05/1956", edad: 68},
  clinicas: ["03/03/2025", "09/03/2025", "06/03/2025", "20/03/2025"]
};

export const DOCUMENTOS = [HEMOGRAMA, BIOQUIMICO, ORINA, PSA, IMAGEN, EPICRISIS];
