// Transcripción de audios largos (hasta varias horas), en segundo plano.
//
// Flujo:
//   1. POST /transcribir  -> sube el audio, responde ENSEGUIDA con un jobId
//      (no espera a que termine de transcribir)
//   2. GET /transcribir/estado/:jobId -> la app pregunta cada tanto si ya
//      terminó, hasta recibir { estado: "listo", texto: "..." }
//
// Esto evita que la conexión se corte por timeouts de plataforma (Render,
// y en general casi cualquier proxy) cuando el audio es muy largo.

const express = require("express");
const router = express.Router();
const multer = require("multer");
const fs = require("fs");
const { subirArchivo, generarConArchivo } = require("../gemini");
const jobStore = require("../jobStore");

const upload = multer({ dest: "uploads/" });

router.post("/transcribir", upload.single("audio"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "Falta el archivo de audio" });
  }

  const jobId = jobStore.crear();
  res.status(202).json({ jobId }); // responde ya, no espera la transcripción

  // Procesamiento real, en segundo plano (no bloquea la respuesta de arriba)
  (async () => {
    try {
      const archivo = await subirArchivo(req.file.path, req.file.mimetype || "audio/mp4");
      const texto = await generarConArchivo({
        archivo,
        prompt: "Transcribí este audio en español, palabra por palabra, sin resumir ni interpretar. Devolvé solo el texto transcripto."
      });
      jobStore.actualizar(jobId, { estado: "listo", texto });
    } catch (err) {
      console.error("Error transcribiendo en segundo plano:", err);
      jobStore.actualizar(jobId, { estado: "error", error: err.message || "Error desconocido" });
    } finally {
      fs.unlink(req.file.path, () => {});
    }
  })();
});

router.get("/transcribir/estado/:jobId", (req, res) => {
  const job = jobStore.obtener(req.params.jobId);
  if (!job) return res.status(404).json({ error: "Trabajo no encontrado" });
  res.json(job);
});

module.exports = router;
