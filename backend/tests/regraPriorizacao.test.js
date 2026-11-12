/* Testes unitários da RegraDePriorizacao (funções puras, sem banco). */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const r = require('../src/services/regraPriorizacao');

const P = r.PARAMETROS_PADRAO;
const HOJE = '2026-11-02'; // segunda-feira

describe('haSobreposicao', () => {
  test('intervalos que se cruzam se sobrepõem', () => {
    assert.equal(r.haSobreposicao(600, 700, 650, 750), true);
    assert.equal(r.haSobreposicao(600, 700, 610, 620), true);
  });
  test('intervalos adjacentes NÃO se sobrepõem (fim exclusivo)', () => {
    assert.equal(r.haSobreposicao(600, 700, 700, 800), false);
    assert.equal(r.haSobreposicao(700, 800, 600, 700), false);
  });
});

describe('verificarConflitos', () => {
  const existentes = [
    { id_reserva: 1, id_laboratorio: 1, data: '2026-11-04', hora_inicio: '08:00', hora_fim: '10:00', status: 'APROVADA' },
    { id_reserva: 2, id_laboratorio: 1, data: '2026-11-04', hora_inicio: '09:00', hora_fim: '11:00', status: 'REJEITADA' },
    { id_reserva: 3, id_laboratorio: 2, data: '2026-11-04', hora_inicio: '08:00', hora_fim: '10:00', status: 'APROVADA' },
    { id_reserva: 4, id_laboratorio: 1, data: '2026-11-05', hora_inicio: '08:00', hora_fim: '10:00', status: 'APROVADA' },
    { id_reserva: 5, id_laboratorio: 1, data: '2026-11-04', hora_inicio: '09:30', hora_fim: '10:30', status: 'PENDENTE' },
  ];
  const alvo = { id_laboratorio: 1, data: '2026-11-04', hora_inicio: '09:00', hora_fim: '10:00' };

  test('considera apenas mesmo laboratório, mesma data e status ativos', () => {
    const ids = r.verificarConflitos(alvo, existentes).map((c) => c.id_reserva);
    assert.deepEqual(ids.sort(), [1, 5]);
  });
  test('ignora a própria reserva em alterações', () => {
    const ids = r.verificarConflitos({ ...alvo, id_reserva: 1 }, existentes).map((c) => c.id_reserva);
    assert.deepEqual(ids, [5]);
  });
  test('filtra por status informado', () => {
    const ids = r.verificarConflitos(alvo, existentes, ['APROVADA']).map((c) => c.id_reserva);
    assert.deepEqual(ids, [1]);
  });
});

describe('validarRestricoesRigidas', () => {
  const lab = { capacidade: 30, ativo: true };
  const ok = { data: '2026-11-04', hora_inicio: '08:00', hora_fim: '10:00', qtd_alunos: 20 };

  test('solicitação válida não gera erros', () => {
    assert.deepEqual(r.validarRestricoesRigidas(ok, lab, P, HOJE), []);
  });
  test('capacidade do laboratório é restrição rígida', () => {
    const erros = r.validarRestricoesRigidas({ ...ok, qtd_alunos: 31 }, lab, P, HOJE);
    assert.match(erros[0], /excede a capacidade/);
  });
  test('fora do horário de funcionamento', () => {
    assert.ok(r.validarRestricoesRigidas({ ...ok, hora_inicio: '06:00' }, lab, P, HOJE).length);
    assert.ok(r.validarRestricoesRigidas({ ...ok, hora_fim: '23:30' }, lab, P, HOJE).length);
  });
  test('domingo não é dia de funcionamento', () => {
    const erros = r.validarRestricoesRigidas({ ...ok, data: '2026-11-08' }, lab, P, HOJE);
    assert.match(erros.join(), /dia da semana/);
  });
  test('datas passadas e laboratório inativo são recusados', () => {
    assert.ok(r.validarRestricoesRigidas({ ...ok, data: '2026-10-30' }, lab, P, HOJE).length);
    assert.ok(r.validarRestricoesRigidas(ok, { ...lab, ativo: false }, P, HOJE).length);
  });
  test('horário de término anterior ao início', () => {
    assert.ok(r.validarRestricoesRigidas({ ...ok, hora_fim: '07:00' }, lab, P, HOJE).length);
  });
});

describe('definirPrioridade', () => {
  const base = { data: '2026-11-04', qtd_alunos: 30, capacidade: 30, perfil: 'DOCENTE' };

  test('aula prática obrigatória tem prioridade sobre teórica e extracurricular', () => {
    const pr = r.definirPrioridade({ ...base, tipoDisciplina: 'PRATICA' }, P, HOJE).total;
    const te = r.definirPrioridade({ ...base, tipoDisciplina: 'TEORICA' }, P, HOJE).total;
    const ex = r.definirPrioridade({ ...base, tipoDisciplina: 'EXTRACURRICULAR' }, P, HOJE).total;
    assert.ok(pr > te && te > ex, `${pr} > ${te} > ${ex}`);
  });
  test('datas mais próximas recebem maior peso', () => {
    const perto = r.definirPrioridade({ ...base, tipoDisciplina: 'PRATICA' }, P, HOJE);
    const longe = r.definirPrioridade({ ...base, tipoDisciplina: 'PRATICA', data: '2026-12-20' }, P, HOJE);
    assert.ok(perto.total > longe.total);
    assert.equal(perto.detalhe.proximidade.dias, 2);
  });
  test('maior quantidade de alunos aumenta a prioridade', () => {
    const cheio = r.definirPrioridade({ ...base, qtd_alunos: 30 }, P, HOJE).total;
    const vazio = r.definirPrioridade({ ...base, qtd_alunos: 3 }, P, HOJE).total;
    assert.ok(cheio > vazio);
  });
  test('resultado sempre entre 0 e 100, com detalhamento', () => {
    const pesosAltos = { ...P, pesos: { ...P.pesos, natureza: { PRATICA: 100 } } };
    const p = r.definirPrioridade({ ...base, tipoDisciplina: 'PRATICA' }, pesosAltos, HOJE);
    assert.equal(p.total, 100);
    assert.deepEqual(Object.keys(p.detalhe), ['natureza', 'proximidade', 'ocupacao', 'perfil']);
  });
});

