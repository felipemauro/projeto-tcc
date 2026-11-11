/* Testes de integração da API REST com banco PostgreSQL real. */
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { app, pool, request, resetarBanco, login, dataFutura, api } = require('./helpers');

let admin, coord, docA, docB, disc;
const DATA = dataFutura(3, 3); // quarta-feira daqui a ~3 semanas

before(async () => {
  await resetarBanco();
  admin = api(await login('admin@t.br'));
  coord = api(await login('coord@t.br'));
  docA = api(await login('doc.a@t.br'));
  docB = api(await login('doc.b@t.br'));
  disc = api(await login('disc@t.br'));
});
after(() => pool.end());

describe('Autenticação e controle de acesso', () => {
  test('login com senha errada retorna 401', async () => {
    const r = await request(app).post('/api/auth/login').send({ email: 'admin@t.br', senha: 'x' });
    assert.equal(r.status, 401);
  });
  test('rotas protegidas exigem token', async () => {
    assert.equal((await request(app).get('/api/reservas')).status, 401);
  });
  test('/auth/me retorna o perfil do usuário', async () => {
    const r = await docA.get('/api/auth/me');
    assert.equal(r.body.perfil, 'DOCENTE');
  });
  test('docente não pode cadastrar laboratório (RBAC)', async () => {
    const r = await docA.post('/api/laboratorios', { nome: 'X', capacidade: 10, localizacao: 'Y' });
    assert.equal(r.status, 403);
  });
  test('discente não pode acessar dashboard nem aprovar', async () => {
    assert.equal((await disc.get('/api/dashboard')).status, 403);
    assert.equal((await disc.post('/api/reservas/1/aprovar', {})).status, 403);
  });
  test('administrativo gerencia laboratórios, disciplinas e usuários', async () => {
    const lab = await admin.post('/api/laboratorios', { nome: 'Lab Novo', capacidade: 15, localizacao: 'Bloco C' });
    assert.equal(lab.status, 201);
    const dis = await admin.post('/api/disciplinas', { nome: 'Redes', curso: 'Eng', periodo: 6, tipo: 'PRATICA' });
    assert.equal(dis.status, 201);
    const usu = await admin.post('/api/usuarios', { nome: 'Novo Prof', email: 'novo@t.br', perfil: 'DOCENTE', senha: 'abcdef' });
    assert.equal(usu.status, 201);
    assert.equal(usu.body.senha, undefined, 'hash da senha não deve ser exposto');
  });
  test('validação de dados retorna 400 com campos', async () => {
    const r = await docA.post('/api/reservas', { id_laboratorio: 1, data: 'amanhã' });
    assert.equal(r.status, 400);
    assert.ok(r.body.campos.length > 0);
  });
});

describe('Solicitação de reservas e regras inteligentes', () => {
  test('docente solicita horário livre → PENDENTE com prioridade calculada', async () => {
    const r = await docA.post('/api/reservas', {
      id_laboratorio: 1, id_disciplina: 1, data: DATA, hora_inicio: '07:30', hora_fim: '09:10', qtd_alunos: 35,
    });
    assert.equal(r.status, 201);
    assert.equal(r.body.reserva.status, 'PENDENTE');
    assert.ok(r.body.prioridade.total > 50);
    assert.equal(r.body.prioridade.detalhe.natureza.criterio, 'PRATICA');
  });

  test('coordenador sem conflitos tem aprovação automática', async () => {
    const r = await coord.post('/api/reservas', {
      id_laboratorio: 2, id_disciplina: 1, data: DATA, hora_inicio: '13:00', hora_fim: '15:00', qtd_alunos: 30,
    });
    assert.equal(r.status, 201);
    assert.equal(r.body.reserva.status, 'APROVADA');
  });

  test('conflito com aprovada de prioridade maior → bloqueia (409) e sugere horários', async () => {
    const r = await docB.post('/api/reservas', {
      id_laboratorio: 2, id_disciplina: 3, data: DATA, hora_inicio: '14:00', hora_fim: '15:00', qtd_alunos: 10,
    });
    assert.equal(r.status, 409);
    assert.equal(r.body.conflitos.length, 1);
    assert.ok(r.body.sugestoes.length > 0, 'deve sugerir horários alternativos');
    const { rows } = await pool.query("SELECT COUNT(*)::int AS n FROM historico WHERE acao = 'BLOQUEADA_CONFLITO'");
    assert.equal(rows[0].n, 1, 'tentativa bloqueada deve ficar registrada');
  });

  test('verificação prévia informa decisão sem gravar', async () => {
    const antes = (await pool.query('SELECT COUNT(*)::int n FROM reserva')).rows[0].n;
    const r = await docB.post('/api/reservas/verificar', {
      id_laboratorio: 2, id_disciplina: 3, data: DATA, hora_inicio: '14:00', hora_fim: '15:00', qtd_alunos: 10,
    });
    assert.equal(r.body.decisao, 'BLOQUEAR');
    assert.equal((await pool.query('SELECT COUNT(*)::int n FROM reserva')).rows[0].n, antes);
  });

  test('capacidade excedida é restrição rígida (422)', async () => {
    const r = await docA.post('/api/reservas', {
      id_laboratorio: 3, data: DATA, hora_inicio: '10:00', hora_fim: '11:00', qtd_alunos: 21,
    });
    assert.equal(r.status, 422);
    assert.match(r.body.erro, /capacidade/);
  });

  test('fora do horário de funcionamento é recusado', async () => {
    const r = await docA.post('/api/reservas', {
      id_laboratorio: 3, data: DATA, hora_inicio: '06:00', hora_fim: '07:30', qtd_alunos: 5,
    });
    assert.equal(r.status, 422);
  });
});

