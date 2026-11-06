const { Pool, types } = require('pg');
const config = require('../config');

// DATE (OID 1082) retornado como string 'AAAA-MM-DD' para evitar
// deslocamentos de fuso horário ao converter para objeto Date do JavaScript.
types.setTypeParser(1082, (valor) => valor);

const pool = new Pool({ connectionString: config.databaseUrl, max: 20 });

/**
 * Executa uma função dentro de uma transação ACID.
 * Em caso de erro, todas as operações são desfeitas (ROLLBACK),
 * garantindo a atomicidade descrita na Seção 3.2.4 do TCC.
 */
async function transacao(fn) {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    const resultado = await fn(cliente);
    await cliente.query('COMMIT');
    return resultado;
  } catch (erro) {
    await cliente.query('ROLLBACK');
    throw erro;
  } finally {
    cliente.release();
  }
}

module.exports = { pool, transacao, query: (texto, params) => pool.query(texto, params) };
