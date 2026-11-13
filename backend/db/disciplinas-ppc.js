/*
 * Disciplinas do curso de Bacharelado em Engenharia de Computação - UEMG Divinópolis,
 * conforme a Estrutura Curricular (Seção 7.10) e a relação de Disciplinas Optativas
 * do Projeto Pedagógico do Curso (PPC).
 *
 * Campos: [nome, período, carga horária semanal teórica (h/a), carga horária semanal prática (h/a)]
 *
 * A natureza usada pela regra de priorização é derivada da carga prática do PPC:
 *   - carga prática > 0  -> PRATICA
 *   - carga prática = 0  -> TEORICA
 * Optativas não têm período fixo (período 0); no PPC todas ocupam vagas de 3 h/a teóricas.
 *
 * Não foram cadastrados: as vagas genéricas "Eletiva I/II" e "Optativa I-V" (substituídas
 * pela lista de optativas abaixo), as Atividades Complementares e de Extensão, e as
 * eletivas (cursadas em outros cursos de graduação, conforme Seção 7.2 do PPC).
 */
const CURSO = 'Engenharia de Computação';

const OBRIGATORIAS = [
  // 1º período
  ['Algoritmos e Estruturas de Dados I', 1, 0, 4],
  ['Cálculo I', 1, 4, 0],
  ['Geometria Analítica e Álgebra Linear', 1, 4, 0],
  ['Introdução a Engenharia de Computação e Ética Profissional', 1, 3, 0],
  ['Metodologia Científica', 1, 3, 0],
  ['Química', 1, 3, 1],
  ['Sociologia', 1, 3, 0],
  // 2º período
  ['Algoritmos e Estruturas de Dados II', 2, 2, 2],
  ['Cálculo II', 2, 4, 0],
  ['Desenho Técnico', 2, 3, 0],
  ['Filosofia', 2, 3, 0],
  ['Física I', 2, 3, 1],
  ['Inglês Instrumental', 2, 3, 0],
  ['Leitura e Produção de Textos', 2, 3, 0],
  ['Matemática Discreta', 2, 3, 0],
  // 3º período
  ['Algoritmos e Estrutura de Dados III', 3, 2, 2],
  ['Cálculo III', 3, 4, 0],
  ['Física II', 3, 3, 1],
  ['Fundamentos de Sistemas de Informação', 3, 3, 0],
  ['Probabilidade e Estatística', 3, 3, 0],
  ['Sequências e Séries', 3, 3, 0],
  ['Sistemas Digitais I', 3, 3, 0],
  // 4º período
  ['Arquitetura de Computadores I', 4, 2, 2],
  ['Fundamentos de Mecânica dos Sólidos e Fluídos', 4, 4, 0],
  ['Física III', 4, 3, 1],
  ['Equações Diferenciais', 4, 3, 0],
  ['Métodos Numéricos Computacionais', 4, 3, 0],
  ['Programação Orientada a Objetos I', 4, 0, 4],
  ['Sistemas Digitais II', 4, 2, 2],
  // 5º período
  ['Arquitetura de Computadores II', 5, 2, 2],
  ['Banco de Dados', 5, 2, 2],
  ['Circuitos Elétrico-Eletrônicos I', 5, 2, 2],
  ['Programação Orientada a Objetos II', 5, 3, 0],
  ['Sistemas Operacionais', 5, 2, 2],
  ['Pesquisa Operacional', 5, 3, 0],
  // 6º período
  ['Análise de Sinais e Sistemas', 6, 3, 1],
  ['Circuitos Elétrico-Eletrônicos II', 6, 2, 2],
  ['Engenharia de Software I', 6, 3, 1],
  ['Organização e Recuperação da Informação', 6, 0, 3],
  ['Redes de Computadores', 6, 2, 2],
  ['Sistemas Distribuídos', 6, 3, 1],
  // 7º período
  ['Compiladores I', 7, 3, 0],
  ['Sistemas de Automação', 7, 2, 2],
  ['Engenharia de Software II', 7, 3, 1],
  ['Modelagem e Simulação', 7, 2, 2],
  ['Sistemas Inteligentes I', 7, 3, 0],
  ['Estágio Supervisionado I', 7, 0, 0],
  // 8º período
  ['Interface Homem-Máquina', 8, 2, 2],
  ['Compiladores II', 8, 2, 2],
  ['Controle e Servomecanismo', 8, 2, 2],
  ['Desenvolvimento Web', 8, 0, 3],
  ['Sistemas Inteligentes II', 8, 3, 1],
  ['Estágio Supervisionado II', 8, 0, 0],
  // 9º período
  ['Robótica', 9, 2, 2],
  ['Metodologia Científica para Computação', 9, 3, 0],
  ['Computação Gráfica', 9, 1, 2],
  ['Programação para Dispositivos Móveis', 9, 0, 3],
  ['Trabalho de Conclusão de Curso I', 9, 3, 0],
  ['Estágio Supervisionado III', 9, 0, 0],
  // 10º período
  ['Administração e Empreendedorismo', 10, 3, 0],
  ['Microcontroladores, Microprocessadores e Aplicações', 10, 2, 2],
  ['Ambiente e Ciência dos Materiais', 10, 3, 0],
  ['Sistemas Inteligentes III', 10, 3, 1],
  ['Trabalho de Conclusão de Curso II', 10, 3, 0],
];

const OPTATIVAS = [
  'Libras',
  'Mineração de Dados',
  'Redes de Alta Velocidade',
  'Redes Neurais Artificiais',
  'Sistemas de Tempo Real',
  'Sistemas Embarcados',
  'Gerenciamento de Redes de Computadores',
  'Gerência de Projetos de Software',
  'Gestão da Qualidade de Software',
  'Tópicos Avançados em Sistemas Operacionais',
  'Administração de Banco de Dados',
  'Data Warehouse',
  'Projeto e Análise de Algoritmos',
  'Otimização Computacional',
  'Técnicas Metaheurísticas para Otimização',
  'Paradigmas de Programação',
  'Compatibilidade e Interferência Eletromagnética',
  'Tópicos Especiais em Engenharia de Computação',
].map((nome) => [nome, 0, 3, 0]);

/** Lista no formato [nome, curso, periodo, tipo]. */
const DISCIPLINAS_PPC = [...OBRIGATORIAS, ...OPTATIVAS].map(([nome, periodo, , pratica]) => [
  nome, CURSO, periodo, pratica > 0 ? 'PRATICA' : 'TEORICA',
]);

module.exports = { DISCIPLINAS_PPC, CURSO, OBRIGATORIAS, OPTATIVAS };
