import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { useAuth } from './AuthContext';

/**
 * Conexão em tempo real (Server-Sent Events). Toda vez que outro usuário
 * cria, aprova, altera ou cancela uma reserva, a "versão" muda e as telas
 * que dependem dela recarregam os dados automaticamente.
 */
const TempoRealContext = createContext({ versao: 0, notificacoes: 0, conectado: false });

export function TempoRealProvider({ children }) {
  const { usuario } = useAuth();
  const [versao, setVersao] = useState(0);
  const [notificacoes, setNotificacoes] = useState(0);
  const [conectado, setConectado] = useState(false);
  const fonte = useRef(null);

  useEffect(() => {
    if (!usuario) return undefined;
    const es = new EventSource(api.urlEventos());
    fonte.current = es;
    es.addEventListener('conectado', () => setConectado(true));
    es.addEventListener('reserva', () => setVersao((v) => v + 1));
    es.addEventListener('laboratorio', () => setVersao((v) => v + 1));
    es.addEventListener('notificacao', () => setNotificacoes((n) => n + 1));
    es.onerror = () => setConectado(false);
    return () => { es.close(); setConectado(false); };
  }, [usuario]);

  return (
    <TempoRealContext.Provider value={{ versao, notificacoes, conectado, atualizar: () => setVersao((v) => v + 1) }}>
      {children}
    </TempoRealContext.Provider>
  );
}

export const useTempoReal = () => useContext(TempoRealContext);
