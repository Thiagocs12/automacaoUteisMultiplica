# Sincronização de Dados — Cypress + Cucumber

Automação para sincronizar dados de **Produção (PROD)** para **Homologação (HML)**, evitando cópia manual entre ambientes. Usa Cypress + Cucumber/BDD para consultar entidades em PROD (via API REST e SQL Server), localizar os correspondentes em HML e criar/atualizar o que for necessário, respeitando dependências entre entidades.

> **Atenção:** este projeto manipula dados de PROD e HML. Produção é tratada como **somente leitura** (guard-rail em código bloqueia qualquer escrita nesse ambiente) — a sincronização sempre flui `PROD → HML`.

## Tecnologias

- [Cypress](https://www.cypress.io/) 15.14.2 + [Cucumber](https://cucumber.io/) (`@badeball/cypress-cucumber-preprocessor`, `esbuild`)
- Node.js / JavaScript (ESM)
- `mssql` para conexão com SQL Server
- `dotenv` para variáveis de ambiente
- ESLint (flat config + `eslint-plugin-cypress`)

## Estrutura do projeto

```
cypress/
├── e2e/features/              # Cenários BDD (.feature)
├── support/
│   ├── step_definitions/      # Steps de cada domínio (Produtos, Esteiras, Vínculos, Grupos e Permissões, Usuários)
│   ├── commands/               # Comandos customizados, por responsabilidade
│   │   (ambiente, arquivos, urls, dependencias, sincronizacaoNivel, estoque, vinculos, gruposPermissoes, log)
│   ├── shared/                 # Lógica pura testável fora do Cypress (node:test)
│   ├── db/dbClient.cjs         # Pools de conexão SQL Server (prod/hml)
│   ├── tasks/dbTasks.cjs       # Tasks de banco expostas ao Cypress
│   ├── apiCommands.js          # executarRequest (requisições HTTP autenticadas)
│   ├── utils.js                # Login via UI, verificação/renovação de token
│   └── e2e.js
├── utils/                      # Mapeamento de entidades por domínio
│   (mapeamentoProdutos, mapeamentoEsteiras, mapeamentoVinculos, mapeamentoGruposPermissoes, mapeamentoUsuarios)
├── output/                     # JSONs intermediários + estoqueIds.json (gitignored)
└── temp/tokens.json            # Tokens de sessão (gitignored)
```

## Como funciona

Cada entidade é descrita em um arquivo de mapeamento (`cypress/utils/mapeamento*.js`) com endpoint, arquivo de saída, dependências e nível de dependência. A sincronização, para cada entidade, processa os níveis em ordem e:

1. busca os dados em PROD e salva em JSON (`cypress/output/`);
2. resolve dependências, convertendo IDs de PROD para os IDs equivalentes em HML via `cypress/output/estoqueIds.json`;
3. localiza o registro correspondente em HML;
4. cria (POST) ou atualiza (PUT/PATCH) o registro, e registra o novo par PROD→HML no estoque.

Os domínios Produtos, Esteiras e Vínculos têm cada um seu arquivo de mapeamento e feature própria — novas entidades são adicionadas configurando o mapeamento, sem alterar a lógica central de processamento.

O domínio **Grupos e Permissões** (grupos, realm roles, client roles e o vínculo grupo→role do Keycloak) tem um pipeline próprio, fora desse fluxo genérico — grupos/roles são localizados em HML por busca textual (`?search=`, filtrando o resultado pelo nome exato), a criação não devolve o `id` no corpo da resposta (repete-se a busca em seguida) e o vínculo grupo→role vem embutido na representação completa do grupo (`GET /groups/{id}`), não de um endpoint de role-mappings à parte. A lógica vive em `commands/gruposPermissoes.js` + `utils/mapeamentoGruposPermissoes.js`.

O domínio **Usuários** não sincroniza uma lista de registros — é uma ação pontual sob demanda que **clona usuário(s) do Keycloak de Produção para Homologação**, mantendo o resto igual (realm roles, client roles de todos os clients, grupos e atributos), em dois modos. O email do novo usuário **nunca é copiado do usuário de origem** — é sempre gerado, inválido/não-real e único (`{novoUsername}.{sufixo}@invalido.multiplica.local`), justamente para nunca colidir com um email já existente em HML.

- **Único** (`@keycloakUsuario`): um usuário por execução, com novo username/senha informados via `--env` (`usuarioOrigem`, `novoUsername`, `novaSenha`).
- **Em lote** (`@clonarUsuariosEmLote`): todos os usuários de um mapa `usuarioProd: usuarioHml` lido do fixture `cypress/fixtures/usuariosParaClonar.json` (populado antes de rodar), numa única execução — cada usuário criado recebe a senha temporária fixa `Automacao@123`, com troca obrigatória no primeiro login. Um item problemático (usuário de origem não encontrado, role/grupo sem correspondente em HML, conflito de username em HML) não interrompe o lote — vira uma dúvida bloqueante só daquele item, e o processamento segue para o próximo. Ao final, os usuários clonados com sucesso são removidos do fixture (quem falhou permanece, para nova tentativa depois de corrigido) — fixture vazia (`{}`) é o estado normal de "nada pendente", não um erro.

A lógica vive em `commands/usuariosKeycloak.js` + `utils/mapeamentoUsuarios.js`; ver detalhes em `CLAUDE.md`.

## Configuração

```bash
npm install
cp .env.example .env   # preencha credenciais e URLs de PROD, HML, Keycloak (HML e PROD) e SQL Server
```

Nunca versionar `.env` ou `cypress/temp/tokens.json` (já cobertos pelo `.gitignore`).

## Execução

```bash
npm run cypress:open   # interface do Cypress, escolha o .feature desejado
npm run cypress:run    # roda todos os cenários (specPattern: **/*.feature)
```

Cenários são marcados por tag de domínio: `@produto`, `@esteira`, `@vinculos`, `@keycloak`, `@keycloakUsuario`, `@clonarUsuariosEmLote`.

A clonagem de usuário única (`@keycloakUsuario`) é parametrizada a cada execução via `--env`:

```bash
npx cypress run --env tags=@keycloakUsuario,usuarioOrigem=fulano,novoUsername=fulano.hml,novaSenha=SenhaForte123!
```

A clonagem em lote (`@clonarUsuariosEmLote`) lê o mapa `usuarioProd: usuarioHml` de `cypress/fixtures/usuariosParaClonar.json` — popule esse arquivo antes de rodar:

```bash
npx cypress run --env tags=@clonarUsuariosEmLote
```

## Autenticação

Sem UI: `cy.verificarTokens(ambiente)` testa se o token salvo em `cypress/temp/tokens.json` ainda é válido e, se não for, chama `cy.obterToken(ambiente)` (`utils.js`), que faz um `POST` direto ao endpoint de token do Keycloak. Ambientes suportados: `prod`, `hml`, `keycloak`, `keycloakProd` (bloqueado para escrita, assim como `prod`).

- `prod`/`hml`: `grant_type=password` no client `autenticacao` (o mesmo client que a aplicação usa por trás da UI), com `HML_API_USERNAME`/`PASSWORD` ou `PROD_API_USERNAME`/`PASSWORD`.
- `keycloak`/`keycloakProd`: `grant_type=client_credentials` num client de automação dedicado (`HML_KEYCLOAK_CLIENT_ID`/`SECRET` ou `PROD_KEYCLOAK_CLIENT_ID`/`SECRET`), criado no realm `multiplicacapital` com "Service accounts roles" habilitado.

Tokens duram horas (não mais segundos), então não há mais a limitação de token expirando em segundos que existia com o client `security-admin-console`.

## Testes e lint

```bash
npm run test:safety   # node:test — cobre regras puras (ex.: bloqueio de escrita em produção)
npm run lint           # ESLint
```

## Segurança

- Produção é somente leitura por construção: `validarSomenteLeituraEmProducao` lança erro se qualquer requisição não-GET for direcionada a `prod`/`keycloakProd`.
- Nunca commitar `.env`, `cypress/temp/tokens.json` ou dados sensíveis em `cypress/output/`.
- `package-lock.json` está no `.gitignore` — instalações podem resolver versões diferentes entre execuções.

## Troubleshooting

| Sintoma | Verifique |
|---|---|
| `401 Unauthorized` | Credenciais no `.env`; remova `cypress/temp/tokens.json` e rode novamente para forçar novo login |
| Registro não encontrado em HML | Campo de busca/descrição do mapeamento; dependências já processadas; `cypress/output/estoqueIds.json` |
| ID de dependência incorreto | `dependencia`, `arquivoDependencia`, `idSubstituido` no mapeamento; se o registro dependente já foi sincronizado |
| Erro de conexão com banco | Variáveis `*_DB_HOST/USER/PASS/NAME/PORT` no `.env`; conectividade com o SQL Server |
