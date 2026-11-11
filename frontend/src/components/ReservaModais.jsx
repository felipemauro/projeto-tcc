/** Modais de ação sobre reservas: detalhes, alterar, aprovar, rejeitar e cancelar. */
import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { Alerta, Campo, Modal, PrioridadeBadge, StatusBadge, Sugestoes, useAviso } from './ui';
import { formatarDataLonga, formatarDataHora, PERFIS, TIPOS_DISCIPLINA, ehGestor } from '../util';
import { useAuth } from '../contexto/AuthContext';

function mensagemErro(e) {
  if (e.corpo?.codigo === 'VERSAO_DESATUALIZADA') {
    return 'Outro usuário modificou esta reserva enquanto você a analisava. Os dados foram atualizados — revise e tente novamente.';
  }
  return e.message;
}

export function DetalhesReserva({ reserva, aoFechar, aoAgir }) {
  const { usuario } = useAuth();
  const [historico, setHistorico] = useState([]);
  const gestor = ehGestor(usuario);
  useEffect(() => {
    if (reserva && gestor) api.get(`/historico?id_reserva=${reserva.id_reserva}`).then(setHistorico).catch(() => {});
  }, [reserva, gestor]);
  if (!reserva) return null;
  const r = reserva;
  const podeCancelar = ['PENDENTE', 'APROVADA'].includes(r.status) && (gestor || r.id_usuario === usuario.id);
  const podeAlterar = (gestor && ['PENDENTE', 'APROVADA'].includes(r.status)) || (r.id_usuario === usuario.id && r.status === 'PENDENTE');
  const d = r.detalhe_prioridade;

  return (
    <Modal
      titulo={`Reserva nº ${r.id_reserva}`}
      aberto
      aoFechar={aoFechar}
      rodape={
        <>
          {gestor && r.status === 'PENDENTE' && <>
            <button className="btn btn-sucesso" onClick={() => aoAgir('aprovar', r)}>Aprovar</button>
            <button className="btn btn-perigo-contorno" onClick={() => aoAgir('rejeitar', r)}>Rejeitar</button>
          </>}
          {podeAlterar && <button className="btn btn-contorno" onClick={() => aoAgir('alterar', r)}>Alterar</button>}
          {podeCancelar && <button className="btn btn-perigo-contorno" onClick={() => aoAgir('cancelar', r)}>Cancelar reserva</button>}
        </>
      }
    >
      <dl className="detalhes">
        <dt>Status</dt><dd><StatusBadge status={r.status} /></dd>
        <dt>Laboratório</dt><dd>{r.laboratorio_nome}</dd>
        <dt>Data</dt><dd>{formatarDataLonga(r.data)}</dd>
        <dt>Horário</dt><dd>{r.hora_inicio} às {r.hora_fim}</dd>
        <dt>Disciplina</dt><dd>{r.disciplina_nome ? `${r.disciplina_nome} (${TIPOS_DISCIPLINA[r.disciplina_tipo]})` : '—'}</dd>
        <dt>Solicitante</dt><dd>{r.usuario_nome} · {PERFIS[r.usuario_perfil]}</dd>
        {r.id_criador && r.id_criador !== r.id_usuario && <><dt>Registrada por</dt><dd>{r.criador_nome}</dd></>}
        <dt>Alunos</dt><dd>{r.qtd_alunos} de {r.laboratorio_capacidade} lugares</dd>
        {r.finalidade && <><dt>Finalidade</dt><dd>{r.finalidade}</dd></>}
        <dt>Prioridade</dt>
        <dd>
          <PrioridadeBadge valor={r.prioridade} detalhe={d} />
          {d && (
            <div className="composicao">
              natureza {d.natureza.valor} + proximidade {d.proximidade.valor} + ocupação {d.ocupacao.valor} + perfil {d.perfil.valor}
            </div>
          )}
        </dd>
        {r.motivo_decisao && <><dt>Observação</dt><dd>{r.motivo_decisao}</dd></>}
      </dl>
      {historico.length > 0 && (
        <div className="linha-tempo">
          <h3>Histórico</h3>
          {historico.map((h) => (
            <div key={h.id_historico}><small>{formatarDataHora(h.data_hora)}</small> {h.acao.replace(/_/g, ' ').toLowerCase()} — {h.usuario}</div>
          ))}
        </div>
      )}
    </Modal>
  );
}

