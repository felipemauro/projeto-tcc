// Reservas e controle de concorrência.
//
// Para evitar reserva duplicada com vários usuários ao mesmo tempo:
// - cada operação trava a linha do laboratório (SELECT ... FOR UPDATE)
//   dentro da transação, então pedidos para o mesmo laboratório entram em fila;
// - aprovar/alterar exige a "versao" que o usuário viu; se mudou, recusa (409);
// - no banco, a restrição EXCLUDE impede aprovadas sobrepostas de qualquer jeito.

const db = require('../db/pool');
const regra = require('./regraPriorizacao');
const { obterParametros } = require('./parametros');
const { registrarHistorico, notificar } = require('./auditoria');
const eventos = require('./eventos');
const { ErroApi, naoEncontrado, proibido } = require('../utils/erros');
const { hhmm, hoje, agoraMinutos, somarDias } = require('../utils/tempo');
const { GESTORES } = require('../middlewares/auth');

const SELECT_RESERVA = `
  SELECT r.id_reserva, r.id_usuario, r.id_laboratorio, r.id_disciplina, r.data,
         to_char(r.hora_inicio, 'HH24:MI') AS hora_inicio,
         to_char(r.hora_fim, 'HH24:MI')    AS hora_fim,
         r.status, r.prioridade, r.detalhe_prioridade, r.qtd_alunos, r.finalidade,
         r.motivo_decisao, r.versao, r.criado_em, r.atualizado_em,
         u.nome AS usuario_nome, u.perfil AS usuario_perfil,
         r.id_criador, c.nome AS criador_nome,
         r.id_serie, s.dias_semana AS serie_dias, s.data_inicio AS serie_inicio, s.data_fim AS serie_fim,
         (SELECT COUNT(*)::int FROM reserva x WHERE x.id_serie = r.id_serie) AS serie_total,
         l.nome AS laboratorio_nome, l.capacidade AS laboratorio_capacidade,
         d.nome AS disciplina_nome, d.tipo AS disciplina_tipo, d.curso AS disciplina_curso
    FROM reserva r
    JOIN usuario u      ON u.id_usuario = r.id_usuario
    LEFT JOIN usuario c ON c.id_usuario = r.id_criador
    LEFT JOIN serie s   ON s.id_serie = r.id_serie
    JOIN laboratorio l  ON l.id_laboratorio = r.id_laboratorio
    LEFT JOIN disciplina d ON d.id_disciplina = r.id_disciplina`;

const formatarData = (iso) => iso.split('-').reverse().join('/');
const descrever = (r) =>
  `${r.laboratorio_nome || 'Laboratório'} em ${formatarData(r.data)}, ${r.hora_inicio}–${r.hora_fim}`;
const ehGestor = (usuario) => GESTORES.includes(usuario.perfil);

async function buscarReserva(cliente, id, travar = false) {
  const sql = `${SELECT_RESERVA} WHERE r.id_reserva = $1${travar ? ' FOR UPDATE OF r' : ''}`;
  const { rows } = await cliente.query(sql, [id]);
  if (!rows[0]) throw naoEncontrado('Reserva');
  return rows[0];
}

async function travarLaboratorios(cliente, ids) {
  const unicos = [...new Set(ids.map(Number))].sort((a, b) => a - b); // ordem fixa evita deadlock
  const { rows } = await cliente.query(
    `SELECT id_laboratorio, nome, capacidade, ativo FROM laboratorio
      WHERE id_laboratorio = ANY($1::int[]) ORDER BY id_laboratorio FOR UPDATE`,
    [unicos]
  );
  return new Map(rows.map((l) => [l.id_laboratorio, l]));
}

async function reservasDoDia(cliente, idLaboratorio, data) {
  const { rows } = await cliente.query(
    `${SELECT_RESERVA}
      WHERE r.id_laboratorio = $1 AND r.data = $2 AND r.status IN ('APROVADA','PENDENTE')`,
    [idLaboratorio, data]
  );
  return rows;
}

async function tipoDisciplina(cliente, idDisciplina) {
  if (!idDisciplina) return null;
  const { rows } = await cliente.query(
    'SELECT tipo FROM disciplina WHERE id_disciplina = $1 AND ativo', [idDisciplina]
  );
  if (!rows[0]) throw new ErroApi(400, 'Disciplina não encontrada ou inativa.');
  return rows[0].tipo;
}

