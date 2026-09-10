# CLAUDE.md

Este arquivo fornece orientações ao Claude Code (claude.ai/code) ao trabalhar com código neste repositório.

## O que é este projeto

Uma ferramenta de automação Cypress + Cucumber (BDD) que sincroniza dados de referência **PROD → HML** (produção → homologação), para os domínios Produtos, Esteiras, Vínculos e Grupos e Permissões (Keycloak). Ela consulta entidades em PROD (API REST, SQL Server e a API de administração do Keycloak), localiza/cria o registro correspondente em HML e os vincula por ID — respeitando a ordem de dependência entre entidades. Isto **não** é uma suíte de testes de UI; é uma ferramenta de orquestração de dados construída sobre a infraestrutura do Cypress/Cucumber.

**Produção é somente leitura por construção.** `validarSomenteLeituraEmProducao` (`cypress/support/shared/producaoSomenteLeitura.js`) lança erro se qualquer requisição não-GET for direcionada a `prod`/`keycloakProd`. Nunca escreva caminhos de código que possam enviar uma requisição não-GET para esses ambientes.

## Comandos

```bash
npm install
cp .env.example .env        # preencha credenciais de API PROD/HML/Keycloak (HML e PROD) e do SQL Server

npm run cypress:open        # interface interativa, escolha o .feature desejado
npm run cypress:run         # roda todos os cenários (specPattern: **/*.feature)

npm run test:safety         # node:test — testes de lógica pura (ex.: bloqueio de escrita em prod), fora do Cypress
npm run lint                # ESLint (flat config)
```

Cenários são marcados por tag de domínio: `@produto`, `@esteira`, `@vinculos`, `@keycloak`. O filtro de tags do Cypress pode direcionar apenas uma, ex.: `cypress run --env tags=@produto`.

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
5. `criarItensInexistentesPorNivel` — POST nos que não tiveram, gravando em seguida o novo id de HML via `setIdHmlPorDescricao`. Quando a entidade tem `novoArray` (corpo de criação embrulhado, ex.: `{ modeloEtapa: {...} }`), o id da resposta é lido tanto em `resultado.body.id` quanto em `resultado.body[novoArray].id` — se nenhum dos dois existir, falha imediatamente (nome do item + resposta crua) em vez de gravar `idHml: null` silenciosamente e só quebrar depois, quando outra entidade tentar resolver essa dependência.

Antes de processar os níveis, os features chamam `cy.voltarIdsOriginais` (reverte substituições `.old` de uma execução anterior), `cy.pesquisarDependenciasLigacao` (busca em PROD os registros vinculados/filhos referenciados pela entidade base) e `cy.preencherIdsHmlPeloEstoque` (pré-preenche `idHml` a partir do cache de ids entre execuções, evitando uma busca redundante em HML).

Após todos os níveis: `cy.atualizarEstoqueIds` persiste os pares de id PROD→HML recém-resolvidos no cache descrito abaixo.

### Cache de ids entre execuções ("estoque")

`cypress/output/estoqueIds.json` armazena `{ idProducao, idHml, dataAtualizacao }` por entidade, válido por 60 dias (`TEMPO_ESTOQUE` em `estoque.js`). Isso permite que execuções seguintes evitem buscar novamente em HML registros já vinculados. Entidades sem um id estável em PROD (grupos do Keycloak) são excluídas via `ENTIDADE_SEM_ESTOQUE`.

### Lotes / limites na busca inicial em PROD

`salvarNovosRegistros` (`dependencias.js`) limita quantos registros novos/desatualizados são trazidos de PROD por execução para algumas entidades de alto volume (`LIMITE_ESTEIRAS`, `LIMITE_PRODUTO`, `LIMITE_MOP`, `LIMITE_POC`), priorizando os atualizados há mais tempo com base em `cypress/output/ultimosUpdates.json` (janela de 14 dias). Entidades sem limite declarado (`LIMITE_LOTE = Infinity`, ex.: `ETAPAS`) não respeitam esse corte por lote: um item sem `idHml` ainda é sempre marcado `atualizar: true`, senão ficaria travado para sempre (essas entidades entram no fetch a reboque do `atualizar` da entidade pai — ex.: uma etapa só é buscada quando a esteira dona dela está no lote da rodada — e não têm uma rodada própria de novas tentativas).

### "Nada a sincronizar" não é uma falha

`PRODUTO`, `ESTEIRAS` e `MOP`/`POC` são as entidades principais de cada domínio (Produtos, Esteiras, Vínculos) — se nenhum registro delas tiver `atualizar === true` na rodada, o restante do cenário (dependências, todos os níveis) nem deveria rodar. Os steps que fazem essa validação (`gerenciamentoDeProdutos.js`, `gerenciamentoDeEsteiras.js`, `gerenciamentoDosVinculos.js`) usam `this.skip()` (Mocha) em vez de `throw` — o cenário fica `pending`, não `failed`, para não quebrar uma pipeline de CI só porque não havia nada novo para sincronizar. Por causa disso, esses steps específicos são `function ()` normal, não arrow function — arrow function não tem `this` próprio para chamar `.skip()`.

