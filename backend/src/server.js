const app = require('./app');
const config = require('./config');
const { pool } = require('./db/pool');

const servidor = app.listen(config.porta, () => {
  console.log(`API do SALI em execução: http://localhost:${config.porta}/api`);
});

function encerrar() {
  servidor.close(() => pool.end().then(() => process.exit(0)));
}
process.on('SIGINT', encerrar);
process.on('SIGTERM', encerrar);
