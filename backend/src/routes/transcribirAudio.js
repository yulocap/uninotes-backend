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
        "-threads 1",          // <-- NUEVO: Obliga a usar solo 1 hilo para no saturar la RAM de Render
        "-map 0:a",            // <-- NUEVO: Agarra estrictamente el audio, ignorando basuras o metadatos pesados
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
    // Si falla rápido, contestamos normal
    return res.status(400).json({ error: "Falta el archivo de audio" });
  }

  // --- EL TRUCO PARA RENDER ---
  // Avisamos que vamos a mandar un JSON y abrimos la primer llave
  res.setHeader("Content-Type", "application/json");
  res.write("{");

  // Mandamos un "latido" (espacio en blanco) cada 30 segundos.
  // Los espacios no rompen el JSON y engañan a Render para que no corte.
  const latido = setInterval(() => {
    res.write(" "); 
  }, 30000);
  // -----------------------------

  const rutaOriginal = req.file.path;
  const carpetaFragmentos = path.join(DIR_FRAGMENTOS, `${req.file.filename}-frag`);
  fs.mkdirSync(carpetaFragmentos, { recursive: true });
  const archivosGeminiPendientes = new Set();

  try {
    // 1) Dividir el audio
    await dividirAudio(rutaOriginal, carpetaFragmentos);

    const nombresFragmentos = fs
      .readdirSync(carpetaFragmentos)
      .filter((nombre) => nombre.startsWith("fragmento_"))
      .sort(); 

    if (nombresFragmentos.length === 0) {
      throw new Error("FFmpeg no generó ningún fragmento");
    }

    // 2) Transcribir cada fragmento respetando el límite
    const textosFragmentos = [];

    for (let i = 0; i < nombresFragmentos.length; i++) {
      const rutaFragmento = path.join(carpetaFragmentos, nombresFragmentos[i]);
      const archivoSubido = await subirArchivo(rutaFragmento, "audio/mp4");
      archivosGeminiPendientes.add(archivoSubido.name);

      const textoFragmento = await generar({
        contents: [
          { fileData: { fileUri: archivoSubido.uri, mimeType: archivoSubido.mimeType } },
          {
            text:
              "Transcribí este audio en español, palabra por palabra, sin resumir. " +
              "Es un fragmento de una clase: si empieza o termina a mitad de una frase, " +
              "transcribilo igual. Devolvé solo el texto transcripto."
          }
        ]
      });

      textosFragmentos.push(textoFragmento.trim());

      await borrarArchivo(archivoSubido.name);
      archivosGeminiPendientes.delete(archivoSubido.name);

      if (i < nombresFragmentos.length - 1) {
        await esperar(ESPERA_ENTRE_LLAMADAS_MS);
      }
    }

    // 3) Juntamos todo el texto
    const textoCompleto = textosFragmentos.join("\n\n");

    // Frenamos el latido y cerramos el JSON correctamente para Android
    clearInterval(latido);
    res.write(`"texto": ${JSON.stringify(textoCompleto)}}`);
    res.end(); // Terminamos la respuesta

  } catch (err) {
    console.error("Error en transcripción:", err);
    clearInterval(latido);
    // Si hay error, le mandamos el error a Android respetando el JSON
    res.write(`"error": "No se pudo transcribir el audio"}`);
    res.end();
  } finally {
    // 4) Limpieza
    fs.unlink(rutaOriginal, () => {});
    fs.rm(carpetaFragmentos, { recursive: true, force: true }, () => {});
    for (const nombre of archivosGeminiPendientes) {
      borrarArchivo(nombre).catch(()=> {});
    }
  }
});

module.exports = router;