describe('Aprovação, remanejamento e controle de concorrência otimista', () => {
  let baixa, alta;

  test('prioridade maior que a aprovada → encaminhada para análise', async () => {
    // Reserva aprovada de baixa prioridade (extracurricular, poucos alunos)
    baixa = (await coord.post('/api/reservas', {
      id_laboratorio: 3, id_disciplina: 3, data: DATA, hora_inicio: '19:00', hora_fim: '20:40', qtd_alunos: 4,
    })).body.reserva;
    assert.equal(baixa.status, 'APROVADA');

    const r = await docA.post('/api/reservas', {
      id_laboratorio: 3, id_disciplina: 1, data: DATA, hora_inicio: '19:00', hora_fim: '20:40', qtd_alunos: 20,
    });
    assert.equal(r.status, 201);
    assert.equal(r.body.decisao, 'ANALISE');
    alta = r.body.reserva;
  });

  test('aprovar sobre aprovada exige confirmação de remanejamento', async () => {
    const r = await coord.post(`/api/reservas/${alta.id_reserva}/aprovar`, { versao: alta.versao });
    assert.equal(r.status, 409);
    assert.equal(r.body.codigo, 'CONFLITO_APROVADA');
  });

  test('versão desatualizada é recusada (bloqueio otimista)', async () => {
    const r = await coord.post(`/api/reservas/${alta.id_reserva}/aprovar`, { versao: alta.versao + 5, forcar: true });
    assert.equal(r.status, 409);
    assert.equal(r.body.codigo, 'VERSAO_DESATUALIZADA');
  });

  test('gerência manual: aprovar com remanejamento rejeita a anterior e notifica', async () => {
    const r = await coord.post(`/api/reservas/${alta.id_reserva}/aprovar`, {
      versao: alta.versao, forcar: true, motivo: 'Aula prática obrigatória',
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.status, 'APROVADA');
    const antiga = (await coord.get(`/api/reservas/${baixa.id_reserva}`)).body;
    assert.equal(antiga.status, 'REJEITADA');
    assert.match(antiga.motivo_decisao, /Remanejada/);
    const { rows } = await pool.query("SELECT * FROM notificacao WHERE titulo = 'Reserva remanejada'");
    assert.equal(rows.length, 1);
  });

  test('rejeição exige motivo e notifica o solicitante', async () => {
    const p = (await docB.post('/api/reservas', {
      id_laboratorio: 1, id_disciplina: 2, data: DATA, hora_inicio: '15:00', hora_fim: '16:00', qtd_alunos: 10,
    })).body.reserva;
    assert.equal((await coord.post(`/api/reservas/${p.id_reserva}/rejeitar`, {})).status, 400);
    const r = await coord.post(`/api/reservas/${p.id_reserva}/rejeitar`, { motivo: 'Laboratório em manutenção' });
    assert.equal(r.body.status, 'REJEITADA');
    const n = (await docB.get('/api/notificacoes')).body;
    assert.ok(n.some((x) => x.titulo === 'Reserva rejeitada'));
  });
});

describe('Agendamento em nome de outra pessoa', () => {
  test('administrativo registra reserva em nome de um docente', async () => {
    const idDocB = (await pool.query("SELECT id_usuario FROM usuario WHERE email = 'doc.b@t.br'")).rows[0].id_usuario;
    const idAdmin = (await pool.query("SELECT id_usuario FROM usuario WHERE email = 'admin@t.br'")).rows[0].id_usuario;
    const verif = await admin.post('/api/reservas/verificar', {
      id_laboratorio: 3, id_disciplina: 1, data: DATA, hora_inicio: '07:30', hora_fim: '09:10', qtd_alunos: 15, id_usuario: idDocB,
    });
    assert.equal(verif.body.prioridade.detalhe.perfil.criterio, 'DOCENTE', 'prioridade usa o perfil de quem usará o laboratório');
    const r = await admin.post('/api/reservas', {
      id_laboratorio: 3, id_disciplina: 1, data: DATA, hora_inicio: '07:30', hora_fim: '09:10', qtd_alunos: 15, id_usuario: idDocB,
    });
    assert.equal(r.status, 201);
    assert.equal(r.body.reserva.id_usuario, idDocB);
    assert.equal(r.body.reserva.id_criador, idAdmin);
    assert.equal(r.body.reserva.criador_nome, 'Admin');
    assert.equal(r.body.reserva.status, 'APROVADA', 'aprovação automática pelo perfil de quem registra');
    const minhas = (await docB.get('/api/reservas?minhas=true')).body;
    assert.ok(minhas.some((x) => x.id_reserva === r.body.reserva.id_reserva), 'aparece em Minhas reservas do docente');
    const notif = (await docB.get('/api/notificacoes')).body;
    assert.ok(notif.some((n) => n.titulo === 'Reserva registrada para você'));
  });

  test('outros perfis não podem agendar em nome de terceiros', async () => {
    const idDocB = (await pool.query("SELECT id_usuario FROM usuario WHERE email = 'doc.b@t.br'")).rows[0].id_usuario;
    for (const u of [docA, coord]) {
      const r = await u.post('/api/reservas', {
        id_laboratorio: 3, data: DATA, hora_inicio: '16:00', hora_fim: '17:00', qtd_alunos: 5, id_usuario: idDocB,
      });
      assert.equal(r.status, 403);
    }
  });

  test('usuário inexistente é recusado', async () => {
    const r = await admin.post('/api/reservas', {
      id_laboratorio: 3, data: DATA, hora_inicio: '16:00', hora_fim: '17:00', qtd_alunos: 5, id_usuario: 9999,
    });
    assert.equal(r.status, 400);
  });
});

describe('Alteração e cancelamento', () => {
  let minha;
  before(async () => {
    minha = (await docB.post('/api/reservas', {
      id_laboratorio: 1, id_disciplina: 2, data: DATA, hora_inicio: '17:00', hora_fim: '18:00', qtd_alunos: 10,
    })).body.reserva;
  });

  test('outro docente não pode alterar a reserva', async () => {
    const r = await docA.patch(`/api/reservas/${minha.id_reserva}`, { hora_fim: '18:30', versao: minha.versao });
    assert.equal(r.status, 403);
  });

  test('o próprio solicitante altera reserva pendente e a versão é incrementada', async () => {
    const r = await docB.patch(`/api/reservas/${minha.id_reserva}`, { hora_fim: '18:30', versao: minha.versao });
    assert.equal(r.status, 200);
    assert.equal(r.body.hora_fim, '18:30');
    assert.equal(r.body.versao, minha.versao + 1);
    minha = r.body;
  });

  test('gestor não consegue mover reserva para horário de outra aprovada', async () => {
    const r = await coord.patch(`/api/reservas/${minha.id_reserva}`, {
      id_laboratorio: 2, hora_inicio: '13:30', hora_fim: '14:30', versao: minha.versao,
    });
    assert.equal(r.status, 409);
    assert.ok(Array.isArray(r.body.sugestoes));
  });

  test('cancelamento é remoção lógica registrada no histórico', async () => {
    const r = await docB.delete(`/api/reservas/${minha.id_reserva}`);
    assert.equal(r.body.status, 'CANCELADA');
    const h = (await coord.get(`/api/historico?id_reserva=${minha.id_reserva}`)).body.map((x) => x.acao);
    assert.deepEqual(h.sort(), ['ALTERADA', 'CANCELADA', 'SOLICITADA']);
  });
});

describe('Dashboard e relatórios', () => {
  test('dashboard retorna indicadores de ocupação e demanda', async () => {
    // conflitos/remanejamentos são contados pela data em que ocorreram (hoje)
    const hojeISO = require('../src/utils/tempo').hoje();
    const r = await coord.get(`/api/dashboard?inicio=${hojeISO}&fim=${DATA}`);
    assert.equal(r.status, 200);
    assert.ok(r.body.resumo.porStatus.APROVADA >= 2);
    assert.equal(r.body.resumo.conflitosEvitados, 1);
    assert.equal(r.body.resumo.remanejamentos, 1);
    const lab2 = r.body.ocupacao.find((l) => l.nome === 'Lab 2');
    assert.equal(lab2.horas_reservadas, 2);
  });

  test('relatório em CSV para Excel', async () => {
    const r = await coord.get(`/api/relatorios?tipo=reservas&inicio=${DATA}&fim=${DATA}&formato=csv`);
    assert.equal(r.status, 200);
    assert.match(r.headers['content-type'], /text\/csv/);
    assert.match(r.text, /Laboratório;Solicitante/);
  });

  test('cada relatório gerado é registrado', async () => {
    const r = await coord.get('/api/relatorios/gerados');
    assert.ok(r.body.length >= 1);
  });

  test('parâmetros da regra de priorização podem ser ajustados pelo administrativo', async () => {
    const atual = (await admin.get('/api/parametros')).body;
    atual.pesos.natureza.TEORICA = 30;
    const r = await admin.put('/api/parametros', atual);
    assert.equal(r.status, 200);
    assert.equal((await docA.get('/api/parametros')).body.pesos.natureza.TEORICA, 30);
    assert.equal((await coord.put('/api/parametros', atual)).status, 403);
  });
});
