const { Router } = require('express');
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const db = require('../db/pool');
const { autorizar, PERFIS } = require('../middlewares/auth');
const { naoEncontrado, ErroApi } = require('../utils/erros');
const { registrarHistorico } = require('../services/auditoria');

// Cadastro de usuários e perfis (somente administrativo)
const router = Router();
router.use(autorizar('ADMINISTRATIVO'));

const CAMPOS = 'id_usuario, nome, email, perfil, ativo, criado_em';

const esquema = z.object({
  nome: z.string().trim().min(3, 'Informe o nome completo.').max(120),
  email: z.string().trim().toLowerCase().email('E-mail inválido.'),
  perfil: z.enum(PERFIS),
  senha: z.string().min(6, 'A senha deve ter ao menos 6 caracteres.').optional(),
  ativo: z.boolean().optional(),
});

router.get('/', async (req, res) => {
  const { rows } = await db.query(`SELECT ${CAMPOS} FROM usuario ORDER BY nome`);
  res.json(rows);
});

router.post('/', async (req, res) => {
  const dados = esquema.extend({ senha: z.string().min(6, 'A senha deve ter ao menos 6 caracteres.') }).parse(req.body);
  const { rows } = await db.query(
    `INSERT INTO usuario (nome, email, senha, perfil, ativo) VALUES ($1,$2,$3,$4,$5) RETURNING ${CAMPOS}`,
    [dados.nome, dados.email, await bcrypt.hash(dados.senha, 10), dados.perfil, dados.ativo ?? true]
  );
  await registrarHistorico(null, { idUsuario: req.usuario.id, acao: 'USUARIO_CRIADO', detalhes: { id: rows[0].id_usuario, perfil: dados.perfil } });
  res.status(201).json(rows[0]);
});

router.put('/:id', async (req, res) => {
  const dados = esquema.parse(req.body);
  if (Number(req.params.id) === req.usuario.id && (dados.ativo === false || dados.perfil !== 'ADMINISTRATIVO')) {
    throw new ErroApi(400, 'Você não pode desativar ou rebaixar o seu próprio usuário.');
  }
  const params = [req.params.id, dados.nome, dados.email, dados.perfil, dados.ativo ?? true];
  let sqlSenha = '';
  if (dados.senha) {
    params.push(await bcrypt.hash(dados.senha, 10));
    sqlSenha = ', senha = $6';
  }
  const { rows } = await db.query(
    `UPDATE usuario SET nome=$2, email=$3, perfil=$4, ativo=$5${sqlSenha}
      WHERE id_usuario = $1 RETURNING ${CAMPOS}`,
    params
  );
  if (!rows[0]) throw naoEncontrado('Usuário');
  await registrarHistorico(null, { idUsuario: req.usuario.id, acao: 'USUARIO_ALTERADO', detalhes: { id: rows[0].id_usuario, perfil: dados.perfil, ativo: rows[0].ativo } });
  res.json(rows[0]);
});

module.exports = router;
