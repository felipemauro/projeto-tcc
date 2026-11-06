const db = require('../db/pool');

/** Registra uma operação no histórico (auditoria e rastreabilidade). */
async function registrarHistorico(cliente, { idReserva = null, idUsuario = null, acao, detalhes = null }) {
  await (cliente || db).query(
    'INSERT INTO historico (id_reserva, id_usuario, acao, detalhes) VALUES ($1, $2, $3, $4)',
    [idReserva, idUsuario, acao, detalhes]
  );
}

/** Cria uma notificação para um usuário. */
async function notificar(cliente, idUsuario, titulo, mensagem) {
  await (cliente || db).query(
    'INSERT INTO notificacao (id_usuario, titulo, mensagem) VALUES ($1, $2, $3)',
    [idUsuario, titulo, mensagem]
  );
}

module.exports = { registrarHistorico, notificar };
