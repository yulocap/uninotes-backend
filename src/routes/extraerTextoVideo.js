// Procesa un link de video (pensado sobre todo para YouTube) subido como
// material de una materia: le pasamos la URL directamente a Gemini (que
// puede "ver" videos de YouTube por URL) y le pedimos, en un solo pedido,
// un texto de estudio + un resumen estructurado + un mapa conceptual -en
// el mismo formato que se usa para las clases grabadas-, para que la app
// pueda mostrarlo en las secciones "Resúmenes" y "Mapas" igual que una clase.

const express = require("express");
const router = express.Router();
const { generar } = require("../gemini");

const PROMPT = `
Mirá este video -es material de estudio que un estudiante subió para una
materia universitaria- y devolvé SOLO un JSON (sin texto adicional, sin
\`\`\`) con esta forma exacta:

{
  "texto": "string - apuntes de estudio en texto plano, bien organizados por temas, con todo el contenido relevante del video",
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

Reglas importantes:
- Basate ÚNICAMENTE en lo que se ve/escucha en el video, nunca inventes contenido.
- Si por algún motivo no podés acceder al contenido del video, devolvé igual
  el JSON pero con "texto": "[No se pudo procesar el video]" y el resto de
  los campos vacíos.

Reglas específicas para "mapaConceptual" -actuá acá como un experto en
mapas conceptuales y especialista pedagógico que ayuda a estudiantes
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

router.post("/extraer-texto-video", async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: "Falta la URL del video" });

    const textoRespuesta = await generar({
      contents: [
        { fileData: { fileUri: url, mimeType: "video/mp4" } },
        { text: PROMPT }
      ]
    });

    const analisis = JSON.parse(textoRespuesta.replace(/```json|```/g, "").trim());

    res.json({
      texto: analisis.texto || "[No se pudo procesar el video]",
      resumenJson: analisis.resumen ? JSON.stringify(analisis.resumen) : null,
      mapaConceptualJson: analisis.mapaConceptual ? JSON.stringify(analisis.mapaConceptual) : null
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "No se pudo procesar el link del video" });
  }
});

module.exports = router;
