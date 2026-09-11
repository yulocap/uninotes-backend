const express = require("express");
const router = express.Router();
const multer = require("multer");
const fs = require("fs");
const { generar } = require("../gemini");

const upload = multer({ dest: "uploads/" });

router.post("/transcribir", upload.single("audio"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "Falta el archivo de audio" });
    }

    const base64Audio = fs.readFileSync(req.file.path, { encoding: "base64" });

    const texto = await generar({
      contents: [
        { inlineData: { mimeType: req.file.mimetype || "audio/mp4", data: base64Audio } },
        { text: "Transcribí este audio en español, palabra por palabra, sin resumir ni interpretar. Devolvé solo el texto transcripto." }
      ]
    });

    fs.unlink(req.file.path, () => {});
    res.json({ texto });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "No se pudo transcribir el audio" });
  }
});

module.exports = router;
