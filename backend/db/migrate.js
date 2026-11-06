/* Aplica os scripts SQL da pasta migrations. Use --reset para recriar o banco. */
const fs = require('fs');
const path = require('path');
const { pool } = require('../src/db/pool');

async function migrar({ reset = false, silencioso = false } = {}) {
  if (reset) {
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    if (!silencioso) console.log('Esquema recriado.');
  }
  const pasta = path.join(__dirname, 'migrations');
  for (const arquivo of fs.readdirSync(pasta).filter((f) => f.endsWith('.sql')).sort()) {
    await pool.query(fs.readFileSync(path.join(pasta, arquivo), 'utf8'));
    if (!silencioso) console.log(`Migração aplicada: ${arquivo}`);
  }
}

if (require.main === module) {
  migrar({ reset: process.argv.includes('--reset') })
    .then(() => pool.end())
    .catch((e) => { console.error(e); process.exit(1); });
}

module.exports = { migrar };