### Ambientes e autenticação

`cypress/support/commands/ambiente.js` define quatro ambientes base: `prod`, `hml`, `keycloak` (Keycloak de HML), `keycloakProd` (Keycloak de PRODUÇÃO — só leitura, usado para sincronizar grupos/roles). `keycloakProd` é bloqueado para escrita diretamente em `validarSomenteLeituraEmProducao`, assim como `prod`.

A autenticação **não usa UI**: `cy.verificarTokens(ambiente)` é chamado no início de cada feature (e, no fluxo de Grupos e Permissões, de novo antes de cada fase) e faz uma requisição de teste barata; se o status não for 200, chama `cy.obterToken(ambiente)` (`cypress/support/utils.js`), que faz um `POST` direto ao endpoint de token do Keycloak e persiste o resultado em `cypress/temp/tokens.json` (gitignored, nunca commitar). Dois grant types diferentes, por tipo de ambiente:
- `prod`/`hml`: `grant_type=password` no client **`autenticacao`** (o mesmo client público que a aplicação usa por trás da UI — mesmo `clientId` nos dois ambientes), com `HML_API_USERNAME`/`PASSWORD` ou `PROD_API_USERNAME`/`PASSWORD`. Não dá pra usar um client de automação genérico aqui: o `mc-cadastro-ms` depende de claims (`idAnalista`, `cargoPrincipal`, etc.) que só esse client específico emite (protocol mappers dedicados a ele) — sem eles a API quebra com `NullPointerException`, não com 401/403 (o token é aceito, só falta o claim que a lógica de negócio espera).
- `keycloak`/`keycloakProd`: `grant_type=client_credentials` num client de automação dedicado (`cypress-uteis-automation`, `HML_KEYCLOAK_CLIENT_ID`/`SECRET` ou `PROD_KEYCLOAK_CLIENT_ID`/`SECRET`), criado no realm `multiplicacapital` (não `master`) com "Service accounts roles" habilitado e o client scope `roles` como default (sem esse scope o token sai sem `realm_access`/`resource_access`, mesmo com as roles certas atribuídas — não é óbvio, custa tempo de debug se esquecer). Escopo mínimo confirmado por teste real contra os endpoints que `gruposPermissoes.js` usa: `view-clients`, `manage-clients`, `view-users`, `manage-users` (`realm-management`) + `manage-realm` em HML (leitura e escrita) ou só `view-realm` em PROD (somente leitura — `keycloakProd` nunca escreve). Tokens duram horas, não mais segundos.

O Cloudflare Access que protege `lgni.grupomultiplica.com.br` (PROD) só bloqueia a rota de UI/console (`/auth/admin/master/console/`) — o endpoint de token e a API REST admin respondem normalmente por trás dele, sem Service Token nenhum.

Todas as chamadas HTTP autenticadas passam por `cy.executarRequest`/`cy.executarRequest2` (aliases da mesma implementação, `apiCommands.js`), que resolve token+baseUrl para o ambiente, aplica o bloqueio de escrita em produção e, em caso de falha, loga um comando `curl` pronto para reproduzir (token oculto) antes de opcionalmente lançar erro.

### Acesso ao SQL Server

`cypress/support/db/dbClient.cjs` (CommonJS, carregado diretamente por `cypress.config.js`, não pelo bundler do Cypress) gerencia pools de conexão por ambiente (`prod`/`hml`) usando `msnodesqlv8` (driver de autenticação integrada do Windows). Exposto às specs como tasks do Cypress via `cypress/support/tasks/dbTasks.cjs` → `cy.executarQuery(ambiente, sql, params)`. Os pools são fechados no `after:run` em `cypress.config.js`.

### Lógica pura/testável vive fora do Cypress

`cypress/support/shared/` reúne lógica sem dependência do objeto global `Cypress` (ex.: `producaoSomenteLeitura.js`, `helpers.js`), justamente para poder ser coberta por `node:test` puro em `__tests__/` sem precisar rodar o Cypress. Ao adicionar lógica de validação/regra de negócio, prefira colocá-la aqui (e testá-la com `node:test`) em vez de embuti-la em um arquivo de `commands/*.js`.

### Formatos de módulo

O projeto é ESM (`"type": "module"` no package.json), **exceto**: o próprio `cypress.config.js` (carregado pelo bundler CJS do Cypress, mistura `import`/`require`) e `cypress/support/tasks/**/*.cjs` + `cypress/support/db/**/*.cjs` (CommonJS de fato, para acesso direto a Node/mssql fora do bundle de specs do Cypress). O flat config do ESLint (`eslint.config.js`) tem blocos separados com `globals`/`sourceType` correspondentes por grupo de arquivos — confira esse arquivo ao adicionar um novo diretório fora do padrão.

