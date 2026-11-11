-- ---------------------------------------------------------------------
-- Reservas recorrentes (séries semanais)
-- Uma série agrupa as reservas de um mesmo horário repetidas nos dias da
-- semana escolhidos, dentro de um período (ex.: aulas do semestre).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS serie (
    id_serie       SERIAL PRIMARY KEY,
    id_usuario     INT  NOT NULL REFERENCES usuario(id_usuario),   -- quem usará o laboratório
    id_criador     INT  NOT NULL REFERENCES usuario(id_usuario),   -- quem registrou
    id_laboratorio INT  NOT NULL REFERENCES laboratorio(id_laboratorio),
    id_disciplina  INT  REFERENCES disciplina(id_disciplina),
    data_inicio    DATE NOT NULL,
    data_fim       DATE NOT NULL,
    dias_semana    INT[] NOT NULL,                                 -- 0 = domingo ... 6 = sábado
    hora_inicio    TIME NOT NULL,
    hora_fim       TIME NOT NULL,
    criado_em      TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT ck_serie_periodo CHECK (data_fim >= data_inicio)
);

ALTER TABLE reserva ADD COLUMN IF NOT EXISTS id_serie INT REFERENCES serie(id_serie);
CREATE INDEX IF NOT EXISTS ix_reserva_serie ON reserva (id_serie);