/** Gera sugestões de horários livres próximos à solicitação. */
async function calcularSugestoes(cliente, solicitacao, parametros) {
  const janela = parametros.sugestoes.janelaDias;
  const [labs, ocup] = await Promise.all([
    cliente.query('SELECT id_laboratorio, nome, capacidade, ativo FROM laboratorio WHERE ativo ORDER BY nome'),
    cliente.query(
      `SELECT id_laboratorio, data, to_char(hora_inicio,'HH24:MI') AS hora_inicio,
              to_char(hora_fim,'HH24:MI') AS hora_fim
         FROM reserva
        WHERE status = 'APROVADA' AND data BETWEEN $1 AND $2`,
      [somarDias(solicitacao.data, -janela), somarDias(solicitacao.data, janela)]
    ),
  ]);
  return regra.sugerirHorarios({
    solicitacao,
    laboratorios: labs.rows,
    ocupacoes: ocup.rows,
    parametros,
    hojeISO: hoje(),
    agoraMin: agoraMinutos(),
  });
}

/**
 * Avalia uma solicitação: restrições rígidas, prioridade, conflitos,
 * decisão e (se necessário) sugestões. Não grava nada.
 */
async function avaliar(cliente, dados, usuario, parametros, laboratorio, idIgnorar, executor = usuario) {
  const alvo = {
    id_reserva: idIgnorar,
    id_laboratorio: dados.id_laboratorio,
    data: dados.data,
    hora_inicio: hhmm(dados.hora_inicio),
    hora_fim: hhmm(dados.hora_fim),
    qtd_alunos: dados.qtd_alunos,
  };
  const restricoes = regra.validarRestricoesRigidas(alvo, laboratorio, parametros, hoje(), agoraMinutos());
  const tipo = await tipoDisciplina(cliente, dados.id_disciplina);
  const prioridade = regra.definirPrioridade(
    {
      tipoDisciplina: tipo,
      data: alvo.data,
      qtd_alunos: alvo.qtd_alunos,
      capacidade: laboratorio?.capacidade ?? 0,
      perfil: usuario.perfil,
    },
    parametros,
    hoje()
  );
  const existentes = restricoes.length ? [] : await reservasDoDia(cliente, alvo.id_laboratorio, alvo.data);
  const conflitos = regra.verificarConflitos(alvo, existentes);
  const decisao = regra.decidirSolicitacao(
    // A prioridade considera o perfil de quem usará o laboratório; a aprovação
    // automática considera o perfil de quem está registrando a reserva.
    { prioridade: prioridade.total, perfil: executor.perfil, conflitos }, parametros
  );
  const precisaSugestao = restricoes.length === 0 && conflitos.length > 0;
  const sugestoes = precisaSugestao ? await calcularSugestoes(cliente, alvo, parametros) : [];
  return { alvo, restricoes, prioridade, conflitos, decisao, sugestoes };
}

const resumoConflito = (c) => ({
  id_reserva: c.id_reserva,
  status: c.status,
  prioridade: c.prioridade,
  hora_inicio: c.hora_inicio,
  hora_fim: c.hora_fim,
  usuario_nome: c.usuario_nome,
  disciplina_nome: c.disciplina_nome,
});

/**
 * Define para quem a reserva será registrada. Somente o Funcionário
 * Administrativo pode agendar em nome de outra pessoa.
 */
async function resolverBeneficiario(cliente, idUsuario, usuario) {
  if (!idUsuario || Number(idUsuario) === usuario.id) return usuario;
  if (usuario.perfil !== 'ADMINISTRATIVO') {
    throw new ErroApi(403, 'Apenas o funcionário administrativo pode agendar em nome de outra pessoa.');
  }
  const { rows } = await cliente.query(
    'SELECT id_usuario AS id, nome, perfil FROM usuario WHERE id_usuario = $1 AND ativo', [idUsuario]
  );
  if (!rows[0]) throw new ErroApi(400, 'Usuário selecionado não encontrado ou inativo.');
  return rows[0];
}

// Operações públicas

