import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import Icone from '../components/Icone';
import { Alerta, Campo, Cartao, Pagina, PrioridadeBadge, Sugestoes, useAviso } from '../components/ui';
import {
  AULAS, DIAS, DIAS_CURTOS, MAX_AULAS_SEGUIDAS, PERFIS, TURNOS, PERFIS_SERIE, TIPOS_DISCIPLINA, formatarData, formatarDataLonga, hojeISO,
  minutos, paraHoraMin, parseData, somarDias,
} from '../util';
import { useAuth } from '../contexto/AuthContext';

const DECISOES = {
  APROVAR: { tipo: 'sucesso', texto: 'Horário livre. A reserva será aprovada automaticamente.' },
  PENDENTE: { tipo: 'info', texto: 'Horário disponível. A solicitação será enviada para aprovação da coordenação.' },
  ANALISE: { tipo: 'aviso', texto: 'Já existe reserva aprovada neste horário, mas esta solicitação tem prioridade maior. Ela será encaminhada para análise e possível remanejamento.' },
  BLOQUEAR: { tipo: 'erro', texto: 'Horário indisponível: já existe reserva aprovada com prioridade igual ou superior. Escolha um dos horários sugeridos.' },
};

const SITUACOES = {
  APROVAR: ['tag-ok', 'Aprovação automática'],
  PENDENTE: ['tag-pratica', 'Aguardará aprovação'],
  ANALISE: ['tag-aviso', 'Em análise (conflito)'],
  BLOQUEAR: ['tag-perigo', 'Bloqueada – não será criada'],
  INVALIDA: ['tag-perigo', 'Inválida – não será criada'],
};

