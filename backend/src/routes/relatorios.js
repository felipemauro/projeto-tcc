const { Router } = require('express');
const { z } = require('zod');
const db = require('../db/pool');
const indicadores = require('../services/indicadores');
const { registrarHistorico } = require('../services/auditoria');

// Caso de uso "Gerar Relatórios" – Coordenador e Funcionário Administrativo
const router = Router();

const TIPOS = {
  ocupacao: 'Taxa de ocupação por laboratório',
  reservas: 'Reservas detalhadas',
  docentes: 'Utilização por solicitante',
  disciplinas: 'Utilização por disciplina',
  conflitos: 'Conflitos bloqueados e remanejamentos',
};

const esquema = z.object({
  tipo: z.enum(Object.keys(TIPOS)),
  inicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  fim: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  formato: z.enum(['json', 'csv']).default('json'),
});

const HORAS = `ROUND(SUM(EXTRACT(EPOCH FROM (r.hora_fim - r.hora_inicio)) / 3600)
               FILTER (WHERE r.status = 'APROVADA')::numeric, 1)::float`;

async function gerar(tipo, inicio, fim) {
  switch (tipo) {
    case 'ocupacao': {
      const linhas = await indicadores.ocupacaoPorLaboratorio(inicio, fim);
      return {
        colunas: [
          ['nome', 'Laboratório'], ['capacidade', 'Capacidade'], ['reservas_aprovadas', 'Reservas aprovadas'],
          ['reservas_pendentes', 'Pendentes'], ['horas_reservadas', 'Horas reservadas'],
          ['horas_disponiveis', 'Horas disponíveis'], ['taxa_ocupacao', 'Ocupação (%)'],
        ],
        linhas,
      };
    }
    case 'reservas': {
      const { rows } = await db.query(
        `SELECT r.id_reserva, to_char(r.data,'DD/MM/YYYY') AS data,
                to_char(r.hora_inicio,'HH24:MI') AS hora_inicio, to_char(r.hora_fim,'HH24:MI') AS hora_fim,
                l.nome AS laboratorio, u.nome AS solicitante, u.perfil, d.nome AS disciplina,
                r.qtd_alunos, r.prioridade, r.status, r.finalidade
           FROM reserva r JOIN laboratorio l ON l.id_laboratorio = r.id_laboratorio
           JOIN usuario u ON u.id_usuario = r.id_usuario
           LEFT JOIN disciplina d ON d.id_disciplina = r.id_disciplina
          WHERE r.data BETWEEN $1 AND $2 ORDER BY r.data, r.hora_inicio`,
        [inicio, fim]
      );
      return {
        colunas: [
          ['id_reserva', 'Nº'], ['data', 'Data'], ['hora_inicio', 'Início'], ['hora_fim', 'Fim'],
          ['laboratorio', 'Laboratório'], ['solicitante', 'Solicitante'], ['perfil', 'Perfil'],
          ['disciplina', 'Disciplina'], ['qtd_alunos', 'Alunos'], ['prioridade', 'Prioridade'],
          ['status', 'Status'], ['finalidade', 'Finalidade'],
        ],
        linhas: rows,
      };
    }
    case 'docentes': {
      const { rows } = await db.query(
        `SELECT u.nome, u.perfil, COUNT(r.id_reserva)::int AS total,
                COUNT(*) FILTER (WHERE r.status = 'APROVADA')::int AS aprovadas,
                COUNT(*) FILTER (WHERE r.status = 'REJEITADA')::int AS rejeitadas,
                COUNT(*) FILTER (WHERE r.status = 'CANCELADA')::int AS canceladas,
                COALESCE(${HORAS}, 0) AS horas
           FROM reserva r JOIN usuario u ON u.id_usuario = r.id_usuario
          WHERE r.data BETWEEN $1 AND $2 GROUP BY u.id_usuario ORDER BY horas DESC, total DESC`,
        [inicio, fim]
      );
      return {
        colunas: [
          ['nome', 'Solicitante'], ['perfil', 'Perfil'], ['total', 'Solicitações'], ['aprovadas', 'Aprovadas'],
          ['rejeitadas', 'Rejeitadas'], ['canceladas', 'Canceladas'], ['horas', 'Horas aprovadas'],
        ],
        linhas: rows,
      };
    }
    case 'disciplinas': {
      const { rows } = await db.query(
        `SELECT d.nome, d.curso, d.periodo, d.tipo, COUNT(r.id_reserva)::int AS total,
                COALESCE(${HORAS}, 0) AS horas
           FROM reserva r JOIN disciplina d ON d.id_disciplina = r.id_disciplina
          WHERE r.data BETWEEN $1 AND $2 GROUP BY d.id_disciplina ORDER BY horas DESC`,
        [inicio, fim]
      );
      return {
        colunas: [
          ['nome', 'Disciplina'], ['curso', 'Curso'], ['periodo', 'Período'], ['tipo', 'Natureza'],
          ['total', 'Reservas'], ['horas', 'Horas aprovadas'],
        ],
        linhas: rows,
      };
    }
    case 'conflitos': {
      const { rows } = await db.query(
        `SELECT to_char(h.data_hora,'DD/MM/YYYY HH24:MI') AS data_hora, h.acao, u.nome AS usuario,
                COALESCE(h.detalhes->'solicitacao'->>'data', r.data::text) AS data_reserva,
                COALESCE(l1.nome, l2.nome) AS laboratorio
           FROM historico h
           LEFT JOIN usuario u ON u.id_usuario = h.id_usuario
           LEFT JOIN reserva r ON r.id_reserva = h.id_reserva
           LEFT JOIN laboratorio l1 ON l1.id_laboratorio = r.id_laboratorio
           LEFT JOIN laboratorio l2 ON l2.id_laboratorio = (h.detalhes->'solicitacao'->>'id_laboratorio')::int
          WHERE h.acao IN ('BLOQUEADA_CONFLITO','REMANEJADA') AND h.data_hora::date BETWEEN $1 AND $2
          ORDER BY h.data_hora DESC`,
        [inicio, fim]
      );
      return {
        colunas: [
          ['data_hora', 'Data/hora'], ['acao', 'Ocorrência'], ['usuario', 'Usuário'],
          ['laboratorio', 'Laboratório'], ['data_reserva', 'Data solicitada'],
        ],
        linhas: rows,
      };
    }
    default:
      return { colunas: [], linhas: [] };
  }
}

