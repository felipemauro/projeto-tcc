-- Horário de funcionamento da UEMG: 07:00 às 22:55, com aulas de 50 minutos.
-- Ajusta, uma única vez, regras já salvas pela tela "Regras de priorização"
-- que ainda estejam com os valores padrão antigos (fechamento 23:00 e passo de 30 min).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM parametro WHERE chave = 'migracao_006_horario_aulas') THEN
    UPDATE parametro
       SET valor = jsonb_set(valor, '{funcionamento,fim}', '"22:55"')
     WHERE chave = 'regras_agendamento' AND valor #>> '{funcionamento,fim}' = '23:00';
    UPDATE parametro
       SET valor = jsonb_set(valor, '{sugestoes,passoMinutos}', '50')
     WHERE chave = 'regras_agendamento' AND valor #>> '{sugestoes,passoMinutos}' = '30';
    INSERT INTO parametro (chave, valor) VALUES ('migracao_006_horario_aulas', 'true');
  END IF;
END $$;
