// Devuelve el estado del contador diario de uso de IA (usados, límite,
// restantes), para que la app pinte la barrita de uso en toda la interfaz.

const express = require("express");
const router = express.Router();
const { obtenerUso } = require("../uso");

router.get("/", (req, res) => {
  res.json(obtenerUso());
});

module.exports = router;
