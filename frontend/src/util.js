/** Utilitários de formatação e datas usados nas telas. */

export const PERFIS = {
  ADMINISTRATIVO: 'Funcionário Administrativo',
  COORDENADOR: 'Coordenador',
  DOCENTE: 'Docente',
  DISCENTE: 'Discente',
};
export const GESTORES = ['ADMINISTRATIVO', 'COORDENADOR'];
// Perfis que podem criar reservas recorrentes (o discente pede uma data por vez)
export const PERFIS_SERIE = ['ADMINISTRATIVO', 'COORDENADOR', 'DOCENTE'];
export const ehGestor = (u) => !!u && GESTORES.includes(u.perfil);

export const STATUS = {
  PENDENTE: 'Pendente',
  APROVADA: 'Aprovada',
  REJEITADA: 'Rejeitada',
  CANCELADA: 'Cancelada',
};

export const TIPOS_DISCIPLINA = {
  PRATICA: 'Prática obrigatória',
  TEORICA: 'Teórica',
  EXTRACURRICULAR: 'Extracurricular',
};

export const DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
export const DIAS_CURTOS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export function dataISO(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function parseData(iso) {
  const [a, m, d] = iso.split('-').map(Number);
  return new Date(a, m - 1, d);
}
export function somarDias(iso, n) {
  const d = parseData(iso);
  d.setDate(d.getDate() + n);
  return dataISO(d);
}
export const hojeISO = () => dataISO(new Date());
export function inicioSemana(iso) {
  const d = parseData(iso);
  const dia = d.getDay();
  d.setDate(d.getDate() - (dia === 0 ? 6 : dia - 1));
  return dataISO(d);
}
export const formatarData = (iso) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '');
export function formatarDataLonga(iso) {
  const d = parseData(iso);
  return `${DIAS[d.getDay()]}, ${formatarData(iso)}`;
}
export function formatarDataHora(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
export const minutos = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

export function paraHoraMin(min) {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
}

// Grade de aulas da UEMG (aulas de 50 minutos).
// Manhã: intervalo das 09:30 às 09:45. Almoço de 1 hora.
// Tarde: até 17:30 (horários a confirmar). Noite: intervalo das 20:15 às 20:30,
// e a última aula termina às 22:55.
export const TURNOS = [
  { nome: 'Manhã', aulas: [['07:00', '07:50'], ['07:50', '08:40'], ['08:40', '09:30'], ['09:45', '10:35'], ['10:35', '11:25'], ['11:25', '12:15']] },
  { nome: 'Tarde', aulas: [['13:15', '14:05'], ['14:05', '14:55'], ['14:55', '15:45'], ['15:45', '16:35'], ['16:35', '17:25']] },
  { nome: 'Noite', aulas: [['18:35', '19:25'], ['19:25', '20:15'], ['20:30', '21:20'], ['21:20', '22:10'], ['22:10', '22:55']] },
];
export const MAX_AULAS_SEGUIDAS = 6;

// Lista única das aulas, com a posição de cada uma dentro do turno
export const AULAS = TURNOS.flatMap((t, ti) =>
  t.aulas.map(([inicio, fim], i) => ({ turno: t.nome, indiceTurno: ti, ordem: i + 1, inicio, fim })))
  .map((a, i) => ({ ...a, id: i }));
