import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexto/AuthContext';
import { Alerta } from '../components/ui';
import Icone from '../components/Icone';
import logoUemg from '../assets/logo-uemg.png';
import logoSali from '../assets/logo-sali.png';

export default function Login() {
  const { usuario, entrar } = useAuth();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

  if (usuario) return <Navigate to="/" replace />;

  const enviar = async (e) => {
    e.preventDefault();
    setErro('');
    setEnviando(true);
    try {
      await entrar(email, senha);
    } catch (er) {
      setErro(er.message);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="login">
      <div className="login-lado">
        <div className="login-marca">
          <img src={logoUemg} alt="UEMG – Universidade do Estado de Minas Gerais" className="login-logo" />
          <span>Unidade Divinópolis</span>
        </div>
        <h1 className="login-titulo">
          <img src={logoSali} alt="SALI – Sistema de Agendamentos de Laboratórios Acadêmicos de Informática" className="login-sistema-logo" />
        </h1>
        <p>Consulte a disponibilidade, solicite reservas e acompanhe a ocupação dos laboratórios de informática em tempo real.</p>
        <ul className="login-recursos">
          <li><Icone nome="check" /> Detecção automática de conflitos de horário</li>
          <li><Icone nome="check" /> Priorização de aulas práticas obrigatórias</li>
          <li><Icone nome="check" /> Sugestão de horários alternativos</li>
          <li><Icone nome="check" /> Controle de acesso por perfil</li>
        </ul>
      </div>
      <div className="login-form-area">
        <form className="login-form" onSubmit={enviar}>
          <h2>Acesso ao sistema</h2>
          <p className="subtitulo">Entre com seu e-mail institucional.</p>
          {erro && <Alerta tipo="erro">{erro}</Alerta>}
          <label className="campo">
            <span className="campo-rotulo">E-mail</span>
            <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
          </label>
          <label className="campo">
            <span className="campo-rotulo">Senha</span>
            <input type="password" autoComplete="current-password" value={senha} onChange={(e) => setSenha(e.target.value)} required />
          </label>
          <button className="btn btn-primario btn-bloco" disabled={enviando}>
            {enviando ? 'Entrando…' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  );
}
