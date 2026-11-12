/**
 * Reservas recorrentes (séries semanais).
 *
 * O solicitante informa horário, período (data inicial e final) e os dias da
 * semana em que leciona. Cada data gerada passa pelas MESMAS regras de uma
 * reserva comum (restrições rígidas, prioridade, conflitos e decisão).
 * Datas bloqueadas ou inválidas são ignoradas e informadas ao usuário; as
 * demais são gravadas numa única transação, vinculadas à série.
 */
const db = require('../db/pool');
const regra = require('./regraPriorizacao');
const { obterParametros } = require('./parametros');
const { registrarHistorico, notificar } = require('./auditoria');
const eventos = require('./eventos');
const reservas = require('./reservaService');
const { ErroApi, naoEncontrado, proibido } = require('../utils/erros');
const { hoje, diferencaDias } = require('../utils/tempo');

const {
  travarLaboratorios, resolverBeneficiario, avaliar, gravarReserva,
  resumoConflito, ehGestor, formatarData,
} = reservas.internos;

const LIMITE_DIAS = 200;       // aproximadamente um semestre letivo
const LIMITE_OCORRENCIAS = 120;

const NOMES_DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

// Perfis autorizados a criar reservas recorrentes (o discente solicita uma data por vez)
const PERFIS_SERIE = ['ADMINISTRATIVO', 'COORDENADOR', 'DOCENTE'];

function exigirPermissaoSerie(usuario) {
  if (!PERFIS_SERIE.includes(usuario.perfil)) {
    throw new ErroApi(403, 'Reservas recorrentes estão disponíveis apenas para docentes, coordenadores e funcionários administrativos. Discentes podem solicitar uma data por vez.');
  }
}

/** A série também não pode ser registrada em nome de um discente. */
function exigirBeneficiarioSerie(beneficiario) {
  if (!PERFIS_SERIE.includes(beneficiario.perfil)) {
    throw new ErroApi(403, 'Não é possível registrar reservas recorrentes para discentes. Para discentes, registre uma data por vez.');
  }
}

function gerarDatas(dados, parametros) {
  if (dados.data_fim < dados.data) throw new ErroApi(400, 'A data final deve ser igual ou posterior à data inicial.');
  if (diferencaDias(dados.data_fim, dados.data) > LIMITE_DIAS) {
    throw new ErroApi(400, `O período da repetição pode ter no máximo ${LIMITE_DIAS} dias.`);
  }
  const datas = regra.gerarDatasRecorrentes(dados.data, dados.data_fim, dados.dias_semana, parametros);
  if (datas.length === 0) {
    throw new ErroApi(400, 'Nenhuma data do período cai nos dias da semana escolhidos (ou os laboratórios não funcionam nesses dias).');
  }
  if (datas.length > LIMITE_OCORRENCIAS) {
    throw new ErroApi(400, `A repetição gera ${datas.length} datas; o máximo é ${LIMITE_OCORRENCIAS}.`);
  }
  return datas;
}

/** Classifica o resultado da avaliação de uma data. */
function situacao(av) {
  if (av.restricoes.length) return 'INVALIDA';
  return av.decisao.acao; // APROVAR | PENDENTE | ANALISE | BLOQUEAR
}

const resumoOcorrencia = (data, av) => ({
  data,
  dia_semana: NOMES_DIAS[new Date(`${data}T12:00:00`).getDay()],
  situacao: situacao(av),
  restricoes: av.restricoes,
  prioridade: av.prioridade.total,
  conflitos: av.conflitos.map(resumoConflito),
  sugestao: av.sugestoes[0] || null,
});

function resumir(ocorrencias) {
  const conta = (s) => ocorrencias.filter((o) => o.situacao === s).length;
  const criaveis = ocorrencias.filter((o) => !['BLOQUEAR', 'INVALIDA'].includes(o.situacao)).length;
  return {
    total: ocorrencias.length,
    criaveis,
    aprovadasAutomaticamente: conta('APROVAR'),
    pendentes: conta('PENDENTE') + conta('ANALISE'),
    bloqueadas: conta('BLOQUEAR'),
    invalidas: conta('INVALIDA'),
  };
}

/** Prévia da série: avalia todas as datas sem gravar nada. */
async function simularSerie(dados, usuario) {
  exigirPermissaoSerie(usuario);
  const parametros = await obterParametros();
  const datas = gerarDatas(dados, parametros);
  const { rows } = await db.query(
    'SELECT id_laboratorio, nome, capacidade, ativo FROM laboratorio WHERE id_laboratorio = $1',
    [dados.id_laboratorio]
  );
  const beneficiario = await resolverBeneficiario(db, dados.id_usuario, usuario);
  exigirBeneficiarioSerie(beneficiario);
  const ocorrencias = [];
  for (const data of datas) {
    const av = await avaliar(db, { ...dados, data }, beneficiario, parametros, rows[0], undefined, usuario);
    ocorrencias.push(resumoOcorrencia(data, av));
  }
  return { ocorrencias, resumo: resumir(ocorrencias) };
}

