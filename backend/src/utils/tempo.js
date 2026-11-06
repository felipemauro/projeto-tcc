/** Utilitários de data/hora. Horários são tratados como minutos desde 00:00. */

function paraMinutos(hhmm) {
  const [h, m] = String(hhmm).split(':').map(Number);
  return h * 60 + m;
}

function paraHora(minutos) {
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Normaliza 'HH:MM:SS' -> 'HH:MM'. */
function hhmm(valor) {
  return String(valor).slice(0, 5);
}

function dataISO(d) {
  const ano = d.getFullYear();
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
}

function parseData(iso) {
  const [a, m, d] = iso.split('-').map(Number);
  return new Date(a, m - 1, d);
}

function somarDias(iso, dias) {
  const d = parseData(iso);
  d.setDate(d.getDate() + dias);
  return dataISO(d);
}

function diferencaDias(isoA, isoB) {
  const ms = parseData(isoA) - parseData(isoB);
  return Math.round(ms / 86400000);
}

/** 0 = domingo ... 6 = sábado */
function diaSemana(iso) {
  return parseData(iso).getDay();
}

function hoje() {
  return dataISO(new Date());
}

function agoraMinutos() {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

module.exports = {
  paraMinutos, paraHora, hhmm, dataISO, parseData, somarDias,
  diferencaDias, diaSemana, hoje, agoraMinutos,
};
