/** Erro de negócio com código HTTP associado. */
class ErroApi extends Error {
  constructor(status, mensagem, dados) {
    super(mensagem);
    this.status = status;
    this.dados = dados;
  }
}

const naoEncontrado = (o = 'Registro') => new ErroApi(404, `${o} não encontrado.`);
const proibido = () => new ErroApi(403, 'Você não tem permissão para esta operação.');

module.exports = { ErroApi, naoEncontrado, proibido };
