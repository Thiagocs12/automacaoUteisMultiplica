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

### Clonagem de Usuário (Keycloak) — ação pontual sob demanda, sem estoque

Diferente de todos os domínios acima (sincronização em lote, recorrente, com cache de ids em `estoqueIds.json`), o domínio **Usuários** (`cypress/utils/mapeamentoUsuarios.js` + `cypress/support/commands/usuariosKeycloak.js`) clona usuários do Keycloak de PRODUÇÃO para HML, em dois modos, ambos reaproveitando a mesma lógica de clonagem (`executarClonagem`, interna a `usuariosKeycloak.js`) sem duplicá-la:

- **Único** (feature `@keycloakUsuario`): clona um único usuário por execução, com novo `username`/senha informados via `--env` (`usuarioOrigem`, `novoUsername`, `novaSenha`) — não uma lista fixa nem um script de uso único. **Parâmetros ausentes não quebram a execução**: `parametrosClonagemUnicaCompletos` (`clonagemUsuarioKeycloak.js`) exige os 3 juntos; faltando qualquer um (nenhum, ou só parte), o step loga `MENSAGEM_PARAMETROS_CLONAGEM_UNICA_AUSENTES` (mesmo texto orientativo, antes lançado como erro) via `cy.logExecucao` e o cenário passa sem executar a clonagem — relevante ao rodar a suíte completa sem `tags=@keycloakUsuario`, quando esses parâmetros nunca são passados de propósito. Com os 3 informados, o comportamento de clonagem é inalterado.
- **Em lote** (feature `@clonarUsuariosEmLote`): clona, numa única execução, todos os usuários de um mapa `usuarioProd: usuarioHml` lido do fixture `cypress/fixtures/usuariosParaClonar.json` (populado antes de rodar — versionado como template vazio `{}`, nunca com usuários reais de PROD, já que decidir "qual usuário copiar" não é algo que a automação decide sozinha). Todo usuário criado pelo lote recebe a senha temporária fixa `SENHA_TEMPORARIA_LOTE` (`Automacao@123`, em `usuariosKeycloak.js`), com `temporary: true` (mecanismo nativo do Keycloak — força troca no primeiro login); o modo único continua usando a `novaSenha` informada, sem `temporary`.
  - **Fixture "consumido" a cada execução bem-sucedida**: ao final do lote, `cy.clonarUsuariosKeycloakEmLote` remove do fixture (via `cy.writeFile`) os usuários que tiveram `ok: true` — usando a função pura `removerUsuariosClonadosComSucesso` (`clonagemUsuarioKeycloak.js`), que recebe o mapa original e a lista de resultados e devolve um novo mapa sem os `usuarioProd` clonados com sucesso. Usuários que ficaram com `ok: false` (dúvida bloqueante) **permanecem** no fixture, para permitir nova tentativa depois que o motivo for corrigido — sem exigir repopular o arquivo manualmente. Isso evita reclonar o mesmo usuário numa próxima execução do cenário.
  - **Fixture vazio (`{}`) é o estado normal de "nada pendente de clonar", não mais um erro**: `cy.clonarUsuariosKeycloakEmLote` loga uma mensagem informativa e retorna lista vazia sem lançar erro (antes lançava `Error`, tratando fixture vazio como guard-rail — mudou porque, com a remoção automática acima, esvaziar o fixture é o resultado esperado de um lote bem-sucedido, não uma configuração incompleta). O step `Then` de `@clonarUsuariosEmLote` (`gerenciamentoDeUsuarios.js`) também trata lista de resultados vazia como sucesso do cenário, sem assertar nada além do log.

Nenhum dos dois modos participa do estoque de ids (não há um "próximo usuário" a sincronizar depois).

Tudo do usuário de origem é copiado para o novo usuário, **exceto** `username`, senha e email: realm roles, client roles (de **todos** os clients em que o usuário tiver role atribuída — resolvido via `GET /users/{id}/role-mappings`, que já devolve `realmMappings`/`clientMappings` agrupados por client sem precisar iterar client por client, ao contrário do client fixo `KEYCLOAK_CLIENT_ID` usado pela sincronização de Grupos e Permissões), grupos (por nome exato, reaproveitando `encontrarPorNomeExato`/a busca textual de `GRUPOS.urlGrupos` já usada por Grupos e Permissões) e atributos/nome/`enabled`/`emailVerified`/`requiredActions`.

