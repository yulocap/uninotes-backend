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
    "relaciones": [{"desde": "id", "hasta": "id"}]
  }
}

Reglas importantes:
- Basate ÚNICAMENTE en lo que se ve/escucha en el video, nunca inventes contenido.
- Si por algún motivo no podés acceder al contenido del video, devolvé igual
  el JSON pero con "texto": "[No se pudo procesar el video]" y el resto de
  los campos vacíos.
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
