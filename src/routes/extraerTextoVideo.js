// Procesa un link de video (pensado sobre todo para YouTube) subido como
// material de una materia: le pasamos la URL directamente a Gemini (que
// puede "ver" videos de YouTube por URL) y le pedimos un resumen de
// estudio, para usarlo como conocimiento igual que el texto extraído de
// un documento.

const express = require("express");
const router = express.Router();
const { generar } = require("../gemini");

const PROMPT = `
Mirá este video -es material de estudio que un estudiante subió para una
materia universitaria- y generá un resumen detallado de todo lo que se
explica: temas cubiertos, conceptos clave, ejemplos y cualquier dato
relevante para estudiar. Redactalo en texto plano, bien organizado por
temas, como si fueran apuntes de estudio.

No inventes contenido que no esté en el video. Si por algún motivo no
podés acceder al contenido del video, respondé únicamente con:
"[No se pudo procesar el video]".
`;

router.post("/extraer-texto-video", async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: "Falta la URL del video" });

    const texto = await generar({
      contents: [
        { fileData: { fileUri: url, mimeType: "video/mp4" } },
        { text: PROMPT }
      ]
    });

    res.json({ texto });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "No se pudo procesar el link del video" });
  }
});

module.exports = router;
