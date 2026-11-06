import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import Icone from './Icone';
import { useAuth } from '../contexto/AuthContext';
import { useTempoReal } from '../contexto/TempoReal';
import { api } from '../api';
import { PERFIS, formatarDataHora } from '../util';

/** Menu lateral organizado por grupos e filtrado conforme o perfil. */
const MENU = [
  {
    grupo: 'Agendamento',
    itens: [
      { para: '/', icone: 'inicio', rotulo: 'Início', fim: true },
      { para: '/agenda', icone: 'agenda', rotulo: 'Agenda dos laboratórios' },
      { para: '/reservas/nova', icone: 'mais', rotulo: 'Nova reserva' },
      { para: '/reservas/minhas', icone: 'lista', rotulo: 'Minhas reservas' },
    ],
  },
  {
    grupo: 'Gestão',
    perfis: ['ADMINISTRATIVO', 'COORDENADOR'],
    itens: [
      { para: '/gestao/solicitacoes', icone: 'aprovar', rotulo: 'Solicitações', contador: true },
      { para: '/gestao/painel', icone: 'grafico', rotulo: 'Painel de ocupação' },
      { para: '/gestao/relatorios', icone: 'relatorio', rotulo: 'Relatórios' },
      { para: '/gestao/historico', icone: 'historico', rotulo: 'Histórico' },
    ],
  },
  {
    grupo: 'Cadastros',
    perfis: ['ADMINISTRATIVO'],
    itens: [
      { para: '/cadastros/laboratorios', icone: 'lab', rotulo: 'Laboratórios' },
      { para: '/cadastros/disciplinas', icone: 'livro', rotulo: 'Disciplinas' },
      { para: '/cadastros/usuarios', icone: 'usuarios', rotulo: 'Usuários e perfis' },
      { para: '/cadastros/regras', icone: 'ajustes', rotulo: 'Regras de priorização' },
    ],
  },
];

function Notificacoes() {
  const { notificacoes: sinal } = useTempoReal();
  const [lista, setLista] = useState([]);
  const [aberto, setAberto] = useState(false);
  const naoLidas = lista.filter((n) => !n.lida).length;

  useEffect(() => { api.get('/notificacoes').then(setLista).catch(() => {}); }, [sinal]);

  const abrir = async () => {
    setAberto((a) => !a);
    if (!aberto && naoLidas) {
      await api.post('/notificacoes/lidas');
      setTimeout(() => setLista((l) => l.map((n) => ({ ...n, lida: true }))), 1500);
    }
  };

  return (
    <div className="notificacoes">
      <button className="btn-topo" onClick={abrir} aria-label={`Notificações (${naoLidas} não lidas)`}>
        <Icone nome="sino" />
        {naoLidas > 0 && <span className="contador">{naoLidas}</span>}
      </button>
      {aberto && (
        <div className="notificacoes-painel">
          <div className="notificacoes-titulo">Notificações</div>
          {lista.length === 0 && <div className="vazio">Nenhuma notificação.</div>}
          {lista.map((n) => (
            <div key={n.id_notificacao} className={`notificacao ${n.lida ? '' : 'nao-lida'}`}>
              <strong>{n.titulo}</strong>
              <p>{n.mensagem}</p>
              <small>{formatarDataHora(n.criado_em)}</small>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Layout() {
  const { usuario, sair } = useAuth();
  const { conectado, versao } = useTempoReal();
  const [menuAberto, setMenuAberto] = useState(false);
  const [pendentes, setPendentes] = useState(0);
  const local = useLocation();
  const gestor = ['ADMINISTRATIVO', 'COORDENADOR'].includes(usuario.perfil);

  useEffect(() => setMenuAberto(false), [local.pathname]);
  useEffect(() => {
    if (!gestor) return;
    api.get('/reservas?status=PENDENTE&limite=500').then((r) => setPendentes(r.length)).catch(() => {});
  }, [gestor, versao]);

  return (
    <div className={`app ${menuAberto ? 'menu-aberto' : ''}`}>
      <header className="topo">
        <button className="btn-topo so-mobile" onClick={() => setMenuAberto((m) => !m)} aria-label="Abrir menu">
          <Icone nome="menu" />
        </button>
        <div className="marca">
          <span className="marca-sigla">UEMG</span>
          <span className="marca-texto">
            <strong>Agendamento de Laboratórios</strong>
            <small>Unidade Divinópolis</small>
          </span>
        </div>
        <div className="topo-direita">
          <span className={`tempo-real ${conectado ? 'on' : ''}`} title={conectado ? 'Atualização em tempo real ativa' : 'Reconectando…'}>
            <span className="ponto" /> {conectado ? 'Ao vivo' : 'Offline'}
          </span>
          <Notificacoes />
          <div className="usuario-topo">
            <span className="avatar">{usuario.nome.replace(/^(Prof\.?|Profa\.?)\s+/i, '').charAt(0)}</span>
            <span className="usuario-dados">
              <strong>{usuario.nome}</strong>
              <small>{PERFIS[usuario.perfil]}</small>
            </span>
          </div>
          <button className="btn-topo" onClick={sair} title="Sair" aria-label="Sair">
            <Icone nome="sair" />
          </button>
        </div>
      </header>

      <aside className="lateral" aria-label="Menu principal">
        <nav>
          {MENU.filter((g) => !g.perfis || g.perfis.includes(usuario.perfil)).map((g) => (
            <div key={g.grupo} className="menu-grupo">
              <div className="menu-grupo-titulo">{g.grupo}</div>
              {g.itens.map((i) => (
                <NavLink key={i.para} to={i.para} end={i.fim} className="menu-item">
                  <Icone nome={i.icone} />
                  <span>{i.rotulo}</span>
                  {i.contador && pendentes > 0 && <span className="menu-contador">{pendentes}</span>}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="lateral-rodape">
          SAL v1.0 · TCC Eng. Computação
        </div>
      </aside>
      <div className="lateral-fundo" onClick={() => setMenuAberto(false)} />

      <main className="conteudo">
        <Outlet />
      </main>
    </div>
  );
}
