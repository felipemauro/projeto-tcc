require('dotenv').config({ quiet: true });
const crypto = require('crypto');

const config = {
  porta: Number(process.env.PORT || 3333),
  databaseUrl:
    process.env.DATABASE_URL || 'postgres://sali:sali@localhost:5432/sali',
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiracao: process.env.JWT_EXPIRES_IN || '8h',
  origemFrontend: process.env.CORS_ORIGIN || 'http://localhost:5173',
  ambiente: process.env.NODE_ENV || 'development',
};

// Sem JWT_SECRET no .env: em produção o servidor não sobe; em desenvolvimento
// usa uma chave temporária (as sessões caem sempre que o servidor reinicia).
if (!config.jwtSecret) {
  if (config.ambiente === 'production') throw new Error('Defina JWT_SECRET no ambiente de produção.');
  config.jwtSecret = crypto.randomBytes(48).toString('hex');
  if (config.ambiente !== 'test') console.warn('JWT_SECRET não definido no .env: usando uma chave temporária.');
}

module.exports = config;
