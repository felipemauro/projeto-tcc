-- Sistema de Agendamento de Laboratórios Acadêmicos com Controle Multiusuário
-- UEMG - Unidade Divinópolis
-- Esquema do banco de dados

-- Extensão necessária para a restrição de exclusão (anti-sobreposição)
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Usuario: superclasse dos perfis Docente, Discente, Coordenador e
-- FuncionarioAdministrativo
CREATE TABLE IF NOT EXISTS usuario (
    id_usuario    SERIAL PRIMARY KEY,
    nome          VARCHAR(120) NOT NULL,
    email         VARCHAR(160) NOT NULL UNIQUE,
    senha         VARCHAR(100) NOT NULL,             -- hash bcrypt
    perfil        VARCHAR(20)  NOT NULL
                  CHECK (perfil IN ('ADMINISTRATIVO','COORDENADOR','DOCENTE','DISCENTE')),
    ativo         BOOLEAN      NOT NULL DEFAULT TRUE,
    criado_em     TIMESTAMP    NOT NULL DEFAULT NOW()
);

-- Laboratorio
CREATE TABLE IF NOT EXISTS laboratorio (
    id_laboratorio SERIAL PRIMARY KEY,
    nome           VARCHAR(80)  NOT NULL UNIQUE,
    capacidade     INT          NOT NULL CHECK (capacidade > 0),
    localizacao    VARCHAR(120) NOT NULL,
    descricao      VARCHAR(500),
    ativo          BOOLEAN      NOT NULL DEFAULT TRUE
);

-- Disciplina
-- tipo: natureza da disciplina, usada pela regra de priorização
--   PRATICA          -> prática obrigatória prevista na matriz curricular
--   TEORICA          -> não exige obrigatoriamente laboratório
--   EXTRACURRICULAR  -> minicursos, eventos, monitorias
CREATE TABLE IF NOT EXISTS disciplina (
    id_disciplina SERIAL PRIMARY KEY,
    nome          VARCHAR(120) NOT NULL,
    curso         VARCHAR(120) NOT NULL,
    periodo       INT          NOT NULL CHECK (periodo BETWEEN 0 AND 12),
    tipo          VARCHAR(20)  NOT NULL DEFAULT 'PRATICA'
                  CHECK (tipo IN ('PRATICA','TEORICA','EXTRACURRICULAR')),
    ativo         BOOLEAN      NOT NULL DEFAULT TRUE,
    UNIQUE (nome, curso)
);

-- Reserva (entidade central do modelo)
-- versao: controle de concorrência otimista (optimistic locking)
CREATE TABLE IF NOT EXISTS reserva (
    id_reserva     SERIAL PRIMARY KEY,
    id_usuario     INT  NOT NULL REFERENCES usuario(id_usuario),
    id_laboratorio INT  NOT NULL REFERENCES laboratorio(id_laboratorio),
    id_disciplina  INT  REFERENCES disciplina(id_disciplina),
    data           DATE NOT NULL,
    hora_inicio    TIME NOT NULL,
    hora_fim       TIME NOT NULL,
    status         VARCHAR(12) NOT NULL DEFAULT 'PENDENTE'
                   CHECK (status IN ('PENDENTE','APROVADA','REJEITADA','CANCELADA')),
    prioridade     INT  NOT NULL DEFAULT 0 CHECK (prioridade BETWEEN 0 AND 100),
    detalhe_prioridade JSONB,
    qtd_alunos     INT  NOT NULL DEFAULT 1 CHECK (qtd_alunos > 0),
    finalidade     VARCHAR(255),
    motivo_decisao VARCHAR(500),
    versao         INT  NOT NULL DEFAULT 1,
    criado_em      TIMESTAMP NOT NULL DEFAULT NOW(),
    atualizado_em  TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT ck_reserva_horario CHECK (hora_fim > hora_inicio),

    -- Restrição rígida garantida pelo próprio SGBD: duas reservas APROVADAS
    -- não podem se sobrepor no mesmo laboratório. Mesmo que a aplicação falhe,
    -- o PostgreSQL rejeita a transação (propriedades de Consistência/Isolamento).
    CONSTRAINT ex_reserva_sem_sobreposicao EXCLUDE USING gist (
        id_laboratorio WITH =,
        tsrange(data + hora_inicio, data + hora_fim, '[)') WITH &&
    ) WHERE (status = 'APROVADA')
);

CREATE INDEX IF NOT EXISTS ix_reserva_lab_data ON reserva (id_laboratorio, data);
CREATE INDEX IF NOT EXISTS ix_reserva_usuario  ON reserva (id_usuario);
CREATE INDEX IF NOT EXISTS ix_reserva_status   ON reserva (status);

-- Relatorio: registro dos relatórios gerados (rastreabilidade)
CREATE TABLE IF NOT EXISTS relatorio (
    id_relatorio SERIAL PRIMARY KEY,
    id_usuario   INT NOT NULL REFERENCES usuario(id_usuario),
    tipo         VARCHAR(40) NOT NULL,
    parametros   JSONB,
    data_geracao TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Histórico de operações (auditoria - requisito não funcional)
-- id_reserva pode ser nulo para tentativas bloqueadas por conflito
CREATE TABLE IF NOT EXISTS historico (
    id_historico SERIAL PRIMARY KEY,
    id_reserva   INT REFERENCES reserva(id_reserva),
    id_usuario   INT REFERENCES usuario(id_usuario),
    acao         VARCHAR(40) NOT NULL,
    detalhes     JSONB,
    data_hora    TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_historico_data ON historico (data_hora DESC);

-- Notificações para usuários (ex.: reserva aprovada, remanejada)
CREATE TABLE IF NOT EXISTS notificacao (
    id_notificacao SERIAL PRIMARY KEY,
    id_usuario     INT NOT NULL REFERENCES usuario(id_usuario),
    titulo         VARCHAR(120) NOT NULL,
    mensagem       VARCHAR(1000) NOT NULL,
    lida           BOOLEAN NOT NULL DEFAULT FALSE,
    criado_em      TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_notificacao_usuario ON notificacao (id_usuario, lida);

-- Parâmetros do sistema: pesos da regra de priorização e horário de
-- funcionamento, definidos pela instituição (ajuste manual)
CREATE TABLE IF NOT EXISTS parametro (
    chave VARCHAR(60) PRIMARY KEY,
    valor JSONB NOT NULL
);