describe('decidirSolicitacao', () => {
  const aprovada = (prioridade) => ({ status: 'APROVADA', prioridade });
  test('bloqueia quando há aprovada de prioridade igual ou maior', () => {
    assert.equal(r.decidirSolicitacao({ prioridade: 50, perfil: 'DOCENTE', conflitos: [aprovada(50)] }, P).acao, 'BLOQUEAR');
  });
  test('encaminha para análise quando a aprovada tem prioridade menor', () => {
    assert.equal(r.decidirSolicitacao({ prioridade: 80, perfil: 'DOCENTE', conflitos: [aprovada(40)] }, P).acao, 'ANALISE');
  });
  test('funcionário administrativo sem conflitos tem aprovação automática', () => {
    assert.equal(r.decidirSolicitacao({ prioridade: 10, perfil: 'ADMINISTRATIVO', conflitos: [] }, P).acao, 'APROVAR');
  });
  test('coordenador fica pendente de aprovação manual', () => {
    assert.equal(r.decidirSolicitacao({ prioridade: 90, perfil: 'COORDENADOR', conflitos: [] }, P).acao, 'PENDENTE');
  });
  test('docentes ficam pendentes de aprovação', () => {
    assert.equal(r.decidirSolicitacao({ prioridade: 90, perfil: 'DOCENTE', conflitos: [] }, P).acao, 'PENDENTE');
  });
  test('gestor concorrendo com pendente não é aprovado automaticamente', () => {
    const d = r.decidirSolicitacao({ prioridade: 90, perfil: 'COORDENADOR', conflitos: [{ status: 'PENDENTE', prioridade: 10 }] }, P);
    assert.equal(d.acao, 'PENDENTE');
  });
});

describe('sugerirHorarios', () => {
  const laboratorios = [
    { id_laboratorio: 1, nome: 'Lab 1', capacidade: 40 },
    { id_laboratorio: 2, nome: 'Lab 2', capacidade: 20 },
    { id_laboratorio: 3, nome: 'Lab 3', capacidade: 40 },
  ];
  const ocupacoes = [
    { id_laboratorio: 1, data: '2026-11-04', hora_inicio: '08:00', hora_fim: '10:00' },
    { id_laboratorio: 3, data: '2026-11-04', hora_inicio: '07:00', hora_fim: '12:00' },
  ];
  const solicitacao = { id_laboratorio: 1, data: '2026-11-04', hora_inicio: '08:00', hora_fim: '10:00', qtd_alunos: 30 };
  const sug = r.sugerirHorarios({ solicitacao, laboratorios, ocupacoes, parametros: P, hojeISO: HOJE });

  test('nenhuma sugestão conflita com ocupações existentes', () => {
    for (const s of sug) {
      const conflita = ocupacoes.some((o) =>
        o.id_laboratorio === s.id_laboratorio && o.data === s.data &&
        r.haSobreposicao(...[s.hora_inicio, s.hora_fim, o.hora_inicio, o.hora_fim].map((h) => {
          const [a, b] = h.split(':').map(Number); return a * 60 + b;
        })));
      assert.equal(conflita, false, JSON.stringify(s));
    }
  });
  test('mantém a mesma duração da solicitação', () => {
    for (const s of sug) assert.equal(s.hora_fim.split(':')[0] - s.hora_inicio.split(':')[0], 2);
  });
  test('não sugere laboratório sem capacidade suficiente', () => {
    assert.ok(!sug.some((s) => s.id_laboratorio === 2));
  });
  test('a primeira sugestão é a mais próxima (mesmo laboratório, deslocamento mínimo)', () => {
    assert.equal(sug[0].tipo, 'MESMO_LABORATORIO');
    assert.equal(sug[0].hora_inicio, '10:00');
  });
  test('respeita o limite de sugestões e ordena por distância', () => {
    assert.ok(sug.length <= P.sugestoes.maximo);
    for (let i = 1; i < sug.length; i++) assert.ok(sug[i].distancia >= sug[i - 1].distancia);
  });
});

describe('gerarDatasRecorrentes', () => {
  test('gera apenas os dias da semana escolhidos dentro do período', () => {
    const datas = r.gerarDatasRecorrentes('2026-11-30', '2026-12-20', [2, 4], P); // terças e quintas
    assert.deepEqual(datas, ['2026-12-01', '2026-12-03', '2026-12-08', '2026-12-10', '2026-12-15', '2026-12-17']);
  });
  test('inclui as datas inicial e final quando coincidem com o dia escolhido', () => {
    assert.deepEqual(r.gerarDatasRecorrentes('2026-12-01', '2026-12-15', [2], P), ['2026-12-01', '2026-12-08', '2026-12-15']);
  });
  test('ignora dias em que os laboratórios não funcionam (domingo)', () => {
    assert.deepEqual(r.gerarDatasRecorrentes('2026-12-01', '2026-12-31', [0], P), []);
  });
});