/** Verificação prévia de disponibilidade (sem gravar) - usada pela tela de nova reserva. */
async function simular(dados, usuario) {
  const parametros = await obterParametros();
  const { rows } = await db.query(
    'SELECT id_laboratorio, nome, capacidade, ativo FROM laboratorio WHERE id_laboratorio = $1',
    [dados.id_laboratorio]
  );
  const beneficiario = await resolverBeneficiario(db, dados.id_usuario, usuario);
  const r = await avaliar(db, dados, beneficiario, parametros, rows[0], dados.id_reserva, usuario);
  return {
    restricoes: r.restricoes,
    prioridade: r.prioridade,
    decisao: r.restricoes.length ? 'INVALIDA' : r.decisao.acao,
    conflitos: r.conflitos.map(resumoConflito),
    sugestoes: r.sugestoes,
  };
}

/** Grava uma reserva já avaliada (status conforme a decisão) e registra no histórico. */
async function gravarReserva(cliente, { dados, av, beneficiario, usuario, emNomeDe, idSerie = null }) {
  const status = av.decisao.acao === 'APROVAR' ? 'APROVADA' : 'PENDENTE';
  const { rows } = await cliente.query(
    `INSERT INTO reserva (id_usuario, id_laboratorio, id_disciplina, data, hora_inicio, hora_fim,
                          status, prioridade, detalhe_prioridade, qtd_alunos, finalidade, motivo_decisao,
                          id_criador, id_serie)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id_reserva`,
    [
      beneficiario.id, dados.id_laboratorio, dados.id_disciplina || null, av.alvo.data,
      av.alvo.hora_inicio, av.alvo.hora_fim, status, av.prioridade.total, av.prioridade.detalhe,
      dados.qtd_alunos, dados.finalidade || null,
      status === 'APROVADA' ? 'Aprovação automática: sem conflitos e solicitante com permissão de gestão.' : null,
      usuario.id, idSerie,
    ]
  );
  const id = rows[0].id_reserva;
  await registrarHistorico(cliente, {
    idReserva: id,
    idUsuario: usuario.id,
    acao: status === 'APROVADA' ? 'CRIADA_APROVADA' : 'SOLICITADA',
    detalhes: {
      prioridade: av.prioridade.total, decisao: av.decisao.acao,
      conflitos: av.conflitos.map((c) => c.id_reserva), emNomeDe, idSerie: idSerie || undefined,
    },
  });
  return buscarReserva(cliente, id);
}

/** Solicita uma reserva: avalia, grava e notifica. */
async function solicitar(dados, usuario) {
  const parametros = await obterParametros();

  const resultado = await db.transacao(async (cliente) => {
    const labs = await travarLaboratorios(cliente, [dados.id_laboratorio]); // bloqueio pessimista
    const laboratorio = labs.get(Number(dados.id_laboratorio));
    const beneficiario = await resolverBeneficiario(cliente, dados.id_usuario, usuario);
    const emNomeDe = beneficiario.id !== usuario.id ? { id: beneficiario.id, nome: beneficiario.nome } : undefined;
    const av = await avaliar(cliente, dados, beneficiario, parametros, laboratorio, undefined, usuario);

    if (av.restricoes.length) {
      throw new ErroApi(422, av.restricoes[0], { restricoes: av.restricoes });
    }

    if (av.decisao.acao === 'BLOQUEAR') {
      await registrarHistorico(cliente, {
        idUsuario: usuario.id,
        acao: 'BLOQUEADA_CONFLITO',
        detalhes: { solicitacao: av.alvo, prioridade: av.prioridade.total, conflitos: av.conflitos.map((c) => c.id_reserva), emNomeDe },
      });
      return { bloqueada: true, av };
    }

    const reserva = await gravarReserva(cliente, { dados, av, beneficiario, usuario, emNomeDe });
    const { status } = reserva;
    if (emNomeDe) {
      await notificar(cliente, beneficiario.id,
        status === 'APROVADA' ? 'Reserva registrada para você' : 'Solicitação registrada para você',
        `${usuario.nome} registrou uma reserva em seu nome no ${descrever(reserva)}${status === 'APROVADA' ? ', já aprovada' : ', aguardando aprovação'}.`);
    }
    return { bloqueada: false, av, reserva, beneficiario };
  });

  if (resultado.bloqueada) {
    const { av } = resultado;
    throw new ErroApi(409, 'Horário indisponível: já existe reserva aprovada com prioridade igual ou superior.', {
      prioridade: av.prioridade,
      conflitos: av.conflitos.map(resumoConflito),
      sugestoes: av.sugestoes,
    });
  }

  eventos.emitir('reserva', { acao: 'criada', id_reserva: resultado.reserva.id_reserva });
  if (resultado.beneficiario.id !== usuario.id) eventos.emitir('notificacao', {}, resultado.beneficiario.id);
  return {
    reserva: resultado.reserva,
    decisao: resultado.av.decisao.acao,
    prioridade: resultado.av.prioridade,
    conflitos: resultado.av.conflitos.map(resumoConflito),
    sugestoes: resultado.av.sugestoes,
  };
}

