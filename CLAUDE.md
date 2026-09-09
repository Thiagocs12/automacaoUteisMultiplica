# CLAUDE.md

Este arquivo fornece orientações ao Claude Code (claude.ai/code) ao trabalhar com código neste repositório.

## O que é este projeto

Uma ferramenta de automação Cypress + Cucumber (BDD) que sincroniza dados de referência **PROD → HML** (produção → homologação), para os domínios Produtos, Esteiras e Vínculos. Ela consulta entidades em PROD (API REST e SQL Server), localiza/cria o registro correspondente em HML e os vincula por ID — respeitando a ordem de dependência entre entidades. Isto **não** é uma suíte de testes de UI; é uma ferramenta de orquestração de dados construída sobre a infraestrutura do Cypress/Cucumber.

**Produção é somente leitura por construção.** `validarSomenteLeituraEmProducao` (`cypress/support/shared/producaoSomenteLeitura.js`) lança erro se qualquer requisição não-GET for direcionada a `prod`/`bprod`. Nunca escreva caminhos de código que possam enviar uma requisição não-GET para `prod`/`bprod`.

## Comandos

```bash
npm install
cp .env.example .env        # preencha credenciais de API PROD/HML/Keycloak/BHML e do SQL Server

npm run cypress:open        # interface interativa, escolha o .feature desejado
npm run cypress:run         # roda todos os cenários (specPattern: **/*.feature)

npm run test:safety         # node:test — testes de lógica pura (ex.: bloqueio de escrita em prod), fora do Cypress
npm run lint                # ESLint (flat config)
```

Cenários são marcados por tag de domínio: `@produto`, `@esteira`, `@vinculos`. O filtro de tags do Cypress pode direcionar apenas uma, ex.: `cypress run --env tags=@produto`.

Para rodar um único arquivo de `node:test` diretamente: `node --test cypress/support/shared/__tests__/producaoSomenteLeitura.test.js`.

Não há etapa de build separada; `cypress.config.js` empacota as specs em tempo real via `@bahmutov/cypress-esbuild-preprocessor`.

## Arquitetura

### O mapeamento de entidades comanda tudo

Cada entidade sincronizada é declarada em um dos três arquivos de mapeamento (`cypress/utils/mapeamentoProdutos.js`, `mapeamentoEsteiras.js`, `mapeamentoVinculos.js`) como um objeto simples indexado pelo nome da entidade, ex.:

```js
PRODUTO: {
  url, urlBusca, urlBuscaId, urlListAll,   // endpoints da API
  nomeArquivo: 'Produtos/1 - Produtos.json', // onde os dados obtidos são cacheados (cypress/output/)
  nivelDependencia: 3,                       // ordem de processamento em relação às outras entidades
  contentBusca: ['descricao', 'classificacaoProduto.id'], // chave de busca composta, quando não é um único campo
  dependencia: [                             // entidades aninhadas cujo id em HML precisa ser resolvido antes
    { idSubstituido: 'subProduto.id', arquivoDependencia: 'Produtos/33 - SubProdutos.json' },
  ],
}
```

Adicionar uma nova entidade sincronizada significa adicionar uma entrada de mapeamento (e, se precisar de tratamento especial, adicionar sua chave a uma das listas de exclusão em `sincronizacaoNivel.js`/`estoque.js`/`dependencias.js`) — e **não** mexer nos comandos centrais de processamento. O bloco comentado no final de `mapeamentoProdutos.js` documenta entidades que foram deixadas de fora do escopo; mantenha esse padrão (comentar, não apagar) caso alguma entidade seja desativada temporariamente.

### Pipeline (por nível de dependência, por domínio)

Os arquivos .feature chamam, para cada nível 1..N: `cy.processarEntidadesPorNivel(nivel, MAPEAMENTO)` (em `cypress/support/commands/sincronizacaoNivel.js`), que executa, em ordem:

1. `substituirUrlsDeAmbiente` — substitui placeholders nas URLs do mapeamento pelo ambiente atual.
2. `atualizarIdsDeDependencias` (`dependencias.js`) — para cada lista `dependencia` da entidade, substitui o id aninhado do lado PROD pelo id já resolvido em HML (percorrendo caminhos com ponto/array), salvando o valor original em uma chave irmã `<campo>.old` para permitir reversão.
3. `pesquisarItensPorNivel` — busca em HML um registro equivalente para cada item (por campo único, `contentBusca` composto, ou busca por nome no estilo Keycloak), gravando o id encontrado em `idHml`.
4. `atualizarItensExistentesPorNivel` — PUT/PATCH nos itens que já tiveram um `idHml` resolvido.
5. `criarItensInexistentesPorNivel` — POST nos que não tiveram, gravando em seguida o novo id de HML via `setIdHmlPorDescricao`.

