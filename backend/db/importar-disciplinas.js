/*
 * Importa (ou atualiza) as disciplinas do PPC de Engenharia de Computação
 * sem apagar os demais dados do banco. Uso: npm run db:disciplinas
 */
const { pool } = require('../src/db/pool');
const { DISCIPLINAS_PPC } = require('./disciplinas-ppc');

async function importar() {
  let inseridas = 0;
  let atualizadas = 0;
  for (const [nome, curso, periodo, tipo] of DISCIPLINAS_PPC) {
    const { rows } = await pool.query(
      `INSERT INTO disciplina (nome, curso, periodo, tipo, ativo) VALUES ($1, $2, $3, $4, TRUE)
       ON CONFLICT (nome, curso) DO UPDATE
         SET periodo = EXCLUDED.periodo, tipo = EXCLUDED.tipo, ativo = TRUE
       RETURNING (xmax = 0) AS inserida`,
      [nome, curso, periodo, tipo]
    );
    if (rows[0].inserida) inseridas++; else atualizadas++;
  }
  // As disciplinas de exemplo da versão anterior (curso "Engenharia da Computação") são
  // apenas desativadas, pois podem estar vinculadas a reservas já registradas.
  const antigas = await pool.query(
    `UPDATE disciplina SET ativo = FALSE WHERE curso = 'Engenharia da Computação' AND ativo`
  );
  console.log(`Disciplinas do PPC: ${inseridas} inseridas, ${atualizadas} atualizadas (total ${DISCIPLINAS_PPC.length}).`);
  if (antigas.rowCount) console.log(`${antigas.rowCount} disciplina(s) de exemplo antigas desativadas.`);
}

if (require.main === module) {
  importar().then(() => pool.end()).catch((e) => { console.error(e); process.exit(1); });
}

module.exports = { importar };
