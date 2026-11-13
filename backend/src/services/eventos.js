// Eventos em tempo real (SSE): avisa os navegadores conectados quando
// uma reserva muda, para que as telas recarreguem os dados.
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
