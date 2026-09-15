const express = require("express");
const router = express.Router();
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const ffmpeg = require("fluent-ffmpeg");

// @ffmpeg-installer/ffmpeg trae el binario de FFmpeg empaquetado (funciona
// en Windows/Mac local Y en Render) — así no dependemos de que FFmpeg esté
// instalado a mano en el sistema donde corra este backend.
const ffmpegPath = require("@ffmpeg-installer/ffmpeg").path;
ffmpeg.setFfmpegPath(ffmpegPath);

const { generar, subirArchivo, borrarArchivo } = require("../gemini");

// ---------- Configuración ----------
const DIR_SUBIDAS = path.join(__dirname, "..", "..", "uploads");
const DIR_FRAGMENTOS = path.join(__dirname, "..", "..", "chunks");
const DURACION_FRAGMENTO_SEGUNDOS = 600; // 10 minutos por fragmento
const ESPERA_ENTRE_LLAMADAS_MS = 4500; // ~13 req/min, debajo del límite gratuito de 15 RPM

for (const dir of [DIR_SUBIDAS, DIR_FRAGMENTOS]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

const upload = multer({ dest: DIR_SUBIDAS });

function esperar(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Divide el audio original en fragmentos de DURACION_FRAGMENTO_SEGUNDOS
// usando el muxer "segment" de FFmpeg. "-c copy" NO re-codifica el audio:
// solo lo corta, así que es rápido y no pierde calidad. Si el audio dura
// menos que un fragmento, simplemente genera un solo archivo.
function dividirAudio(rutaOriginal, carpetaDestino) {
  return new Promise((resolve, reject) => {
    const patronSalida = path.join(carpetaDestino, "fragmento_%03d.m4a");
    ffmpeg(rutaOriginal)
      .outputOptions([
        "-f segment",
        `-segment_time ${DURACION_FRAGMENTO_SEGUNDOS}`,
        "-c copy",
        "-reset_timestamps 1"
      ])
      .output(patronSalida)
      .on("end", () => resolve())
      .on("error", (err) => reject(err))
      .run();
  });
}

router.post("/transcribir", upload.single("audio"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "Falta el archivo de audio" });
  }

  const rutaOriginal = req.file.path;
  const carpetaFragmentos = path.join(DIR_FRAGMENTOS, `${req.file.filename}-frag`);
  fs.mkdirSync(carpetaFragmentos, { recursive: true });

  // Guardamos acá los "name" de los archivos que vamos subiendo a Gemini,
  // para poder borrarlos en el finally aunque algo falle a mitad de camino.
  const archivosGeminiPendientes = new Set();

  try {
    // 1) Dividir el audio grande en fragmentos de 10 minutos
    await dividirAudio(rutaOriginal, carpetaFragmentos);

    const nombresFragmentos = fs
      .readdirSync(carpetaFragmentos)
      .filter((nombre) => nombre.startsWith("fragmento_"))
      .sort(); // fragmento_000, fragmento_001... quedan en orden cronológico

    if (nombresFragmentos.length === 0) {
      throw new Error("FFmpeg no generó ningún fragmento de audio");
    }

    // 2) Transcribir cada fragmento con Gemini, uno por uno, respetando
    //    el límite gratuito de 15 solicitudes por minuto
    const textosFragmentos = [];

    for (let i = 0; i < nombresFragmentos.length; i++) {
      const rutaFragmento = path.join(carpetaFragmentos, nombresFragmentos[i]);

      // Subimos el fragmento con la File API (evita el límite de tamaño
      // del envío "inline" en base64, útil para fragmentos largos)
      const archivoSubido = await subirArchivo(rutaFragmento, "audio/mp4");
      archivosGeminiPendientes.add(archivoSubido.name);

      const textoFragmento = await generar({
        contents: [
          { fileData: { fileUri: archivoSubido.uri, mimeType: archivoSubido.mimeType } },
          {
            text:
              "Transcribí este audio en español, palabra por palabra, sin resumir " +
              "ni interpretar. Es un fragmento de una clase más larga: si empieza o " +
              "termina a mitad de una frase, transcribilo tal cual igual. Devolvé " +
              "solo el texto transcripto."
          }
        ]
      });

      textosFragmentos.push(textoFragmento.trim());

      // Borramos el archivo de Gemini apenas terminamos de usarlo
      await borrarArchivo(archivoSubido.name);
      archivosGeminiPendientes.delete(archivoSubido.name);

      // Esperamos antes de la próxima llamada para no pasarnos del RPM
      // gratuito (no hace falta esperar después del último fragmento)
      if (i < nombresFragmentos.length - 1) {
        await esperar(ESPERA_ENTRE_LLAMADAS_MS);
      }
    }

    // 3) Concatenar los textos de todos los fragmentos en un solo texto.
    //    El resumen/mapa conceptual/temas clave los genera por separado
    //    /api/clase/procesar (así queda igual que hoy: Android transcribe
    //    y después llama a "procesar" con este texto completo).
    const textoCompleto = textosFragmentos.join("\n\n");

    res.json({ texto: textoCompleto });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "No se pudo transcribir el audio" });
  } finally {
    // 4) Limpieza: borramos el audio original, la carpeta de fragmentos
    //    temporales, y cualquier archivo que haya quedado subido a
    //    Gemini si el proceso falló a mitad de camino.
    fs.unlink(rutaOriginal, () => {});
    fs.rm(carpetaFragmentos, { recursive: true, force: true }, () => {});
    for (const nombre of archivosGeminiPendientes) {
      borrarArchivo(nombre);
    }
  }
});

module.exports = router;
