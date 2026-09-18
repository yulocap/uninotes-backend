// Contador simple de uso diario de la IA (Gemini), para poder mostrarle
// al usuario en la app cuánto lleva usado hoy y cuánto le queda antes del
// límite gratuito. Es una aproximación propia -sumamos 1 por cada llamada
// real que hacemos a la API de Gemini-, no un dato oficial de Google: la
// API de Gemini no expone cuánto llevás gastado de tu cuota gratuita, así
// que esto es lo más cercano que se puede mostrar sin eso. Se guarda en un
// archivo simple para que el contador sobreviva si el backend se reinicia
// a mitad del día.

const fs = require("fs");
const path = require("path");

const ARCHIVO_USO = path.join(__dirname, "..", "uso.json");

// Google no publica un número fijo de "requests por día" para el tier
// gratis: varía según el modelo y el proyecto. Se puede ajustar este
// valor en el .env (GEMINI_LIMITE_DIARIO) según lo que muestre la
// consola de AI Studio para tu proyecto.
const LIMITE_DIARIO = parseInt(process.env.GEMINI_LIMITE_DIARIO || "500", 10);

function fechaHoy() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

function leer() {
  try {
    const datos = JSON.parse(fs.readFileSync(ARCHIVO_USO, "utf-8"));
    if (datos.fecha === fechaHoy()) return datos;
  } catch (err) {
    // No existe el archivo todavía (primera vez) o quedó corrupto:
    // arrancamos el contador de cero para hoy.
  }
  return { fecha: fechaHoy(), usados: 0 };
}

function guardar(datos) {
  try {
    fs.writeFileSync(ARCHIVO_USO, JSON.stringify(datos));
  } catch (err) {
    console.warn("No se pudo guardar el contador de uso de IA:", err.message);
  }
}

/** Suma una llamada al contador de hoy. Se llama en cada request real a Gemini. */
function registrarUso() {
  const datos = leer();
  datos.usados += 1;
  guardar(datos);
}

/** Estado actual del contador: usados, límite, restantes y la fecha. */
function obtenerUso() {
  const datos = leer();
  const restantes = Math.max(LIMITE_DIARIO - datos.usados, 0);
  return { fecha: datos.fecha, usados: datos.usados, limite: LIMITE_DIARIO, restantes };
}

module.exports = { registrarUso, obtenerUso };
