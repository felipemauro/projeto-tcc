/*
 * Dados de DEMONSTRAÇÃO (fictícios) para apresentação e testes do protótipo.
 * Não representam a ocupação real dos laboratórios da UEMG Divinópolis.
 * Cada usuário possui senha própria (ver lista USUARIOS).
 */
const bcrypt = require('bcryptjs');
const { pool } = require('../src/db/pool');
const { definirPrioridade, PARAMETROS_PADRAO } = require('../src/services/regraPriorizacao');
const { hoje, somarDias, diaSemana } = require('../src/utils/tempo');
const { DISCIPLINAS_PPC } = require('./disciplinas-ppc');

// [nome, e-mail, perfil, senha]
const USUARIOS = [
  ['Aguinaldo', 'aguinaldo.admin@funcionario.uemg.br', 'ADMINISTRATIVO', '123456@ag'],
  ['Willyan', 'willyan.coord@coordenacao.uemg.br', 'COORDENADOR', '123456@wi'],
  ['Prof. Marcos', 'marcos.doc@docente.uemg.br', 'DOCENTE', '123456@ma'],
  ['Felipe Mauro da Silva', 'felipe.1657023@discente.uemg.br', 'DISCENTE', '123456@fe'],
];
const COORD = 1, DOCENTE = 2, DISCENTE = 3;

const LABORATORIOS = [
  ['Laboratório de Informática 1', 40, 'Bloco A – Sala 101', '40 computadores, projetor, Windows/Linux, IDEs de programação'],
  ['Laboratório de Informática 2', 30, 'Bloco A – Sala 102', '30 computadores, projetor, pacote de simulação de circuitos'],
  ['Laboratório de Informática 3', 25, 'Bloco B – Sala 205', '25 computadores, ferramentas de CAD e modelagem'],
  ['Laboratório de Redes', 20, 'Bloco B – Sala 210', 'Bancada com switches e roteadores, 20 estações'],
];

// Disciplinas do PPC de Engenharia de Computação + uma atividade extracurricular de exemplo
const DISCIPLINAS = [
  ...DISCIPLINAS_PPC,
  ['Minicurso de Desenvolvimento de Jogos', 'Atividade Extracurricular', 0, 'EXTRACURRICULAR'],
];

// Disciplinas usadas nas reservas de demonstração (índices referenciados em AGENDA_SEMANAL)
const DISCIPLINAS_AGENDA = [
  'Algoritmos e Estruturas de Dados I',
  'Programação Orientada a Objetos I',
  'Banco de Dados',
  'Redes de Computadores',
  'Engenharia de Software I',
  'Métodos Numéricos Computacionais',
  'Minicurso de Desenvolvimento de Jogos',
];

// [usuarioIdx, labIdx, disciplinaIdx|null, deslocamentoDias, inicio, fim, alunos, status]
const AGENDA_SEMANAL = [
  [DOCENTE, 0, 0, 0, '07:30', '09:10', 35, 'APROVADA'],
  [DOCENTE, 1, 1, 0, '09:20', '11:00', 28, 'APROVADA'],
  [DOCENTE, 2, 2, 1, '13:00', '14:40', 22, 'APROVADA'],
  [DOCENTE, 3, 3, 1, '19:00', '20:40', 18, 'APROVADA'],
  [DOCENTE, 0, 1, 2, '19:00', '22:30', 38, 'APROVADA'],
  [DOCENTE, 1, 4, 2, '07:30', '09:10', 25, 'APROVADA'],
  [DISCENTE, 2, 6, 3, '14:00', '17:00', 15, 'APROVADA'],
  [DOCENTE, 0, 0, 3, '07:30', '09:10', 35, 'APROVADA'],
  [DOCENTE, 1, 5, 4, '19:00', '20:40', 20, 'APROVADA'],
];

async function seed() {
  await pool.query('TRUNCATE notificacao, historico, relatorio, reserva, disciplina, laboratorio, usuario RESTART IDENTITY CASCADE');

  const usuarios = [];
  for (const [nome, email, perfil, senhaTexto] of USUARIOS) {
    const senha = await bcrypt.hash(senhaTexto, 10);
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
  const porNome = new Map();
  for (const [nome, curso, periodo, tipo] of DISCIPLINAS) {
    const { rows } = await pool.query(
      'INSERT INTO disciplina (nome, curso, periodo, tipo) VALUES ($1,$2,$3,$4) RETURNING *',
      [nome, curso, periodo, tipo]
    );
    porNome.set(nome, rows[0]);
  }
  const discs = DISCIPLINAS_AGENDA.map((nome) => {
    if (!porNome.has(nome)) throw new Error(`Disciplina da agenda não encontrada: ${nome}`);
    return porNome.get(nome);
  });

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
        [id, usuarios[COORD].id_usuario, data]
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
  await inserir(usuarios[DOCENTE], labs[0], discs[2], somarDias(prox, 3), '13:00', '14:40', 30, 'PENDENTE', hoje());
  await inserir(usuarios[DISCENTE], labs[0], discs[6], somarDias(prox, 3), '13:30', '15:00', 12, 'PENDENTE', hoje());
  await inserir(usuarios[DOCENTE], labs[2], discs[5], somarDias(prox, 4), '09:20', '11:00', 20, 'PENDENTE', hoje());
  await inserir(usuarios[DOCENTE], labs[3], discs[3], somarDias(prox, 0), '13:00', '14:40', 18, 'PENDENTE', hoje());

  // Algumas tentativas bloqueadas no histórico (para os indicadores)
  for (let i = 1; i <= 3; i++) {
    await pool.query(
      `INSERT INTO historico (id_usuario, acao, detalhes, data_hora)
       VALUES ($1, 'BLOQUEADA_CONFLITO', $2, NOW() - ($3 || ' days')::interval)`,
      [usuarios[DOCENTE].id_usuario,
        { solicitacao: { id_laboratorio: labs[0].id_laboratorio, data: somarDias(segunda, -7 * i), hora_inicio: '07:30', hora_fim: '09:10' } },
        String(i * 6)]
    );
  }

  await pool.query(
    `INSERT INTO notificacao (id_usuario, titulo, mensagem) VALUES ($1, 'Bem-vindo(a)', $2)`,
    [usuarios[DOCENTE].id_usuario, 'Este é o Sistema de Agendamento de Laboratórios da UEMG Divinópolis.']
  );

  console.log('Dados de demonstração inseridos. Usuários:');
  USUARIOS.forEach(([, email, perfil]) => console.log(`  ${perfil.padEnd(15)} ${email}`));
}

if (require.main === module) {
  seed().then(() => pool.end()).catch((e) => { console.error(e); process.exit(1); });
}

module.exports = { seed };
