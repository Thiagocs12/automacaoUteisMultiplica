// arquivo: utils.js

import MAPEAMENTOS_APIS from '../utils/mapeamentoProdutos';

const CLASSIFICACAO_PRODUTO = MAPEAMENTOS_APIS.CLASSIFICACAO_PRODUTO;
const GRUPOS_KEYCLOAK = MAPEAMENTOS_APIS.GRUPOS_KEYCLOAK;
const SELECIONAR_CEDENTE = MAPEAMENTOS_APIS.SELECIONAR_CEDENTE;

/**
 * @description Verifica se o token do ambiente informado ainda é válido
 * executando uma requisição de teste. Caso o token esteja expirado (status diferente de 200),
 * aciona o fluxo de login via UI para renovação do token.
 * @param {'prod'|'hml'|'bhml'|'keycloak'} ambiente - Ambiente cujo token será verificado.
 * @returns {Cypress.Chainable<void>}
 */
Cypress.Commands.add('verificarTokens', (ambiente) => {
  if (['prod', 'hml'].includes(ambiente)) {
    return cy.executarRequest(ambiente, `${CLASSIFICACAO_PRODUTO.urlBusca}PRODUTO`, '', 'GET', false).then((response) => {
      if (response.status === 200) return;
      cy.loginUi(ambiente);
    });
  }

  if (ambiente === 'bhml') {
    return cy.executarRequest(ambiente, `${SELECIONAR_CEDENTE.url}Agrofoods`, '', 'GET', false).then((response) => {
      if (response.status === 200) return;
      cy.loginUi(ambiente);
    });
  }

  if (ambiente === 'keycloak') {
    return cy.executarRequest(ambiente, `${GRUPOS_KEYCLOAK.urlBusca}APC`, '', 'GET', false).then((response) => {
      if (response.status === 200) return;
      cy.loginUi(ambiente);
    });
  }
});

/**
 * @description Realiza o login via interface gráfica (UI) para o ambiente informado,
 * intercepta o token de acesso retornado pelo Keycloak e o salva em 'cypress/temp/tokens.json'.
 * Suporta fluxos com e sem redirecionamento cross-origin entre a baseUrl da aplicação e a URL do Keycloak.
 * @param {'prod'|'hml'|'bhml'|'keycloak'} ambiente - Ambiente onde o login será realizado.
 * @returns {Cypress.Chainable<void>}
 */
Cypress.Commands.add('loginUi', (ambiente) => {
  cy.definirAmbiente(ambiente).then(({ loginUrl, baseUrl, loginUsername, loginPassword, urlTokenApiIntercept }) => {
    cy.intercept('POST', urlTokenApiIntercept).as('obterToken');

    const baseOrigin = new URL(baseUrl).origin;
    const keycloakOrigin = new URL(loginUrl).origin;
    const precisaDeCrossOrigin = baseOrigin !== keycloakOrigin;

    cy.visit(baseUrl);

    if (precisaDeCrossOrigin) {
      cy.origin(
        keycloakOrigin,
        { args: { loginUsername, loginPassword, keycloakOrigin } },
        ({ loginUsername, loginPassword, keycloakOrigin }) => {
          cy.url({ timeout: 20000 }).should('include', keycloakOrigin);
          cy.get('#username').should('be.visible').type(loginUsername, { log: false });
          cy.get('#password').should('be.visible').type(loginPassword, { log: false });
          cy.get('#kc-login').should('be.visible').click();
        }
      );
    } else {
      cy.url({ timeout: 20000 }).should('include', keycloakOrigin);
      cy.get('#username').should('be.visible').type(loginUsername, { log: false });
      cy.get('#password').should('be.visible').type(loginPassword, { log: false });
      cy.get('#kc-login').should('be.visible').click();
    }

    cy.wait('@obterToken', { timeout: 20000 }).then((interception) => {
      const accessToken = interception?.response?.body?.access_token;

      if (!accessToken) {
        throw new Error(`[loginUi] Token não encontrado na resposta para o ambiente "${ambiente}".`);
      }

      const filePath = 'cypress/temp/tokens.json';

      cy.readFile(filePath, { log: false, timeout: 5000 })
        .then(
          (existentes) => (typeof existentes === 'object' && existentes !== null ? existentes : {}),
          (err) => {
            if (err.code === 'ENOENT') return {};
            throw new Error(`[loginUi] Erro ao ler tokens.json: ${err.message}`);
          }
        )
        .then((tokens) => {
          tokens[ambiente] = { token: accessToken };
          cy.writeFile(filePath, tokens, { log: false });
        });
    });

    cy.url({ timeout: 15000 }).should('include', baseUrl);
  });
});

/**
 * @description Utilitário para acessar o valor de uma propriedade aninhada de um objeto
 * a partir de um caminho em notação de ponto (ex: 'endereco.cidade.nome').
 * Retorna undefined caso qualquer nível do caminho não exista.
 * @param {object} obj - Objeto de origem da busca.
 * @param {string} caminho - Caminho da propriedade em notação de ponto (ex: 'a.b.c').
 * @returns {any}
 */
export const obterValor = (obj, caminho) =>
  caminho.split('.').reduce((acc, chave) => acc?.[chave], obj);