function conferirVersao(reserva, versaoInformada) {
  if (versaoInformada !== undefined && Number(versaoInformada) !== reserva.versao) {
    throw new ErroApi(409, 'Esta reserva foi modificada por outro usuário. Atualize a página e tente novamente.', {
      codigo: 'VERSAO_DESATUALIZADA',
      versaoAtual: reserva.versao,
    });
  }
}

/**
 * Aprovar reserva (Coordenador/Funcionário Administrativo).
 * Com `forcar = true`, aplica a gerência manual: reservas aprovadas
 * conflitantes são remanejadas (rejeitadas com aviso e sugestões).
 */
async function aprovar(id, { versao, forcar = false, motivo }, usuario) {
  const parametros = await obterParametros();
  const afetados = [];

  const reserva = await db.transacao(async (cliente) => {
    const previa = await buscarReserva(cliente, id);
    await travarLaboratorios(cliente, [previa.id_laboratorio]);
    const atual = await buscarReserva(cliente, id, true);
    conferirVersao(atual, versao);
    if (atual.status !== 'PENDENTE') {
      throw new ErroApi(409, `Apenas reservas pendentes podem ser aprovadas (status atual: ${atual.status}).`);
    }

    const existentes = await reservasDoDia(cliente, atual.id_laboratorio, atual.data);
    const aprovadas = regra.verificarConflitos(atual, existentes, ['APROVADA']);

    if (aprovadas.length && !forcar) {
      throw new ErroApi(409, 'Existe reserva aprovada no mesmo horário. Confirme o remanejamento para prosseguir.', {
        codigo: 'CONFLITO_APROVADA',
        conflitos: aprovadas.map(resumoConflito),
      });
    }

    for (const c of aprovadas) {
      await cliente.query(
        `UPDATE reserva SET status = 'REJEITADA', versao = versao + 1, atualizado_em = NOW(),
                motivo_decisao = $2 WHERE id_reserva = $1`,
        [c.id_reserva, `Remanejada pela gestão em favor da reserva #${atual.id_reserva}. ${motivo || ''}`.trim()]
      );
      const sugestoes = await calcularSugestoes(cliente, c, parametros);
      const textoSug = sugestoes.length
        ? ` Horários alternativos disponíveis: ${sugestoes.slice(0, 3).map((s) => `${s.laboratorio} ${formatarData(s.data)} ${s.hora_inicio}–${s.hora_fim}`).join('; ')}.`
        : '';
      await notificar(cliente, c.id_usuario, 'Reserva remanejada',
        `Sua reserva no ${descrever(c)} foi remanejada pela gestão para atender uma demanda prioritária.${textoSug}`);
      await registrarHistorico(cliente, {
        idReserva: c.id_reserva, idUsuario: usuario.id, acao: 'REMANEJADA',
        detalhes: { emFavorDe: atual.id_reserva, motivo: motivo || null },
      });
      afetados.push(c.id_usuario);
    }

    await cliente.query(
      `UPDATE reserva SET status = 'APROVADA', versao = versao + 1, atualizado_em = NOW(),
              motivo_decisao = $2 WHERE id_reserva = $1`,
      [id, motivo || null]
    );
    await registrarHistorico(cliente, {
      idReserva: id, idUsuario: usuario.id, acao: 'APROVADA',
      detalhes: { forcada: aprovadas.length > 0, remanejadas: aprovadas.map((c) => c.id_reserva) },
    });
    await notificar(cliente, atual.id_usuario, 'Reserva aprovada', `Sua reserva no ${descrever(atual)} foi aprovada.`);
    return buscarReserva(cliente, id);
  });

  eventos.emitir('reserva', { acao: 'aprovada', id_reserva: reserva.id_reserva });
  for (const u of [reserva.id_usuario, ...afetados]) eventos.emitir('notificacao', {}, u);
  return reserva;
}