/** Cria a série e todas as reservas possíveis numa única transação. */
async function criarSerie(dados, usuario) {
  exigirPermissaoSerie(usuario);
  const parametros = await obterParametros();
  const datas = gerarDatas(dados, parametros);

  const resultado = await db.transacao(async (cliente) => {
    const labs = await travarLaboratorios(cliente, [dados.id_laboratorio]); // bloqueio pessimista
    const laboratorio = labs.get(Number(dados.id_laboratorio));
    if (!laboratorio) throw new ErroApi(400, 'Laboratório não encontrado.');
    const beneficiario = await resolverBeneficiario(cliente, dados.id_usuario, usuario);
    exigirBeneficiarioSerie(beneficiario);
    const emNomeDe = beneficiario.id !== usuario.id ? { id: beneficiario.id, nome: beneficiario.nome } : undefined;

    // Avalia todas as datas antes de gravar
    const avaliacoes = [];
    for (const data of datas) {
      const av = await avaliar(cliente, { ...dados, data }, beneficiario, parametros, laboratorio, undefined, usuario);
      avaliacoes.push({ data, av });
    }
    const viaveis = avaliacoes.filter(({ av }) => !['BLOQUEAR', 'INVALIDA'].includes(situacao(av)));
    if (viaveis.length === 0) {
      return { nenhuma: true, ocorrencias: avaliacoes.map(({ data, av }) => resumoOcorrencia(data, av)) };
    }

    const { rows } = await cliente.query(
      `INSERT INTO serie (id_usuario, id_criador, id_laboratorio, id_disciplina, data_inicio, data_fim,
                          dias_semana, hora_inicio, hora_fim)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id_serie`,
      [beneficiario.id, usuario.id, dados.id_laboratorio, dados.id_disciplina || null, dados.data,
        dados.data_fim, dados.dias_semana, dados.hora_inicio, dados.hora_fim]
    );
    const idSerie = rows[0].id_serie;

    const criadas = [];
    for (const { data, av } of viaveis) {
      criadas.push(await gravarReserva(cliente, {
        dados: { ...dados, data }, av, beneficiario, usuario, emNomeDe, idSerie,
      }));
    }
    const ignoradas = avaliacoes
      .filter(({ av }) => ['BLOQUEAR', 'INVALIDA'].includes(situacao(av)))
      .map(({ data, av }) => resumoOcorrencia(data, av));

    for (const { data, av } of avaliacoes.filter((x) => situacao(x.av) === 'BLOQUEAR')) {
      await registrarHistorico(cliente, {
        idUsuario: usuario.id,
        acao: 'BLOQUEADA_CONFLITO',
        detalhes: { solicitacao: av.alvo, prioridade: av.prioridade.total, conflitos: av.conflitos.map((c) => c.id_reserva), idSerie, data },
      });
    }
    await registrarHistorico(cliente, {
      idUsuario: usuario.id,
      acao: 'SERIE_CRIADA',
      detalhes: {
        idSerie, criadas: criadas.length, ignoradas: ignoradas.length,
        periodo: { inicio: dados.data, fim: dados.data_fim }, dias_semana: dados.dias_semana, emNomeDe,
      },
    });

    const aprovadas = criadas.filter((r) => r.status === 'APROVADA').length;
    if (emNomeDe) {
      await notificar(cliente, beneficiario.id, 'Reservas semanais registradas para você',
        `${usuario.nome} registrou ${criadas.length} reserva(s) semanais em seu nome no ${laboratorio.nome}, ` +
        `${dados.hora_inicio}–${dados.hora_fim}, de ${formatarData(dados.data)} a ${formatarData(dados.data_fim)}` +
        `${aprovadas === criadas.length ? ', já aprovadas' : ', aguardando aprovação'}.`);
    }
    return { idSerie, criadas, ignoradas, beneficiario };
  });

  if (resultado.nenhuma) {
    throw new ErroApi(409, 'Nenhuma data do período está disponível. Ajuste o horário, o laboratório ou o período.', {
      ocorrencias: resultado.ocorrencias,
      resumo: resumir(resultado.ocorrencias),
    });
  }

  eventos.emitir('reserva', { acao: 'serie_criada', id_serie: resultado.idSerie });
  if (resultado.beneficiario.id !== usuario.id) eventos.emitir('notificacao', {}, resultado.beneficiario.id);
  return {
    id_serie: resultado.idSerie,
    criadas: resultado.criadas.length,
    aprovadas: resultado.criadas.filter((r) => r.status === 'APROVADA').length,
    pendentes: resultado.criadas.filter((r) => r.status === 'PENDENTE').length,
    ignoradas: resultado.ignoradas,
    reservas: resultado.criadas,
  };
}

