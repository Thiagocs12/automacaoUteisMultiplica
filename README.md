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
│   ├── step_definitions/      # Steps de cada domínio (Produtos, Esteiras, Vínculos)
│   ├── commands/               # Comandos customizados, por responsabilidade
│   │   (ambiente, arquivos, urls, dependencias, sincronizacaoNivel, estoque, vinculos, log)
│   ├── shared/                 # Lógica pura testável fora do Cypress (node:test)
│   ├── db/dbClient.cjs         # Pools de conexão SQL Server (prod/hml)
│   ├── tasks/dbTasks.cjs       # Tasks de banco expostas ao Cypress
│   ├── apiCommands.js          # executarRequest (requisições HTTP autenticadas)
│   ├── utils.js                # Login via UI, verificação/renovação de token
│   └── e2e.js
├── utils/                      # Mapeamento de entidades por domínio
│   (mapeamentoProdutos, mapeamentoEsteiras, mapeamentoVinculos)
├── output/                     # JSONs intermediários + estoqueIds.json (gitignored)
└── temp/tokens.json            # Tokens de sessão (gitignored)
```

## Como funciona

Cada entidade é descrita em um arquivo de mapeamento (`cypress/utils/mapeamento*.js`) com endpoint, arquivo de saída, dependências e nível de dependência. A sincronização, para cada entidade, processa os níveis em ordem e:

1. busca os dados em PROD e salva em JSON (`cypress/output/`);
2. resolve dependências, convertendo IDs de PROD para os IDs equivalentes em HML via `cypress/output/estoqueIds.json`;
3. localiza o registro correspondente em HML;
4. cria (POST) ou atualiza (PUT/PATCH) o registro, e registra o novo par PROD→HML no estoque.

Os três domínios sincronizados (Produtos, Esteiras, Vínculos) têm cada um seu arquivo de mapeamento e feature própria — novas entidades são adicionadas configurando o mapeamento, sem alterar a lógica central de processamento.

## Configuração

```bash
npm install
cp .env.example .env   # preencha credenciais e URLs de PROD, HML, Keycloak, BHML e SQL Server
```

Nunca versionar `.env` ou `cypress/temp/tokens.json` (já cobertos pelo `.gitignore`).

## Execução

```bash
npm run cypress:open   # interface do Cypress, escolha o .feature desejado
npm run cypress:run    # roda todos os cenários (specPattern: **/*.feature)
```

Cenários são marcados por tag de domínio: `@produto`, `@esteira`, `@vinculos`.

## Autenticação

Login é feito via UI (Keycloak), interceptando o token retornado e salvando em `cypress/temp/tokens.json`. Antes de cada execução, `cy.verificarTokens(ambiente)` testa se o token salvo ainda é válido e refaz o login se necessário. Ambientes suportados: `prod`, `hml`, `keycloak`, `bhml` (o alias `bprod` reaproveita a base de HML/BHML e permanece bloqueado para escrita).

## Testes e lint

```bash
npm run test:safety   # node:test — cobre regras puras (ex.: bloqueio de escrita em produção)
npm run lint           # ESLint
```

## Segurança

- Produção é somente leitura por construção: `validarSomenteLeituraEmProducao` lança erro se qualquer requisição não-GET for direcionada a `prod`/`bprod`.
- Nunca commitar `.env`, `cypress/temp/tokens.json` ou dados sensíveis em `cypress/output/`.
- `package-lock.json` está no `.gitignore` — instalações podem resolver versões diferentes entre execuções.

## Troubleshooting

| Sintoma | Verifique |
|---|---|
| `401 Unauthorized` | Credenciais no `.env`; remova `cypress/temp/tokens.json` e rode novamente para forçar novo login |
| Registro não encontrado em HML | Campo de busca/descrição do mapeamento; dependências já processadas; `cypress/output/estoqueIds.json` |
| ID de dependência incorreto | `dependencia`, `arquivoDependencia`, `idSubstituido` no mapeamento; se o registro dependente já foi sincronizado |
| Erro de conexão com banco | Variáveis `*_DB_HOST/USER/PASS/NAME/PORT` no `.env`; conectividade com o SQL Server |