function paraCsv({ colunas, linhas }) {
  const esc = (v) => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const cab = colunas.map(([, rotulo]) => esc(rotulo)).join(';');
  const corpo = linhas.map((l) => colunas.map(([chave]) => esc(l[chave])).join(';'));
  return '﻿' + [cab, ...corpo].join('\r\n'); // BOM para abrir corretamente no Excel
}

router.get('/tipos', (_req, res) => res.json(TIPOS));

router.get('/', async (req, res) => {
  const { tipo, inicio, fim, formato } = esquema.parse(req.query);
  const resultado = await gerar(tipo, inicio, fim);
  await db.query(
    'INSERT INTO relatorio (id_usuario, tipo, parametros) VALUES ($1, $2, $3)',
    [req.usuario.id, tipo, { inicio, fim, formato }]
  );
  await registrarHistorico(null, { idUsuario: req.usuario.id, acao: 'RELATORIO_GERADO', detalhes: { tipo, inicio, fim } });

  if (formato === 'csv') {
    res.set('Content-Type', 'text/csv; charset=utf-8');
    res.set('Content-Disposition', `attachment; filename="relatorio-${tipo}-${inicio}_${fim}.csv"`);
    return res.send(paraCsv(resultado));
  }
  res.json({
    titulo: TIPOS[tipo],
    periodo: { inicio, fim },
    colunas: resultado.colunas.map(([chave, rotulo]) => ({ chave, rotulo })),
    linhas: resultado.linhas,
  });
});

// Histórico de relatórios gerados
router.get('/gerados', async (_req, res) => {
  const { rows } = await db.query(
    `SELECT r.id_relatorio, r.tipo, r.parametros, r.data_geracao, u.nome AS usuario
       FROM relatorio r JOIN usuario u ON u.id_usuario = r.id_usuario
      ORDER BY r.data_geracao DESC LIMIT 50`
  );
  res.json(rows);
});

module.exports = router;
