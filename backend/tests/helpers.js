// Ambiente de teste: banco separado e limites relaxados
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgres://sal:sal@localhost:5432/sal_test';
process.env.LOGIN_RATE_LIMIT = '10000';

const request = require('supertest');
const app = require('../src/app');
const { pool } = require('../src/db/pool');
const { migrar } = require('../db/migrate');
const { hoje, somarDias, diaSemana } = require('../src/utils/tempo');

async function resetarBanco() {
  await migrar({ reset: true, silencioso: true });
  const bcrypt = require('bcryptjs');
  const senha = await bcrypt.hash('123456', 4);
  await pool.query(
    `INSERT INTO usuario (nome, email, senha, perfil) VALUES
      ('Admin', 'admin@t.br', $1, 'ADMINISTRATIVO'),
      ('Coord', 'coord@t.br', $1, 'COORDENADOR'),
      ('Docente A', 'doc.a@t.br', $1, 'DOCENTE'),
      ('Docente B', 'doc.b@t.br', $1, 'DOCENTE'),
      ('Discente', 'disc@t.br', $1, 'DISCENTE')`,
    [senha]
  );
  await pool.query(
    `INSERT INTO laboratorio (nome, capacidade, localizacao) VALUES
      ('Lab 1', 40, 'Bloco A'), ('Lab 2', 30, 'Bloco A'), ('Lab 3', 20, 'Bloco B')`
  );
  await pool.query(
    `INSERT INTO disciplina (nome, curso, periodo, tipo) VALUES
      ('Algoritmos', 'Eng. Comp.', 2, 'PRATICA'),
      ('Cálculo', 'Eng. Comp.', 1, 'TEORICA'),
      ('Minicurso', 'Extra', 0, 'EXTRACURRICULAR')`
  );
}

const tokens = {};
async function login(email) {
  if (!tokens[email]) {
    const res = await request(app).post('/api/auth/login').send({ email, senha: '123456' });
    tokens[email] = res.body.token;
  }
  return tokens[email];
}

/** Próxima data com o dia da semana desejado, a partir de N semanas no futuro. */
function dataFutura(dia = 3, semanas = 3) {
  let d = somarDias(hoje(), semanas * 7);
  while (diaSemana(d) !== dia) d = somarDias(d, 1);
  return d;
}

function api(token) {
  const auth = (r) => r.set('Authorization', `Bearer ${token}`);
  return {
    get: (u) => auth(request(app).get(u)),
    post: (u, b) => auth(request(app).post(u)).send(b),
    patch: (u, b) => auth(request(app).patch(u)).send(b),
    put: (u, b) => auth(request(app).put(u)).send(b),
    delete: (u) => auth(request(app).delete(u)),
  };
}

module.exports = { app, pool, request, resetarBanco, login, dataFutura, api };
