/** Componentes de interface reutilizáveis. */
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import Icone from './Icone';
import { STATUS, formatarData } from '../util';
import { useTempoReal } from '../contexto/TempoReal';

// ------------------------------------------------------------------ Badges
export function StatusBadge({ status }) {
  return <span className={`badge badge-${status?.toLowerCase()}`}>{STATUS[status] || status}</span>;
}

export function PrioridadeBadge({ valor, detalhe }) {
  const nivel = valor >= 70 ? 'alta' : valor >= 40 ? 'media' : 'baixa';
  const dica = detalhe
    ? `Natureza: ${detalhe.natureza?.valor} · Proximidade: ${detalhe.proximidade?.valor} · Ocupação: ${detalhe.ocupacao?.valor} · Perfil: ${detalhe.perfil?.valor}`
    : undefined;
  return (
    <span className={`prioridade prioridade-${nivel}`} title={dica}>
      <span className="prioridade-barra"><span style={{ width: `${valor}%` }} /></span>
      {valor}
    </span>
  );
}

// -------------------------------------------------------------- Estruturas
export function Pagina({ titulo, subtitulo, acoes, children }) {
  return (
    <section className="pagina">
      <header className="pagina-cabecalho">
        <div>
          <h1>{titulo}</h1>
          {subtitulo && <p className="subtitulo">{subtitulo}</p>}
        </div>
        {acoes && <div className="pagina-acoes">{acoes}</div>}
      </header>
      {children}
    </section>
  );
}

export function Cartao({ titulo, acoes, children, className = '' }) {
  return (
    <div className={`cartao ${className}`}>
      {(titulo || acoes) && (
        <div className="cartao-cabecalho">
          {titulo && <h2>{titulo}</h2>}
          {acoes}
        </div>
      )}
      <div className="cartao-corpo">{children}</div>
    </div>
  );
}

export function Carregando({ texto = 'Carregando…' }) {
  return <div className="carregando"><span className="spinner" />{texto}</div>;
}

export function Vazio({ children }) {
  return <div className="vazio">{children}</div>;
}

export function Alerta({ tipo = 'info', children }) {
  return (
    <div className={`alerta alerta-${tipo}`} role={tipo === 'erro' ? 'alert' : 'status'}>
      <Icone nome={tipo === 'erro' || tipo === 'aviso' ? 'alerta' : tipo === 'sucesso' ? 'check' : 'info'} />
      <div>{children}</div>
    </div>
  );
}

export function Modal({ titulo, aberto, aoFechar, children, rodape, largo }) {
  useEffect(() => {
    if (!aberto) return undefined;
    const esc = (e) => e.key === 'Escape' && aoFechar();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [aberto, aoFechar]);
  if (!aberto) return null;
  return (
    <div className="modal-fundo" onMouseDown={(e) => e.target === e.currentTarget && aoFechar()}>
      <div className={`modal ${largo ? 'modal-largo' : ''}`} role="dialog" aria-modal="true" aria-label={titulo}>
        <div className="modal-cabecalho">
          <h2>{titulo}</h2>
          <button className="btn-icone" onClick={aoFechar} aria-label="Fechar"><Icone nome="fechar" /></button>
        </div>
        <div className="modal-corpo">{children}</div>
        {rodape && <div className="modal-rodape">{rodape}</div>}
      </div>
    </div>
  );
}

export function Campo({ rotulo, erro, children, ajuda }) {
  return (
    <label className={`campo ${erro ? 'campo-erro' : ''}`}>
      <span className="campo-rotulo">{rotulo}</span>
      {children}
      {ajuda && !erro && <span className="campo-ajuda">{ajuda}</span>}
      {erro && <span className="campo-msg-erro">{erro}</span>}
    </label>
  );
}

/** Lista de horários alternativos sugeridos pela regra inteligente. */
export function Sugestoes({ itens, aoEscolher }) {
  if (!itens?.length) return null;
  const rotulo = { MESMO_LABORATORIO: 'Mesmo laboratório', OUTRO_LABORATORIO: 'Outro laboratório', OUTRO_DIA: 'Outro dia' };
  return (
    <div className="sugestoes">
      <h3><Icone nome="relogio" tamanho={16} /> Horários alternativos sugeridos</h3>
      <ul>
        {itens.map((s, i) => (
          <li key={i}>
            <div>
              <strong>{s.laboratorio}</strong>
              <span>{formatarData(s.data)} · {s.hora_inicio}–{s.hora_fim}</span>
              <span className="tag">{rotulo[s.tipo]}</span>
            </div>
            {aoEscolher && <button className="btn btn-sm" onClick={() => aoEscolher(s)}>Usar este horário</button>}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ------------------------------------------------------------------ Avisos
const AvisoContext = createContext(() => {});
export function AvisoProvider({ children }) {
  const [avisos, setAvisos] = useState([]);
  const avisar = useCallback((texto, tipo = 'sucesso') => {
    const id = Math.random();
    setAvisos((a) => [...a, { id, texto, tipo }]);
    setTimeout(() => setAvisos((a) => a.filter((x) => x.id !== id)), 4500);
  }, []);
  return (
    <AvisoContext.Provider value={avisar}>
      {children}
      <div className="avisos" aria-live="polite">
        {avisos.map((a) => (
          <div key={a.id} className={`aviso aviso-${a.tipo}`}>
            <Icone nome={a.tipo === 'erro' ? 'alerta' : 'check'} /> {a.texto}
          </div>
        ))}
      </div>
    </AvisoContext.Provider>
  );
}
export const useAviso = () => useContext(AvisoContext);

// ------------------------------------------------------------------- Dados
/**
 * Carrega dados da API e recarrega automaticamente quando outro usuário
 * altera reservas (evento em tempo real).
 */
export function useDados(carregar, deps = [], { tempoReal = true } = {}) {
  const { versao } = useTempoReal();
  const [estado, setEstado] = useState({ dados: null, erro: null, carregando: true });
  const [recarga, setRecarga] = useState(0);
  useEffect(() => {
    let ativo = true;
    setEstado((e) => ({ ...e, carregando: true }));
    carregar()
      .then((dados) => ativo && setEstado({ dados, erro: null, carregando: false }))
      .catch((erro) => ativo && setEstado((e) => ({ ...e, erro, carregando: false })));
    return () => { ativo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, recarga, tempoReal ? versao : 0]);
  return { ...estado, recarregar: () => setRecarga((r) => r + 1) };
}
