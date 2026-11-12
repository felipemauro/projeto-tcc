import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, sessao } from '../api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [usuario, setUsuario] = useState(null);
  const [carregando, setCarregando] = useState(!!sessao.token());

  useEffect(() => {
    if (!sessao.token()) return;
    api.get('/auth/me')
      .then(setUsuario)
      .catch(() => sessao.limpar())
      .finally(() => setCarregando(false));
  }, []);

  useEffect(() => {
    const expirou = () => setUsuario(null);
    window.addEventListener('sali:sessao-expirada', expirou);
    return () => window.removeEventListener('sali:sessao-expirada', expirou);
  }, []);

  const entrar = useCallback(async (email, senha) => {
    const r = await api.post('/auth/login', { email, senha });
    sessao.salvar(r.token);
    setUsuario(r.usuario);
    return r.usuario;
  }, []);

  const sair = useCallback(() => {
    sessao.limpar();
    setUsuario(null);
  }, []);

  return (
    <AuthContext.Provider value={{ usuario, carregando, entrar, sair }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
