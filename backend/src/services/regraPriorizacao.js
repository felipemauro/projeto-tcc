// Regras de agendamento: conflitos, prioridade, decisão e sugestões de horário.
// Nada aqui acessa o banco, por isso dá para testar tudo isoladamente.
const {
  paraMinutos, paraHora, somarDias, diferencaDias, diaSemana,
} = require('../utils/tempo');

const PARAMETROS_PADRAO = Object.freeze({
  funcionamento: { inicio: '07:00', fim: '22:55', diasSemana: [1, 2, 3, 4, 5, 6] },
  pesos: {
    natureza: { PRATICA: 45, TEORICA: 25, EXTRACURRICULAR: 10, SEM_DISCIPLINA: 5 },
    proximidadeMax: 20,
    ocupacaoMax: 25,
    perfil: { ADMINISTRATIVO: 10, COORDENADOR: 10, DOCENTE: 10, DISCENTE: 0 },
  },
  // Só o administrativo é aprovado direto; o coordenador aprova os próprios pedidos na aba Solicitações.
  aprovacaoAutomatica: ['ADMINISTRATIVO'],
  sugestoes: { janelaDias: 7, passoMinutos: 50, maximo: 6 },
});

// 1. Verificação de conflitos (restrição rígida de não sobreposição)

/** Intervalos semiabertos [inicio, fim) se sobrepõem? */
function haSobreposicao(inicioA, fimA, inicioB, fimB) {
  return inicioA < fimB && inicioB < fimA;
}

/** Reservas que ocupam o mesmo laboratório no mesmo horário do pedido. */
function verificarConflitos(alvo, reservas, statusConsiderados = ['APROVADA', 'PENDENTE']) {
  const ini = paraMinutos(alvo.hora_inicio);
  const fim = paraMinutos(alvo.hora_fim);
  return reservas.filter(
    (r) =>
      r.id_reserva !== alvo.id_reserva &&
      Number(r.id_laboratorio) === Number(alvo.id_laboratorio) &&
      r.data === alvo.data &&
      statusConsiderados.includes(r.status) &&
      haSobreposicao(ini, fim, paraMinutos(r.hora_inicio), paraMinutos(r.hora_fim))
  );
}

/** Restrições rígidas que independem de outras reservas. */
function validarRestricoesRigidas({ data, hora_inicio, hora_fim, qtd_alunos }, laboratorio, parametros, hojeISO, agoraMin) {
  const p = parametros || PARAMETROS_PADRAO;
  const erros = [];
  const ini = paraMinutos(hora_inicio);
  const fim = paraMinutos(hora_fim);

  if (fim <= ini) erros.push('O horário de término deve ser posterior ao de início.');
  if (ini < paraMinutos(p.funcionamento.inicio) || fim > paraMinutos(p.funcionamento.fim)) {
    erros.push(`Horário fora do funcionamento dos laboratórios (${p.funcionamento.inicio} às ${p.funcionamento.fim}).`);
  }
  if (!p.funcionamento.diasSemana.includes(diaSemana(data))) {
    erros.push('Os laboratórios não funcionam no dia da semana selecionado.');
  }
  if (data < hojeISO || (data === hojeISO && agoraMin !== undefined && ini < agoraMin)) {
    erros.push('Não é possível reservar um horário que já passou.');
  }
  if (!laboratorio || laboratorio.ativo === false) {
    erros.push('Laboratório indisponível.');
  } else if (qtd_alunos > laboratorio.capacidade) {
    erros.push(`A quantidade de alunos (${qtd_alunos}) excede a capacidade do laboratório (${laboratorio.capacidade}).`);
  }
  return erros;
}

// 2. Priorização (restrições flexíveis)

/**
 * Calcula a prioridade (0 a 100) de uma solicitação, com a composição
 * detalhada de cada critério, para dar transparência à decisão.
 *
 * Critérios: natureza da disciplina (aula prática obrigatória),
 * proximidade da data de utilização, quantidade de alunos envolvidos e
 * perfil do solicitante.
 */
