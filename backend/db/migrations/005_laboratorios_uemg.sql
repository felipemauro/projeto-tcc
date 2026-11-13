-- Laboratórios reais da UEMG Divinópolis, conforme o Regulamento de Uso e
-- Funcionamento dos Laboratórios de Informática (2026), mais o 225 (Bloco 2)
-- e a capacidade do 1002, informados pela coordenação.
-- Só age em bancos que ainda têm os laboratórios de demonstração antigos:
-- renomeia os quatro existentes (mantendo as reservas) e inclui os que faltam.
-- Em um banco novo não faz nada; o seed já cadastra os laboratórios reais.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM laboratorio WHERE nome = 'Laboratório de Informática 1') THEN
    UPDATE laboratorio AS l
       SET nome = n.nome, capacidade = n.capacidade, localizacao = n.localizacao, descricao = n.descricao
      FROM (VALUES
        ('Laboratório de Informática 1', 'Laboratório 404', 40, 'Bloco 4 - Sala 404 (antiga 406)',
         '40 computadores, quadro, projetor multimídia e ar-condicionado. Prioridade para turmas maiores.'),
        ('Laboratório de Informática 2', 'Laboratório 109', 22, 'Bloco 1 - Sala 109',
         '22 computadores, quadro, projetor multimídia e ar-condicionado.'),
        ('Laboratório de Informática 3', 'Laboratório 110', 22, 'Bloco 1 - Sala 110',
         '22 computadores, quadro, projetor multimídia e ar-condicionado. Livre acesso à tarde, das 14h às 16h.'),
        ('Laboratório de Redes', 'Laboratório 220', 22, 'Bloco 2 - Sala 220',
         '22 computadores, quadro, projetor multimídia e ar-condicionado.')
      ) AS n(antigo, nome, capacidade, localizacao, descricao)
     WHERE l.nome = n.antigo;

    INSERT INTO laboratorio (nome, capacidade, localizacao, descricao) VALUES
      ('Laboratório 221', 22, 'Bloco 2 - Sala 221',
       '22 computadores, quadro, projetor multimídia e ar-condicionado.'),
      ('Laboratório 1001', 20, 'Bloco 10 - Sala 1001',
       '20 computadores, quadro, projetor multimídia e ar-condicionado.')
    ON CONFLICT (nome) DO NOTHING;
  END IF;
END $$;

-- Laboratórios 1002 e 225: incluídos em bancos que já têm os laboratórios reais.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM laboratorio WHERE nome = 'Laboratório 404') THEN
    INSERT INTO laboratorio (nome, capacidade, localizacao, descricao) VALUES
      ('Laboratório 1002', 22, 'Bloco 10 - Sala 1002',
       'Laboratório de Circuitos Elétricos e Eletrônicos. Uso exclusivo do curso de Engenharia de Computação.'),
      ('Laboratório 225', 30, 'Bloco 2 - Sala 225', 'Capacidade para 30 alunos.')
    ON CONFLICT (nome) DO NOTHING;
  END IF;
END $$;
