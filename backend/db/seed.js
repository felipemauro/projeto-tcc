/*
 * Dados de DEMONSTRAÇÃO (fictícios) para apresentação e testes do protótipo.
 * Não representam a ocupação real dos laboratórios da UEMG Divinópolis.
 * Senha de todos os usuários: 123456
 */
const bcrypt = require('bcryptjs');
const { pool } = require('../src/db/pool');
const { definirPrioridade, PARAMETROS_PADRAO } = require('../src/services/regraPriorizacao');
const { hoje, somarDias, diaSemana } = require('../src/utils/tempo');

const USUARIOS = [
  ['Secretaria Acadêmica', 'admin@uemg.br', 'ADMINISTRATIVO'],
  ['Coordenação Eng. Computação', 'coordenacao@uemg.br', 'COORDENADOR'],
  ['Prof. Ana Ribeiro', 'ana.ribeiro@uemg.br', 'DOCENTE'],
  ['Prof. Carlos Mendes', 'carlos.mendes@uemg.br', 'DOCENTE'],
  ['Prof. Juliana Costa', 'juliana.costa@uemg.br', 'DOCENTE'],
  ['Lucas Almeida (monitor)', 'lucas.almeida@discente.uemg.br', 'DISCENTE'],
];

const LABORATORIOS = [
  ['Laboratório de Informática 1', 40, 'Bloco A – Sala 101', '40 computadores, projetor, Windows/Linux, IDEs de programação'],
  ['Laboratório de Informática 2', 30, 'Bloco A – Sala 102', '30 computadores, projetor, pacote de simulação de circuitos'],
  ['Laboratório de Informática 3', 25, 'Bloco B – Sala 205', '25 computadores, ferramentas de CAD e modelagem'],
  ['Laboratório de Redes', 20, 'Bloco B – Sala 210', 'Bancada com switches e roteadores, 20 estações'],
];

const DISCIPLINAS = [
  ['Algoritmos e Estruturas de Dados I', 'Engenharia da Computação', 2, 'PRATICA'],
  ['Programação Orientada a Objetos', 'Engenharia da Computação', 3, 'PRATICA'],
  ['Banco de Dados', 'Engenharia da Computação', 5, 'PRATICA'],
  ['Redes de Computadores', 'Engenharia da Computação', 6, 'PRATICA'],
  ['Engenharia de Software', 'Engenharia da Computação', 5, 'TEORICA'],
  ['Cálculo Numérico', 'Engenharia da Computação', 4, 'TEORICA'],
  ['Minicurso de Desenvolvimento de Jogos', 'Atividade Extracurricular', 0, 'EXTRACURRICULAR'],
];

// [usuarioIdx, labIdx, disciplinaIdx|null, deslocamentoDias, inicio, fim, alunos, status]
const AGENDA_SEMANAL = [
  [2, 0, 0, 0, '07:30', '09:10', 35, 'APROVADA'],
  [3, 1, 1, 0, '09:20', '11:00', 28, 'APROVADA'],
  [4, 2, 2, 1, '13:00', '14:40', 22, 'APROVADA'],
  [3, 3, 3, 1, '19:00', '20:40', 18, 'APROVADA'],
  [2, 0, 1, 2, '19:00', '22:30', 38, 'APROVADA'],
  [4, 1, 4, 2, '07:30', '09:10', 25, 'APROVADA'],
  [5, 2, 6, 3, '14:00', '17:00', 15, 'APROVADA'],
  [2, 0, 0, 3, '07:30', '09:10', 35, 'APROVADA'],
  [3, 1, 5, 4, '19:00', '20:40', 20, 'APROVADA'],
];

