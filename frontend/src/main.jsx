import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexto/AuthContext';
import { TempoRealProvider } from './contexto/TempoReal';
import { AvisoProvider, Carregando } from './components/ui';
import Layout from './components/Layout';
import Login from './pages/Login';
import Inicio from './pages/Inicio';
import Agenda from './pages/Agenda';
import NovaReserva from './pages/NovaReserva';
import MinhasReservas from './pages/MinhasReservas';
import Solicitacoes from './pages/Solicitacoes';
import Painel from './pages/Painel';
import Relatorios from './pages/Relatorios';
import Historico from './pages/Historico';
import Regras from './pages/Regras';
import { Disciplinas, Laboratorios, Usuarios } from './pages/Cadastros';
import './estilos.css';

function Protegida({ perfis, children }) {
  const { usuario, carregando } = useAuth();
  if (carregando) return <Carregando texto="Verificando sessão…" />;
  if (!usuario) return <Navigate to="/login" replace />;
  if (perfis && !perfis.includes(usuario.perfil)) return <Navigate to="/" replace />;
  return children;
}

const GESTAO = ['ADMINISTRATIVO', 'COORDENADOR'];
const ADMIN = ['ADMINISTRATIVO'];

function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<Protegida><Layout /></Protegida>}>
        <Route index element={<Inicio />} />
        <Route path="agenda" element={<Agenda />} />
        <Route path="reservas/nova" element={<NovaReserva />} />
        <Route path="reservas/minhas" element={<MinhasReservas />} />
        <Route path="gestao/solicitacoes" element={<Protegida perfis={GESTAO}><Solicitacoes /></Protegida>} />
        <Route path="gestao/painel" element={<Protegida perfis={GESTAO}><Painel /></Protegida>} />
        <Route path="gestao/relatorios" element={<Protegida perfis={GESTAO}><Relatorios /></Protegida>} />
        <Route path="gestao/historico" element={<Protegida perfis={GESTAO}><Historico /></Protegida>} />
        <Route path="cadastros/laboratorios" element={<Protegida perfis={ADMIN}><Laboratorios /></Protegida>} />
        <Route path="cadastros/disciplinas" element={<Protegida perfis={ADMIN}><Disciplinas /></Protegida>} />
        <Route path="cadastros/usuarios" element={<Protegida perfis={ADMIN}><Usuarios /></Protegida>} />
        <Route path="cadastros/regras" element={<Protegida perfis={ADMIN}><Regras /></Protegida>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <AuthProvider>
      <TempoRealProvider>
        <AvisoProvider>
          <App />
        </AvisoProvider>
      </TempoRealProvider>
    </AuthProvider>
  </BrowserRouter>
);
