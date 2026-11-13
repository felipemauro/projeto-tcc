-- As solicitações do coordenador deixam de ter aprovação automática:
-- passam a ficar pendentes e são aprovadas manualmente em Solicitações.
-- Ajusta, uma única vez, regras já salvas pela tela "Regras de priorização".
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM parametro WHERE chave = 'migracao_004_aprovacao_coordenador') THEN
    UPDATE parametro
       SET valor = jsonb_set(
             valor, '{aprovacaoAutomatica}',
             COALESCE((SELECT jsonb_agg(e) FROM jsonb_array_elements(valor->'aprovacaoAutomatica') e
                        WHERE e <> '"COORDENADOR"'::jsonb), '[]'::jsonb))
     WHERE chave = 'regras_agendamento' AND valor ? 'aprovacaoAutomatica';
    INSERT INTO parametro (chave, valor) VALUES ('migracao_004_aprovacao_coordenador', 'true');
  END IF;
END $$;
