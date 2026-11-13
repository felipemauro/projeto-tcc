/**
 * Indicadores de uso dos laboratórios - base do dashboard administrativo
 * e dos relatórios.
 */
const db = require('../db/pool');
const { obterParametros } = require('./parametros');
const { paraMinutos, somarDias, diaSemana } = require('../utils/tempo');

/** Quantidade de dias de funcionamento no intervalo [inicio, fim]. */
function diasUteis(inicio, fim, diasSemana) {
  let n = 0;
  for (let d = inicio; d <= fim; d = somarDias(d, 1)) if (diasSemana.includes(diaSemana(d))) n++;
  return n;
}

async function ocupacaoPorLaboratorio(inicio, fim) {
  const p = await obterParametros();
  const horasDia = (paraMinutos(p.funcionamento.fim) - paraMinutos(p.funcionamento.inicio)) / 60;
  const disponiveis = diasUteis(inicio, fim, p.funcionamento.diasSemana) * horasDia;
  const { rows } = await db.query(
    `SELECT l.id_laboratorio, l.nome, l.capacidade,
            COUNT(r.id_reserva) FILTER (WHERE r.status = 'APROVADA')::int AS reservas_aprovadas,
            COUNT(r.id_reserva) FILTER (WHERE r.status = 'PENDENTE')::int AS reservas_pendentes,
            COALESCE(SUM(EXTRACT(EPOCH FROM (r.hora_fim - r.hora_inicio)) / 3600)
                     FILTER (WHERE r.status = 'APROVADA'), 0)::float AS horas_reservadas
       FROM laboratorio l
       LEFT JOIN reserva r ON r.id_laboratorio = l.id_laboratorio AND r.data BETWEEN $1 AND $2
      WHERE l.ativo
      GROUP BY l.id_laboratorio ORDER BY l.nome`,
    [inicio, fim]
  );
  return rows.map((r) => ({
    ...r,
    horas_reservadas: Math.round(r.horas_reservadas * 10) / 10,
    horas_disponiveis: disponiveis,
    taxa_ocupacao: disponiveis ? Math.round((r.horas_reservadas / disponiveis) * 1000) / 10 : 0,
  }));
}

/** Mapa de calor da demanda: dia da semana x hora (reservas aprovadas e pendentes). */
async function demandaPorDiaHora(inicio, fim) {
  const p = await obterParametros();
  const hIni = Math.floor(paraMinutos(p.funcionamento.inicio) / 60);
  const hFim = Math.ceil(paraMinutos(p.funcionamento.fim) / 60);
  const { rows } = await db.query(
    `SELECT data, to_char(hora_inicio,'HH24:MI') AS hora_inicio, to_char(hora_fim,'HH24:MI') AS hora_fim
       FROM reserva WHERE status IN ('APROVADA','PENDENTE') AND data BETWEEN $1 AND $2`,
    [inicio, fim]
  );
  const grade = {};
  for (const dia of p.funcionamento.diasSemana) {
    grade[dia] = {};
    for (let h = hIni; h < hFim; h++) grade[dia][h] = 0;
  }
  for (const r of rows) {
    const dia = diaSemana(r.data);
    if (!grade[dia]) continue;
    const ini = paraMinutos(r.hora_inicio);
    const fimR = paraMinutos(r.hora_fim);
    for (let h = hIni; h < hFim; h++) {
      if (ini < (h + 1) * 60 && h * 60 < fimR) grade[dia][h]++;
    }
  }
  return { horas: Array.from({ length: hFim - hIni }, (_, i) => hIni + i), dias: p.funcionamento.diasSemana, grade };
}

async function resumo(inicio, fim) {
  const [status, eventos, aprovacao, disciplinas, proximas] = await Promise.all([
    db.query(
      `SELECT status, COUNT(*)::int AS total FROM reserva WHERE data BETWEEN $1 AND $2 GROUP BY status`,
      [inicio, fim]
    ),
    db.query(
      `SELECT acao, COUNT(*)::int AS total FROM historico
        WHERE acao IN ('BLOQUEADA_CONFLITO','REMANEJADA') AND data_hora::date BETWEEN $1 AND $2
        GROUP BY acao`,
      [inicio, fim]
    ),
    db.query(
      `SELECT ROUND(AVG(EXTRACT(EPOCH FROM (h.data_hora - r.criado_em)) / 3600)::numeric, 1)::float AS horas
         FROM historico h JOIN reserva r ON r.id_reserva = h.id_reserva
        WHERE h.acao IN ('APROVADA','REJEITADA') AND r.data BETWEEN $1 AND $2`,
      [inicio, fim]
    ),
    db.query(
      `SELECT d.nome, d.tipo,
              ROUND(SUM(EXTRACT(EPOCH FROM (r.hora_fim - r.hora_inicio)) / 3600)::numeric, 1)::float AS horas
         FROM reserva r JOIN disciplina d ON d.id_disciplina = r.id_disciplina
        WHERE r.status = 'APROVADA' AND r.data BETWEEN $1 AND $2
        GROUP BY d.id_disciplina ORDER BY horas DESC LIMIT 6`,
      [inicio, fim]
    ),
    db.query(`SELECT COUNT(*)::int AS total FROM reserva WHERE status = 'PENDENTE' AND data >= CURRENT_DATE`),
  ]);
  const porStatus = Object.fromEntries(['APROVADA', 'PENDENTE', 'REJEITADA', 'CANCELADA'].map((s) => [s, 0]));
  status.rows.forEach((r) => { porStatus[r.status] = r.total; });
  const ev = Object.fromEntries(eventos.rows.map((r) => [r.acao, r.total]));
  return {
    porStatus,
    totalReservas: Object.values(porStatus).reduce((a, b) => a + b, 0),
    pendentesAbertas: proximas.rows[0].total,
    conflitosEvitados: ev.BLOQUEADA_CONFLITO || 0,
    remanejamentos: ev.REMANEJADA || 0,
    tempoMedioDecisaoHoras: aprovacao.rows[0].horas,
    topDisciplinas: disciplinas.rows,
  };
}

module.exports = { ocupacaoPorLaboratorio, demandaPorDiaHora, resumo, diasUteis };
