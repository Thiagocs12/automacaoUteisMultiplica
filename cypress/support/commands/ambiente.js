// arquivo: ambiente.js

import tokens from '../../temp/tokens.json';

/**
 * @description Define e retorna os dados base para um ambiente específico,
 * incluindo URLs, credenciais e token de acesso.
 * @param {'prod'|'hml'|'keycloak'|'bhml'} ambiente - Nome do ambiente desejado.
 * @returns {Cypress.Chainable<{baseUrl, loginUrl, loginUsername, loginPassword, urlTokenApiIntercept, token}>}
 */
Cypress.Commands.add('definirAmbiente', (ambiente) => {
  const ambientes = {
    prod: {
      baseUrl: Cypress.env('PROD_API_BASE_URL'),
      loginUrl: Cypress.env('PROD_API_LOGIN_URL'),
      loginUsername: Cypress.env('PROD_API_USERNAME'),
      loginPassword: Cypress.env('PROD_API_PASSWORD'),
      urlTokenApiIntercept: `${Cypress.env('PROD_API_LOGIN_URL')}/auth/realms/multiplicacapital/protocol/openid-connect/token`,
      token: tokens?.prod?.token ?? '',
    },
    hml: {
      baseUrl: Cypress.env('HML_API_BASE_URL'),
      loginUrl: Cypress.env('HML_API_LOGIN_URL'),
      loginUsername: Cypress.env('HML_API_USERNAME'),
      loginPassword: Cypress.env('HML_API_PASSWORD'),
      urlTokenApiIntercept: `${Cypress.env('HML_API_LOGIN_URL')}/auth/realms/multiplicacapital/protocol/openid-connect/token`,
      token: tokens?.hml?.token ?? '',
    },
    keycloak: {
      baseUrl: Cypress.env('HML_KEYCLOAK_BASE_URL'),
      loginUrl: Cypress.env('HML_KEYCLOAK_LOGIN_URL'),
      loginUsername: Cypress.env('HML_KEYCLOAK_USERNAME'),
      loginPassword: Cypress.env('HML_KEYCLOAK_PASSWORD'),
      urlTokenApiIntercept: `${Cypress.env('HML_KEYCLOAK_LOGIN_URL')}/auth/realms/master/protocol/openid-connect/token`,
      token: tokens?.keycloak?.token ?? '',
    },
    bhml: {
      baseUrl: Cypress.env('BHML_API_BASE_URL'),
      loginUrl: Cypress.env('BHML_API_LOGIN_URL'),
      loginUsername: Cypress.env('BHML_API_USERNAME'),
      loginPassword: Cypress.env('BHML_API_PASSWORD'),
      urlTokenApiIntercept: `${Cypress.env('BHML_API_LOGIN_URL')}/auth/realms/beyondbanking-hml/protocol/openid-connect/token`,
      token: tokens?.bhml?.token ?? '',
    },
  };

  const config = ambientes[ambiente];

  if (!config) throw new Error(`[definirAmbiente] Ambiente desconhecido: "${ambiente}"`);

  return cy.wrap(config);
});