async function buscarSerie(cliente, idSerie) {
  const { rows } = await cliente.query(
    `SELECT s.*, l.nome AS laboratorio_nome FROM serie s
       JOIN laboratorio l ON l.id_laboratorio = s.id_laboratorio WHERE s.id_serie = $1`,
    [idSerie]
  );
  if (!rows[0]) throw naoEncontrado('Série');
  return rows[0];
}

/**
 * Aprova de uma vez todas as datas pendentes da série que não conflitam
 * com reservas já aprovadas. As que conflitam permanecem pendentes para
 * análise individual (aprovação com remanejamento).
 */
async function aprovarSerie(idSerie, usuario) {
  const resultado = await db.transacao(async (cliente) => {
    const serie = await buscarSerie(cliente, idSerie);
    await travarLaboratorios(cliente, [serie.id_laboratorio]);
    const { rows: pendentes } = await cliente.query(
      `SELECT id_reserva, id_laboratorio, data, to_char(hora_inicio,'HH24:MI') AS hora_inicio,
              to_char(hora_fim,'HH24:MI') AS hora_fim
         FROM reserva WHERE id_serie = $1 AND status = 'PENDENTE' ORDER BY data FOR UPDATE`,
      [idSerie]
    );
    const aprovadas = [];
    const mantidas = [];
    for (const r of pendentes) {
      const { rows: conflito } = await cliente.query(
        `SELECT 1 FROM reserva WHERE id_laboratorio = $1 AND data = $2 AND status = 'APROVADA'
            AND id_reserva <> $3 AND hora_inicio < $5 AND hora_fim > $4 LIMIT 1`,
        [r.id_laboratorio, r.data, r.id_reserva, r.hora_inicio, r.hora_fim]
      );
      if (conflito.length) { mantidas.push(r.data); continue; }
      await cliente.query(
        `UPDATE reserva SET status = 'APROVADA', versao = versao + 1, atualizado_em = NOW(),
                motivo_decisao = 'Aprovada junto com a série semanal.' WHERE id_reserva = $1`,
        [r.id_reserva]
      );
      await registrarHistorico(cliente, { idReserva: r.id_reserva, idUsuario: usuario.id, acao: 'APROVADA', detalhes: { idSerie } });
      aprovadas.push(r.data);
    }
    if (aprovadas.length) {
      await notificar(cliente, serie.id_usuario, 'Reservas semanais aprovadas',
        `${aprovadas.length} reserva(s) da sua série no ${serie.laboratorio_nome} foram aprovadas` +
        `${mantidas.length ? `; ${mantidas.length} continuam em análise por conflito de horário` : ''}.`);
    }
    return { serie, aprovadas, mantidas };
  });
  eventos.emitir('reserva', { acao: 'serie_aprovada', id_serie: idSerie });
  eventos.emitir('notificacao', {}, resultado.serie.id_usuario);
  return {
    aprovadas: resultado.aprovadas.length,
    mantidasPendentes: resultado.mantidas.map(formatarData),
  };
}

/** Cancela as próximas datas da série (a partir de hoje). */
async function cancelarSerie(idSerie, { motivo } = {}, usuario) {
  const resultado = await db.transacao(async (cliente) => {
    const serie = await buscarSerie(cliente, idSerie);
    if (!ehGestor(usuario) && serie.id_usuario !== usuario.id && serie.id_criador !== usuario.id) throw proibido();
    const { rows } = await cliente.query(
      `UPDATE reserva SET status = 'CANCELADA', versao = versao + 1, atualizado_em = NOW(),
              motivo_decisao = COALESCE($3, motivo_decisao)
        WHERE id_serie = $1 AND status IN ('PENDENTE','APROVADA') AND data >= $2
        RETURNING id_reserva`,
      [idSerie, hoje(), motivo || null]
    );
    for (const r of rows) {
      await registrarHistorico(cliente, { idReserva: r.id_reserva, idUsuario: usuario.id, acao: 'CANCELADA', detalhes: { idSerie, motivo: motivo || null } });
    }
    if (rows.length && serie.id_usuario !== usuario.id) {
      await notificar(cliente, serie.id_usuario, 'Reservas semanais canceladas',
        `${rows.length} reserva(s) da sua série no ${serie.laboratorio_nome} foram canceladas.${motivo ? ` Motivo: ${motivo}` : ''}`);
    }
    return { serie, canceladas: rows.length };
  });
  eventos.emitir('reserva', { acao: 'serie_cancelada', id_serie: idSerie });
  if (resultado.serie.id_usuario !== usuario.id) eventos.emitir('notificacao', {}, resultado.serie.id_usuario);
  return { canceladas: resultado.canceladas };
}

module.exports = { simularSerie, criarSerie, aprovarSerie, cancelarSerie, LIMITE_DIAS, LIMITE_OCORRENCIAS, PERFIS_SERIE };
