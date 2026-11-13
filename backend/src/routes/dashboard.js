const { Router } = require('express');
const { z } = require('zod');
const indicadores = require('../services/indicadores');
const { hoje, somarDias } = require('../utils/tempo');

const router = Router();
const data = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

// GET /api/dashboard?inicio&fim - dashboard administrativo (Objetivo específico "d")
router.get('/', async (req, res) => {
  const hojeISO = hoje();
  const inicio = req.query.inicio ? data.parse(req.query.inicio) : `${hojeISO.slice(0, 8)}01`;
  const fim = req.query.fim ? data.parse(req.query.fim) : somarDias(inicio, 30);
  const [resumo, ocupacao, demanda] = await Promise.all([
    indicadores.resumo(inicio, fim),
    indicadores.ocupacaoPorLaboratorio(inicio, fim),
    indicadores.demandaPorDiaHora(inicio, fim),
  ]);
  res.json({ periodo: { inicio, fim }, resumo, ocupacao, demanda });
});

module.exports = router;
