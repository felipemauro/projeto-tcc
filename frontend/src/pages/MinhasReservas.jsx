import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, qs } from '../api';
import Icone from '../components/Icone';
import { useAcoesReserva } from '../components/ReservaModais';
import { Carregando, Pagina, PrioridadeBadge, StatusBadge, Vazio, useDados } from '../components/ui';
import { STATUS, formatarData, hojeISO, somarDias } from '../util';

export default function MinhasReservas() {
  const [filtro, setFiltro] = useState({ periodo: 'proximas', status: '' });
  const intervalo = filtro.periodo === 'proximas'
    ? { inicio: hojeISO() }
    : filtro.periodo === 'anteriores'
      ? { inicio: somarDias(hojeISO(), -180), fim: somarDias(hojeISO(), -1) }
      : {};
  const { dados, carregando, recarregar } = useDados(
    () => api.get(`/reservas${qs({ minhas: 'true', status: filtro.status, ...intervalo })}`),
    [filtro.periodo, filtro.status]
  );
  const { abrir, modais } = useAcoesReserva(recarregar);
  const lista = filtro.periodo === 'anteriores' ? [...(dados || [])].reverse() : dados || [];

  return (
    <Pagina
      titulo="Minhas reservas"
      subtitulo="Acompanhe o andamento das suas solicitações."
      acoes={<Link className="btn btn-primario" to="/reservas/nova"><Icone nome="mais" /> Nova reserva</Link>}
    >
      <div className="barra-filtros">
        <div className="segmentado">
          {[['proximas', 'Próximas'], ['anteriores', 'Anteriores'], ['todas', 'Todas']].map(([v, r]) => (
            <button key={v} className={filtro.periodo === v ? 'ativo' : ''} onClick={() => setFiltro({ ...filtro, periodo: v })}>{r}</button>
          ))}
        </div>
        <select value={filtro.status} onChange={(e) => setFiltro({ ...filtro, status: e.target.value })} aria-label="Status">
          <option value="">Todos os status</option>
          {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>

      <div className="cartao">
        {carregando && !dados ? <Carregando /> : lista.length === 0 ? (
          <Vazio>Nenhuma reserva encontrada. <Link to="/reservas/nova">Solicitar reserva</Link></Vazio>
        ) : (
          <div className="tabela-rolagem">
            <table className="tabela">
              <thead>
                <tr><th>Data</th><th>Horário</th><th>Laboratório</th><th>Disciplina</th><th>Prioridade</th><th>Status</th><th /></tr>
              </thead>
              <tbody>
                {lista.map((r) => (
                  <tr key={r.id_reserva} className="linha-clicavel" onClick={() => abrir('detalhes', r)}>
                    <td>{formatarData(r.data)}</td>
                    <td>{r.hora_inicio}–{r.hora_fim}</td>
                    <td>{r.laboratorio_nome}</td>
                    <td>{r.disciplina_nome || r.finalidade || '—'}</td>
                    <td><PrioridadeBadge valor={r.prioridade} detalhe={r.detalhe_prioridade} /></td>
                    <td>
                      <StatusBadge status={r.status} />
                      {r.motivo_decisao && r.status === 'REJEITADA' && <div className="texto-apoio pequeno">{r.motivo_decisao}</div>}
                    </td>
                    <td className="acoes-linha" onClick={(e) => e.stopPropagation()}>
                      {r.status === 'PENDENTE' && <button className="btn btn-sm btn-contorno" onClick={() => abrir('alterar', r)}>Alterar</button>}
                      {['PENDENTE', 'APROVADA'].includes(r.status) && r.data >= hojeISO() &&
                        <button className="btn btn-sm btn-perigo-contorno" onClick={() => abrir('cancelar', r)}>Cancelar</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {modais}
    </Pagina>
  );
}
