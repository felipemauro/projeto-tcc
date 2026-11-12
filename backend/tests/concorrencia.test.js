/*
 * Testes de concorrência (controle multiusuário – Seção 3.4 do TCC).
 * Simulam vários usuários tentando ocupar o MESMO laboratório e horário
 * ao mesmo tempo, verificando que nunca surgem reservas duplicadas.
 */
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { pool, resetarBanco, login, dataFutura, api } = require('./helpers');

const DATA = dataFutura(4, 4);
let coord, admin;

before(async () => {
  await resetarBanco();
  coord = api(await login('coord@t.br'));
  admin = api(await login('admin@t.br'));
});
after(() => pool.end());

async function aprovadasNoHorario(idLab, inicio, fim) {
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS n FROM reserva
      WHERE id_laboratorio = $1 AND data = $2 AND status = 'APROVADA'
        AND hora_inicio < $4 AND hora_fim > $3`,
    [idLab, DATA, inicio, fim]
  );
  return rows[0].n;
}

describe('Condição de corrida em solicitações simultâneas', () => {
  test('20 solicitações simultâneas para o mesmo horário → apenas 1 aprovada', async () => {
    const corpo = (i) => ({
      id_laboratorio: 1, id_disciplina: 1, data: DATA,
      hora_inicio: '08:00', hora_fim: i % 2 ? '09:40' : '10:00', qtd_alunos: 30,
    });
    const respostas = await Promise.all(
      Array.from({ length: 20 }, (_, i) => admin.post('/api/reservas', corpo(i)))
    );
    const criadas = respostas.filter((r) => r.status === 201);
    const conflitos = respostas.filter((r) => r.status === 409);
    const aprovadas = criadas.filter((r) => r.body.reserva.status === 'APROVADA');

    assert.equal(aprovadas.length, 1, 'somente uma reserva pode ser aprovada');
    assert.equal(criadas.length + conflitos.length, 20, 'nenhuma requisição deve falhar com erro interno');
    assert.equal(await aprovadasNoHorario(1, '08:00', '10:00'), 1);
  });
});

describe('Condição de corrida em aprovações simultâneas', () => {
  test('aprovações concorrentes de pendentes sobrepostas → apenas 1 aprovada', async () => {
    const ids = [];
    for (const [email, ini, fim] of [
      ['doc.a@t.br', '14:00', '15:40'], ['doc.b@t.br', '14:30', '16:00'], ['disc@t.br', '15:00', '16:30'],
    ]) {
      const u = api(await login(email));
      const r = await u.post('/api/reservas', {
        id_laboratorio: 2, id_disciplina: 1, data: DATA, hora_inicio: ini, hora_fim: fim, qtd_alunos: 20,
      });
      assert.equal(r.status, 201);
      ids.push(r.body.reserva.id_reserva);
    }
    const admin = api(await login('admin@t.br'));
    const respostas = await Promise.all(
      ids.flatMap((id) => [coord.post(`/api/reservas/${id}/aprovar`, {}), admin.post(`/api/reservas/${id}/aprovar`, {})])
    );
    const ok = respostas.filter((r) => r.status === 200);
    assert.equal(ok.length, 1, `esperada 1 aprovação, obtidas ${ok.length}`);
    assert.ok(respostas.every((r) => [200, 409].includes(r.status)));
    assert.equal(await aprovadasNoHorario(2, '14:00', '16:30'), 1);
  });
});

describe('Garantia no SGBD (restrição de exclusão)', () => {
  test('o PostgreSQL rejeita sobreposição de aprovadas mesmo sem a aplicação', async () => {
    await pool.query(
      `INSERT INTO reserva (id_usuario, id_laboratorio, data, hora_inicio, hora_fim, status)
       VALUES (1, 3, $1, '19:00', '20:00', 'APROVADA')`, [DATA]
    );
    await assert.rejects(
      pool.query(
        `INSERT INTO reserva (id_usuario, id_laboratorio, data, hora_inicio, hora_fim, status)
         VALUES (2, 3, $1, '19:30', '21:00', 'APROVADA')`, [DATA]
      ),
      (e) => e.code === '23P01'
    );
  });
  test('reservas adjacentes (fim = início) são permitidas', async () => {
    await pool.query(
      `INSERT INTO reserva (id_usuario, id_laboratorio, data, hora_inicio, hora_fim, status)
       VALUES (2, 3, $1, '20:00', '21:00', 'APROVADA')`, [DATA]
    );
  });
});
