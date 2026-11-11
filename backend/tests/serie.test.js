/* Testes de integração das reservas recorrentes (séries semanais). */
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { pool, resetarBanco, login, dataFutura, api } = require('./helpers');
const { somarDias } = require('../src/utils/tempo');

let admin, coord, docA, docB, disc;
const INICIO = dataFutura(2, 3);            // uma terça-feira daqui a ~3 semanas
const FIM = somarDias(INICIO, 27);          // 4 semanas
const base = {
  id_laboratorio: 1, id_disciplina: 1, data: INICIO, data_fim: FIM,
  dias_semana: [2, 4], hora_inicio: '19:00', hora_fim: '20:40', qtd_alunos: 30,
};

before(async () => {
  await resetarBanco();
  admin = api(await login('admin@t.br'));
  coord = api(await login('coord@t.br'));
  docA = api(await login('doc.a@t.br'));
  docB = api(await login('doc.b@t.br'));
  disc = api(await login('disc@t.br'));
});
after(() => pool.end());

describe('Reservas recorrentes', () => {
  test('prévia lista todas as datas e aponta a que tem conflito', async () => {
    // ocupa uma das quintas com reserva aprovada de prioridade alta
    const quinta = somarDias(INICIO, 9);
    const bloqueio = await coord.post('/api/reservas', {
      id_laboratorio: 1, id_disciplina: 1, data: quinta, hora_inicio: '19:00', hora_fim: '22:00', qtd_alunos: 40,
    });
    assert.equal(bloqueio.body.reserva.status, 'APROVADA');

    const r = await docA.post('/api/reservas/serie/verificar', base);
    assert.equal(r.status, 200);
    assert.equal(r.body.resumo.total, 8, '4 semanas x 2 dias');
    assert.equal(r.body.resumo.bloqueadas, 1);
    assert.equal(r.body.resumo.criaveis, 7);
    const bloqueada = r.body.ocorrencias.find((o) => o.situacao === 'BLOQUEAR');
    assert.equal(bloqueada.data, quinta);
    assert.ok(bloqueada.sugestao, 'data bloqueada traz uma sugestão de horário');
    const n = (await pool.query('SELECT COUNT(*)::int n FROM serie')).rows[0].n;
    assert.equal(n, 0, 'a prévia não grava nada');
  });

  let idSerie;
  test('cria a série com as datas disponíveis e informa as ignoradas', async () => {
    const r = await docA.post('/api/reservas/serie', base);
    assert.equal(r.status, 201);
    assert.equal(r.body.criadas, 7);
    assert.equal(r.body.pendentes, 7, 'docente aguarda aprovação');
    assert.equal(r.body.ignoradas.length, 1);
    idSerie = r.body.id_serie;
    const { rows } = await pool.query('SELECT COUNT(*)::int n FROM reserva WHERE id_serie = $1', [idSerie]);
    assert.equal(rows[0].n, 7);
    const lista = (await docA.get('/api/reservas?minhas=true')).body.filter((x) => x.id_serie === idSerie);
    assert.equal(lista[0].serie_total, 7);
    assert.deepEqual(lista[0].serie_dias, [2, 4]);
  });

  test('coordenação aprova a série inteira de uma vez', async () => {
    assert.equal((await docA.post(`/api/reservas/serie/${idSerie}/aprovar`, {})).status, 403);
    const r = await coord.post(`/api/reservas/serie/${idSerie}/aprovar`, {});
    assert.equal(r.status, 200);
    assert.equal(r.body.aprovadas, 7);
    const n = (await docA.get('/api/notificacoes')).body;
    assert.ok(n.some((x) => x.titulo === 'Reservas semanais aprovadas'));
  });

  test('outro docente não cancela a série; o dono cancela as próximas datas', async () => {
    assert.equal((await docB.delete(`/api/reservas/serie/${idSerie}`)).status, 403);
    const r = await docA.delete(`/api/reservas/serie/${idSerie}`);
    assert.equal(r.body.canceladas, 7);
  });

  test('administrativo cria série em nome de um docente, já aprovada', async () => {
    const idDocB = (await pool.query("SELECT id_usuario FROM usuario WHERE email = 'doc.b@t.br'")).rows[0].id_usuario;
    const r = await admin.post('/api/reservas/serie', { ...base, id_laboratorio: 2, qtd_alunos: 25, dias_semana: [3], id_usuario: idDocB });
    assert.equal(r.status, 201);
    assert.equal(r.body.criadas, 4);
    assert.equal(r.body.aprovadas, 4);
    assert.ok(r.body.reservas.every((x) => x.id_usuario === idDocB));
  });

  test('período sem datas disponíveis é recusado com o detalhamento', async () => {
    const r = await docB.post('/api/reservas/serie', { ...base, id_laboratorio: 2, qtd_alunos: 10, id_disciplina: 3, dias_semana: [3] });
    assert.equal(r.status, 409);
    assert.equal(r.body.resumo.bloqueadas, 4);
  });

  test('discente não pode criar reserva recorrente (apenas uma data por solicitação)', async () => {
    const corpo = { ...base, id_laboratorio: 3, qtd_alunos: 10, hora_inicio: '13:00', hora_fim: '14:00' };
    assert.equal((await disc.post('/api/reservas/serie/verificar', corpo)).status, 403);
    assert.equal((await disc.post('/api/reservas/serie', corpo)).status, 403);
    const unica = await disc.post('/api/reservas', { ...corpo, data_fim: undefined, dias_semana: undefined });
    assert.equal(unica.status, 201, 'reserva de uma única data continua permitida');
  });

  test('limites: data final anterior, dias sem funcionamento e período longo', async () => {
    assert.equal((await docA.post('/api/reservas/serie/verificar', { ...base, data_fim: somarDias(INICIO, -1) })).status, 400);
    assert.equal((await docA.post('/api/reservas/serie/verificar', { ...base, dias_semana: [0] })).status, 400);
    assert.equal((await docA.post('/api/reservas/serie/verificar', { ...base, data_fim: somarDias(INICIO, 400) })).status, 400);
  });
});
