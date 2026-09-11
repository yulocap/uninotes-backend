const express = require("express");
const router = express.Router();
const multer = require("multer");
const fs = require("fs");
const { generar } = require("../gemini");

const upload = multer({ dest: "uploads/" });

const PROMPT = `
Extraé todo el texto legible de esta imagen o documento (apuntes, pizarrón
o página). Mantené la estructura cuando sea posible (títulos, listas,
fórmulas). Si hay partes ilegibles, escribí "[ilegible]" en vez de
inventar contenido. No agregues comentarios tuyos, devolvé solo el texto
extraído.
`;

router.post("/extraer-texto", upload.single("archivo"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Falta el archivo" });

    const base64 = fs.readFileSync(req.file.path, { encoding: "base64" });

    const texto = await generar({
      contents: [
        { inlineData: { mimeType: req.file.mimetype, data: base64 } },
        { text: PROMPT }
      ]
    });

    fs.unlink(req.file.path, () => {});
    res.json({ texto });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "No se pudo extraer el texto del documento" });
  }
});

module.exports = router;
