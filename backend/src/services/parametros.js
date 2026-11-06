const db = require('../db/pool');
const { PARAMETROS_PADRAO } = require('./regraPriorizacao');

const CHAVE = 'regras_agendamento';

/** Mescla profunda simples (objetos), arrays são substituídos. */
function mesclar(base, extra) {
  if (!extra || typeof extra !== 'object' || Array.isArray(extra)) return extra ?? base;
  const out = { ...base };
  for (const [k, v] of Object.entries(extra)) {
    out[k] = base && typeof base[k] === 'object' && !Array.isArray(base[k]) ? mesclar(base[k], v) : v;
  }
  return out;
}

async function obterParametros(cliente = db) {
  const { rows } = await cliente.query('SELECT valor FROM parametro WHERE chave = $1', [CHAVE]);
  return mesclar(structuredClone(PARAMETROS_PADRAO), rows[0]?.valor);
}

async function salvarParametros(valor, cliente = db) {
  const final = mesclar(structuredClone(PARAMETROS_PADRAO), valor);
  await cliente.query(
    `INSERT INTO parametro (chave, valor) VALUES ($1, $2)
     ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor`,
    [CHAVE, final]
  );
  return final;
}

module.exports = { obterParametros, salvarParametros, mesclar };
