const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const config = require('./config');
const { autenticar, autorizar, GESTORES } = require('./middlewares/auth');
const tratarErros = require('./middlewares/tratarErros');
const diversos = require('./routes/diversos');

const app = express();

app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: config.origemFrontend.split(',') }));
app.use(express.json({ limit: '100kb' }));

app.get('/api/saude', (_req, res) => res.json({ status: 'ok', servico: 'SALI – UEMG Divinópolis' }));

// Rotas públicas
app.use('/api/auth', require('./routes/auth'));
app.use('/api/eventos', diversos.tempoReal);

// Rotas protegidas por JWT
app.use('/api/usuarios', autenticar, require('./routes/usuarios'));
app.use('/api/laboratorios', autenticar, require('./routes/laboratorios'));
app.use('/api/disciplinas', autenticar, require('./routes/disciplinas'));
app.use('/api/reservas', autenticar, require('./routes/reservas'));
app.use('/api/dashboard', autenticar, autorizar(...GESTORES), require('./routes/dashboard'));
app.use('/api/relatorios', autenticar, autorizar(...GESTORES), require('./routes/relatorios'));
app.use('/api/historico', autenticar, diversos.historico);
app.use('/api/notificacoes', autenticar, diversos.notificacoes);
app.use('/api/parametros', autenticar, diversos.parametros);

app.use('/api', (_req, res) => res.status(404).json({ erro: 'Rota não encontrada.' }));

// Em produção, o backend também serve o build do frontend (SPA)
const dist = path.resolve(__dirname, '../../frontend/dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^\/(?!api).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.use(tratarErros);

module.exports = app;
