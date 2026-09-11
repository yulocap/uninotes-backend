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
    "relaciones": [{"desde": "id", "hasta": "id"}]
  },
  "conceptosClave": ["string", ...],
  "posiblesPreguntas": ["string", ...]
}

Reglas importantes:
- Basate ÚNICAMENTE en lo que aparece en la transcripción.
- Nunca inventes contenido que no esté mencionado.
- Si algo no queda claro, no lo incluyas en vez de adivinar.
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
