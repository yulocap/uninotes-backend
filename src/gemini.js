// Cliente único de Gemini, compartido por todas las rutas.
// Usa el SDK oficial actual (@google/genai) — el anterior
// (@google/generative-ai) está discontinuado y da problemas con las
// claves nuevas tipo "AQ." que Google empezó a emitir en 2026.

const { GoogleGenAI } = require("@google/genai");

if (!process.env.GEMINI_API_KEY) {
  console.warn("⚠️  Falta GEMINI_API_KEY en las variables de entorno.");
}

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const MODEL = "gemini-3.6-flash";

/**
 * @param {object} opciones
 * @param {any} opciones.contents - string, o array de parts (texto/inlineData)
 * @param {string} [opciones.systemInstruction]
 * @returns {Promise<string>} el texto de la respuesta
 */
async function generar({ contents, systemInstruction }) {
  const response = await ai.models.generateContent({
    model: MODEL,
    contents,
    ...(systemInstruction ? { config: { systemInstruction } } : {})
  });
  return response.text;
}

module.exports = { generar };
