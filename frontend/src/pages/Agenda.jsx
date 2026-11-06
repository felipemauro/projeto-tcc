import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api, qs } from '../api';
import GradeHorarios from '../components/GradeHorarios';
import Icone from '../components/Icone';
import { useAcoesReserva } from '../components/ReservaModais';
import { Carregando, Pagina, useDados } from '../components/ui';
import { useAuth } from '../contexto/AuthContext';
import {
  DIAS_CURTOS, formatarData, formatarDataLonga, hojeISO, inicioSemana, parseData, paraHoraMin, somarDias,
} from '../util';

/** Caso de uso "Consultar Disponibilidade" / "Visualizar Horários Agendados". */
export default function Agenda() {
  const { usuario } = useAuth();
  const navegar = useNavigate();
  const [params, setParams] = useSearchParams();
  const modo = params.get('modo') || 'dia';
  const data = params.get('data') || hojeISO();
  const idLab = params.get('lab') || '';
  const atualizar = (novo) => setParams({ modo, data, lab: idLab, ...novo });

  const semana = inicioSemana(data);
  const intervalo = modo === 'dia' ? [data, data] : [semana, somarDias(semana, 5)];

  const labs = useDados(() => api.get('/laboratorios'), []);
  const parametros = useDados(() => api.get('/parametros'), [], { tempoReal: false });
  const reservas = useDados(
    () => api.get(`/reservas${qs({ inicio: intervalo[0], fim: intervalo[1], status: 'APROVADA,PENDENTE' })}`),
    [intervalo[0], intervalo[1]]
  );
  const { abrir, modais } = useAcoesReserva(reservas.recarregar);

  const labSelecionado = idLab || labs.dados?.[0]?.id_laboratorio;
  const func = parametros.dados?.funcionamento;

  const colunas = useMemo(() => {
    if (!labs.dados || !reservas.dados) return [];
    const marcar = (r) => ({ ...r, minha: r.id_usuario === usuario.id });
    if (modo === 'dia') {
      return labs.dados.map((l) => ({
        chave: l.id_laboratorio,
        titulo: l.nome,
        subtitulo: `${l.capacidade} lugares · ${l.localizacao}`,
        idLab: l.id_laboratorio,
        data,
        reservas: reservas.dados.filter((r) => r.id_laboratorio === l.id_laboratorio).map(marcar),
      }));
    }
    return Array.from({ length: 6 }, (_, i) => {
      const d = somarDias(semana, i);
      return {
        chave: d,
        titulo: `${DIAS_CURTOS[parseData(d).getDay()]} ${formatarData(d).slice(0, 5)}`,
        destaque: d === hojeISO(),
        indisponivel: func && !func.diasSemana.includes(parseData(d).getDay()),
        idLab: Number(labSelecionado),
        data: d,
        reservas: reservas.dados
          .filter((r) => r.data === d && r.id_laboratorio === Number(labSelecionado))
          .map((r) => ({ ...marcar(r), rotuloExtra: r.usuario_nome })),
      };
    });
  }, [labs.dados, reservas.dados, modo, data, semana, labSelecionado, usuario.id, func]);

  const passo = modo === 'dia' ? 1 : 7;
  const titulo = modo === 'dia'
    ? formatarDataLonga(data)
    : `Semana de ${formatarData(semana)} a ${formatarData(somarDias(semana, 5))}`;

  return (
    <Pagina
      titulo="Agenda dos laboratórios"
      subtitulo="Consulte a ocupação e clique em um horário livre para solicitar uma reserva."
      acoes={<button className="btn btn-primario" onClick={() => navegar('/reservas/nova')}><Icone nome="mais" /> Nova reserva</button>}
    >
      <div className="barra-filtros">
        <div className="segmentado" role="group" aria-label="Visualização">
          <button className={modo === 'dia' ? 'ativo' : ''} onClick={() => atualizar({ modo: 'dia' })}>Dia (todos os laboratórios)</button>
          <button className={modo === 'semana' ? 'ativo' : ''} onClick={() => atualizar({ modo: 'semana' })}>Semana (por laboratório)</button>
        </div>
        {modo === 'semana' && (
          <select value={labSelecionado || ''} onChange={(e) => atualizar({ lab: e.target.value })} aria-label="Laboratório">
            {labs.dados?.map((l) => <option key={l.id_laboratorio} value={l.id_laboratorio}>{l.nome}</option>)}
          </select>
        )}
        <div className="navegacao-data">
          <button className="btn-icone" onClick={() => atualizar({ data: somarDias(data, -passo) })} aria-label="Anterior"><Icone nome="esquerda" /></button>
          <input type="date" value={data} onChange={(e) => e.target.value && atualizar({ data: e.target.value })} aria-label="Data" />
          <button className="btn-icone" onClick={() => atualizar({ data: somarDias(data, passo) })} aria-label="Próximo"><Icone nome="direita" /></button>
          <button className="btn btn-sm btn-contorno" onClick={() => atualizar({ data: hojeISO() })}>Hoje</button>
        </div>
      </div>

      <div className="cartao">
        <div className="cartao-cabecalho">
          <h2>{titulo}</h2>
          <div className="legenda">
            <span><i className="leg leg-aprovada" /> Aprovada</span>
            <span><i className="leg leg-pendente" /> Pendente</span>
            <span><i className="leg leg-minha" /> Minha reserva</span>
          </div>
        </div>
        <div className="cartao-corpo sem-padding">
          {!colunas.length ? <Carregando /> : (
            <GradeHorarios
              colunas={colunas}
              inicio={func?.inicio}
              fim={func?.fim}
              aoClicarReserva={(r) => abrir('detalhes', r)}
              aoClicarVazio={(c, min) => navegar(`/reservas/nova${qs({ lab: c.idLab, data: c.data, inicio: paraHoraMin(min) })}`)}
            />
          )}
        </div>
      </div>
      {modais}
    </Pagina>
  );
}
