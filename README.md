# SALI – Sistema de Agendamento de Laboratórios Acadêmicos com Controle Multiusuário

Protótipo desenvolvido como Trabalho de Conclusão de Curso em **Engenharia da Computação** – **UEMG Unidade Divinópolis**.

- **Autor:** Felipe Mauro da Silva
- **Orientador:** Prof. Me. Marcos Alberto Saldanha

Plataforma web para docentes, discentes, coordenadores e funcionários administrativos consultarem a disponibilidade, solicitarem e gerenciarem reservas dos laboratórios de informática, com **detecção automática de conflitos**, **priorização de aulas práticas**, **sugestão de horários alternativos** e **controle de concorrência multiusuário**.

---

## Arquitetura

Modelo cliente-servidor em três camadas (Figura 4 do TCC):

| Camada | Tecnologia | Pasta |
|---|---|---|
| Apresentação (SPA) | React 19, HTML5, CSS3, JavaScript (Vite) | `frontend/` |
| Lógica de negócio / API REST | Node.js 22, Express 5, JWT | `backend/src/` |
| Persistência | PostgreSQL 16 (transações ACID) | `backend/db/` |

```
frontend/  ──HTTP/JSON──▶  backend (API REST)  ──SQL──▶  PostgreSQL
    ▲                            │
    └──── Server-Sent Events ◀───┘  (atualização em tempo real)
```

### Correspondência com a modelagem do TCC

| Artefato do TCC | Implementação |
|---|---|
| DER (Figura 2): Usuario, Laboratorio, Disciplina, Reserva, Relatorio | `backend/db/migrations/001_schema.sql` (+ `historico`, `notificacao`, `parametro`) |
| Classe `RegradePriorizacao` (Figura 3): `verificarConflitos()`, `definirPrioridades()` | `backend/src/services/regraPriorizacao.js` |
| Classe `Reserva`: `solicitar()`, `aprovar()`, `rejeitar()`, `alterar()` | `backend/src/services/reservaService.js` |
| Casos de uso (Figura 1) | Rotas em `backend/src/routes/` e telas em `frontend/src/pages/` |
| Diagrama de sequência (Seção 3.2.3) | `docs/diagrama-sequencia-solicitar-reserva.puml` |
| Testes de API com Postman (Tabela 1) | `docs/SALI.postman_collection.json` |

### Objetivos específicos × funcionalidades

| Objetivo (Seção 1.2.1) | Onde está |
|---|---|
| a) Autenticação e controle de acesso multiusuário | Login JWT, senhas com bcrypt, RBAC por perfil (`middlewares/auth.js`), menu e rotas filtrados por perfil |
| b) Algoritmos inteligentes de detecção e prevenção de conflitos | `regraPriorizacao.js` + travas transacionais em `reservaService.js` + restrição `EXCLUDE` no banco |
| c) Avaliar o impacto na eficiência | Indicadores no painel: conflitos evitados, remanejamentos, tempo médio de decisão, taxa de ocupação |
| d) Dashboards administrativos | Tela **Painel de ocupação** e **Relatórios** (exportação CSV) |
| e) Ajustes manuais por gestores | Aprovar/rejeitar/alterar, aprovação com remanejamento e tela **Regras de priorização** |

---

## Regras inteligentes de agendamento (Seção 4.6)

1. **Verificação automática de disponibilidade** – restrições rígidas (capacidade, horário de funcionamento, dia letivo, data passada) e verificação de sobreposição com reservas aprovadas e pendentes.
2. **Priorização (0 a 100)** – soma ponderada e transparente de:
   - natureza da disciplina (prática obrigatória > teórica > extracurricular > sem disciplina);
   - proximidade da data de utilização;
   - quantidade de alunos em relação à capacidade do laboratório;
   - perfil do solicitante.
   Os pesos são configuráveis pelo funcionário administrativo.
3. **Decisão**:
   - conflito com aprovada de prioridade **igual ou maior** → solicitação **bloqueada** e horários alternativos sugeridos;
   - conflito com aprovada de prioridade **menor** → encaminhada para **análise** (possível remanejamento);
   - sem conflitos → aprovação automática (perfis configurados) ou pendente de aprovação.
4. **Sugestão de horários alternativos** – mesmo laboratório em horários próximos, outros laboratórios com capacidade suficiente no mesmo horário e o mesmo horário em dias próximos, ordenados por proximidade.
5. **Reservas recorrentes** – o solicitante informa o horário, o período e os dias da semana em que leciona; cada data gerada passa pelas mesmas regras acima. Datas com conflito são mostradas antes da confirmação e não são criadas; as demais formam uma série, que pode ser aprovada ou cancelada de uma só vez.
6. **Histórico de utilização** – todas as operações (inclusive tentativas bloqueadas) ficam registradas para auditoria e indicadores.

## Controle multiusuário (Seção 3.4)

- **Bloqueio pessimista:** cada operação que pode ocupar horário executa `SELECT ... FOR UPDATE` na linha do laboratório dentro de uma transação, serializando requisições simultâneas ao mesmo laboratório.
- **Bloqueio otimista:** aprovações e alterações enviam a `versao` lida; se outro usuário alterou a reserva no intervalo, a operação é recusada (`409 VERSAO_DESATUALIZADA`), evitando *lost update*.
- **Garantia no SGBD:** restrição `EXCLUDE USING gist` impede duas reservas **aprovadas** sobrepostas no mesmo laboratório, mesmo se a aplicação falhar.
- **Tempo real:** alterações são propagadas via *Server-Sent Events*; as telas se atualizam sem recarregar.

