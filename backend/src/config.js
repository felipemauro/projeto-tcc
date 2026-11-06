require('dotenv').config({ quiet: true });

const config = {
  porta: Number(process.env.PORT || 3333),
  databaseUrl:
    process.env.DATABASE_URL || 'postgres://sal:sal@localhost:5432/sal',
  jwtSecret: process.env.JWT_SECRET || 'troque-este-segredo-em-producao',
  jwtExpiracao: process.env.JWT_EXPIRES_IN || '8h',
  origemFrontend: process.env.CORS_ORIGIN || 'http://localhost:5173',
  ambiente: process.env.NODE_ENV || 'development',
};

if (config.ambiente === 'production' && config.jwtSecret.startsWith('troque')) {
  throw new Error('Defina JWT_SECRET no ambiente de produção.');
}

module.exports = config;
