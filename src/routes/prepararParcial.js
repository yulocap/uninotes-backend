const express = require("express");
const router = express.Router();
const { generar } = require("../gemini");

const INSTRUCCIONES_POR_TIPO = {
  guia_estudio: 'Devolvé un JSON: {"temas": ["tema 1", "tema 2", ...]} con los temas que debería repasar, ordenados por importancia.',
  conceptos_importantes: 'Devolvé un JSON: {"conceptos": [{"nombre": "...", "explicacion": "..."}]}.',
  preguntas_posibles: 'Devolvé un JSON: {"preguntas": ["...", "..."]}.',
  multiple_choice: 'Devolvé un JSON: {"preguntas": [{"pregunta": "...", "opciones": ["...","...","...","..."], "correcta": 0}]}.',
  desarrollo: 'Devolvé un JSON: {"preguntas": ["...", "..."]} de preguntas para responder escribiendo.',
  flashcards: 'Devolvé un JSON: {"tarjetas": [{"concepto": "...", "explicacion": "..."}]}.',
  simulacro: 'Devolvé un JSON: {"secciones": [{"tipo": "multiple_choice|desarrollo", "preguntas": [...]}]} armando un examen completo mezclando tipos.'
};

const SYSTEM_BASE = `
Sos un asistente que prepara material de estudio para un parcial
universitario, basándote ÚNICAMENTE en el contenido de las clases y
documentos de esa materia que te paso como contexto. Nunca inventes
temas, conceptos o preguntas que no tengan base en ese material.
Respondé SOLO con el JSON pedido, sin texto adicional, sin \`\`\`.
`;

router.post("/generar", async (req, res) => {
  try {
    const { tipo, contextoMateria } = req.body;
    const instrucciones = INSTRUCCIONES_POR_TIPO[tipo];
    if (!instrucciones || !contextoMateria) {
      return res.status(400).json({ error: "Tipo inválido o falta contexto de la materia" });
    }

    const texto = await generar({
      contents: contextoMateria,
      systemInstruction: `${SYSTEM_BASE}\n${instrucciones}`
    });

    const resultado = JSON.parse(texto.replace(/```json|```/g, "").trim());
    res.json({ resultado });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "No se pudo generar el material" });
  }
});

module.exports = router;