async function rejeitar(id, { versao, motivo }, usuario) {
  const reserva = await db.transacao(async (cliente) => {
    const atual = await buscarReserva(cliente, id, true);
    conferirVersao(atual, versao);
    if (atual.status !== 'PENDENTE') {
      throw new ErroApi(409, `Apenas reservas pendentes podem ser rejeitadas (status atual: ${atual.status}).`);
    }
    await cliente.query(
      `UPDATE reserva SET status = 'REJEITADA', versao = versao + 1, atualizado_em = NOW(),
              motivo_decisao = $2 WHERE id_reserva = $1`,
      [id, motivo]
    );
    await registrarHistorico(cliente, { idReserva: id, idUsuario: usuario.id, acao: 'REJEITADA', detalhes: { motivo } });
    await notificar(cliente, atual.id_usuario, 'Reserva rejeitada',
      `Sua solicitação para o ${descrever(atual)} foi rejeitada. Motivo: ${motivo}`);
    return buscarReserva(cliente, id);
  });
  eventos.emitir('reserva', { acao: 'rejeitada', id_reserva: id });
  eventos.emitir('notificacao', {}, reserva.id_usuario);
  return reserva;
}

/**
 * Alterar reserva. Gestores podem alterar qualquer reserva ativa; o
 * solicitante pode alterar apenas as próprias reservas pendentes.
 */
async function alterar(id, dados, usuario) {
  const parametros = await obterParametros();

  const reserva = await db.transacao(async (cliente) => {
    const previa = await buscarReserva(cliente, id);
    const novoLab = dados.id_laboratorio ?? previa.id_laboratorio;
    const labs = await travarLaboratorios(cliente, [previa.id_laboratorio, novoLab]);
    const atual = await buscarReserva(cliente, id, true);
    conferirVersao(atual, dados.versao);

    const gestor = ehGestor(usuario);
    if (!gestor && (atual.id_usuario !== usuario.id || atual.status !== 'PENDENTE')) {
      throw new ErroApi(403, 'Você só pode alterar suas próprias reservas enquanto estiverem pendentes.');
    }
    if (!['PENDENTE', 'APROVADA'].includes(atual.status)) {
      throw new ErroApi(409, 'Reservas rejeitadas ou canceladas não podem ser alteradas.');
    }

    const novo = {
      id_laboratorio: novoLab,
      id_disciplina: dados.id_disciplina !== undefined ? dados.id_disciplina : atual.id_disciplina,
      data: dados.data ?? atual.data,
      hora_inicio: dados.hora_inicio ?? atual.hora_inicio,
      hora_fim: dados.hora_fim ?? atual.hora_fim,
      qtd_alunos: dados.qtd_alunos ?? atual.qtd_alunos,
      finalidade: dados.finalidade !== undefined ? dados.finalidade : atual.finalidade,
    };
    // A prioridade é recalculada com o perfil de quem solicitou originalmente.
    const solicitante = { id: atual.id_usuario, perfil: atual.usuario_perfil };
    const av = await avaliar(cliente, novo, solicitante, parametros, labs.get(Number(novoLab)), atual.id_reserva);

    if (av.restricoes.length) throw new ErroApi(422, av.restricoes[0], { restricoes: av.restricoes });
    const aprovadas = av.conflitos.filter((c) => c.status === 'APROVADA');
    if (aprovadas.length) {
      throw new ErroApi(409, 'O novo horário conflita com uma reserva aprovada.', {
        conflitos: av.conflitos.map(resumoConflito),
        sugestoes: av.sugestoes,
      });
    }

    await cliente.query(
      `UPDATE reserva SET id_laboratorio=$2, id_disciplina=$3, data=$4, hora_inicio=$5, hora_fim=$6,
              qtd_alunos=$7, finalidade=$8, prioridade=$9, detalhe_prioridade=$10,
              versao = versao + 1, atualizado_em = NOW()
        WHERE id_reserva = $1`,
      [id, novo.id_laboratorio, novo.id_disciplina || null, av.alvo.data, av.alvo.hora_inicio,
        av.alvo.hora_fim, novo.qtd_alunos, novo.finalidade, av.prioridade.total, av.prioridade.detalhe]
    );
    await registrarHistorico(cliente, {
      idReserva: id, idUsuario: usuario.id, acao: 'ALTERADA',
      detalhes: {
        antes: { id_laboratorio: atual.id_laboratorio, data: atual.data, hora_inicio: atual.hora_inicio, hora_fim: atual.hora_fim },
        depois: { id_laboratorio: novo.id_laboratorio, data: av.alvo.data, hora_inicio: av.alvo.hora_inicio, hora_fim: av.alvo.hora_fim },
        motivo: dados.motivo || null,
      },
    });
    if (atual.id_usuario !== usuario.id) {
      await notificar(cliente, atual.id_usuario, 'Reserva alterada pela gestão',
        `Sua reserva foi alterada para ${labs.get(Number(novoLab)).nome} em ${formatarData(av.alvo.data)}, ${av.alvo.hora_inicio}–${av.alvo.hora_fim}.${dados.motivo ? ` Motivo: ${dados.motivo}` : ''}`);
    }
    return buscarReserva(cliente, id);
  });

  eventos.emitir('reserva', { acao: 'alterada', id_reserva: id });
  eventos.emitir('notificacao', {}, reserva.id_usuario);
  return reserva;
}

