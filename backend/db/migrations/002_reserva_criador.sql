-- Reserva registrada em nome de outra pessoa
-- id_usuario  -> quem utilizará o laboratório (dono da reserva)
-- id_criador  -> quem registrou a reserva no sistema (ex.: funcionário
--                administrativo agendando para um docente)
ALTER TABLE reserva ADD COLUMN IF NOT EXISTS id_criador INT REFERENCES usuario(id_usuario);
UPDATE reserva SET id_criador = id_usuario WHERE id_criador IS NULL;
