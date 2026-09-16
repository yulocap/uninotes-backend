require("dotenv").config();
const express = require("express");
const procesarClaseRouter = require("./routes/procesarClase");
const transcribirAudioRouter = require("./routes/transcribirAudio");
const preguntarMateriaRouter = require("./routes/preguntarMateria");
const preguntarGeneralRouter = require("./routes/preguntarGeneral");
const prepararParcialRouter = require("./routes/prepararParcial");
const extraerTextoRouter = require("./routes/extraerTextoDocumento");
const extraerTextoVideoRouter = require("./routes/extraerTextoVideo");
const exportarMateriaWordRouter = require("./routes/exportarMateriaWord");

const app = express();
app.use(express.json({ limit: "50mb" }));

app.use("/api/clase", procesarClaseRouter);
app.use("/api/audio", transcribirAudioRouter);
app.use("/api/materia", preguntarMateriaRouter);
app.use("/api/materia", exportarMateriaWordRouter);
app.use("/api/general", preguntarGeneralRouter);
app.use("/api/parcial", prepararParcialRouter);
app.use("/api/documento", extraerTextoRouter);
app.use("/api/documento", extraerTextoVideoRouter);

app.get("/health", (req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => console.log(`UniNotes backend escuchando en puerto ${PORT}`));

// Cada request ahora procesa el audio COMPLETO de la clase (hasta ~2hs) en
// una sola llamada, así que le damos margen generoso.
server.setTimeout(15 * 60 * 1000); // 15 min
server.headersTimeout = 15 * 60 * 1000;