async function seed() {
  const senha = await bcrypt.hash('123456', 10);
  await pool.query('TRUNCATE notificacao, historico, relatorio, reserva, disciplina, laboratorio, usuario RESTART IDENTITY CASCADE');

  const usuarios = [];
  for (const [nome, email, perfil] of USUARIOS) {
    const { rows } = await pool.query(
      'INSERT INTO usuario (nome, email, senha, perfil) VALUES ($1,$2,$3,$4) RETURNING id_usuario, perfil',
      [nome, email, senha, perfil]
    );
    usuarios.push(rows[0]);
  }
  const labs = [];
  for (const [nome, capacidade, localizacao, descricao] of LABORATORIOS) {
    const { rows } = await pool.query(
      'INSERT INTO laboratorio (nome, capacidade, localizacao, descricao) VALUES ($1,$2,$3,$4) RETURNING *',
      [nome, capacidade, localizacao, descricao]
    );
    labs.push(rows[0]);
  }
  const discs = [];
  for (const [nome, curso, periodo, tipo] of DISCIPLINAS) {
    const { rows } = await pool.query(
      'INSERT INTO disciplina (nome, curso, periodo, tipo) VALUES ($1,$2,$3,$4) RETURNING *',
      [nome, curso, periodo, tipo]
    );
    discs.push(rows[0]);
  }

  // Segunda-feira da semana atual
  let segunda = hoje();
  while (diaSemana(segunda) !== 1) segunda = somarDias(segunda, -1);

  const inserir = async (u, l, d, data, inicio, fim, alunos, status, base) => {
    const p = definirPrioridade(
      { tipoDisciplina: d?.tipo, data, qtd_alunos: alunos, capacidade: l.capacidade, perfil: u.perfil },
      PARAMETROS_PADRAO, base
    );
    const { rows } = await pool.query(
      `INSERT INTO reserva (id_usuario, id_laboratorio, id_disciplina, data, hora_inicio, hora_fim, status,
                            prioridade, detalhe_prioridade, qtd_alunos, finalidade, criado_em)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, LEAST(($4::date - 3) + time '10:00', NOW() - interval '2 hours'))
       RETURNING id_reserva`,
      [u.id_usuario, l.id_laboratorio, d?.id_disciplina || null, data, inicio, fim, status, p.total, p.detalhe,
        alunos, d ? `Aula de ${d.nome}` : 'Reunião']
    );
    const id = rows[0].id_reserva;
    await pool.query(
      `INSERT INTO historico (id_reserva, id_usuario, acao, data_hora) VALUES ($1,$2,'SOLICITADA', LEAST(($3::date - 3) + time '10:00', NOW() - interval '2 hours'))`,
      [id, u.id_usuario, data]
    );
    if (status === 'APROVADA') {
      await pool.query(
        `INSERT INTO historico (id_reserva, id_usuario, acao, data_hora) VALUES ($1,$2,'APROVADA', ($3::date - 2) + time '15:30')`,
        [id, usuarios[1].id_usuario, data]
      );
    }
    return id;
  };

  // Agenda recorrente: 4 semanas anteriores (histórico) + semana atual + próxima
  for (let semana = -4; semana <= 1; semana++) {
    for (const [ui, li, di, desl, ini, fim, alunos, status] of AGENDA_SEMANAL) {
      const data = somarDias(segunda, semana * 7 + desl);
      await inserir(usuarios[ui], labs[li], di === null ? null : discs[di], data, ini, fim, alunos, status, somarDias(data, -5));
    }
  }

  // Solicitações pendentes na próxima semana (incluindo concorrência pelo mesmo horário)
  const prox = somarDias(segunda, 7);
  await inserir(usuarios[4], labs[0], discs[2], somarDias(prox, 3), '13:00', '14:40', 30, 'PENDENTE', hoje());
  await inserir(usuarios[5], labs[0], discs[6], somarDias(prox, 3), '13:30', '15:00', 12, 'PENDENTE', hoje());
  await inserir(usuarios[3], labs[2], discs[5], somarDias(prox, 4), '09:20', '11:00', 20, 'PENDENTE', hoje());
  await inserir(usuarios[2], labs[3], discs[3], somarDias(prox, 0), '13:00', '14:40', 18, 'PENDENTE', hoje());

  // Algumas tentativas bloqueadas no histórico (para os indicadores)
  for (let i = 1; i <= 3; i++) {
    await pool.query(
      `INSERT INTO historico (id_usuario, acao, detalhes, data_hora)
       VALUES ($1, 'BLOQUEADA_CONFLITO', $2, NOW() - ($3 || ' days')::interval)`,
      [usuarios[2 + (i % 3)].id_usuario,
        { solicitacao: { id_laboratorio: labs[0].id_laboratorio, data: somarDias(segunda, -7 * i), hora_inicio: '07:30', hora_fim: '09:10' } },
        String(i * 6)]
    );
  }

  await pool.query(
    `INSERT INTO notificacao (id_usuario, titulo, mensagem) VALUES ($1, 'Bem-vindo(a)', $2)`,
    [usuarios[2].id_usuario, 'Este é o Sistema de Agendamento de Laboratórios da UEMG Divinópolis.']
  );

  console.log('Dados de demonstração inseridos. Usuários (senha 123456):');
  USUARIOS.forEach(([, email, perfil]) => console.log(`  ${perfil.padEnd(15)} ${email}`));
}

if (require.main === module) {
  seed().then(() => pool.end()).catch((e) => { console.error(e); process.exit(1); });
}

module.exports = { seed };