Antes de processar os níveis, os features chamam `cy.voltarIdsOriginais` (reverte substituições `.old` de uma execução anterior), `cy.pesquisarDependenciasLigacao` (busca em PROD os registros vinculados/filhos referenciados pela entidade base) e `cy.preencherIdsHmlPeloEstoque` (pré-preenche `idHml` a partir do cache de ids entre execuções, evitando uma busca redundante em HML).

Após todos os níveis: `cy.atualizarEstoqueIds` persiste os pares de id PROD→HML recém-resolvidos no cache descrito abaixo.

### Cache de ids entre execuções ("estoque")

`cypress/output/estoqueIds.json` armazena `{ idProducao, idHml, dataAtualizacao }` por entidade, válido por 60 dias (`TEMPO_ESTOQUE` em `estoque.js`). Isso permite que execuções seguintes evitem buscar novamente em HML registros já vinculados. Entidades sem um id estável em PROD (grupos do Keycloak) são excluídas via `ENTIDADE_SEM_ESTOQUE`.

### Lotes / limites na busca inicial em PROD

`salvarNovosRegistros` (`dependencias.js`) limita quantos registros novos/desatualizados são trazidos de PROD por execução para algumas entidades de alto volume (`LIMITE_ESTEIRAS`, `LIMITE_PRODUTO`, `LIMITE_MOP`, `LIMITE_POC`), priorizando os atualizados há mais tempo com base em `cypress/output/ultimosUpdates.json` (janela de 14 dias). Entidades sem limite declarado não têm limite.

### Ambientes e autenticação

`cypress/support/commands/ambiente.js` define quatro ambientes base: `prod`, `hml`, `keycloak`, `bhml`. `bprod` é um alias que reaproveita o token de `bhml` + a baseUrl de `hml` e permanece bloqueado para escrita (ver `resolverAmbienteDaRequisicao` em `apiCommands.js`).

A autenticação é feita via UI: `cy.loginUi(ambiente)` (`cypress/support/utils.js`) acessa a aplicação, preenche o formulário de login do Keycloak (tratando cross-origin via `cy.origin` quando necessário), intercepta a resposta do token e o persiste em `cypress/temp/tokens.json` (gitignored, nunca commitar). `cy.verificarTokens(ambiente)` é chamado no início de cada feature e faz uma requisição de teste barata; se o status não for 200, aciona `loginUi` para renovar.

Todas as chamadas HTTP autenticadas passam por `cy.executarRequest`/`cy.executarRequest2` (aliases da mesma implementação, `apiCommands.js`), que resolve token+baseUrl para o ambiente, aplica o bloqueio de escrita em produção e, em caso de falha, loga um comando `curl` pronto para reproduzir (token oculto) antes de opcionalmente lançar erro.

### Acesso ao SQL Server

`cypress/support/db/dbClient.cjs` (CommonJS, carregado diretamente por `cypress.config.js`, não pelo bundler do Cypress) gerencia pools de conexão por ambiente (`prod`/`hml`) usando `msnodesqlv8` (driver de autenticação integrada do Windows). Exposto às specs como tasks do Cypress via `cypress/support/tasks/dbTasks.cjs` → `cy.executarQuery(ambiente, sql, params)`. Os pools são fechados no `after:run` em `cypress.config.js`.

### Lógica pura/testável vive fora do Cypress

`cypress/support/shared/` reúne lógica sem dependência do objeto global `Cypress` (ex.: `producaoSomenteLeitura.js`, `helpers.js`), justamente para poder ser coberta por `node:test` puro em `__tests__/` sem precisar rodar o Cypress. Ao adicionar lógica de validação/regra de negócio, prefira colocá-la aqui (e testá-la com `node:test`) em vez de embuti-la em um arquivo de `commands/*.js`.

### Formatos de módulo

O projeto é ESM (`"type": "module"` no package.json), **exceto**: o próprio `cypress.config.js` (carregado pelo bundler CJS do Cypress, mistura `import`/`require`) e `cypress/support/tasks/**/*.cjs` + `cypress/support/db/**/*.cjs` (CommonJS de fato, para acesso direto a Node/mssql fora do bundle de specs do Cypress). O flat config do ESLint (`eslint.config.js`) tem blocos separados com `globals`/`sourceType` correspondentes por grupo de arquivos — confira esse arquivo ao adicionar um novo diretório fora do padrão.

### Peculiaridades de nomenclatura/tradução entre ambientes

Algumas entidades têm nomes canônicos diferentes entre PROD e HML para o mesmo conceito (ex.: o tipo de esteira "OPE" em PROD é "MOP" em HML). Use o mapa `traducaoBusca` da entidade (ver uso em `sincronizacaoNivel.js`) para traduzir o valor usado na busca/criação em HML, sem alterar o registro de PROD cacheado localmente.

## Segurança / não commitar

- Nunca commitar `.env` ou `cypress/temp/tokens.json` (ambos no `.gitignore`).
- `package-lock.json` está no `.gitignore` — instalações podem resolver versões diferentes entre execuções/máquinas.
- `cypress/output/**` contém snapshots de dados sincronizados (gitignored) — trate como potencialmente sensível.
