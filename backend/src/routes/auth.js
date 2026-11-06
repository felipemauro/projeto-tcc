const { Router } = require('express');
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const rateLimit = require('express-rate-limit');
const db = require('../db/pool');
const { autenticar, gerarToken } = require('../middlewares/auth');
const { ErroApi } = require('../utils/erros');
const { registrarHistorico } = require('../services/auditoria');

const router = Router();

const limitarLogin = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.LOGIN_RATE_LIMIT || 30),
  standardHeaders: true,
  legacyHeaders: false,
  message: { erro: 'Muitas tentativas de login. Aguarde alguns minutos.' },
});

const esquemaLogin = z.object({
  email: z.string().trim().toLowerCase().email('E-mail inválido.'),
  senha: z.string().min(1, 'Informe a senha.'),
});

// POST /api/auth/login – caso de uso "Realizar Login"
router.post('/login', limitarLogin, async (req, res) => {
  const { email, senha } = esquemaLogin.parse(req.body);
  const { rows } = await db.query('SELECT * FROM usuario WHERE email = $1', [email]);
  const usuario = rows[0];
  if (!usuario || !(await bcrypt.compare(senha, usuario.senha))) {
    throw new ErroApi(401, 'E-mail ou senha incorretos.');
  }
  if (!usuario.ativo) throw new ErroApi(403, 'Usuário inativo. Procure a secretaria.');
  await registrarHistorico(null, { idUsuario: usuario.id_usuario, acao: 'LOGIN' });
  res.json({
    token: gerarToken(usuario),
    usuario: { id: usuario.id_usuario, nome: usuario.nome, email: usuario.email, perfil: usuario.perfil },
  });
});

// GET /api/auth/me
router.get('/me', autenticar, async (req, res) => {
  const { rows } = await db.query(
    'SELECT id_usuario AS id, nome, email, perfil, ativo FROM usuario WHERE id_usuario = $1',
    [req.usuario.id]
  );
  if (!rows[0] || !rows[0].ativo) throw new ErroApi(401, 'Sessão inválida.');
  res.json(rows[0]);
});

// PUT /api/auth/senha
router.put('/senha', autenticar, async (req, res) => {
  const { senhaAtual, novaSenha } = z
    .object({
      senhaAtual: z.string().min(1),
      novaSenha: z.string().min(6, 'A nova senha deve ter ao menos 6 caracteres.'),
    })
    .parse(req.body);
  const { rows } = await db.query('SELECT senha FROM usuario WHERE id_usuario = $1', [req.usuario.id]);
  if (!(await bcrypt.compare(senhaAtual, rows[0].senha))) throw new ErroApi(400, 'Senha atual incorreta.');
  await db.query('UPDATE usuario SET senha = $2 WHERE id_usuario = $1', [req.usuario.id, await bcrypt.hash(novaSenha, 10)]);
  res.json({ mensagem: 'Senha alterada com sucesso.' });
});

module.exports = router;
