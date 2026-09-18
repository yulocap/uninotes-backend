const express = require("express");
const router = express.Router();
const multer = require("multer");
const fs = require("fs");
const pdfParse = require("pdf-parse");
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

    const buffer = fs.readFileSync(req.file.path);
    let texto = null;

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

    // Si no hay texto (es una imagen, o un PDF escaneado sin texto real),
    // ahí sí lo mandamos a Gemini para que lo lea con OCR.
    if (texto === null) {
      const base64 = buffer.toString("base64");
      texto = await generar({
        contents: [
          { inlineData: { mimeType: req.file.mimetype, data: base64 } },
          { text: PROMPT }
        ]
      });
    }

    fs.unlink(req.file.path, () => {});
    res.json({ texto });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "No se pudo extraer el texto del documento" });
  }
});

module.exports = router;