**O email do novo usuário nunca é copiado do usuário de origem** — é sempre gerado, inválido/não-real e único (`gerarEmailInvalidoUnico`, `cypress/support/shared/clonagemUsuarioKeycloak.js`): combina o `novoUsername` (já exigido único em HML) com um sufixo aleatório e um domínio não real, no formato `{novoUsername}.{sufixo}@invalido.multiplica.local`. Isso existe porque copiar o email do usuário de origem causava conflito de criação sempre que o mesmo email já existisse em HML — era uma "dúvida bloqueante" da versão anterior deste recurso, removida junto com essa mudança: como o email nunca mais vem do usuário original, não há mais como colidir com o dele.

Peculiaridades que diferenciam este pipeline do de Grupos e Permissões:
- **A API de usuários do Keycloak suporta busca por correspondência exata nativamente** (`?username=...&exact=true`) — diferente de grupos/roles, não é preciso filtrar o resultado da busca depois.
- **Nunca decide sozinho diante de ambiguidade**: usuário de origem não encontrado em PROD, uma role/grupo do usuário de origem sem correspondente em HML (nunca cria o que falta — diferente de Grupos e Permissões, que cria grupos/roles faltantes), ou o novo `username` já existente em HML são a "dúvida bloqueante" deste recurso — a checagem é a mesma (`executarClonagem`) nos dois modos, mas cada modo reage diferente:
  - **Modo único** (`cy.clonarUsuarioKeycloak`): lança erro descritivo imediatamente, interrompendo a clonagem. Como este modo é sempre executado sob demanda por um humano, o erro lançado É a forma de sinalizar a "dúvida" a quem estiver rodando.
  - **Modo em lote** (`cy.clonarUsuariosKeycloakEmLote`): **não** lança erro — o item problemático vira um resultado `{ ok: false, motivo }` (junto com `usuarioProd`/`usuarioHml` daquele item específico) na lista final, e o processamento segue normalmente para o próximo usuário do mapa. Isso só é possível porque `executarClonagem` e os resolvers internos (`resolverRolesRealmEmHml`, `resolverRolesClienteEmHml`, `resolverGruposEmHml`) devolvem `{ ok, motivo? , valor? }` em vez de lançar — decisão tomada justamente para viabilizar essa continuação (Cypress não permite `try/catch`/`.catch()` ao redor de uma cadeia de comandos que falha: uma vez que um comando lança erro dentro dela, a fila de comandos do teste é interrompida, então "continuar após uma falha" só funciona se o próprio código nunca lançar erro para os casos esperados). A orquestração do lote em si (`clonarUsuariosEmLote`, em `cypress/support/shared/clonagemUsuarioKeycloak.js`) é pura — recebe a função de clonagem por injeção — para poder ser coberta por `node:test` sem depender do Cypress.
- **A criação do usuário não é seguida de nova busca "às cegas"**: o `username` já foi conferido como livre em HML antes de criar (passo anterior do fluxo), então a busca por `username` logo após o `POST` serve só para obter o `id` do novo usuário (necessário para os `POST`/`PUT` de role-mappings/grupos seguintes), não para tratar `409` como sucesso — um `POST` de criação que falhar aqui é sempre um erro real, não uma corrida esperada.

### Clonagem de Cedente — ciclo prospect → POC → comitê → cedente (em implementação)

Diferente de todos os domínios acima, o domínio **Cedente** (`cypress/utils/mapeamentoCedente.js` +
`cypress/support/shared/clonagemCedente.js` + `cypress/support/commands/cedente.js`, feature
`@cedente`) clona um cedente **inteiro** de PROD para HML, percorrendo o ciclo de vida completo do
banco — prospect → pleito → proposta (POC) → comitê → cedente — e recriando em HML tudo que for
necessário para esse cadastro existir e funcionar lá, exceto documentação/formalização (com uma
exceção pontual, ver abaixo), KYC, log/auditoria, backups, compliance por CNPJ (`CPL_CEDENTE_*`) e
todo o domínio de operação/liquidação/câmbio. Escopo completo (o que entra/fica de fora por fase, a
regra de match por CNPJ/CPF, e "já existe em HML → apaga e refaz") está documentado inline em
`clonagemCedente.js` e na tarefa de origem — não repetido aqui para não divergir de uma única fonte
de verdade.

