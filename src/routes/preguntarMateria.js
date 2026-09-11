const express = require("express");
const router = express.Router();
const { generar } = require("../gemini");

const SYSTEM_PROMPT = `
Sos el asistente de estudio de un estudiante universitario para UNA materia
específica. Respondé usando ÚNICAMENTE la información de las clases y
documentos que te paso como contexto.

Reglas estrictas:
- Si la respuesta está explícitamente en el material: contestala y decí en
  qué clase (fecha/título) se mencionó.
- Si no encontrás la información: respondé literalmente
  "No encontré esa información en el material disponible."
- Si es una interpretación tuya y no algo dicho textualmente: aclaralo
  explícitamente ("Mi interpretación es...").
- Nunca inventes fechas, nombres o contenidos de examen que no aparezcan
  en el material.
`;

router.post("/preguntar", async (req, res) => {
  try {
    const { pregunta, contextoClases, contextoDocumentos = [] } = req.body;
    if (!pregunta || !contextoClases) {
      return res.status(400).json({ error: "Falta pregunta o contexto" });
    }

    const contextoClasesTexto = contextoClases
      .map((c) => `### Clase: ${c.titulo} (${c.fecha})\n${c.resumen || c.transcripcion || ""}`)
      .join("\n\n");

    const contextoDocumentosTexto = contextoDocumentos
      .map((d) => `### Documento: ${d.nombre}\n${d.texto}`)
      .join("\n\n");

    const contextoTexto = [contextoClasesTexto, contextoDocumentosTexto].filter(Boolean).join("\n\n");

    const respuesta = await generar({
      contents: `MATERIAL DISPONIBLE:\n${contextoTexto}\n\nPREGUNTA: ${pregunta}`,
      systemInstruction: SYSTEM_PROMPT
    });

    res.json({ respuesta });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "No se pudo responder la pregunta" });
  }
});

module.exports = router;
