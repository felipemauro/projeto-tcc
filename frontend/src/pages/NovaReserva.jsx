import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import Icone from '../components/Icone';
import { Alerta, Campo, Cartao, Pagina, PrioridadeBadge, Sugestoes, useAviso } from '../components/ui';
import { HORARIOS_AULA, TIPOS_DISCIPLINA, formatarDataLonga, hojeISO, minutos, paraHoraMin } from '../util';

const DECISOES = {
  APROVAR: { tipo: 'sucesso', texto: 'Horário livre. Sua reserva será aprovada automaticamente.' },
  PENDENTE: { tipo: 'info', texto: 'Horário disponível. A solicitação será enviada para aprovação da coordenação.' },
  ANALISE: { tipo: 'aviso', texto: 'Já existe reserva aprovada neste horário, mas sua solicitação tem prioridade maior. Ela será encaminhada para análise e possível remanejamento.' },
  BLOQUEAR: { tipo: 'erro', texto: 'Horário indisponível: já existe reserva aprovada com prioridade igual ou superior. Escolha um dos horários sugeridos.' },
};

/** Caso de uso "Solicitar Reserva" com verificação de conflitos e priorização em tempo real. */
export default function NovaReserva() {
  const navegar = useNavigate();
  const avisar = useAviso();
  const [params] = useSearchParams();
  const [labs, setLabs] = useState([]);
  const [disciplinas, setDisciplinas] = useState([]);
  const [ocupacoes, setOcupacoes] = useState([]);
  const [analise, setAnalise] = useState(null);
  const [verificando, setVerificando] = useState(false);
  const [erro, setErro] = useState(null);
  const [enviando, setEnviando] = useState(false);

  const inicioParam = params.get('inicio');
  const [f, setF] = useState({
    id_laboratorio: params.get('lab') || '',
    id_disciplina: '',
    data: params.get('data') || hojeISO(),
    hora_inicio: inicioParam || '',
    hora_fim: inicioParam ? paraHoraMin(Math.min(minutos(inicioParam) + 100, 23 * 60)) : '',
    qtd_alunos: '',
    finalidade: '',
  });
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));

  useEffect(() => {
    api.get('/laboratorios').then((l) => {
      setLabs(l);
      setF((x) => (x.id_laboratorio ? x : { ...x, id_laboratorio: String(l[0]?.id_laboratorio || '') }));
    });
    api.get('/disciplinas').then(setDisciplinas);
  }, []);

  const lab = labs.find((l) => String(l.id_laboratorio) === String(f.id_laboratorio));
  const completo = f.id_laboratorio && f.data && f.hora_inicio && f.hora_fim && Number(f.qtd_alunos) > 0;
  const corpo = useMemo(() => ({
    id_laboratorio: Number(f.id_laboratorio),
    id_disciplina: f.id_disciplina ? Number(f.id_disciplina) : null,
    data: f.data,
    hora_inicio: f.hora_inicio,
    hora_fim: f.hora_fim,
    qtd_alunos: Number(f.qtd_alunos),
    finalidade: f.finalidade || null,
  }), [f]);

  // Ocupação do laboratório no dia escolhido
  useEffect(() => {
    if (!f.id_laboratorio || !f.data) return;
    api.get(`/laboratorios/${f.id_laboratorio}/disponibilidade?data=${f.data}`)
      .then((r) => setOcupacoes(r.ocupacoes)).catch(() => setOcupacoes([]));
  }, [f.id_laboratorio, f.data]);

  // Verificação inteligente (com atraso para não sobrecarregar o servidor)
  useEffect(() => {
    setErro(null);
    if (!completo) { setAnalise(null); return undefined; }
    setVerificando(true);
    const t = setTimeout(() => {
      api.post('/reservas/verificar', corpo)
        .then(setAnalise)
        .catch((e) => setAnalise({ restricoes: [e.message], decisao: 'INVALIDA' }))
        .finally(() => setVerificando(false));
    }, 350);
    return () => clearTimeout(t);
  }, [corpo, completo]);

  const usarSugestao = (s) => setF((x) => ({ ...x, id_laboratorio: String(s.id_laboratorio), data: s.data, hora_inicio: s.hora_inicio, hora_fim: s.hora_fim }));

  const enviar = async (e) => {
    e.preventDefault();
    setEnviando(true);
    setErro(null);
    try {
      const r = await api.post('/reservas', corpo);
      avisar(r.reserva.status === 'APROVADA'
        ? 'Reserva confirmada e aprovada!'
        : 'Solicitação enviada! Você será notificado(a) quando for analisada.');
      navegar('/reservas/minhas');
    } catch (er) {
      setErro({ texto: er.message, sugestoes: er.corpo?.sugestoes, campos: er.corpo?.campos });
    } finally {
      setEnviando(false);
    }
  };

  const decisao = analise && !analise.restricoes?.length ? DECISOES[analise.decisao] : null;
  const bloqueado = analise?.decisao === 'BLOQUEAR' || analise?.restricoes?.length > 0;
  const det = analise?.prioridade?.detalhe;

  return (
    <Pagina titulo="Nova reserva" subtitulo="Preencha os dados; o sistema verifica conflitos e calcula a prioridade enquanto você digita.">
      <div className="layout-duas-colunas">
        <Cartao titulo="Dados da reserva">
          <form onSubmit={enviar} className="form-grade">
            {erro && <div className="col-2">
              <Alerta tipo="erro">{erro.texto}{erro.campos && <ul>{erro.campos.map((c) => <li key={c.campo}>{c.mensagem}</li>)}</ul>}</Alerta>
              <Sugestoes itens={erro.sugestoes} aoEscolher={usarSugestao} />
            </div>}

            <Campo rotulo="Laboratório *">
              <select value={f.id_laboratorio} onChange={(e) => set('id_laboratorio', e.target.value)} required>
                {labs.map((l) => <option key={l.id_laboratorio} value={l.id_laboratorio}>{l.nome} — {l.capacidade} lugares</option>)}
              </select>
            </Campo>
            <Campo rotulo="Disciplina" ajuda={f.id_disciplina ? TIPOS_DISCIPLINA[disciplinas.find((d) => String(d.id_disciplina) === f.id_disciplina)?.tipo] : 'Deixe em branco para reuniões ou outras atividades'}>
              <select value={f.id_disciplina} onChange={(e) => set('id_disciplina', e.target.value)}>
                <option value="">— Sem disciplina vinculada —</option>
                {Object.entries(TIPOS_DISCIPLINA).map(([tipo, rotulo]) => (
                  <optgroup key={tipo} label={rotulo}>
                    {disciplinas.filter((d) => d.tipo === tipo).map((d) => (
                      <option key={d.id_disciplina} value={d.id_disciplina}>{d.nome}{d.periodo ? ` (${d.periodo}º período)` : ''}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </Campo>
            <Campo rotulo="Data *">
              <input type="date" min={hojeISO()} value={f.data} onChange={(e) => set('data', e.target.value)} required />
            </Campo>
            <Campo rotulo="Quantidade de alunos *" ajuda={lab ? `Capacidade: ${lab.capacidade}` : undefined}>
              <input type="number" min="1" max={lab?.capacidade} value={f.qtd_alunos} onChange={(e) => set('qtd_alunos', e.target.value)} required />
            </Campo>
            <div className="col-2">
              <span className="campo-rotulo">Horário *</span>
              <div className="horarios-rapidos">
                {HORARIOS_AULA.map(([i, fim]) => (
                  <button type="button" key={i}
                    className={`chip ${f.hora_inicio === i && f.hora_fim === fim ? 'ativo' : ''}`}
                    onClick={() => setF((x) => ({ ...x, hora_inicio: i, hora_fim: fim }))}>
                    {i}–{fim}
                  </button>
                ))}
              </div>
            </div>
            <Campo rotulo="Início"><input type="time" step="300" value={f.hora_inicio} onChange={(e) => set('hora_inicio', e.target.value)} required /></Campo>
            <Campo rotulo="Término"><input type="time" step="300" value={f.hora_fim} onChange={(e) => set('hora_fim', e.target.value)} required /></Campo>
            <div className="col-2">
              <Campo rotulo="Finalidade / observações">
                <input value={f.finalidade} maxLength={255} onChange={(e) => set('finalidade', e.target.value)} placeholder="Ex.: aula prática de listas encadeadas" />
              </Campo>
            </div>
            <div className="col-2 acoes-form">
              <button type="button" className="btn btn-contorno" onClick={() => navegar(-1)}>Voltar</button>
              <button className="btn btn-primario" disabled={!completo || enviando || bloqueado || verificando}>
                {enviando ? 'Enviando…' : decisao && analise.decisao === 'APROVAR' ? 'Confirmar reserva' : 'Enviar solicitação'}
              </button>
            </div>
          </form>
        </Cartao>

        <div className="coluna-lateral">
          <Cartao titulo="Análise inteligente">
            {!completo && <p className="texto-apoio">Preencha laboratório, data, horário e quantidade de alunos para verificar a disponibilidade.</p>}
            {completo && verificando && <p className="texto-apoio"><span className="spinner" /> Verificando conflitos…</p>}
            {completo && !verificando && analise && <>
              {analise.restricoes?.length > 0 && <Alerta tipo="erro">{analise.restricoes.map((r) => <div key={r}>{r}</div>)}</Alerta>}
              {decisao && <Alerta tipo={decisao.tipo}>{decisao.texto}</Alerta>}
              {analise.prioridade && (
                <div className="bloco-prioridade">
                  <div className="bloco-prioridade-topo">
                    <span>Prioridade calculada</span>
                    <PrioridadeBadge valor={analise.prioridade.total} />
                  </div>
                  <ul className="composicao-lista">
                    <li><span>Natureza da disciplina</span><b>+{det.natureza.valor}</b></li>
                    <li><span>Proximidade da data ({det.proximidade.dias} dia{det.proximidade.dias === 1 ? '' : 's'})</span><b>+{det.proximidade.valor}</b></li>
                    <li><span>Ocupação do laboratório ({det.ocupacao.taxa}%)</span><b>+{det.ocupacao.valor}</b></li>
                    <li><span>Perfil do solicitante</span><b>+{det.perfil.valor}</b></li>
                  </ul>
                </div>
              )}
              {analise.conflitos?.length > 0 && (
                <div className="conflitos">
                  <h3><Icone nome="alerta" tamanho={16} /> Conflitos encontrados</h3>
                  {analise.conflitos.map((c) => (
                    <div key={c.id_reserva} className="conflito-item">
                      <span>{c.hora_inicio}–{c.hora_fim} · {c.disciplina_nome || 'Reserva'}</span>
                      <span className="texto-apoio">{c.usuario_nome} · {c.status === 'APROVADA' ? 'aprovada' : 'pendente'} · prioridade {c.prioridade}</span>
                    </div>
                  ))}
                </div>
              )}
              <Sugestoes itens={analise.sugestoes} aoEscolher={usarSugestao} />
            </>}
          </Cartao>

          {lab && (
            <Cartao titulo={`Ocupação em ${formatarDataLonga(f.data)}`}>
              <p className="texto-apoio">{lab.nome} · {lab.localizacao}</p>
              {ocupacoes.length === 0
                ? <p className="texto-apoio">Nenhuma reserva neste dia — laboratório livre.</p>
                : <ul className="lista-ocupacao">
                    {ocupacoes.map((o) => (
                      <li key={o.id_reserva} className={o.status === 'PENDENTE' ? 'pendente' : ''}>
                        <b>{o.hora_inicio}–{o.hora_fim}</b> {o.disciplina_nome || 'Reserva'}
                        <small>{o.status === 'PENDENTE' ? 'pendente' : o.usuario_nome}</small>
                      </li>
                    ))}
                  </ul>}
            </Cartao>
          )}
        </div>
      </div>
    </Pagina>
  );
}
