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
  const intentos = 3;
  for (let intento = 1; intento <= intentos; intento++) {
    try {
      const response = await ai.models.generateContent({
        model: MODEL,
        contents,
        ...(systemInstruction ? { config: { systemInstruction } } : {})
      });
      return response.text;
    } catch (err) {
      const esSaturado = err?.message?.includes("503") || err?.message?.includes("UNAVAILABLE");
      if (esSaturado && intento < intentos) {
        // Google está saturado momentáneamente: esperamos un poco y reintentamos.
        await new Promise((resolve) => setTimeout(resolve, 2000 * intento));
        continue;
      }
      throw err;
    }
  }
}

module.exports = { generar };
