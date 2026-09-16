const express = require("express");
const router = express.Router();
const multer = require("multer");
const fs = require("fs");
const path = require("path");

const { generar, subirArchivo, borrarArchivo } = require("../gemini");

const DIR_SUBIDAS = path.join(__dirname, "..", "..", "uploads");
if (!fs.existsSync(DIR_SUBIDAS)) fs.mkdirSync(DIR_SUBIDAS, { recursive: true });

const upload = multer({ dest: DIR_SUBIDAS });

// Recibe el audio de una clase (hasta ~2hs, una sola llamada — Gemini
// soporta audio largo en un solo request, así que no hace falta cortarlo).
// Sube el archivo a Gemini con la File API, pide la transcripción, borra
// el archivo de Gemini y el archivo temporal de Node, y devuelve el texto.
router.post("/transcribir-chunk", upload.single("audio"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "Falta el archivo de audio" });
  }

  const tamañoMB = (req.file.size / (1024 * 1024)).toFixed(1);
  console.log(`[transcribir-chunk] recibido "${req.file.originalname}" — ${tamañoMB} MB`);

  const rutaLocal = req.file.path;
  let archivoGemini = null;

  try {
    archivoGemini = await subirArchivo(rutaLocal, req.file.mimetype || "audio/mp4");

    const texto = await generar({
      contents: [
        { fileData: { fileUri: archivoGemini.uri, mimeType: archivoGemini.mimeType } },
        {
          text:
            "Transcribí este audio en español, palabra por palabra, sin resumir " +
            "ni interpretar. Devolvé solo el texto transcripto."
        }
      ]
    });

    res.json({ texto: texto.trim() });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "No se pudo transcribir el fragmento de audio" });
  } finally {
    // Limpieza: borramos el archivo temporal de Node y el que quedó
    // subido a Gemini, pase lo que pase.
    fs.unlink(rutaLocal, () => {});
    if (archivoGemini) borrarArchivo(archivoGemini.name);
  }
});

module.exports = router;
