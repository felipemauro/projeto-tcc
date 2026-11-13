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

/** Horários-padrão de aula (sugestão de preenchimento rápido). */
export const HORARIOS_AULA = [
  ['07:30', '09:10'], ['09:20', '11:00'], ['13:00', '14:40'],
  ['14:50', '16:30'], ['19:00', '20:40'], ['20:50', '22:30'],
];
export function paraHoraMin(min) {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
}
