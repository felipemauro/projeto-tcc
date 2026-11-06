const { Router } = require('express');
const { z } = require('zod');
const { autorizar, GESTORES } = require('../middlewares/auth');
const servico = require('../services/reservaService');

const router = Router();

const data = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data no formato AAAA-MM-DD.');
const hora = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:\d{2})?$/, 'Hora no formato HH:MM.');
const id = z.coerce.number().int().positive();

const esquemaReserva = z.object({
  id_laboratorio: id,
  id_disciplina: id.nullable().optional(),
  data,
  hora_inicio: hora,
  hora_fim: hora,
  qtd_alunos: z.coerce.number().int().positive('Informe a quantidade de alunos.'),
  finalidade: z.string().trim().max(255).nullable().optional(),
});

// GET /api/reservas?inicio&fim&id_laboratorio&status&minhas=true&ordem=prioridade
router.get('/', async (req, res) => {
  const q = req.query;
  res.json(
    await servico.listar(
      {
        inicio: q.inicio, fim: q.fim, id_laboratorio: q.id_laboratorio, status: q.status,
        minhas: q.minhas === 'true', id_usuario: q.id_usuario, ordem: q.ordem,
        comConflitos: q.conflitos === 'true', limite: q.limite,
      },
      req.usuario
    )
  );
});

// POST /api/reservas/verificar – pré-validação inteligente (conflitos, prioridade, sugestões)
router.post('/verificar', async (req, res) => {
  const dados = esquemaReserva.extend({ id_reserva: id.optional() }).parse(req.body);
  res.json(await servico.simular(dados, req.usuario));
});

router.get('/:id', async (req, res) => {
  res.json(await servico.obter(id.parse(req.params.id), req.usuario));
});

// POST /api/reservas – caso de uso "Solicitar Reserva"
router.post('/', async (req, res) => {
  const resultado = await servico.solicitar(esquemaReserva.parse(req.body), req.usuario);
  res.status(201).json(resultado);
});

// PATCH /api/reservas/:id – caso de uso "Alterar Reserva"
router.patch('/:id', async (req, res) => {
  const dados = esquemaReserva.partial().extend({
    versao: z.coerce.number().int().optional(),
    motivo: z.string().trim().max(500).optional(),
  }).parse(req.body);
  res.json(await servico.alterar(id.parse(req.params.id), dados, req.usuario));
});

// POST /api/reservas/:id/aprovar – caso de uso "Aprovar Reserva"
router.post('/:id/aprovar', autorizar(...GESTORES), async (req, res) => {
  const dados = z.object({
    versao: z.coerce.number().int().optional(),
    forcar: z.boolean().optional(),
    motivo: z.string().trim().max(500).optional(),
  }).parse(req.body || {});
  res.json(await servico.aprovar(id.parse(req.params.id), dados, req.usuario));
});

// POST /api/reservas/:id/rejeitar – caso de uso "Rejeitar Reserva"
router.post('/:id/rejeitar', autorizar(...GESTORES), async (req, res) => {
  const dados = z.object({
    versao: z.coerce.number().int().optional(),
    motivo: z.string().trim().min(3, 'Informe o motivo da rejeição.').max(500),
  }).parse(req.body || {});
  res.json(await servico.rejeitar(id.parse(req.params.id), dados, req.usuario));
});

// DELETE /api/reservas/:id – cancelamento (remoção lógica)
router.delete('/:id', async (req, res) => {
  const motivo = typeof req.query.motivo === 'string' ? req.query.motivo.slice(0, 500) : undefined;
  res.json(await servico.cancelar(id.parse(req.params.id), { motivo }, req.usuario));
});

module.exports = router;
