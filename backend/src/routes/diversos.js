/** Rotas de histórico (auditoria), notificações, parâmetros e eventos em tempo real. */
const { Router } = require('express');
const { z } = require('zod');
const db = require('../db/pool');
const { autorizar, GESTORES, verificarToken } = require('../middlewares/auth');
const { obterParametros, salvarParametros } = require('../services/parametros');
const { registrarHistorico } = require('../services/auditoria');
const eventos = require('../services/eventos');
const { ErroApi } = require('../utils/erros');

// ---------------------------------------------------------------- histórico
const historico = Router();
historico.get('/', autorizar(...GESTORES), async (req, res) => {
  const params = [];
  const cond = [];
  if (req.query.acao) { params.push(req.query.acao); cond.push(`h.acao = $${params.length}`); }
  if (req.query.id_reserva) { params.push(req.query.id_reserva); cond.push(`h.id_reserva = $${params.length}`); }
  const where = cond.length ? `WHERE ${cond.join(' AND ')}` : '';
  const { rows } = await db.query(
    `SELECT h.id_historico, h.id_reserva, h.acao, h.detalhes, h.data_hora, u.nome AS usuario, u.perfil
       FROM historico h LEFT JOIN usuario u ON u.id_usuario = h.id_usuario
       ${where} ORDER BY h.data_hora DESC, h.id_historico DESC LIMIT 300`,
    params
  );
  res.json(rows);
});

// ------------------------------------------------------------ notificações
const notificacoes = Router();
notificacoes.get('/', async (req, res) => {
  const { rows } = await db.query(
    `SELECT * FROM notificacao WHERE id_usuario = $1 ORDER BY criado_em DESC LIMIT 50`,
    [req.usuario.id]
  );
  res.json(rows);
});
notificacoes.post('/lidas', async (req, res) => {
  await db.query('UPDATE notificacao SET lida = TRUE WHERE id_usuario = $1 AND NOT lida', [req.usuario.id]);
  res.json({ ok: true });
});

// -------------------------------------------------------------- parâmetros
const parametros = Router();
parametros.get('/', async (_req, res) => res.json(await obterParametros()));

const peso = z.coerce.number().int().min(0).max(100);
const hora = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
parametros.put('/', autorizar('ADMINISTRATIVO'), async (req, res) => {
  const dados = z.object({
    funcionamento: z.object({
      inicio: hora, fim: hora, diasSemana: z.array(z.number().int().min(0).max(6)).min(1),
    }),
    pesos: z.object({
      natureza: z.object({ PRATICA: peso, TEORICA: peso, EXTRACURRICULAR: peso, SEM_DISCIPLINA: peso }),
      proximidadeMax: peso,
      ocupacaoMax: peso,
      perfil: z.object({ ADMINISTRATIVO: peso, COORDENADOR: peso, DOCENTE: peso, DISCENTE: peso }),
    }),
    aprovacaoAutomatica: z.array(z.enum(['ADMINISTRATIVO', 'COORDENADOR', 'DOCENTE', 'DISCENTE'])),
    sugestoes: z.object({
      janelaDias: z.coerce.number().int().min(1).max(30),
      passoMinutos: z.coerce.number().int().min(10).max(120),
      maximo: z.coerce.number().int().min(1).max(20),
    }),
  }).parse(req.body);
  if (dados.funcionamento.fim <= dados.funcionamento.inicio) {
    throw new ErroApi(400, 'O fim do funcionamento deve ser após o início.');
  }
  const salvo = await salvarParametros(dados);
  await registrarHistorico(null, { idUsuario: req.usuario.id, acao: 'PARAMETROS_ALTERADOS', detalhes: dados });
  res.json(salvo);
});

// ------------------------------------------------- eventos em tempo real (SSE)
// O EventSource do navegador não envia cabeçalhos, por isso o token vai na query.
const tempoReal = Router();
tempoReal.get('/', (req, res) => {
  let usuario;
  try {
    usuario = verificarToken(String(req.query.token || ''));
  } catch {
    throw new ErroApi(401, 'Token inválido.');
  }
  eventos.conectar(req, res, usuario);
});

module.exports = { historico, notificacoes, parametros, tempoReal };
