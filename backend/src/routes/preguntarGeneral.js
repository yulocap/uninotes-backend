const express = require("express");
const router = express.Router();
const { generar } = require("../gemini");

const SYSTEM_PROMPT = `
Sos el asistente universitario general del estudiante. Tenés acceso a un
resumen de TODAS sus materias (no solo una). Respondé cruzando información
entre materias cuando la pregunta lo pida.

Reglas estrictas:
- Basate únicamente en el material que te paso.
- Si no hay información suficiente para alguna materia, decilo explícitamente
  en vez de inventar.
- Si es una interpretación tuya, aclaralo.
`;

router.post("/preguntar", async (req, res) => {
  try {
    const { pregunta, contextoMaterias } = req.body;
    if (!pregunta || !contextoMaterias) {
      return res.status(400).json({ error: "Falta pregunta o contexto" });
    }

    const contextoTexto = contextoMaterias
      .map((materia) => {
        const clasesTexto = materia.clases
          .map((c) => `  - ${c.titulo} (${c.fecha}): ${c.resumen}`)
          .join("\n");
        return `## Materia: ${materia.nombre}\n${clasesTexto}`;
      })
      .join("\n\n");

    const respuesta = await generar({
      contents: `MATERIAS DISPONIBLES:\n${contextoTexto}\n\nPREGUNTA: ${pregunta}`,
      systemInstruction: SYSTEM_PROMPT
    });

    res.json({ respuesta });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "No se pudo responder la pregunta" });
  }
});

module.exports = router;