- **Classificação de tabela por fase** (`classificarTabelaCedente`, `clonagemCedente.js`): dado o
  nome de uma tabela, devolve em qual fase ela entra (`prospect`/`poc`/`comite`/`cedente`/`catalogo`)
  ou `entra: false` se estiver fora de escopo — fonte única de verdade, nenhum outro arquivo deve
  duplicar essa lista.
- **Grafo de dependência estrutural** (`construirGrafoEstrutural` +
  `ordenarTabelasPorDependenciaEstrutural`, `clonagemCedente.js`, alimentado pelas constantes
  `MAPEAMENTO_CEDENTE_*` de `mapeamentoCedente.js`): a ordem real de INSERT/DELETE entre as tabelas
  do cedente vem **sempre** deste grafo (calculado a partir de FKs reais investigadas contra PROD via
  `INFORMATION_SCHEMA.COLUMNS`/`sys.foreign_keys`), nunca da suposição "uma fase termina antes da
  próxima começar" — várias tabelas cruzam fases (ex.: `MC_PRT_PLEITO*`, com prefixo de prospect, na
  verdade depende estruturalmente de `MC_POC_PROPOSTA`, fase POC).
- **Dependências de catálogo** (`MC_CAD_*` genéricas, mais duas exceções fora desse padrão —
  `MC_RAT_RATING_INDICADOR(_ITEM)`, confirmadas com o responsável do projeto — ver
  `TABELAS_CATALOGO_FORA_DO_PADRAO_MC_CAD`) são resolvidas pelo mesmo padrão já usado em
  Produtos/Esteiras/Vínculos (busca por chave natural em HML, cria se faltar via
  `commands/dependencias.js`/`estoque.js`), não por cópia profunda tabela a tabela.
- **Dois tipos de dependência específicos deste domínio**, distintos de `estrutural`/`catalogo`:
  `participante-fixo` (o votante real de um comitê/ata em PROD nunca é copiado — toda linha de
  votação clonada usa um participante fixo pré-acordado, localizado por nome em `MC_CAD_ANALISTA`
  em HML) e `cascata` (`MC_CED_CEDENTE_VINCULADO.idCedenteVinculado` aponta para outro cedente — se
  ausente em HML, a clonagem deve ser disparada recursivamente para ele também).
- **`aplicarValoresFixos`** (`clonagemCedente.js`): sobrescreve, sobre uma linha vinda de PROD, as
  colunas declaradas em `valoresFixos` no mapeamento de uma tabela (ex.: marcar todo comitê/ata
  clonado como votado e aprovado) — não é uma FK a resolver, é uma sobrescrita direta de valor.
- **Exceção pontual à exclusão de documentação**: `MC_CED_ATA`/`MC_CED_ATA_VOTACAO` entram no escopo
  (`TABELAS_POR_FASE[FASE_CEDENTE]`) só para viabilizar a votação da ata do cedente — `MC_CED_ATA`
  guarda o conteúdo da ata inline (`textoAtaComite`, texto/HTML), não como arquivo externo; não abre
  precedente para as demais tabelas de documentação/formalização, que continuam fora de escopo.
- **Etapa implementada até aqui — só LEITURA**: `cy.resolverEstrategiaClonagemCedente(documento)`
  (`commands/cedente.js`) localiza pessoa (`MC_CAD_PESSOA`, por `cnpjCpf` ignorando máscara) e
  prospect de origem em PROD, checa se já existe cedente com o mesmo documento em HML (join
  `MC_CED_CEDENTE.idPessoa = MC_CAD_PESSOA.id` — o cedente não guarda CNPJ/CPF próprio), e devolve a
  estratégia (`decidirEstrategiaClonagemCedente`: `bloqueado-sem-origem` se faltar pessoa/prospect de
  origem, `criar` ou `apagar-e-recriar` conforme o cedente já exista em HML). Nenhum INSERT/DELETE é
  executado por este comando.
