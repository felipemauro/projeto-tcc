const jwt = require('jsonwebtoken');
const config = require('../config');
const { ErroApi } = require('../utils/erros');

const PERFIS = ['ADMINISTRATIVO', 'COORDENADOR', 'DOCENTE', 'DISCENTE'];
const GESTORES = ['ADMINISTRATIVO', 'COORDENADOR'];

function gerarToken(usuario) {
  return jwt.sign(
    { id: usuario.id_usuario, nome: usuario.nome, perfil: usuario.perfil },
    config.jwtSecret,
    { expiresIn: config.jwtExpiracao }
  );
}

function verificarToken(token) {
  return jwt.verify(token, config.jwtSecret);
}

/** Exige um token JWT válido no cabeçalho Authorization: Bearer <token>. */
function autenticar(req, _res, next) {
  const cabecalho = req.headers.authorization || '';
  const [tipo, token] = cabecalho.split(' ');
  if (tipo !== 'Bearer' || !token) {
    throw new ErroApi(401, 'Autenticação necessária.');
  }
  try {
    req.usuario = verificarToken(token);
  } catch {
    throw new ErroApi(401, 'Sessão inválida ou expirada. Faça login novamente.');
  }
  next();
}

/** Controle de acesso por perfil (RBAC). */
function autorizar(...perfisPermitidos) {
  return (req, _res, next) => {
    if (!perfisPermitidos.includes(req.usuario.perfil)) {
      throw new ErroApi(403, 'Seu perfil não tem permissão para esta operação.');
    }
    next();
  };
}

module.exports = { autenticar, autorizar, gerarToken, verificarToken, PERFIS, GESTORES };