O teste `backend/tests/concorrencia.test.js` dispara 20 solicitações simultâneas para o mesmo horário e aprovações concorrentes de reservas sobrepostas, verificando que **apenas uma** é aprovada.

---

## Como executar

### Pré-requisitos
- Node.js 20 ou superior
- PostgreSQL 14 ou superior

### 1. Banco de dados

No PostgreSQL instalado, crie o usuário e os bancos:
```sql
CREATE USER sali WITH PASSWORD 'sali';
CREATE DATABASE sali OWNER sali;
CREATE DATABASE sali_test OWNER sali;   -- usado pelos testes automatizados
```
> A extensão `btree_gist` é criada pela migração; o usuário precisa de permissão para isso (dono do banco ou superusuário).

### 2. Backend
```bash
cd backend
cp .env.example .env        # ajuste DATABASE_URL e JWT_SECRET se necessário
npm install
npm run db:reset            # cria as tabelas e insere dados de demonstração
npm run db:disciplinas      # (opcional) importa as disciplinas do PPC sem apagar os dados
npm run dev                 # API em http://localhost:3333/api
```

### 3. Frontend
```bash
cd frontend
npm install
npm run dev                 # interface em http://localhost:5173
```

### Produção (um único servidor)
```bash
cd frontend && npm run build
cd ../backend && npm start   # serve a API e o frontend compilado em http://localhost:3333
```

### Usuários cadastrados

| Perfil | E-mail | Senha |
|---|---|---|
| Funcionário Administrativo | aguinaldo.admin@funcionario.uemg.br | 123456@ag |
| Coordenador | willyan.coord@coordenacao.uemg.br | 123456@wi |
| Docente | marcos.doc@docente.uemg.br | 123456@ma |
| Discente | felipe.1657023@discente.uemg.br | 123456@fe |

> As disciplinas cadastradas seguem a estrutura curricular do PPC de Engenharia de Computação (`backend/db/disciplinas-ppc.js`).
>
> Os usuários e as senhas são definidos em `backend/db/seed.js`. Altere as senhas antes de usar o sistema em produção.

> Os dados de demonstração (`backend/db/seed.js`) são fictícios e servem apenas para apresentação; não representam a ocupação real dos laboratórios.

### Testes automatizados
```bash
cd backend
npm test     # 68 testes: unitários (regras), integração (API, séries) e concorrência
```

---

## API REST (principais endpoints)

| Método | Rota | Descrição | Perfis |
|---|---|---|---|
| POST | `/api/auth/login` | Autenticação (retorna JWT) | público |
| GET | `/api/auth/me` | Usuário logado | todos |
| GET | `/api/reservas` | Lista (filtros: `inicio`, `fim`, `status`, `id_laboratorio`, `minhas`, `ordem=prioridade`, `conflitos=true`) | todos |
| POST | `/api/reservas/verificar` | Análise prévia: conflitos, prioridade, decisão e sugestões | todos |
| POST | `/api/reservas` | Solicitar reserva | todos |
| PATCH | `/api/reservas/:id` | Alterar reserva | dono (pendente) / gestores |
| POST | `/api/reservas/:id/aprovar` | Aprovar (`forcar: true` para remanejar) | gestores |
| POST | `/api/reservas/:id/rejeitar` | Rejeitar com motivo | gestores |
| DELETE | `/api/reservas/:id` | Cancelar (remoção lógica) | dono / gestores |
| POST | `/api/reservas/serie/verificar` | Prévia de reserva recorrente: situação de cada data | todos |
| POST | `/api/reservas/serie` | Criar reserva recorrente (semanal) com as datas disponíveis | todos |
| POST | `/api/reservas/serie/:id/aprovar` | Aprovar todas as datas pendentes da série | gestores |
| DELETE | `/api/reservas/serie/:id` | Cancelar as próximas datas da série | dono / gestores |
| GET | `/api/laboratorios/:id/disponibilidade?data=` | Ocupação do dia | todos |
| GET/POST/PUT | `/api/laboratorios`, `/api/disciplinas`, `/api/usuarios` | Cadastros | administrativo |
| GET | `/api/dashboard` | Indicadores de ocupação e demanda | gestores |
| GET | `/api/relatorios?tipo=&inicio=&fim=&formato=csv` | Relatórios | gestores |
| GET | `/api/historico` | Auditoria | gestores |
| GET/PUT | `/api/parametros` | Pesos da priorização e funcionamento | leitura: todos · escrita: administrativo |
| GET | `/api/eventos?token=` | Eventos em tempo real (SSE) | todos |

A coleção completa para o Postman está em `docs/SALI.postman_collection.json`.

---

## Estrutura do projeto

```
├── backend/
│   ├── db/            migrações SQL, migrate.js e seed.js
│   ├── src/
│   │   ├── routes/    endpoints REST
│   │   ├── services/  regras de negócio (priorização, reservas, indicadores, eventos)
│   │   ├── middlewares/ autenticação, autorização e tratamento de erros
│   │   └── db/        pool de conexões e transações
│   └── tests/         testes unitários, de integração e de concorrência
├── frontend/
│   └── src/
│       ├── pages/       telas (agenda, nova reserva, solicitações, painel…)
│       ├── components/  layout com menu lateral, grade de horários, modais
│       └── contexto/    autenticação e tempo real
└── docs/              diagrama de sequência (PlantUML) e coleção Postman
```

## Identidade visual

A interface segue o padrão de portais acadêmicos como o Lyceum (barra superior institucional, menu lateral agrupado por área e conteúdo em cartões). As cores ficam centralizadas em variáveis no início de `frontend/src/estilos.css` e podem ser ajustadas para a paleta oficial da instituição.