/** Prévia de uma reserva recorrente: situação de cada data da série. */
function PreviaSerie({ previa }) {
  const { resumo, ocorrencias } = previa;
  const prioridades = ocorrencias.map((o) => o.prioridade);
  const tipo = resumo.criaveis === 0 ? 'erro' : resumo.criaveis < resumo.total ? 'aviso' : 'sucesso';
  return (
    <>
      <Alerta tipo={tipo}>
        <b>{resumo.criaveis} de {resumo.total}</b> datas podem ser reservadas
        {resumo.aprovadasAutomaticamente > 0 && <> · {resumo.aprovadasAutomaticamente} com aprovação automática</>}
        {resumo.pendentes > 0 && <> · {resumo.pendentes} aguardarão aprovação</>}
        {resumo.bloqueadas + resumo.invalidas > 0 && <> · <b>{resumo.bloqueadas + resumo.invalidas} não serão criadas</b></>}.
      </Alerta>
      <p className="texto-apoio">Prioridade das datas: {Math.min(...prioridades)} a {Math.max(...prioridades)} (datas mais próximas pontuam mais).</p>
      <ul className="lista-serie">
        {ocorrencias.map((o) => {
          const [classe, rotulo] = SITUACOES[o.situacao];
          return (
            <li key={o.data} className={['BLOQUEAR', 'INVALIDA'].includes(o.situacao) ? 'ignorada' : ''}>
              <div className="lista-serie-linha">
                <b>{formatarData(o.data)}</b> <span className="texto-apoio">{o.dia_semana}</span>
                <span className={`tag ${classe}`}>{rotulo}</span>
              </div>
              {o.restricoes.length > 0 && <small>{o.restricoes[0]}</small>}
              {o.situacao === 'BLOQUEAR' && o.conflitos[0] && (
                <small>Ocupado por {o.conflitos[0].disciplina_nome || 'reserva'} ({o.conflitos[0].usuario_nome}).
                  {o.sugestao && <> Livre: {o.sugestao.laboratorio}, {formatarData(o.sugestao.data)} {o.sugestao.hora_inicio}–{o.sugestao.hora_fim}.</>}
                </small>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}

// Tela de nova reserva, com a análise de conflitos e prioridade enquanto o usuário preenche
// Término padrão ao chegar pela agenda: duas aulas seguidas no mesmo turno (ou uma, se for a última).
function fimDuasAulas(inicio) {
  const aula = AULAS.find((a) => a.inicio === inicio);
  if (!aula) return paraHoraMin(Math.min(minutos(inicio) + 100, 22 * 60 + 55));
  const proxima = AULAS[aula.id + 1];
  return proxima && proxima.indiceTurno === aula.indiceTurno ? proxima.fim : aula.fim;
}

export default function NovaReserva() {
  const navegar = useNavigate();
  const avisar = useAviso();
  const { usuario } = useAuth();
  const podeAgendarParaOutros = usuario.perfil === 'ADMINISTRATIVO';
  const podeRepetirPerfil = PERFIS_SERIE.includes(usuario.perfil);
  const [usuarios, setUsuarios] = useState([]);
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
    hora_fim: inicioParam ? fimDuasAulas(inicioParam) : '',
    qtd_alunos: '',
    finalidade: '',
    id_usuario: '',
    repetir: false,
    data_fim: '',
    dias_semana: [],
  });
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));

  // A repetição semanal não vale para discentes (nem quando o administrativo agenda para um discente)
  const beneficiarioSelecionado = usuarios.find((u) => String(u.id_usuario) === String(f.id_usuario));
  const paraDiscente = beneficiarioSelecionado?.perfil === 'DISCENTE';
  const podeRepetir = podeRepetirPerfil && !paraDiscente;
  useEffect(() => {
    if (!podeRepetir && f.repetir) setF((x) => ({ ...x, repetir: false }));
  }, [podeRepetir, f.repetir]);

  useEffect(() => {
    api.get('/laboratorios').then((l) => {
      setLabs(l);
      setF((x) => (x.id_laboratorio ? x : { ...x, id_laboratorio: String(l[0]?.id_laboratorio || '') }));
    });
    api.get('/disciplinas').then(setDisciplinas);
    if (podeAgendarParaOutros) {
      api.get('/usuarios').then((l) => setUsuarios(l.filter((u) => u.ativo && u.id_usuario !== usuario.id)));
    }
  }, [podeAgendarParaOutros, usuario.id]);

  const lab = labs.find((l) => String(l.id_laboratorio) === String(f.id_laboratorio));

  // Seleção por aulas: a aula de início e quantas aulas seguidas (no mesmo turno)
  // definem o horário. Se o horário digitado não bater com a grade, os campos ficam em branco.
  const aulaInicial = AULAS.find((a) => a.inicio === f.hora_inicio);
  const aulasDisponiveis = aulaInicial
    ? AULAS.filter((a) => a.indiceTurno === aulaInicial.indiceTurno && a.id >= aulaInicial.id).slice(0, MAX_AULAS_SEGUIDAS)
    : [];
  const qtdAulas = aulasDisponiveis.findIndex((a) => a.fim === f.hora_fim) + 1;
  const escolherAulas = (id, quantidade) => {
    const inicial = AULAS[id];
    if (!inicial) return;
    const doTurno = AULAS.filter((a) => a.indiceTurno === inicial.indiceTurno && a.id >= id);
    const ultima = doTurno[Math.min(quantidade, doTurno.length, MAX_AULAS_SEGUIDAS) - 1];
    setF((x) => ({ ...x, hora_inicio: inicial.inicio, hora_fim: ultima.fim }));
  };
  const completo = f.id_laboratorio && f.data && f.hora_inicio && f.hora_fim && Number(f.qtd_alunos) > 0
    && (!f.repetir || (f.data_fim && f.dias_semana.length > 0));
  const corpo = useMemo(() => ({
    id_laboratorio: Number(f.id_laboratorio),
    id_disciplina: f.id_disciplina ? Number(f.id_disciplina) : null,
    data: f.data,
    hora_inicio: f.hora_inicio,
    hora_fim: f.hora_fim,
    qtd_alunos: Number(f.qtd_alunos),
    finalidade: f.finalidade || null,
    ...(f.id_usuario ? { id_usuario: Number(f.id_usuario) } : {}),
    ...(f.repetir ? { data_fim: f.data_fim, dias_semana: f.dias_semana } : {}),
  }), [f]);

  const alternarRepeticao = (ligar) => setF((x) => ({
    ...x,
    repetir: ligar,
    // padrão: o dia da semana da data inicial, por 15 semanas (aprox. um semestre)
    dias_semana: ligar && x.dias_semana.length === 0 ? [parseData(x.data).getDay()] : x.dias_semana,
    data_fim: ligar && !x.data_fim ? somarDias(x.data, 7 * 15 - 1) : x.data_fim,
  }));
  const alternarDia = (d) => setF((x) => ({
    ...x,
    dias_semana: x.dias_semana.includes(d) ? x.dias_semana.filter((y) => y !== d) : [...x.dias_semana, d].sort(),
  }));

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
      api.post(f.repetir ? '/reservas/serie/verificar' : '/reservas/verificar', corpo)
        .then(setAnalise)
        .catch((e) => setAnalise({ restricoes: [e.message], decisao: 'INVALIDA' }))
        .finally(() => setVerificando(false));
    }, f.repetir ? 600 : 350);
    return () => clearTimeout(t);
  }, [corpo, completo, f.repetir]);

  const usarSugestao = (s) => setF((x) => ({ ...x, id_laboratorio: String(s.id_laboratorio), data: s.data, hora_inicio: s.hora_inicio, hora_fim: s.hora_fim }));

  const enviar = async (e) => {
    e.preventDefault();
    setEnviando(true);
    setErro(null);
    try {
      if (f.repetir) {
        const r = await api.post('/reservas/serie', corpo);
        const partes = [`${r.criadas} reserva(s) semanais criadas`];
        if (r.aprovadas) partes.push(`${r.aprovadas} já aprovada(s)`);
        if (r.ignoradas.length) partes.push(`${r.ignoradas.length} data(s) ignorada(s) por conflito`);
        avisar(partes.join(' · ') + (f.id_usuario ? '. A pessoa foi notificada.' : '.'));
        navegar(f.id_usuario ? `/agenda?modo=semana&lab=${f.id_laboratorio}&data=${f.data}` : '/reservas/minhas');
        return;
      }
      const r = await api.post('/reservas', corpo);
      if (f.id_usuario) {
        avisar(`Reserva registrada para ${r.reserva.usuario_nome}${r.reserva.status === 'APROVADA' ? ' e aprovada' : ''}. A pessoa foi notificada.`);
        navegar('/agenda?' + new URLSearchParams({ data: r.reserva.data }).toString());
        return;
      }
      avisar(r.reserva.status === 'APROVADA'
        ? 'Reserva confirmada e aprovada!'
        : 'Solicitação enviada! Você será notificado(a) quando for analisada.');
      navegar('/reservas/minhas');
    } catch (er) {
      setErro({ texto: er.message, sugestoes: er.corpo?.sugestoes, campos: er.corpo?.campos });
      if (er.corpo?.ocorrencias) setAnalise({ ocorrencias: er.corpo.ocorrencias, resumo: er.corpo.resumo });
    } finally {
      setEnviando(false);
    }
  };

  const ehSerie = !!analise?.ocorrencias;
  const decisaoBase = analise && !ehSerie && !analise.restricoes?.length ? DECISOES[analise.decisao] : null;
  // O coordenador aprova as próprias solicitações manualmente, na aba Solicitações
  const decisao = decisaoBase && analise.decisao === 'PENDENTE' && usuario.perfil === 'COORDENADOR'
    ? { ...decisaoBase, texto: 'Horário disponível. A solicitação ficará pendente: aprove-a na aba Solicitações.' }
    : decisaoBase;
  const bloqueado = ehSerie
    ? analise.resumo.criaveis === 0
    : analise?.decisao === 'BLOQUEAR' || analise?.restricoes?.length > 0;
  const textoBotao = enviando ? 'Enviando…'
    : ehSerie && f.repetir ? `Criar ${analise.resumo.criaveis} reserva${analise.resumo.criaveis === 1 ? '' : 's'}`
      : decisao && analise.decisao === 'APROVAR' ? 'Confirmar reserva' : 'Enviar solicitação';
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

            {podeAgendarParaOutros && (
              <div className="col-2">
                <Campo rotulo="Reservar para *" ajuda={f.id_usuario
                  ? 'A reserva ficará no nome da pessoa selecionada, que será notificada. A prioridade considera o perfil dela.'
                  : 'Escolha outra pessoa para registrar a reserva em nome dela.'}>
                  <select value={f.id_usuario} onChange={(e) => set('id_usuario', e.target.value)}>
                    <option value="">Para mim — {usuario.nome}</option>
                    {['DOCENTE', 'COORDENADOR', 'DISCENTE', 'ADMINISTRATIVO'].map((perfil) => {
                      const grupo = usuarios.filter((u) => u.perfil === perfil);
                      return grupo.length > 0 && (
                        <optgroup key={perfil} label={PERFIS[perfil]}>
                          {grupo.map((u) => <option key={u.id_usuario} value={u.id_usuario}>{u.nome} ({u.email})</option>)}
                        </optgroup>
                      );
                    })}
                  </select>
                </Campo>
              </div>
            )}
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
            <Campo rotulo={f.repetir ? 'Data inicial *' : 'Data *'}>
              <input type="date" min={hojeISO()} value={f.data} onChange={(e) => set('data', e.target.value)} required />
            </Campo>
            <Campo rotulo="Quantidade de alunos *" ajuda={lab ? `Capacidade: ${lab.capacidade}` : undefined}>
              <input type="number" min="1" max={lab?.capacidade} value={f.qtd_alunos} onChange={(e) => set('qtd_alunos', e.target.value)} required />
            </Campo>
            <Campo rotulo="Aula inicial" ajuda="Aulas de 50 minutos">
              <select value={aulaInicial ? aulaInicial.id : ''} onChange={(e) => e.target.value !== '' && escolherAulas(Number(e.target.value), qtdAulas || 2)}>
                <option value="">Selecione</option>
                {TURNOS.map((t) => (
                  <optgroup key={t.nome} label={t.nome}>
                    {AULAS.filter((a) => a.turno === t.nome).map((a) => (
                      <option key={a.id} value={a.id}>{a.ordem}ª aula - {a.inicio} às {a.fim}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </Campo>
            <Campo rotulo="Quantidade de aulas" ajuda={aulaInicial && qtdAulas ? `Das ${f.hora_inicio} às ${f.hora_fim}` : 'Ou digite o horário abaixo'}>
              <select value={qtdAulas || ''} disabled={!aulaInicial} onChange={(e) => escolherAulas(aulaInicial.id, Number(e.target.value))}>
                {!qtdAulas && <option value="">-</option>}
                {aulasDisponiveis.map((a, i) => <option key={a.id} value={i + 1}>{i + 1} {i === 0 ? 'aula' : 'aulas'}</option>)}
              </select>
            </Campo>
            <Campo rotulo="Início"><input type="time" step="300" value={f.hora_inicio} onChange={(e) => set('hora_inicio', e.target.value)} required /></Campo>
            <Campo rotulo="Término"><input type="time" step="300" value={f.hora_fim} onChange={(e) => set('hora_fim', e.target.value)} required /></Campo>
            {podeRepetirPerfil && paraDiscente && (
              <p className="col-2 texto-apoio aviso-repeticao">Reservas semanais não estão disponíveis para discentes: registre uma data por vez.</p>
            )}
            {podeRepetir && <div className="col-2 bloco-repeticao">
              <div className="segmentado" role="group" aria-label="Repetição">
                <button type="button" className={!f.repetir ? 'ativo' : ''} onClick={() => alternarRepeticao(false)}>Apenas nesta data</button>
                <button type="button" className={f.repetir ? 'ativo' : ''} onClick={() => alternarRepeticao(true)}>Repetir semanalmente</button>
              </div>
              {f.repetir && (
                <div className="form-grade repeticao-campos">
                  <div className="col-2">
                    <span className="campo-rotulo">Dias da semana em que leciona *</span>
                    <div className="horarios-rapidos">
                      {[1, 2, 3, 4, 5, 6].map((d) => (
                        <button type="button" key={d} title={DIAS[d]}
                          className={`chip ${f.dias_semana.includes(d) ? 'ativo' : ''}`} onClick={() => alternarDia(d)}>
                          {DIAS_CURTOS[d]}
                        </button>
                      ))}
                    </div>
                  </div>
                  <Campo rotulo="Repetir até *" ajuda="Ex.: último dia de aula do semestre">
                    <input type="date" min={f.data} max={somarDias(f.data, 200)} value={f.data_fim} onChange={(e) => set('data_fim', e.target.value)} required />
                  </Campo>
                  <p className="texto-apoio repeticao-dica">
                    Cada data passa pelas mesmas regras de conflito e prioridade. As datas com conflito são mostradas na análise ao lado e não serão criadas.
                  </p>
                </div>
              )}
            </div>}
            <div className="col-2">
              <Campo rotulo="Finalidade / observações">
                <input value={f.finalidade} maxLength={255} onChange={(e) => set('finalidade', e.target.value)} placeholder="Ex.: aula prática de listas encadeadas" />
              </Campo>
            </div>
            <div className="col-2 acoes-form">
              <button type="button" className="btn btn-contorno" onClick={() => navegar(-1)}>Voltar</button>
              <button className="btn btn-primario" disabled={!completo || enviando || bloqueado || verificando}>
                {textoBotao}
              </button>
            </div>
          </form>
        </Cartao>

        <div className="coluna-lateral">
          <Cartao titulo="Análise inteligente">
            {!completo && <p className="texto-apoio">Preencha laboratório, data, horário e quantidade de alunos{f.repetir ? ', os dias da semana e a data final' : ''} para verificar a disponibilidade.</p>}
            {completo && verificando && <p className="texto-apoio"><span className="spinner" /> Verificando conflitos{f.repetir ? ' em todas as datas' : ''}…</p>}
            {completo && !verificando && ehSerie && <PreviaSerie previa={analise} />}
            {completo && !verificando && analise && !ehSerie && <>
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
