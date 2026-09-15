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

// Transcribir un audio de 90+ min (chunking + esperas entre llamadas a
// Gemini) puede tardar varios minutos. Render permite requests de hasta
// ~100 min en el plan gratuito, así que solo hace falta subir estos
// límites de Node para que no corte la conexión antes de tiempo.
server.setTimeout(30 * 60 * 1000); // 30 min de inactividad en el socket
server.headersTimeout = 30 * 60 * 1000;
server.requestTimeout = 0; // sin límite para recibir el audio que sube Android
