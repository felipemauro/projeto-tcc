const { Router } = require('express');
const { z } = require('zod');
const db = require('../db/pool');
const { autorizar } = require('../middlewares/auth');
const { naoEncontrado } = require('../utils/erros');
const { registrarHistorico } = require('../services/auditoria');

const router = Router();

const esquema = z.object({
  nome: z.string().trim().min(2).max(120),
  curso: z.string().trim().min(2).max(120),
  periodo: z.coerce.number().int().min(0).max(12),
  tipo: z.enum(['PRATICA', 'TEORICA', 'EXTRACURRICULAR']),
  ativo: z.boolean().optional(),
});

router.get('/', async (req, res) => {
  const somenteAtivas = req.query.todas !== 'true';
  const { rows } = await db.query(
    `SELECT * FROM disciplina ${somenteAtivas ? 'WHERE ativo' : ''} ORDER BY curso, periodo, nome`
  );
  res.json(rows);
});

// Cadastro de disciplinas (somente administrativo)
router.post('/', autorizar('ADMINISTRATIVO'), async (req, res) => {
  const d = esquema.parse(req.body);
  const { rows } = await db.query(
    'INSERT INTO disciplina (nome, curso, periodo, tipo, ativo) VALUES ($1,$2,$3,$4,$5) RETURNING *',
    [d.nome, d.curso, d.periodo, d.tipo, d.ativo ?? true]
  );
  await registrarHistorico(null, { idUsuario: req.usuario.id, acao: 'DISCIPLINA_CRIADA', detalhes: { id: rows[0].id_disciplina } });
  res.status(201).json(rows[0]);
});

router.put('/:id', autorizar('ADMINISTRATIVO'), async (req, res) => {
  const d = esquema.parse(req.body);
  const { rows } = await db.query(
    `UPDATE disciplina SET nome=$2, curso=$3, periodo=$4, tipo=$5, ativo=$6
      WHERE id_disciplina = $1 RETURNING *`,
    [req.params.id, d.nome, d.curso, d.periodo, d.tipo, d.ativo ?? true]
  );
  if (!rows[0]) throw naoEncontrado('Disciplina');
  await registrarHistorico(null, { idUsuario: req.usuario.id, acao: 'DISCIPLINA_ALTERADA', detalhes: { id: rows[0].id_disciplina } });
  res.json(rows[0]);
});

module.exports = router;
