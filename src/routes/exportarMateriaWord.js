// Exportar a Word (sección "exportar materia"): junta TODO el contenido
// disponible de una materia (transcripciones/resúmenes de clases +
// texto extraído de documentos), le pide a Gemini que lo reescriba como
// un resumen académico integrador -detectando y fusionando información
// duplicada entre clases y documentos en vez de repetirla- y arma un
// archivo .docx real con ese contenido para devolvérselo a la app.

const express = require("express");
const router = express.Router();
const { generar } = require("../gemini");
const {
  Document,
  Packer,
  Paragraph,
  HeadingLevel,
  TextRun,
  AlignmentType
} = require("docx");

const PROMPT_ENSAYO = `
Sos un asistente que redacta un resumen académico integrador de TODA una
materia universitaria, a partir de las clases grabadas y el material que
subió el estudiante (apuntes, PDFs, fotos de pizarrón, etc.).

Tu tarea:
1. Revisá todo el contenido disponible (clases y documentos).
2. Si encontrás información repetida o solapada entre distintas clases o
   documentos, fusionala en un solo desarrollo -nunca la repitas dos veces-.
3. Redactá el resultado en formato de ensayo/resumen universitario: prosa
   clara, prolija y bien organizada por temas. No es un copy-paste de las
   transcripciones: es un texto reescrito, cohesivo y fácil de estudiar.
4. Organizalo en secciones temáticas, cada una con un título corto.
5. Ordená las secciones de forma lógica (no necesariamente el orden
   cronológico de las clases, sino el orden que tenga más sentido para
   entender la materia).

Devolvé SOLO un JSON (sin texto adicional, sin \`\`\`) con esta forma exacta:
{
  "introduccion": "string - párrafo introductorio de qué temas cubre este material",
  "secciones": [
    { "titulo": "string corto", "contenido": "string con uno o más párrafos, separados por \\n\\n" }
  ],
  "conclusion": "string - cierre breve integrando los temas principales"
}

Reglas importantes:
- Basate ÚNICAMENTE en el material que te paso, nunca inventes contenido.
- No repitas la misma idea o dato en más de una sección.
- Si dos clases o documentos hablan del mismo tema, unificalos en una sola sección.
- Si el material es muy escaso, igual devolvé el JSON con lo que haya disponible.
`;

router.post("/exportar-word", async (req, res) => {
  try {
    const { nombreMateria, contextoClases = [], contextoDocumentos = [] } = req.body;

    if (!nombreMateria || (contextoClases.length === 0 && contextoDocumentos.length === 0)) {
      return res.status(400).json({ error: "Falta el nombre de la materia o no hay contenido para exportar" });
    }

    const contextoClasesTexto = contextoClases
      .map((c) => `### Clase: ${c.titulo} (${c.fecha})\n${c.resumen || c.transcripcion || ""}`)
      .join("\n\n");

    const contextoDocumentosTexto = contextoDocumentos
      .map((d) => `### Documento: ${d.nombre}\n${d.texto}`)
      .join("\n\n");

    const contextoTexto = [contextoClasesTexto, contextoDocumentosTexto].filter(Boolean).join("\n\n");

    const textoRespuesta = await generar({
      contents: `MATERIA: ${nombreMateria}\n\nMATERIAL DISPONIBLE:\n${contextoTexto}`,
      systemInstruction: PROMPT_ENSAYO
    });

    const ensayo = JSON.parse(textoRespuesta.replace(/```json|```/g, "").trim());

    const hijos = [
      new Paragraph({
        text: nombreMateria,
        heading: HeadingLevel.TITLE,
        alignment: AlignmentType.CENTER
      }),
      new Paragraph({ text: "" })
    ];

    if (ensayo.introduccion) {
      for (const p of String(ensayo.introduccion).split("\n").filter(Boolean)) {
        hijos.push(new Paragraph({ children: [new TextRun({ text: p, size: 24 })] }));
      }
      hijos.push(new Paragraph({ text: "" }));
    }

    for (const seccion of ensayo.secciones || []) {
      hijos.push(new Paragraph({ text: seccion.titulo, heading: HeadingLevel.HEADING_1 }));
      const parrafos = String(seccion.contenido || "").split("\n").filter(Boolean);
      for (const p of parrafos) {
        hijos.push(new Paragraph({ children: [new TextRun({ text: p, size: 24 })] }));
      }
      hijos.push(new Paragraph({ text: "" }));
    }

    if (ensayo.conclusion) {
      hijos.push(new Paragraph({ text: "Conclusión", heading: HeadingLevel.HEADING_1 }));
      for (const p of String(ensayo.conclusion).split("\n").filter(Boolean)) {
        hijos.push(new Paragraph({ children: [new TextRun({ text: p, size: 24 })] }));
      }
    }

    const doc = new Document({ sections: [{ children: hijos }] });
    const buffer = await Packer.toBuffer(doc);

    const nombreArchivo = `${(nombreMateria || "materia").replace(/[^a-zA-Z0-9-_ ]/g, "").trim() || "materia"}.docx`;

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );
    res.setHeader("Content-Disposition", `attachment; filename="${nombreArchivo}"`);
    res.send(buffer);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "No se pudo generar el documento Word" });
  }
});

module.exports = router;
