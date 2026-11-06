import { useState } from 'react';
import { api, qs } from '../api';
import { Carregando, Pagina, Vazio, useDados } from '../components/ui';
import { PERFIS, formatarDataHora } from '../util';

const ACOES = {
  SOLICITADA: 'Reserva solicitada',
  CRIADA_APROVADA: 'Reserva criada (aprovação automática)',
  APROVADA: 'Reserva aprovada',
  REJEITADA: 'Reserva rejeitada',
  ALTERADA: 'Reserva alterada',
  CANCELADA: 'Reserva cancelada',
  REMANEJADA: 'Reserva remanejada',
  BLOQUEADA_CONFLITO: 'Tentativa bloqueada por conflito',
  LOGIN: 'Acesso ao sistema',
  RELATORIO_GERADO: 'Relatório gerado',
  PARAMETROS_ALTERADOS: 'Regras de priorização alteradas',
  LABORATORIO_CRIADO: 'Laboratório cadastrado',
  LABORATORIO_ALTERADO: 'Laboratório alterado',
  DISCIPLINA_CRIADA: 'Disciplina cadastrada',
  DISCIPLINA_ALTERADA: 'Disciplina alterada',
  USUARIO_CRIADO: 'Usuário cadastrado',
  USUARIO_ALTERADO: 'Usuário alterado',
};

function resumirDetalhes(h) {
  const d = h.detalhes;
  if (!d) return '';
  if (h.acao === 'BLOQUEADA_CONFLITO' && d.solicitacao) {
    const s = d.solicitacao;
    return `${s.data?.split('-').reverse().join('/')} ${s.hora_inicio}–${s.hora_fim} · prioridade ${d.prioridade ?? '—'}`;
  }
  if (h.acao === 'ALTERADA' && d.depois) {
    return `→ ${d.depois.data.split('-').reverse().join('/')} ${d.depois.hora_inicio}–${d.depois.hora_fim}${d.motivo ? ` · ${d.motivo}` : ''}`;
  }
  if (d.motivo) return d.motivo;
  if (d.remanejadas?.length) return `remanejou nº ${d.remanejadas.join(', ')}`;
  if (d.emFavorDe) return `em favor da nº ${d.emFavorDe}`;
  if (d.prioridade !== undefined) return `prioridade ${d.prioridade}`;
  if (d.tipo) return `${d.tipo} (${d.inicio} a ${d.fim})`;
  return '';
}

/** Auditoria e rastreabilidade das operações (requisito não funcional). */
export default function Historico() {
  const [acao, setAcao] = useState('');
  const { dados, carregando } = useDados(() => api.get(`/historico${qs({ acao })}`), [acao]);

  return (
    <Pagina titulo="Histórico de operações" subtitulo="Registro de auditoria das ações realizadas no sistema (últimos 300 eventos).">
      <div className="barra-filtros">
        <select value={acao} onChange={(e) => setAcao(e.target.value)} aria-label="Tipo de operação">
          <option value="">Todas as operações</option>
          {Object.entries(ACOES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>
      <div className="cartao">
        {carregando && !dados ? <Carregando /> : !dados?.length ? <Vazio>Nenhum registro.</Vazio> : (
          <div className="tabela-rolagem">
            <table className="tabela tabela-compacta">
              <thead><tr><th>Data/hora</th><th>Operação</th><th>Reserva</th><th>Usuário</th><th>Detalhes</th></tr></thead>
              <tbody>
                {dados.map((h) => (
                  <tr key={h.id_historico} className={h.acao === 'BLOQUEADA_CONFLITO' ? 'linha-conflito' : ''}>
                    <td className="nowrap">{formatarDataHora(h.data_hora)}</td>
                    <td>{ACOES[h.acao] || h.acao}</td>
                    <td>{h.id_reserva ? `nº ${h.id_reserva}` : '—'}</td>
                    <td>{h.usuario || '—'}{h.perfil && <div className="texto-apoio pequeno">{PERFIS[h.perfil]}</div>}</td>
                    <td className="texto-apoio">{resumirDetalhes(h)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Pagina>
  );
}