### Logs — só em pontos estratégicos

`cy.logExecucao` (`commands/log.js`) loga em `cy.log` (UI) e via `cy.task('log', ...)` (terminal, inclusive em `cypress run` headless). Cada chamada é um round-trip síncrono até o processo Node — caro quando repetido por item dentro de um laço de centenas de registros. Convenção do projeto: logar por entidade/nível (ex.: `[Nível X] ...`, contagem agregada de itens a criar/atualizar) e em falhas (erro HTTP com curl de reprodução, erro de SQL, dependência não resolvida) — nunca um log de sucesso por item individual dentro de `criarItensInexistentesPorNivel`, `atualizarItensExistentesPorNivel`, `atualizarItensHml`, `inserirItensHml` ou `setIdHmlPorDescricao`. Ao adicionar uma chamada nova nesses fluxos, prefira um log agregado antes do laço a um log dentro dele.

### Peculiaridades de nomenclatura/tradução entre ambientes

Algumas entidades têm nomes canônicos diferentes entre PROD e HML para o mesmo conceito (ex.: o tipo de esteira "OPE" em PROD é "MOP" em HML). Use o mapa `traducaoBusca` da entidade (ver uso em `sincronizacaoNivel.js`) para traduzir o valor usado na busca/criação em HML, sem alterar o registro de PROD cacheado localmente.

### Grupos e Permissões (Keycloak) — pipeline próprio, fora de `sincronizacaoNivel.js`

Diferente de Produtos/Esteiras/Vínculos, o domínio Grupos e Permissões (`cypress/utils/mapeamentoGruposPermissoes.js` + `cypress/support/commands/gruposPermissoes.js`, feature `@keycloak`) **não** usa o pipeline genérico de níveis de dependência: a API de administração do Keycloak tem forma própria demais para caber no contrato `nivelDependencia`/`contentBusca`/`novoArray` (pensado para as APIs REST de negócio, ex.: mc-cadastro-ms) sem recorrer a mais casos especiais hardcoded em `sincronizacaoNivel.js` — o mesmo tipo de solução pontual já usada ali para os grupos Keycloak de OPERADORES/OBSERVADORES/GESTORES de esteira (ver `ENTIDADES_SEM_ATUALIZACAO`, `ENTIDADE_SEM_ESTOQUE`), que são um caso à parte (só o nome do grupo, sem id estável em PROD) e continuam nesse fluxo antigo.

Peculiaridades da API do Keycloak que moldam esse pipeline:
- **Grupos e roles são localizados em HML por busca textual** (`?search=nome`), que faz correspondência **parcial** — todo resultado é filtrado pelo nome exato (`encontrarPorNomeExato` em `shared/keycloakHelpers.js`) antes de decidir se o registro já existe.
- **A criação não devolve o novo `id` no corpo da resposta** (ao contrário de mc-cadastro-ms) — não se usa o cabeçalho `Location`; em vez disso, repete-se a mesma busca por nome logo após o POST para obter o id (também cobre o caso `409`: tratado como sucesso, já existe o que se queria criar).
- **Client roles exigem resolver o UUID interno do client antes** (`buscarUuidClienteKeycloak`, via `GET .../clients?clientId=`), porque o `clientId` público é o mesmo em PROD e HML mas o UUID interno é gerado por ambiente.
- **O vínculo grupo→role não vem de um endpoint de "role-mappings" separado**: vem embutido na representação completa do grupo (`GET .../groups/{id}`, campos `realmRoles: string[]` e `clientRoles: {[clientId]: string[]}`) — só a listagem/busca de grupos é que retorna uma representação "brief" sem esses campos. `sincronizarRoleMappingsDosGrupos` busca essa representação completa em PROD e em HML, faz o diff por nome (`calcularNomesFaltantes`) e atribui (`POST .../role-mappings/realm|clients/{uuid}`) só o que falta — resolvendo a representação completa de cada role faltante **na hora**, nunca a partir de um valor cacheado no arquivo de output (o `idHml` de uma role pode ter vindo do estoque de ids de uma execução anterior, sem repassar pela busca desta rodada).

GRUPOS/ROLES_REALM/ROLES_CLIENTE têm id estável em PROD (UUID do Keycloak) e por isso participam normalmente do estoque de ids (`cy.preencherIdsHmlPeloEstoque`/`cy.atualizarEstoqueIds`) — ao contrário dos grupos OPERADORES/OBSERVADORES/GESTORES do fluxo de Esteiras.

## Segurança / não commitar

- Nunca commitar `.env` ou `cypress/temp/tokens.json` (ambos no `.gitignore`).
- `package-lock.json` está no `.gitignore` — instalações podem resolver versões diferentes entre execuções/máquinas.
- `cypress/output/**` contém snapshots de dados sincronizados (gitignored) — trate como potencialmente sensível.