async function cancelar(id, { motivo } = {}, usuario) {
  const reserva = await db.transacao(async (cliente) => {
    const atual = await buscarReserva(cliente, id, true);
    if (!ehGestor(usuario) && atual.id_usuario !== usuario.id) throw proibido();
    if (!['PENDENTE', 'APROVADA'].includes(atual.status)) {
      throw new ErroApi(409, 'Esta reserva já foi encerrada.');
    }
    await cliente.query(
      `UPDATE reserva SET status = 'CANCELADA', versao = versao + 1, atualizado_em = NOW(),
              motivo_decisao = COALESCE($2, motivo_decisao) WHERE id_reserva = $1`,
      [id, motivo || null]
    );
    await registrarHistorico(cliente, { idReserva: id, idUsuario: usuario.id, acao: 'CANCELADA', detalhes: { motivo: motivo || null } });
    if (atual.id_usuario !== usuario.id) {
      await notificar(cliente, atual.id_usuario, 'Reserva cancelada pela gestão',
        `Sua reserva no ${descrever(atual)} foi cancelada.${motivo ? ` Motivo: ${motivo}` : ''}`);
    }
    return buscarReserva(cliente, id);
  });
  eventos.emitir('reserva', { acao: 'cancelada', id_reserva: id });
  return reserva;
}

/** Listagem com filtros. Discentes e docentes veem a agenda geral (sem dados sensíveis). */
async function listar(filtros, usuario) {
  const cond = [];
  const params = [];
  const p = (v) => { params.push(v); return `$${params.length}`; };

  if (filtros.minhas) cond.push(`r.id_usuario = ${p(usuario.id)}`);
  if (filtros.id_laboratorio) cond.push(`r.id_laboratorio = ${p(filtros.id_laboratorio)}`);
  if (filtros.status) cond.push(`r.status = ANY(${p(String(filtros.status).split(','))}::text[])`);
  if (filtros.inicio) cond.push(`r.data >= ${p(filtros.inicio)}`);
  if (filtros.fim) cond.push(`r.data <= ${p(filtros.fim)}`);
  if (filtros.id_usuario && ehGestor(usuario)) cond.push(`r.id_usuario = ${p(filtros.id_usuario)}`);

  const where = cond.length ? `WHERE ${cond.join(' AND ')}` : '';
  const ordem = filtros.ordem === 'prioridade'
    ? 'r.prioridade DESC, r.data, r.hora_inicio'
    : 'r.data, r.hora_inicio';
  const limite = Math.min(Number(filtros.limite) || 500, 2000);
  const { rows } = await db.query(`${SELECT_RESERVA} ${where} ORDER BY ${ordem} LIMIT ${limite}`, params);

  // Marca conflitos entre pendentes e aprovadas (alerta visual de conflito)
  if (filtros.comConflitos) {
    for (const r of rows.filter((x) => x.status === 'PENDENTE')) {
      const doDia = await reservasDoDia(db, r.id_laboratorio, r.data);
      r.conflitos = regra.verificarConflitos(r, doDia).map(resumoConflito);
    }
  }
  return rows;
}

async function obter(id, usuario) {
  const r = await buscarReserva(db, id);
  if (!ehGestor(usuario) && r.id_usuario !== usuario.id && r.status !== 'APROVADA') throw proibido();
  return r;
}

module.exports = {
  simular, solicitar, aprovar, rejeitar, alterar, cancelar, listar, obter,
  // usados pelo serviço de séries (reservas recorrentes)
  internos: {
    travarLaboratorios, resolverBeneficiario, avaliar, gravarReserva, buscarReserva,
    reservasDoDia, resumoConflito, descrever, ehGestor, formatarData,
  },
};
