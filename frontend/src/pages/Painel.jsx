import { useState } from 'react';
import { api, qs } from '../api';
import { Cartao, Carregando, Pagina, useDados } from '../components/ui';
import { DIAS_CURTOS, TIPOS_DISCIPLINA, formatarData, hojeISO, somarDias } from '../util';

const PERIODOS = {
  mes: () => { const h = hojeISO(); return [`${h.slice(0, 8)}01`, somarDias(`${h.slice(0, 8)}01`, 30)]; },
  '30': () => [somarDias(hojeISO(), -30), hojeISO()],
  '90': () => [somarDias(hojeISO(), -90), hojeISO()],
  proximos: () => [hojeISO(), somarDias(hojeISO(), 30)],
};

function Indicador({ rotulo, valor, detalhe, tom }) {
  return (
    <div className={`indicador ${tom ? `indicador-${tom}` : ''}`}>
      <span className="indicador-rotulo">{rotulo}</span>
      <span className="indicador-valor">{valor}</span>
      {detalhe && <span className="indicador-detalhe">{detalhe}</span>}
    </div>
  );
}

/** Barras horizontais (série única, um só tom), com rótulo direto do valor. */
function Barras({ itens, formatar = (v) => v, max }) {
  const topo = max ?? Math.max(1, ...itens.map((i) => i.valor));
  return (
    <div className="barras">
      {itens.map((i) => (
        <div key={i.rotulo} className="barra-linha" title={`${i.rotulo}: ${formatar(i.valor)}${i.dica ? ` · ${i.dica}` : ''}`}>
          <span className="barra-rotulo">{i.rotulo}</span>
          <span className="barra-trilho"><span className="barra-valor" style={{ width: `${(i.valor / topo) * 100}%` }} /></span>
          <span className="barra-numero">{formatar(i.valor)}</span>
        </div>
      ))}
    </div>
  );
}

/** Mapa de calor da demanda (escala sequencial de um único matiz). */
function MapaCalor({ demanda }) {
  const max = Math.max(1, ...demanda.dias.flatMap((d) => demanda.horas.map((h) => demanda.grade[d][h])));
  return (
    <div className="mapa-calor-rolagem">
      <table className="mapa-calor">
        <thead>
          <tr><th />{demanda.horas.map((h) => <th key={h}>{String(h).padStart(2, '0')}h</th>)}</tr>
        </thead>
        <tbody>
          {demanda.dias.map((d) => (
            <tr key={d}>
              <th>{DIAS_CURTOS[d]}</th>
              {demanda.horas.map((h) => {
                const v = demanda.grade[d][h];
                const n = v === 0 ? 0 : Math.min(5, Math.ceil((v / max) * 5));
                return <td key={h} className={`calor-${n}`} title={`${DIAS_CURTOS[d]} ${h}h: ${v} reserva(s)`}>{v || ''}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="legenda-calor">
        <span>Menor demanda</span>
        {[0, 1, 2, 3, 4, 5].map((n) => <i key={n} className={`calor-${n}`} />)}
        <span>Maior demanda</span>
      </div>
    </div>
  );
}

/** Dashboard administrativo (objetivo específico "d" do TCC). */
export default function Painel() {
  const [periodo, setPeriodo] = useState('mes');
  const [inicio, fim] = PERIODOS[periodo]();
  const { dados, carregando } = useDados(() => api.get(`/dashboard${qs({ inicio, fim })}`), [periodo]);

  return (
    <Pagina titulo="Painel de ocupação" subtitulo={`Período: ${formatarData(inicio)} a ${formatarData(fim)}`}>
      <div className="barra-filtros">
        <div className="segmentado">
          {[['mes', 'Mês atual'], ['30', 'Últimos 30 dias'], ['90', 'Últimos 90 dias'], ['proximos', 'Próximos 30 dias']].map(([v, r]) => (
            <button key={v} className={periodo === v ? 'ativo' : ''} onClick={() => setPeriodo(v)}>{r}</button>
          ))}
        </div>
      </div>

      {carregando && !dados ? <Carregando /> : dados && <>
        <div className="indicadores">
          <Indicador rotulo="Reservas aprovadas" valor={dados.resumo.porStatus.APROVADA} detalhe={`${dados.resumo.totalReservas} solicitações no período`} />
          <Indicador rotulo="Pendentes em aberto" valor={dados.resumo.pendentesAbertas} detalhe="aguardando decisão" tom={dados.resumo.pendentesAbertas ? 'aviso' : undefined} />
          <Indicador rotulo="Conflitos evitados" valor={dados.resumo.conflitosEvitados} detalhe="tentativas bloqueadas pelo sistema" />
          <Indicador rotulo="Remanejamentos" valor={dados.resumo.remanejamentos} detalhe="ajustes manuais da gestão" />
          <Indicador rotulo="Tempo médio de decisão"
            valor={dados.resumo.tempoMedioDecisaoHoras == null ? '—' : `${String(dados.resumo.tempoMedioDecisaoHoras).replace('.', ',')} h`}
            detalhe="da solicitação à aprovação/rejeição" />
        </div>

        <div className="layout-painel">
          <Cartao titulo="Taxa de ocupação por laboratório">
            <Barras
              itens={dados.ocupacao.map((l) => ({
                rotulo: l.nome.replace('Laboratório de Informática', 'Lab. Info.'),
                valor: l.taxa_ocupacao,
                dica: `${l.horas_reservadas} h de ${l.horas_disponiveis} h disponíveis · ${l.reservas_aprovadas} reservas`,
              }))}
              formatar={(v) => `${String(v).replace('.', ',')}%`}
              max={Math.max(25, ...dados.ocupacao.map((l) => l.taxa_ocupacao))}
            />
            <p className="nota">Horas aprovadas ÷ horas de funcionamento no período.</p>
          </Cartao>
          <Cartao titulo="Disciplinas com maior uso (horas aprovadas)">
            {dados.resumo.topDisciplinas.length === 0 ? <p className="texto-apoio">Sem dados no período.</p> : (
              <Barras
                itens={dados.resumo.topDisciplinas.map((d) => ({ rotulo: d.nome, valor: d.horas, dica: TIPOS_DISCIPLINA[d.tipo] }))}
                formatar={(v) => `${String(v).replace('.', ',')} h`}
              />
            )}
          </Cartao>
        </div>

        <Cartao titulo="Demanda por dia da semana e horário">
          <p className="texto-apoio">Reservas aprovadas e pendentes que ocupam cada faixa horária — identifica horários de pico e de baixa ocupação.</p>
          <MapaCalor demanda={dados.demanda} />
        </Cartao>

        <Cartao titulo="Detalhamento por laboratório">
          <div className="tabela-rolagem">
            <table className="tabela">
              <thead><tr><th>Laboratório</th><th className="num">Capacidade</th><th className="num">Aprovadas</th><th className="num">Pendentes</th><th className="num">Horas reservadas</th><th className="num">Ocupação</th></tr></thead>
              <tbody>
                {dados.ocupacao.map((l) => (
                  <tr key={l.id_laboratorio}>
                    <td>{l.nome}</td><td className="num">{l.capacidade}</td><td className="num">{l.reservas_aprovadas}</td>
                    <td className="num">{l.reservas_pendentes}</td><td className="num">{String(l.horas_reservadas).replace('.', ',')}</td>
                    <td className="num">{String(l.taxa_ocupacao).replace('.', ',')}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Cartao>
      </>}
    </Pagina>
  );
}
