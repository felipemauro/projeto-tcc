import { useState } from 'react';
import { api, qs } from '../api';
import Icone from '../components/Icone';
import { useAcoesReserva } from '../components/ReservaModais';
import { Carregando, Pagina, PrioridadeBadge, StatusBadge, Vazio, useDados } from '../components/ui';
import { PERFIS, formatarData, formatarDataHora, hojeISO } from '../util';

/** Casos de uso "Aprovar", "Rejeitar" e "Alterar Reserva" (Coordenador / Administrativo). */
export default function Solicitacoes() {
  const [aba, setAba] = useState('pendentes');
  const [idLab, setIdLab] = useState('');
  const labs = useDados(() => api.get('/laboratorios'), [], { tempoReal: false });
  const { dados, carregando, recarregar } = useDados(
    () => api.get(`/reservas${qs(aba === 'pendentes'
      ? { status: 'PENDENTE', ordem: 'prioridade', conflitos: 'true', id_laboratorio: idLab }
      : { status: 'APROVADA', inicio: hojeISO(), id_laboratorio: idLab })}`),
    [aba, idLab]
  );
  const { abrir, modais } = useAcoesReserva(recarregar);

  return (
    <Pagina
      titulo="Solicitações de reserva"
      subtitulo="Pendentes ordenadas pela prioridade calculada. Conflitos de horário são destacados."
    >
      <div className="barra-filtros">
        <div className="segmentado">
          <button className={aba === 'pendentes' ? 'ativo' : ''} onClick={() => setAba('pendentes')}>Aguardando decisão</button>
          <button className={aba === 'aprovadas' ? 'ativo' : ''} onClick={() => setAba('aprovadas')}>Aprovadas (próximas)</button>
        </div>
        <select value={idLab} onChange={(e) => setIdLab(e.target.value)} aria-label="Laboratório">
          <option value="">Todos os laboratórios</option>
          {labs.dados?.map((l) => <option key={l.id_laboratorio} value={l.id_laboratorio}>{l.nome}</option>)}
        </select>
      </div>

      <div className="cartao">
        {carregando && !dados ? <Carregando /> : !dados?.length ? (
          <Vazio>{aba === 'pendentes' ? 'Nenhuma solicitação aguardando decisão. 🎉' : 'Nenhuma reserva aprovada a partir de hoje.'}</Vazio>
        ) : (
          <div className="tabela-rolagem">
            <table className="tabela">
              <thead>
                <tr>
                  <th>Prioridade</th><th>Data / horário</th><th>Laboratório</th><th>Disciplina</th>
                  <th>Solicitante</th><th>Alunos</th>{aba === 'pendentes' ? <th>Situação</th> : <th>Status</th>}<th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {dados.map((r) => {
                  const contraAprovada = r.conflitos?.some((c) => c.status === 'APROVADA');
                  const concorrentes = r.conflitos?.filter((c) => c.status === 'PENDENTE').length || 0;
                  return (
                    <tr key={r.id_reserva} className={contraAprovada ? 'linha-conflito' : ''}>
                      <td><PrioridadeBadge valor={r.prioridade} detalhe={r.detalhe_prioridade} /></td>
                      <td><b>{formatarData(r.data)}</b><br />{r.hora_inicio}–{r.hora_fim}</td>
                      <td>{r.laboratorio_nome}</td>
                      <td>{r.disciplina_nome || r.finalidade || '—'}</td>
                      <td>{r.usuario_nome}<div className="texto-apoio pequeno">{PERFIS[r.usuario_perfil]} · {formatarDataHora(r.criado_em)}</div>{r.id_criador && r.id_criador !== r.id_usuario && <div className="texto-apoio pequeno">registrada por {r.criador_nome}</div>}</td>
                      <td>{r.qtd_alunos}/{r.laboratorio_capacidade}</td>
                      <td>
                        {aba === 'pendentes' ? (
                          contraAprovada ? <span className="tag tag-perigo"><Icone nome="alerta" tamanho={13} /> Conflita com aprovada</span>
                            : concorrentes ? <span className="tag tag-aviso">{concorrentes} concorrente(s)</span>
                              : <span className="tag tag-ok">Horário livre</span>
                        ) : <StatusBadge status={r.status} />}
                      </td>
                      <td className="acoes-linha">
                        {aba === 'pendentes' && <>
                          <button className="btn btn-sm btn-sucesso" onClick={() => abrir('aprovar', r)} title="Aprovar"><Icone nome="check" tamanho={15} /> Aprovar</button>
                          <button className="btn btn-sm btn-perigo-contorno" onClick={() => abrir('rejeitar', r)} title="Rejeitar"><Icone nome="x" tamanho={15} /></button>
                        </>}
                        <button className="btn btn-sm btn-contorno" onClick={() => abrir('alterar', r)} title="Alterar"><Icone nome="editar" tamanho={15} /></button>
                        <button className="btn btn-sm btn-contorno" onClick={() => abrir('detalhes', r)} title="Detalhes"><Icone nome="info" tamanho={15} /></button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {modais}
    </Pagina>
  );
}
