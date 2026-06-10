import MAPEAMENTOS_APIS from '../utils/mapeamentoApis';

const multiflow = MAPEAMENTOS_APIS.MULTIFLOW;

/**
 * @description Executa uma requisição HTTP autenticada para uma API de um ambiente específico.
 * Para os ambientes 'bhml' e 'bprod', utiliza o token do ambiente 'bhml'
 * combinado com a baseUrl do ambiente 'hml'.
 * Para os demais ambientes, utiliza token e baseUrl do próprio ambiente informado.
 * @param {'prod'|'hml'|'keycloak'|'bhml'|'bprod'} ambiente - Ambiente alvo da requisição.
 * @param {string} api - Caminho relativo da API (será concatenado à baseUrl do ambiente).
 * @param {object|string} [body=''] - Corpo da requisição (usado em POST, PUT, PATCH etc.).
 * @param {'GET'|'POST'|'PUT'|'PATCH'|'DELETE'} [method='GET'] - Método HTTP da requisição.
 * @param {boolean} [fail=true] - Se true, falha o teste automaticamente em status codes de erro (4xx/5xx).
 * @returns {Cypress.Chainable<Cypress.Response>} A resposta completa da requisição HTTP.
 */
Cypress.Commands.add('executarRequest', (ambiente, api, body = '', method = 'GET', fail = true) => {
  // Se o ambiente for 'bhml' ou 'bprod', usa o token do 'bhml' mas a baseUrl do 'hml'
  if (ambiente === 'bhml' || ambiente === 'bprod') {
    return cy.definirAmbiente('bhml').then(({ token }) => {
      return cy.definirAmbiente('hml').then(({ baseUrl }) => {
        const tokenAutorizacao = `Bearer ${token}`;
        const urlCompleta = `${baseUrl}/${api}`;

        return cy.request({
          method,
          url: urlCompleta,
          headers: {
            accept: 'application/json, text/plain, */*',
            'accept-language': 'pt-BR,pt;q=0.9,en;q=0.8,en-GB;q=0.7,en-US;q=0.6',
            authorization: tokenAutorizacao,
            'content-type': 'application/json',
          },
          body,
          failOnStatusCode: fail,
        });
      });
    });
  }

  // Fluxo padrão para todos os outros ambientes
  return cy.definirAmbiente(ambiente).then(({ baseUrl, token }) => {
    const tokenAutorizacao = `Bearer ${token}`;
    const urlCompleta = `${baseUrl}/${api}`;

    return cy.request({
      method,
      url: urlCompleta,
      headers: {
        accept: 'application/json, text/plain, */*',
        'accept-language': 'pt-BR,pt;q=0.9,en;q=0.8,en-GB;q=0.7,en-US;q=0.6',
        authorization: tokenAutorizacao,
        'content-type': 'application/json',
      },
      body,
      failOnStatusCode: fail,
    });
  });
});