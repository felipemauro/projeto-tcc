const { Router } = require('express');
const { z } = require('zod');
const db = require('../db/pool');
const { autorizar } = require('../middlewares/auth');
const { naoEncontrado } = require('../utils/erros');
const { registrarHistorico } = require('../services/auditoria');
const eventos = require('../services/eventos');

const router = Router();

const esquema = z.object({
  nome: z.string().trim().min(2).max(80),
  capacidade: z.coerce.number().int().positive('Capacidade deve ser maior que zero.'),
  localizacao: z.string().trim().min(2).max(120),
  descricao: z.string().trim().max(500).optional().nullable(),
  ativo: z.boolean().optional(),
});

// GET /api/laboratorios - todos os perfis (consulta)
router.get('/', async (req, res) => {
  const somenteAtivos = req.query.todos !== 'true';
  const { rows } = await db.query(
    `SELECT * FROM laboratorio ${somenteAtivos ? 'WHERE ativo' : ''} ORDER BY length(nome), nome`
  );
  res.json(rows);
});

// GET /api/laboratorios/:id/disponibilidade?data=AAAA-MM-DD
router.get('/:id/disponibilidade', async (req, res) => {
  const data = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(req.query.data);
  const { rows: lab } = await db.query('SELECT * FROM laboratorio WHERE id_laboratorio = $1', [req.params.id]);
  if (!lab[0]) throw naoEncontrado('Laboratório');
  const { rows } = await db.query(
    `SELECT r.id_reserva, to_char(r.hora_inicio,'HH24:MI') AS hora_inicio, to_char(r.hora_fim,'HH24:MI') AS hora_fim,
            r.status, r.prioridade, u.nome AS usuario_nome, d.nome AS disciplina_nome
       FROM reserva r JOIN usuario u ON u.id_usuario = r.id_usuario
       LEFT JOIN disciplina d ON d.id_disciplina = r.id_disciplina
      WHERE r.id_laboratorio = $1 AND r.data = $2 AND r.status IN ('APROVADA','PENDENTE')
      ORDER BY r.hora_inicio`,
    [req.params.id, data]
  );
  res.json({ laboratorio: lab[0], data, ocupacoes: rows });
});

// Cadastro de laboratórios (somente administrativo)
router.post('/', autorizar('ADMINISTRATIVO'), async (req, res) => {
  const d = esquema.parse(req.body);
  const { rows } = await db.query(
    `INSERT INTO laboratorio (nome, capacidade, localizacao, descricao, ativo)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [d.nome, d.capacidade, d.localizacao, d.descricao || null, d.ativo ?? true]
  );
  await registrarHistorico(null, { idUsuario: req.usuario.id, acao: 'LABORATORIO_CRIADO', detalhes: { id: rows[0].id_laboratorio } });
  eventos.emitir('laboratorio', {});
  res.status(201).json(rows[0]);
});

router.put('/:id', autorizar('ADMINISTRATIVO'), async (req, res) => {
  const d = esquema.parse(req.body);
  const { rows } = await db.query(
    `UPDATE laboratorio SET nome=$2, capacidade=$3, localizacao=$4, descricao=$5, ativo=$6
      WHERE id_laboratorio = $1 RETURNING *`,
    [req.params.id, d.nome, d.capacidade, d.localizacao, d.descricao || null, d.ativo ?? true]
  );
  if (!rows[0]) throw naoEncontrado('Laboratório');
  await registrarHistorico(null, { idUsuario: req.usuario.id, acao: 'LABORATORIO_ALTERADO', detalhes: { id: rows[0].id_laboratorio } });
  eventos.emitir('laboratorio', {});
  res.json(rows[0]);
});

module.exports = router;