export function AprovarReserva({ reserva, aoFechar, aoConcluir }) {
  const avisar = useAviso();
  const [conflitos, setConflitos] = useState(null);
  const [motivo, setMotivo] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

  const enviar = async (forcar = false) => {
    setEnviando(true); setErro('');
    try {
      await api.post(`/reservas/${reserva.id_reserva}/aprovar`, { versao: reserva.versao, forcar, motivo: motivo || undefined });
      avisar(forcar ? 'Reserva aprovada com remanejamento. Os afetados foram notificados.' : 'Reserva aprovada.');
      aoConcluir();
    } catch (e) {
      if (e.corpo?.codigo === 'CONFLITO_APROVADA') setConflitos(e.corpo.conflitos);
      else { setErro(mensagemErro(e)); if (e.corpo?.codigo === 'VERSAO_DESATUALIZADA') aoConcluir(false); }
    } finally { setEnviando(false); }
  };

  // Tenta aprovar direto; se houver conflito com aprovada, pede confirmação de remanejamento.
  const iniciou = useRef(false);
  useEffect(() => {
    if (iniciou.current) return;
    iniciou.current = true;
    enviar(false);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!conflitos && !erro) return null;
  return (
    <Modal
      titulo="Conflito com reserva aprovada"
      aberto
      aoFechar={aoFechar}
      rodape={conflitos && <>
        <button className="btn btn-contorno" onClick={aoFechar}>Voltar</button>
        <button className="btn btn-primario" disabled={enviando} onClick={() => enviar(true)}>Aprovar e remanejar</button>
      </>}
    >
      {erro && <Alerta tipo="erro">{erro}</Alerta>}
      {conflitos && <>
        <Alerta tipo="aviso">
          Já existe reserva aprovada neste horário. Ao confirmar, a(s) reserva(s) abaixo será(ão) <strong>remanejada(s)</strong>:
          o solicitante recebe uma notificação com horários alternativos sugeridos pelo sistema.
        </Alerta>
        <table className="tabela tabela-compacta">
          <thead><tr><th>Horário</th><th>Solicitante</th><th>Disciplina</th><th>Prioridade</th></tr></thead>
          <tbody>
            {conflitos.map((c) => (
              <tr key={c.id_reserva}>
                <td>{c.hora_inicio}–{c.hora_fim}</td><td>{c.usuario_nome}</td>
                <td>{c.disciplina_nome || '—'}</td><td><PrioridadeBadge valor={c.prioridade} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="texto-apoio">Prioridade da solicitação em análise: <PrioridadeBadge valor={reserva.prioridade} /></p>
        <Campo rotulo="Justificativa do remanejamento (opcional)">
          <input value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={500} placeholder="Ex.: aula prática obrigatória da matriz curricular" />
        </Campo>
      </>}
    </Modal>
  );
}

export function RejeitarReserva({ reserva, aoFechar, aoConcluir }) {
  const avisar = useAviso();
  const [motivo, setMotivo] = useState('');
  const [erro, setErro] = useState('');
  const enviar = async (e) => {
    e.preventDefault();
    try {
      await api.post(`/reservas/${reserva.id_reserva}/rejeitar`, { versao: reserva.versao, motivo });
      avisar('Solicitação rejeitada. O solicitante foi notificado.');
      aoConcluir();
    } catch (er) { setErro(mensagemErro(er)); }
  };
  return (
    <Modal titulo={`Rejeitar reserva nº ${reserva.id_reserva}`} aberto aoFechar={aoFechar}
      rodape={<>
        <button className="btn btn-contorno" onClick={aoFechar}>Voltar</button>
        <button className="btn btn-perigo" form="form-rejeitar" disabled={motivo.trim().length < 3}>Rejeitar</button>
      </>}>
      <form id="form-rejeitar" onSubmit={enviar}>
        {erro && <Alerta tipo="erro">{erro}</Alerta>}
        <p className="texto-apoio">{reserva.laboratorio_nome} · {formatarDataLonga(reserva.data)} · {reserva.hora_inicio}–{reserva.hora_fim} · {reserva.usuario_nome}</p>
        <Campo rotulo="Motivo da rejeição *">
          <textarea autoFocus rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={500} required />
        </Campo>
      </form>
    </Modal>
  );
}

export function CancelarReserva({ reserva, aoFechar, aoConcluir }) {
  const avisar = useAviso();
  const [motivo, setMotivo] = useState('');
  const [erro, setErro] = useState('');
  const enviar = async () => {
    try {
      await api.delete(`/reservas/${reserva.id_reserva}${motivo ? `?motivo=${encodeURIComponent(motivo)}` : ''}`);
      avisar('Reserva cancelada.');
      aoConcluir();
    } catch (e) { setErro(e.message); }
  };
  return (
    <Modal titulo="Cancelar reserva" aberto aoFechar={aoFechar}
      rodape={<>
        <button className="btn btn-contorno" onClick={aoFechar}>Voltar</button>
        <button className="btn btn-perigo" onClick={enviar}>Confirmar cancelamento</button>
      </>}>
      {erro && <Alerta tipo="erro">{erro}</Alerta>}
      <p>Deseja cancelar a reserva do <strong>{reserva.laboratorio_nome}</strong> em {formatarDataLonga(reserva.data)}, {reserva.hora_inicio}–{reserva.hora_fim}? O horário ficará livre para outros usuários.</p>
      <Campo rotulo="Motivo (opcional)">
        <input value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={500} />
      </Campo>
    </Modal>
  );
}

export function AlterarReserva({ reserva, aoFechar, aoConcluir }) {
  const avisar = useAviso();
  const { usuario } = useAuth();
  const [labs, setLabs] = useState([]);
  const [f, setF] = useState({
    id_laboratorio: reserva.id_laboratorio, data: reserva.data, hora_inicio: reserva.hora_inicio,
    hora_fim: reserva.hora_fim, qtd_alunos: reserva.qtd_alunos, motivo: '',
  });
  const [erro, setErro] = useState(null);
  useEffect(() => { api.get('/laboratorios').then(setLabs); }, []);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const enviar = async (e) => {
    e?.preventDefault();
    setErro(null);
    try {
      await api.patch(`/reservas/${reserva.id_reserva}`, {
        ...f, id_laboratorio: Number(f.id_laboratorio), qtd_alunos: Number(f.qtd_alunos),
        versao: reserva.versao, motivo: f.motivo || undefined,
      });
      avisar('Reserva alterada.');
      aoConcluir();
    } catch (er) {
      setErro({ texto: mensagemErro(er), sugestoes: er.corpo?.sugestoes });
      if (er.corpo?.codigo === 'VERSAO_DESATUALIZADA') aoConcluir(false);
    }
  };

  return (
    <Modal titulo={`Alterar reserva nº ${reserva.id_reserva}`} aberto aoFechar={aoFechar} largo
      rodape={<>
        <button className="btn btn-contorno" onClick={aoFechar}>Voltar</button>
        <button className="btn btn-primario" form="form-alterar">Salvar alteração</button>
      </>}>
      <form id="form-alterar" onSubmit={enviar} className="form-grade">
        {erro && <div className="col-2"><Alerta tipo="erro">{erro.texto}</Alerta>
          <Sugestoes itens={erro.sugestoes} aoEscolher={(s) => setF({ ...f, id_laboratorio: s.id_laboratorio, data: s.data, hora_inicio: s.hora_inicio, hora_fim: s.hora_fim })} />
        </div>}
        <Campo rotulo="Laboratório">
          <select value={f.id_laboratorio} onChange={set('id_laboratorio')}>
            {labs.map((l) => <option key={l.id_laboratorio} value={l.id_laboratorio}>{l.nome} ({l.capacidade} lugares)</option>)}
          </select>
        </Campo>
        <Campo rotulo="Data"><input type="date" value={f.data} onChange={set('data')} required /></Campo>
        <Campo rotulo="Início"><input type="time" value={f.hora_inicio} onChange={set('hora_inicio')} required /></Campo>
        <Campo rotulo="Término"><input type="time" value={f.hora_fim} onChange={set('hora_fim')} required /></Campo>
        <Campo rotulo="Quantidade de alunos"><input type="number" min="1" value={f.qtd_alunos} onChange={set('qtd_alunos')} required /></Campo>
        {ehGestor(usuario) && reserva.id_usuario !== usuario.id && (
          <Campo rotulo="Motivo (enviado ao solicitante)"><input value={f.motivo} onChange={set('motivo')} maxLength={500} /></Campo>
        )}
      </form>
    </Modal>
  );
}

/** Orquestra os modais a partir de uma ação ('detalhes' | 'aprovar' | ...). */
export function useAcoesReserva(aoAtualizar) {
  const [acao, setAcao] = useState(null);
  const fechar = () => setAcao(null);
  const concluir = (fecharModal = true) => { if (fecharModal) setAcao(null); aoAtualizar?.(); };
  const abrir = (tipo, reserva) => setAcao({ tipo, reserva });
  const modais = acao && (
    <>
      {acao.tipo === 'detalhes' && <DetalhesReserva reserva={acao.reserva} aoFechar={fechar} aoAgir={abrir} />}
      {acao.tipo === 'aprovar' && <AprovarReserva reserva={acao.reserva} aoFechar={fechar} aoConcluir={concluir} />}
      {acao.tipo === 'rejeitar' && <RejeitarReserva reserva={acao.reserva} aoFechar={fechar} aoConcluir={concluir} />}
      {acao.tipo === 'alterar' && <AlterarReserva reserva={acao.reserva} aoFechar={fechar} aoConcluir={concluir} />}
      {acao.tipo === 'cancelar' && <CancelarReserva reserva={acao.reserva} aoFechar={fechar} aoConcluir={concluir} />}
    </>
  );
  return { abrir, modais };
}