function definirPrioridade({ tipoDisciplina, data, qtd_alunos, capacidade, perfil }, parametros, hojeISO) {
  const pesos = (parametros || PARAMETROS_PADRAO).pesos;

  const chaveNatureza = tipoDisciplina || 'SEM_DISCIPLINA';
  const natureza = pesos.natureza[chaveNatureza] ?? 0;

  const dias = Math.max(0, diferencaDias(data, hojeISO));
  let fatorProx;
  if (dias <= 2) fatorProx = 1;
  else if (dias <= 7) fatorProx = 0.7;
  else if (dias <= 14) fatorProx = 0.4;
  else fatorProx = 0.15;
  const proximidade = Math.round(pesos.proximidadeMax * fatorProx);

  const taxa = capacidade > 0 ? Math.min(1, qtd_alunos / capacidade) : 0;
  const ocupacao = Math.round(pesos.ocupacaoMax * taxa);

  const perfilPeso = pesos.perfil[perfil] ?? 0;

  const total = Math.max(0, Math.min(100, natureza + proximidade + ocupacao + perfilPeso));
  return {
    total,
    detalhe: {
      natureza: { valor: natureza, criterio: chaveNatureza },
      proximidade: { valor: proximidade, dias },
      ocupacao: { valor: ocupacao, taxa: Math.round(taxa * 100) },
      perfil: { valor: perfilPeso, criterio: perfil },
    },
  };
}

/**
 * Decide o destino de uma solicitação a partir dos conflitos encontrados.
 *  - BLOQUEAR: existe reserva aprovada de prioridade igual ou maior;
 *  - ANALISE:  existe reserva aprovada, mas de prioridade menor - a
 *              solicitação é encaminhada para análise administrativa
 *              (possível remanejamento);
 *  - APROVAR:  sem conflitos com aprovadas e solicitante com aprovação automática;
 *  - PENDENTE: sem conflitos com aprovadas, aguarda aprovação.
 */
function decidirSolicitacao({ prioridade, perfil, conflitos }, parametros) {
  const p = parametros || PARAMETROS_PADRAO;
  const aprovadas = conflitos.filter((c) => c.status === 'APROVADA');
  const pendentes = conflitos.filter((c) => c.status === 'PENDENTE');

  if (aprovadas.length > 0) {
    const maiorPrioridade = Math.max(...aprovadas.map((c) => c.prioridade));
    if (maiorPrioridade >= prioridade) {
      return { acao: 'BLOQUEAR', aprovadas, pendentes };
    }
    return { acao: 'ANALISE', aprovadas, pendentes };
  }
  if (p.aprovacaoAutomatica.includes(perfil) && pendentes.length === 0) {
    return { acao: 'APROVAR', aprovadas, pendentes };
  }
  return { acao: 'PENDENTE', aprovadas, pendentes };
}

// 3. Sugestão automática de horários alternativos

/**
 * Busca horários livres próximos ao solicitado:
 *  a) mesmo laboratório e mesmo dia, deslocando o início em passos fixos;
 *  b) outros laboratórios com capacidade suficiente no mesmo horário;
 *  c) mesmo laboratório e horário em dias próximos (janela configurável).
 * Os candidatos são ordenados por "distância" da solicitação original.
 */
