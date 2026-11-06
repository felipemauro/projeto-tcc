const { ZodError } = require('zod');
const { ErroApi } = require('../utils/erros');

// eslint-disable-next-line no-unused-vars
function tratarErros(erro, _req, res, _next) {
  if (erro instanceof ErroApi) {
    return res.status(erro.status).json({ erro: erro.message, ...(erro.dados || {}) });
  }
  if (erro instanceof ZodError) {
    const campos = erro.issues.map((i) => ({ campo: i.path.join('.'), mensagem: i.message }));
    return res.status(400).json({ erro: 'Dados inválidos.', campos });
  }
  // Violação da restrição de exclusão do PostgreSQL (sobreposição de reservas aprovadas)
  if (erro.code === '23P01') {
    return res.status(409).json({
      erro: 'Conflito de horário: já existe reserva aprovada para este laboratório no período.',
    });
  }
  if (erro.code === '23505') {
    return res.status(409).json({ erro: 'Registro duplicado.', detalhe: erro.detail });
  }
  if (erro.code === '23503') {
    return res.status(409).json({ erro: 'Registro está vinculado a outros dados e não pode ser removido.' });
  }
  if (erro.type === 'entity.parse.failed') {
    return res.status(400).json({ erro: 'JSON inválido.' });
  }
  console.error(erro);
  return res.status(500).json({ erro: 'Erro interno do servidor.' });
}

module.exports = tratarErros;
