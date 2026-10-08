// arquivo: ambiente.js

const CAMINHO_TOKENS = 'cypress/temp/tokens.json';

/**
 * @description Define e retorna os dados base para um ambiente específico,
 * incluindo URLs, credenciais e token de acesso.
 *
 * O token é lido de 'cypress/temp/tokens.json' a cada chamada (`cy.task('lerJsonSeExistir')`,
 * não `import` estático; arquivo ausente = sem token) — importante porque `cy.obterToken` pode gravar um
 * token novo no meio de um cenário (quando `cy.verificarTokens` detecta que o
 * salvo expirou), e as chamadas seguintes de `cy.definirAmbiente` dentro do
 * mesmo cenário precisam enxergar esse token novo imediatamente, não o que
 * existia quando o bundle da spec foi montado.
 *
 * 'prod'/'hml' se autenticam via `grant_type=password` no client `autenticacao`
 * (o mesmo client que a aplicação usa por trás da UI) usando `loginUsername`/
 * `loginPassword`. 'keycloak'/'keycloakProd' se autenticam via
 * `grant_type=client_credentials` num client de automação dedicado
 * (`clientId`/`clientSecret`), criado no realm `multiplicacapital` — por isso
 * `urlToken` aponta para esse realm em vez de `master` (onde vive o
 * `security-admin-console` usado pelo login humano do console admin, que este
 * projeto não usa mais). Ver `cy.obterToken` (`utils.js`) para como cada
 * ambiente usa esses campos.
 * @param {'prod'|'hml'|'keycloak'|'keycloakProd'} ambiente - Nome do ambiente desejado.
 * @returns {Cypress.Chainable<{baseUrl, urlToken, loginUsername?, loginPassword?, clientId?, clientSecret?, token}>}
 */
Cypress.Commands.add('definirAmbiente', (ambiente) => {
  // `cy.task('lerJsonSeExistir')` em vez de `cy.readFile`: o `.then` do Cypress
  // não aceita callback de rejeição, então `cy.readFile` num arquivo ausente
  // (primeira execução, ou `cypress/temp/` limpo) falhava o cenário em vez de
  // seguir sem token e deixar `cy.verificarTokens` obter um novo.
  return cy
    .task('lerJsonSeExistir', { caminhoArquivo: CAMINHO_TOKENS }, { log: false })
    .then((tokens) => (typeof tokens === 'object' && tokens !== null && !Array.isArray(tokens) ? tokens : {}))
    .then((tokens) => {
      const ambientes = {
        prod: {
          baseUrl: Cypress.env('PROD_API_BASE_URL'),
          loginUsername: Cypress.env('PROD_API_USERNAME'),
          loginPassword: Cypress.env('PROD_API_PASSWORD'),
          urlToken: `${Cypress.env('PROD_API_LOGIN_URL')}/auth/realms/multiplicacapital/protocol/openid-connect/token`,
          token: tokens?.prod?.token ?? '',
        },
        hml: {
          baseUrl: Cypress.env('HML_API_BASE_URL'),
          loginUsername: Cypress.env('HML_API_USERNAME'),
          loginPassword: Cypress.env('HML_API_PASSWORD'),
          urlToken: `${Cypress.env('HML_API_LOGIN_URL')}/auth/realms/multiplicacapital/protocol/openid-connect/token`,
          token: tokens?.hml?.token ?? '',
        },
        keycloak: {
          baseUrl: Cypress.env('HML_KEYCLOAK_BASE_URL'),
          clientId: Cypress.env('HML_KEYCLOAK_CLIENT_ID'),
          clientSecret: Cypress.env('HML_KEYCLOAK_CLIENT_SECRET'),
          urlToken: `${Cypress.env('HML_KEYCLOAK_BASE_URL')}/auth/realms/multiplicacapital/protocol/openid-connect/token`,
          token: tokens?.keycloak?.token ?? '',
        },
        // Keycloak de PRODUÇÃO — usado apenas para LEITURA (listar grupos/roles a
        // sincronizar para HML). Bloqueado para escrita em `producaoSomenteLeitura.js`,
        // igual a 'prod'.
        keycloakProd: {
          baseUrl: Cypress.env('PROD_KEYCLOAK_BASE_URL'),
          clientId: Cypress.env('PROD_KEYCLOAK_CLIENT_ID'),
          clientSecret: Cypress.env('PROD_KEYCLOAK_CLIENT_SECRET'),
          urlToken: `${Cypress.env('PROD_KEYCLOAK_BASE_URL')}/auth/realms/multiplicacapital/protocol/openid-connect/token`,
          token: tokens?.keycloakProd?.token ?? '',
        },
      };

      const config = ambientes[ambiente];

      if (!config) throw new Error(`[definirAmbiente] Ambiente desconhecido: "${ambiente}"`);

      return config;
    });
});
