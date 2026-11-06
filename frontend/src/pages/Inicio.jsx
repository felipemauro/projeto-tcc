import { Link, useNavigate } from 'react-router-dom';
import { api, qs } from '../api';
import GradeHorarios from '../components/GradeHorarios';
import Icone from '../components/Icone';
import { useAcoesReserva } from '../components/ReservaModais';
import { Cartao, Carregando, Pagina, StatusBadge, Vazio, useDados } from '../components/ui';
import { useAuth } from '../contexto/AuthContext';
import { ehGestor, formatarData, formatarDataLonga, hojeISO, paraHoraMin, parseData, somarDias } from '../util';

function saudacao() {
  const h = new Date().getHours();
  return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
}

export default function Inicio() {
  const { usuario } = useAuth();
  const navegar = useNavigate();
  const gestor = ehGestor(usuario);
  const hoje = hojeISO();

  const minhas = useDados(() => api.get(`/reservas${qs({ minhas: 'true', inicio: hoje, status: 'APROVADA,PENDENTE', limite: 6 })}`), []);
  const hojeLabs = useDados(() => Promise.all([
    api.get('/laboratorios'),
    api.get(`/reservas${qs({ inicio: hoje, fim: hoje, status: 'APROVADA,PENDENTE' })}`),
    api.get('/parametros'),
  ]), []);
  const pendentes = useDados(() => (gestor ? api.get('/reservas?status=PENDENTE&conflitos=true') : Promise.resolve([])), []);
  const { abrir, modais } = useAcoesReserva(() => { minhas.recarregar(); hojeLabs.recarregar(); });

  const [labs, reservasHoje, parametros] = hojeLabs.dados || [];
  const funcionaHoje = parametros?.funcionamento.diasSemana.includes(parseData(hoje).getDay());
  const primeiroNome = usuario.nome.replace(/^(Prof\.?|Profa\.?)\s+/i, '').split(' ')[0];
  const comConflito = pendentes.dados?.filter((p) => p.conflitos?.length).length || 0;

  return (
    <Pagina titulo={`${saudacao()}, ${primeiroNome}!`} subtitulo={formatarDataLonga(hoje)}>
      <div className="atalhos">
        <Link to="/reservas/nova" className="atalho atalho-destaque"><Icone nome="mais" tamanho={22} /><span>Nova reserva</span></Link>
        <Link to="/agenda" className="atalho"><Icone nome="agenda" tamanho={22} /><span>Ver agenda</span></Link>
        <Link to="/reservas/minhas" className="atalho"><Icone nome="lista" tamanho={22} /><span>Minhas reservas</span></Link>
        {gestor && (
          <Link to="/gestao/solicitacoes" className="atalho">
            <Icone nome="aprovar" tamanho={22} />
            <span>{pendentes.dados?.length ?? '…'} solicitações pendentes</span>
            {comConflito > 0 && <small className="atalho-alerta">{comConflito} com conflito</small>}
          </Link>
        )}
      </div>

      <div className="layout-inicio">
        <Cartao titulo="Minhas próximas reservas" acoes={<Link to="/reservas/minhas" className="link">Ver todas</Link>}>
          {!minhas.dados ? <Carregando /> : minhas.dados.length === 0 ? (
            <Vazio>Você não possui reservas futuras.</Vazio>
          ) : (
            <ul className="lista-reservas">
              {minhas.dados.map((r) => (
                <li key={r.id_reserva} onClick={() => abrir('detalhes', r)}>
                  <div className="lista-data">
                    <b>{formatarData(r.data).slice(0, 5)}</b>
                    <small>{r.hora_inicio}</small>
                  </div>
                  <div className="lista-info">
                    <strong>{r.disciplina_nome || r.finalidade || 'Reserva'}</strong>
                    <span>{r.laboratorio_nome} · {r.hora_inicio}–{r.hora_fim}</span>
                  </div>
                  <StatusBadge status={r.status} />
                </li>
              ))}
            </ul>
          )}
        </Cartao>

        <Cartao titulo="Laboratórios hoje" acoes={<Link to="/agenda" className="link">Abrir agenda</Link>} className="cartao-grade">
          {!labs ? <Carregando /> : !funcionaHoje ? (
            <Vazio>Os laboratórios não funcionam hoje. <Link to={`/agenda?data=${somarDias(hoje, 1)}`}>Ver próximo dia</Link></Vazio>
          ) : (
            <GradeHorarios
              colunas={labs.map((l) => ({
                chave: l.id_laboratorio,
                titulo: l.nome.replace('Laboratório de Informática', 'Lab. Info.'),
                subtitulo: `${l.capacidade} lugares`,
                idLab: l.id_laboratorio,
                reservas: reservasHoje.filter((r) => r.id_laboratorio === l.id_laboratorio).map((r) => ({ ...r, minha: r.id_usuario === usuario.id })),
              }))}
              inicio={parametros.funcionamento.inicio}
              fim={parametros.funcionamento.fim}
              aoClicarReserva={(r) => abrir('detalhes', r)}
              aoClicarVazio={(c, min) => navegar(`/reservas/nova${qs({ lab: c.idLab, data: hoje, inicio: paraHoraMin(min) })}`)}
            />
          )}
        </Cartao>
      </div>
      {modais}
    </Pagina>
  );
}
