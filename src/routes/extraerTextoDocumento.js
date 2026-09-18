// Extrae el texto de un material subido (PDF, imagen, foto de pizarrón) y
// además genera un resumen de estudio y un mapa conceptual a partir de
// ese contenido -igual que ya se hace con las clases grabadas y los
// links de video-, para que el material también aparezca en las
// secciones "Resúmenes" y "Mapas" de la materia.

const express = require("express");
const router = express.Router();
const multer = require("multer");
const fs = require("fs");
const pdfParse = require("pdf-parse");
const { generar } = require("../gemini");

const upload = multer({ dest: "uploads/" });

// Mismo formato que usan las clases y los videos, para que la app pueda
// mostrarlo con los mismos componentes (ResumenTab, MapaConceptualView).
const REGLAS_MAPA = `
Reglas específicas para "mapaConceptual" -actuá como un experto en mapas
conceptuales y especialista pedagógico que ayuda a estudiantes
universitarios a estudiar-:
- Jerarquía clara: nivel 0 es UN SOLO concepto raíz (el tema general).
  Nivel 1 son los conceptos principales que se desprenden de la raíz.
  Nivel 2 son sub-conceptos o detalles de esos. Nivel 3 (si hace falta)
  son ejemplos o casos particulares.
- Cada "texto" de nodo tiene que ser MUY breve: 2 a 5 palabras, una frase
  nominal (nunca una oración completa ni un párrafo).
- Cada relación necesita una "etiqueta" con una frase de enlace corta (2
  a 4 palabras, en minúscula, ej: "se calcula con", "es un tipo de",
  "depende de", "incluye a", "se relaciona con") que conecte los dos
  conceptos como si formaran una oración: [nodo A] --etiqueta--> [nodo B].
- Apuntá a un mapa completo pero legible: entre 8 y 16 nodos en total.
- Todo nodo tiene que estar conectado a al menos otro (no dejes nodos
  sueltos), y evitá relaciones redundantes o duplicadas.
`;

// Usado cuando NO hay texto extraído localmente (imagen, o PDF escaneado
// sin texto real): un solo pedido a Gemini que hace OCR + resumen + mapa
// juntos, para no gastar dos pedidos de cuota por el mismo archivo.
const PROMPT_DESDE_ARCHIVO = `
Extraé todo el texto legible de esta imagen o documento (apuntes,
pizarrón o página) y además generá un resumen de estudio y un mapa
conceptual a partir de ese contenido. Es material que un estudiante
subió para una materia universitaria. Basate ÚNICAMENTE en lo que
aparece en el archivo, nunca inventes contenido — si hay partes
ilegibles, escribí "[ilegible]" en el texto en vez de inventar. Devolvé
SOLO un JSON (sin texto adicional, sin \`\`\`) con esta forma exacta:

{
  "texto": "string - todo el texto legible, manteniendo la estructura cuando se pueda (títulos, listas, fórmulas)",
  "resumen": {
    "conceptoPrincipal": "string",
    "conceptosImportantes": ["string", ...],
    "ejemplos": ["string", ...],
    "puntosDelProfesor": ["string", ...],
    "posibleExamen": ["string", ...]
  },
  "mapaConceptual": {
    "nodos": [{"id": "string", "texto": "string", "nivel": 0}],
    "relaciones": [{"desde": "id", "hasta": "id", "etiqueta": "string"}]
  }
}
${REGLAS_MAPA}
`;

// Usado cuando el texto YA se extrajo localmente (PDF con texto real):
// acá solo pedimos el resumen y el mapa, sin reenviar el archivo.
function promptDesdeTexto(texto) {
  return `
Este es el texto ya extraído de un material de estudio (apuntes,
diapositivas o similar) que un estudiante subió para una materia
universitaria. Generá un resumen de estudio y un mapa conceptual a
partir de él. Basate ÚNICAMENTE en este contenido, nunca inventes
información. Devolvé SOLO un JSON (sin texto adicional, sin \`\`\`) con
esta forma exacta:

{
  "resumen": {
    "conceptoPrincipal": "string",
    "conceptosImportantes": ["string", ...],
    "ejemplos": ["string", ...],
    "puntosDelProfesor": ["string", ...],
    "posibleExamen": ["string", ...]
  },
  "mapaConceptual": {
    "nodos": [{"id": "string", "texto": "string", "nivel": 0}],
    "relaciones": [{"desde": "id", "hasta": "id", "etiqueta": "string"}]
  }
}
${REGLAS_MAPA}

Texto del material:
"""
${texto.slice(0, 30000)}
"""
`;
}

function parsearJson(respuesta) {
  try {
    return JSON.parse(respuesta.replace(/```json|```/g, "").trim());
  } catch (err) {
    console.warn("La respuesta de Gemini no vino en JSON válido:", err.message);
    return null;
  }
}

router.post("/extraer-texto", upload.single("archivo"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Falta el archivo" });

    const buffer = fs.readFileSync(req.file.path);
    let texto = null;
    let resumenJson = null;
    let mapaConceptualJson = null;

    // Si es un PDF con texto real adentro (la gran mayoría de apuntes y
    // diapositivas exportados, no escaneados), lo extraemos acá mismo:
    // es instantáneo, no gasta cuota de Gemini, y evita depender de que
    // Gemini sepa "leer" ese PDF puntual como imagen — a veces rechaza
    // PDFs válidos con un error genérico sin razón clara.
    if (req.file.mimetype === "application/pdf") {
      try {
        const resultado = await pdfParse(buffer);
        if (resultado.text && resultado.text.trim().length > 30) {
          texto = resultado.text.trim();
        }
      } catch (err) {
        console.warn("No se pudo leer el PDF localmente, se lo mandamos a Gemini:", err.message);
      }
    }

    if (texto !== null) {
      // Ya tenemos el texto: un solo pedido más, nada más que para el
      // resumen y el mapa (no hace falta reenviar el archivo).
      const respuesta = await generar({ contents: [{ text: promptDesdeTexto(texto) }] });
      const analisis = parsearJson(respuesta);
      resumenJson = analisis?.resumen ? JSON.stringify(analisis.resumen) : null;
      mapaConceptualJson = analisis?.mapaConceptual ? JSON.stringify(analisis.mapaConceptual) : null;
    } else {
      // No hay texto local (imagen, o PDF escaneado): un solo pedido a
      // Gemini que hace todo junto (OCR + resumen + mapa).
      const base64 = buffer.toString("base64");
      const respuesta = await generar({
        contents: [
          { inlineData: { mimeType: req.file.mimetype, data: base64 } },
          { text: PROMPT_DESDE_ARCHIVO }
        ]
      });
      const analisis = parsearJson(respuesta);
      texto = analisis?.texto || "[No se pudo procesar el archivo]";
      resumenJson = analisis?.resumen ? JSON.stringify(analisis.resumen) : null;
      mapaConceptualJson = analisis?.mapaConceptual ? JSON.stringify(analisis.mapaConceptual) : null;
    }

    fs.unlink(req.file.path, () => {});
    res.json({ texto, resumenJson, mapaConceptualJson });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "No se pudo extraer el texto del documento" });
  }
});

module.exports = router;