- **Grafo unificado e metadados de catálogo** (`mapeamentoCedente.js`): `MAPEAMENTO_CEDENTE_UNIFICADO`
  une as 4 constantes `MAPEAMENTO_CEDENTE_*` por fase num único grafo (122 tabelas, sem colisão de
  chave), base para `construirGrafoEstrutural`/`ordenarTabelasPorDependenciaEstrutural` calcularem a
  ordem de INSERT considerando também as arestas que cruzam fase (`clonagemCedente.js` também ganhou
  `ordenarTabelasParaExclusaoEstrutural`, sempre o inverso exato da ordem de inserção, para a ordem de
  DELETE do "apaga e refaz"). `METADADOS_CATALOGO_CEDENTE` declara, para cada tabela de catálogo
  referenciada, o nome da coluna usada como chave natural (`descricao` ou `nome`, mesma convenção já
  usada em `commands/sincronizacaoNivel.js`) — levantado via `INFORMATION_SCHEMA.COLUMNS` real contra
  PROD; 4 tabelas (`MC_CAD_PESSOA`, `MC_CAD_BLOQUEIO`, `MC_CAD_FORMULARIO_CAMPO`,
  `MC_CAD_PESSOA_SOCIO`) ficam de fora de propósito, por não terem uma coluna única e óbvia de chave
  natural — resolver quando a tabela que as referencia for implementada.
- **Ainda não implementado**: o resolvedor genérico de dependência de catálogo (busca em HML pela
  chave natural declarada em `METADADOS_CATALOGO_CEDENTE`, cria copiando a linha de PROD se não
  existir), os comandos de INSERT das tabelas estruturais (na ordem de
  `ordenarTabelasPorDependenciaEstrutural` sobre `MAPEAMENTO_CEDENTE_UNIFICADO`, com resolução
  dinâmica de colunas via `INFORMATION_SCHEMA.COLUMNS` menos as colunas de auditoria) e DELETE (para o
  caso "já existe → apaga e refaz", ordem de `ordenarTabelasParaExclusaoEstrutural`, um cedente por
  execução).

## Segurança / não commitar

- Nunca commitar `.env` ou `cypress/temp/tokens.json` (ambos no `.gitignore`).
- `package-lock.json` está no `.gitignore` — instalações podem resolver versões diferentes entre execuções/máquinas.
- `cypress/output/**` contém snapshots de dados sincronizados (gitignored) — trate como potencialmente sensível.

## Collaboration workflow

Este repositório é mantido por agentes automatizados (Claude Code). Fluxo atual (mudou em
2026-09-14, pedido explícito do responsável pelo projeto — mesmo padrão adotado por outra
automação irmã):

- Cada tarefa é implementada por um subAgent numa branch nova a partir de `reviewAgents`; o
  subAgent commita e publica (push) essa branch quando a tarefa termina e o autoteste passa.
- Um Agent Master valida a branch — merge de teste local contra `reviewAgents` para achar
  conflito (resolvido com a skill `/resolve-conflicts`, `.claude/skills/resolve-conflicts/`,
  commitado na própria branch da feature) e roda os testes — e, se passar, **mescla e dá push
  direto na `reviewAgents`** (sem Pull Request por tarefa, sem aprovação humana por tarefa). O
  Agent Master **nunca** mescla nem dá push direto na `main`/`master`.
- O único ponto de revisão manual é um **Pull Request único e contínuo `reviewAgents → main`**,
  que o Agent Master garante que existe (cria uma vez se faltar; nunca recria) e que reflete
  sozinho, via GitHub, cada commit novo pusheado na `reviewAgents`. Um humano mescla esse PR na
  `main` quando quiser fazer um release, normalmente depois de validar manualmente a
  `reviewAgents`.
- `main`/`master` só recebe merge vindo de `reviewAgents`, em momentos de release — nunca commit
  direto.
- Um hook de projeto (`.claude/settings.json`, `SessionStart`) busca `origin/reviewAgents` ao
  iniciar uma sessão e só dá pull automático se a branch atual for `reviewAgents` com working tree
  limpa; caso contrário, só avisa em vez de trocar de branch ou sobrescrever trabalho local.
- Cada instância de agente (subAgent ou Agent Master) fixa sua própria conta do Claude Code via
  `CLAUDE_CONFIG_DIR`, setada antes do `claude` iniciar — isso é configurado centralmente na pasta
  de automação do Supervisor (fora deste repositório), não por clone aqui. O Agent Master também
  autentica o `gh` CLI via uma variável de ambiente `GH_TOKEN`, setada da mesma forma (usado só
  para garantir o PR único `reviewAgents → main`, não para PR por tarefa).