function sugerirHorarios({ solicitacao, laboratorios, ocupacoes, parametros, hojeISO, agoraMin }) {
  const p = parametros || PARAMETROS_PADRAO;
  const ini = paraMinutos(solicitacao.hora_inicio);
  const fim = paraMinutos(solicitacao.hora_fim);
  const duracao = fim - ini;
  const abre = paraMinutos(p.funcionamento.inicio);
  const fecha = paraMinutos(p.funcionamento.fim);
  const passo = p.sugestoes.passoMinutos;
  const qtd = solicitacao.qtd_alunos || 1;

  const livre = (idLab, data, i, f) =>
    !ocupacoes.some(
      (o) =>
        Number(o.id_laboratorio) === Number(idLab) &&
        o.data === data &&
        haSobreposicao(i, f, paraMinutos(o.hora_inicio), paraMinutos(o.hora_fim))
    );

  const dataValida = (data, i) =>
    p.funcionamento.diasSemana.includes(diaSemana(data)) &&
    (data > hojeISO || (data === hojeISO && (agoraMin === undefined || i >= agoraMin)));

  const labsPorId = new Map(laboratorios.map((l) => [Number(l.id_laboratorio), l]));
  const labOriginal = labsPorId.get(Number(solicitacao.id_laboratorio));
  const candidatos = [];
  const add = (lab, data, i, tipo, distancia) =>
    candidatos.push({
      id_laboratorio: lab.id_laboratorio,
      laboratorio: lab.nome,
      data,
      hora_inicio: paraHora(i),
      hora_fim: paraHora(i + duracao),
      tipo,
      distancia,
    });

  // a) mesmo laboratório, mesmo dia
  if (labOriginal) {
    for (let desloc = passo; desloc <= fecha - abre; desloc += passo) {
      for (const sinal of [1, -1]) {
        const i = ini + sinal * desloc;
        if (i < abre || i + duracao > fecha) continue;
        if (dataValida(solicitacao.data, i) && livre(labOriginal.id_laboratorio, solicitacao.data, i, i + duracao)) {
          // distância = horas de deslocamento (50 min ≈ 0,83)
          add(labOriginal, solicitacao.data, i, 'MESMO_LABORATORIO', desloc / 60 + (sinal < 0 ? 0.01 : 0));
        }
      }
    }
  }

  // b) outro laboratório, mesmo horário
  for (const lab of laboratorios) {
    if (Number(lab.id_laboratorio) === Number(solicitacao.id_laboratorio)) continue;
    if (lab.ativo === false || lab.capacidade < qtd) continue;
    if (dataValida(solicitacao.data, ini) && livre(lab.id_laboratorio, solicitacao.data, ini, fim)) {
      // folga de capacidade menor = melhor encaixe
      add(lab, solicitacao.data, ini, 'OUTRO_LABORATORIO', 1.5 + (lab.capacidade - qtd) / 100);
    }
  }

  // c) mesmo laboratório e horário, dias próximos
  if (labOriginal) {
    for (let d = 1; d <= p.sugestoes.janelaDias; d++) {
      for (const sinal of [1, -1]) {
        const data = somarDias(solicitacao.data, sinal * d);
        if (dataValida(data, ini) && livre(labOriginal.id_laboratorio, data, ini, fim)) {
          add(labOriginal, data, ini, 'OUTRO_DIA', d * 3 + (sinal < 0 ? 0.5 : 0));
        }
      }
    }
  }

  candidatos.sort((a, b) => a.distancia - b.distancia);
  return candidatos.slice(0, p.sugestoes.maximo);
}

// 4. Reservas recorrentes

/**
 * Gera as datas de uma série semanal: todas as datas entre `inicio` e `fim`
 * (inclusive) que caem nos dias da semana escolhidos e em que os
 * laboratórios funcionam. Dias da semana: 0 = domingo ... 6 = sábado.
 */
function gerarDatasRecorrentes(inicio, fim, diasSemana, parametros) {
  const funcionamento = (parametros || PARAMETROS_PADRAO).funcionamento.diasSemana;
  const escolhidos = new Set(diasSemana.map(Number));
  const datas = [];
  for (let d = inicio; d <= fim; d = somarDias(d, 1)) {
    const dia = diaSemana(d);
    if (escolhidos.has(dia) && funcionamento.includes(dia)) datas.push(d);
  }
  return datas;
}

module.exports = {
  PARAMETROS_PADRAO,
  gerarDatasRecorrentes,
  haSobreposicao,
  verificarConflitos,
  validarRestricoesRigidas,
  definirPrioridade,
  decidirSolicitacao,
  sugerirHorarios,
};
