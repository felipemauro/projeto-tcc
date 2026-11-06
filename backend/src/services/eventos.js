/**
 * Barramento de eventos em tempo real via Server-Sent Events (SSE).
 * Quando uma reserva é criada, aprovada, alterada ou cancelada, todos os
 * clientes conectados recebem o aviso e atualizam a tela sem recarregar
 * a página (Seção 3.2.1 do TCC).
 */
const clientes = new Set();

function conectar(req, res, usuario) {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();
  res.write(`event: conectado\ndata: {"ok":true}\n\n`);

  const cliente = { res, usuario };
  clientes.add(cliente);
  const pulso = setInterval(() => res.write(': ping\n\n'), 25000);

  req.on('close', () => {
    clearInterval(pulso);
    clientes.delete(cliente);
  });
}

/** Envia um evento a todos os clientes (ou somente a um usuário). */
function emitir(tipo, dados = {}, idUsuarioDestino) {
  const pacote = `event: ${tipo}\ndata: ${JSON.stringify(dados)}\n\n`;
  for (const c of clientes) {
    if (idUsuarioDestino && c.usuario.id !== idUsuarioDestino) continue;
    c.res.write(pacote);
  }
}

module.exports = { conectar, emitir, totalConectados: () => clientes.size };
