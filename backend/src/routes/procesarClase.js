const express = require("express");
const router = express.Router();
const { generar } = require("../gemini");

const PROMPT_ANALISIS = `
Sos un asistente que analiza la transcripción de una clase universitaria.
Devolvé SOLO un JSON (sin texto adicional, sin \`\`\`) con esta forma exacta:

{
  "titulo": "string corto y representativo del tema principal",
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
  },
  "conceptosClave": ["string", ...],
  "posiblesPreguntas": ["string", ...]
}

Reglas importantes:
- Basate ÚNICAMENTE en lo que aparece en la transcripción.
- Nunca inventes contenido que no esté mencionado.
- Si algo no queda claro, no lo incluyas en vez de adivinar.

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

router.post("/procesar", async (req, res) => {
  try {
    const { transcripcion } = req.body;
    if (!transcripcion) {
      return res.status(400).json({ error: "Falta la transcripción" });
    }

    const textoRespuesta = await generar({
      contents: transcripcion,
      systemInstruction: PROMPT_ANALISIS
    });

    const analisisCrudo = JSON.parse(textoRespuesta.replace(/```json|```/g, "").trim());

    const analisis = {
      titulo: analisisCrudo.titulo,
      resumenJson: JSON.stringify(analisisCrudo.resumen),
      mapaConceptualJson: JSON.stringify(analisisCrudo.mapaConceptual),
      conceptosClaveJson: JSON.stringify(analisisCrudo.conceptosClave),
      posiblesPreguntasJson: JSON.stringify(analisisCrudo.posiblesPreguntas)
    };

    res.json({ analisis });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "No se pudo procesar la clase" });
  }
});

module.exports = router;
