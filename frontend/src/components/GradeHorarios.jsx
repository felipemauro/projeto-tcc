import { AULAS, minutos } from '../util';

const PX_HORA = 52;

/**
 * Grade de horários (estilo quadro de horários acadêmico).
 * colunas: [{ chave, titulo, subtitulo, destaque, reservas: [...] }]
 */
export default function GradeHorarios({ colunas, inicio = '07:00', fim = '23:00', aoClicarVazio, aoClicarReserva }) {
  const ini = minutos(inicio);
  const fimMin = minutos(fim);
  const horas = [];
  for (let h = Math.floor(ini / 60); h < Math.ceil(fimMin / 60); h++) horas.push(h);
  const altura = ((fimMin - ini) / 60) * PX_HORA;

  const clicarVazio = (coluna, e) => {
    if (!aoClicarVazio || e.target !== e.currentTarget) return;
    const y = e.nativeEvent.offsetY;
    const clicado = ini + (y / PX_HORA) * 60;
    // Encaixa na aula de 50 minutos em que o clique caiu; num intervalo, vai para a próxima aula.
    const aula = AULAS.find((a) => clicado < minutos(a.fim));
    if (!aula) return;
    aoClicarVazio(coluna, minutos(aula.inicio));
  };

  return (
    <div className="grade" style={{ '--colunas': colunas.length }}>
      <div className="grade-cabecalho">
        <div className="grade-canto" />
        {colunas.map((c) => (
          <div key={c.chave} className={`grade-titulo ${c.destaque ? 'destaque' : ''}`}>
            <strong>{c.titulo}</strong>
            {c.subtitulo && <small>{c.subtitulo}</small>}
          </div>
        ))}
      </div>
      <div className="grade-corpo">
        <div className="grade-horas" style={{ height: altura }}>
          {horas.map((h) => (
            <div key={h} className="grade-hora" style={{ top: (h * 60 - ini) / 60 * PX_HORA }}>
              {String(h).padStart(2, '0')}:00
            </div>
          ))}
        </div>
        {colunas.map((c) => (
          <div
            key={c.chave}
            className={`grade-coluna ${c.indisponivel ? 'indisponivel' : ''} ${aoClicarVazio && !c.indisponivel ? 'clicavel' : ''}`}
            style={{ height: altura, backgroundSize: `100% ${PX_HORA}px` }}
            onClick={(e) => !c.indisponivel && clicarVazio(c, e)}
            title={aoClicarVazio && !c.indisponivel ? 'Clique em um horário livre para reservar' : undefined}
          >
            {c.reservas.map((r) => {
              const top = ((minutos(r.hora_inicio) - ini) / 60) * PX_HORA;
              const h = ((minutos(r.hora_fim) - minutos(r.hora_inicio)) / 60) * PX_HORA;
              return (
                <button
                  key={r.id_reserva}
                  type="button"
                  className={`bloco bloco-${r.status.toLowerCase()} ${r.minha ? 'bloco-minha' : ''}`}
                  style={{ top, height: Math.max(h - 2, 18) }}
                  onClick={() => aoClicarReserva?.(r)}
                  title={`${r.hora_inicio}–${r.hora_fim} · ${r.disciplina_nome || r.finalidade || 'Reserva'} · ${r.usuario_nome}${r.status === 'PENDENTE' ? ' (pendente)' : ''}`}
                >
                  <span className="bloco-hora">{r.hora_inicio}–{r.hora_fim}</span>
                  <span className="bloco-titulo">{r.disciplina_nome || r.finalidade || 'Reserva'}</span>
                  {h > 46 && <span className="bloco-sub">{r.rotuloExtra || r.usuario_nome}</span>}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
