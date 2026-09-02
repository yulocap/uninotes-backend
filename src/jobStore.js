// Almacén simple en memoria para trabajos en segundo plano (transcripción
// de audios largos). No persiste si el servidor se reinicia, pero eso es
// aceptable para este caso de uso: los trabajos duran minutos, no días.

const jobs = new Map();

function crear() {
  const id = `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  jobs.set(id, { estado: "procesando", texto: null, error: null });
  return id;
}

function actualizar(id, datos) {
  const actual = jobs.get(id) || {};
  jobs.set(id, { ...actual, ...datos });
}

function obtener(id) {
  return jobs.get(id);
}

module.exports = { crear, actualizar, obtener };
