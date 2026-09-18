// Cliente único de Gemini, compartido por todas las rutas.
// Usa el SDK oficial actual (@google/genai) — el anterior
// (@google/generative-ai) está discontinuado y da problemas con las
// claves nuevas tipo "AQ." que Google empezó a emitir en 2026.

const { GoogleGenAI } = require("@google/genai");
const { registrarUso } = require("./uso");

if (!process.env.GEMINI_API_KEY) {
  console.warn("⚠️  Falta GEMINI_API_KEY en las variables de entorno.");
}

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
// Modelo: gemini-3.5-flash-lite en vez de gemini-3.6-flash. El motivo es
// pura cuota gratuita: a septiembre 2026, gemini-3.6-flash da apenas 20
// pedidos gratis por día (¡se gasta con 2-3 clases!), mientras que
// flash-lite da 500/día. Sigue soportando audio, imágenes, PDF y video,
// que es todo lo que esta app necesita — solo es un poco menos "piola"
// para razonamiento complejo, que acá no hace falta.
const MODEL = "gemini-3.5-flash-lite";

const REINTENTOS_MAXIMOS = 6;
const ESPERA_BASE_MS = 5000;
const ESPERA_MAXIMA_MS = 60000; // no esperamos más de 1 min entre intentos

/**
 * @param {object} opciones
 * @param {any} opciones.contents - string, o array de parts (texto/inlineData)
 * @param {string} [opciones.systemInstruction]
 * @returns {Promise<string>} el texto de la respuesta
 */
async function generar({ contents, systemInstruction }, intento = 1) {
  try {
    registrarUso();
    const response = await ai.models.generateContent({
      model: MODEL,
      contents,
      ...(systemInstruction ? { config: { systemInstruction } } : {})
    });
    return response.text;
  } catch (err) {
    if (err?.status === 429) {
      console.warn(
        "Se agotó la cuota diaria gratuita de Gemini (o se pegó una ráfaga de pedidos). " +
          "Se resetea a medianoche hora de EE.UU. Detalle:",
        err?.message?.slice(0, 200)
      );
    }

    // Gemini a veces devuelve 503 "high demand" en el tier gratis. No es un
    // error nuestro: reintentamos unas cuantas veces con espera creciente
    // (tope de 1 min) antes de darnos por vencidos.
    const modeloSaturado =
      err?.status === 503 || /UNAVAILABLE|overloaded|high demand/i.test(err?.message || "");

    if (modeloSaturado && intento < REINTENTOS_MAXIMOS) {
      const espera = Math.min(ESPERA_BASE_MS * Math.pow(2, intento - 1), ESPERA_MAXIMA_MS);
      console.warn(
        `Gemini saturado (intento ${intento}/${REINTENTOS_MAXIMOS}), reintentando en ${espera / 1000}s...`
      );
      await new Promise((resolve) => setTimeout(resolve, espera));
      return generar({ contents, systemInstruction }, intento + 1);
    }
    throw err;
  }
}

/**
 * Sube un archivo (ej: un fragmento de audio) a la File API de Gemini.
 * Sirve para mandar archivos sin las limitaciones de tamaño del envío
 * "inline" (base64 dentro del propio request). Los archivos subidos así
 * Google los borra solos a las 48hs, pero igual los borramos a mano
 * apenas terminamos de usarlos (ver borrarArchivo).
 * @param {string} rutaLocal - ruta del archivo en el disco del servidor
 * @param {string} mimeType
 * @returns {Promise<object>} el archivo ya en estado ACTIVE (listo para usar)
 */
async function subirArchivo(rutaLocal, mimeType) {
  const archivo = await ai.files.upload({
    file: rutaLocal,
    config: { mimeType }
  });
  return esperarArchivoActivo(archivo);
}

// Espera a que Gemini termine de procesar el archivo subido. Con audio
// normalmente es instantáneo, pero por las dudas lo esperamos igual
// (evita el típico error "file is not in ACTIVE state").
async function esperarArchivoActivo(archivo) {
  let info = archivo;
  while (info.state === "PROCESSING") {
    await new Promise((resolve) => setTimeout(resolve, 3000));
    info = await ai.files.get({ name: info.name });
  }
  if (info.state !== "ACTIVE") {
    throw new Error(`El archivo subido a Gemini quedó en estado "${info.state}"`);
  }
  return info;
}

/**
 * Borra un archivo previamente subido con subirArchivo(). No tira error
 * si falla (no es crítico: Gemini los borra solo a las 48hs igual).
 * @param {string} nombre - el "name" del archivo subido (archivo.name)
 */
async function borrarArchivo(nombre) {
  try {
    await ai.files.delete({ name: nombre });
  } catch (err) {
    console.warn("No se pudo borrar un archivo temporal de Gemini:", err.message);
  }
}

module.exports = { generar, subirArchivo, borrarArchivo };
