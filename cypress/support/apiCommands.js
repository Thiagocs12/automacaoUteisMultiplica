import { validarSomenteLeituraEmProducao } from './shared/producaoSomenteLeitura';

const CABECALHOS_PADRAO = (token) => ({
  accept: 'application/json, text/plain, */*',
  'accept-language': 'pt-BR,pt;q=0.9,en;q=0.8,en-GB;q=0.7,en-US;q=0.6',
  authorization: `Bearer ${token}`,
  'content-type': 'application/json',
});

/**
 * @description Resolve token e baseUrl para uma requisição.
 * Para os ambientes 'bhml' e 'bprod', utiliza o token do ambiente 'bhml'
 * combinado com a baseUrl do ambiente 'hml'. Para os demais ambientes,
 * utiliza token e baseUrl do próprio ambiente informado.
 * @param {'prod'|'hml'|'keycloak'|'bhml'|'bprod'} ambiente - Ambiente alvo da requisição.
 * @returns {Cypress.Chainable<{token: string, baseUrl: string}>}
 */
const resolverAmbienteDaRequisicao = (ambiente) => {
  if (ambiente === 'bhml' || ambiente === 'bprod') {
    return cy
      .definirAmbiente('bhml')
      .then(({ token }) => cy.definirAmbiente('hml').then(({ baseUrl }) => ({ token, baseUrl })));
  }

  return cy.definirAmbiente(ambiente).then(({ baseUrl, token }) => ({ token, baseUrl }));
};

/**
 * @description Executa uma requisição HTTP autenticada para uma API de um ambiente específico.
 * @param {'prod'|'hml'|'keycloak'|'bhml'|'bprod'} ambiente - Ambiente alvo da requisição.
 * @param {string} api - Caminho relativo da API (será concatenado à baseUrl do ambiente).
 * @param {object|string} [body=''] - Corpo da requisição (usado em POST, PUT, PATCH etc.).
 * @param {'GET'|'POST'|'PUT'|'PATCH'|'DELETE'} [method='GET'] - Método HTTP da requisição.
 * @param {boolean} [fail=true] - Se true, falha o teste automaticamente em status codes de erro (4xx/5xx).
 * @returns {Cypress.Chainable<Cypress.Response>} A resposta completa da requisição HTTP.
 */
const executarRequisicaoHttp = (ambiente, api, body, method, fail) => {
  validarSomenteLeituraEmProducao(ambiente, method);

  return resolverAmbienteDaRequisicao(ambiente).then(({ token, baseUrl }) => {
    const url = `${baseUrl}/${api}`;

    return cy
      .logExecucao(`[HTTP] ${method} (${ambiente}) ${url}`)
      .then(() =>
        cy.request({
          method,
          url,
          headers: CABECALHOS_PADRAO(token),
          body,
          failOnStatusCode: fail,
        }),
      )
      .then((resposta) => {
        cy.logExecucao(`[HTTP] ${method} (${ambiente}) ${url} -> ${resposta.status}`);
        return resposta;
      });
  });
};

Cypress.Commands.add('executarRequest', (ambiente, api, body = '', method = 'GET', fail = true) =>
  executarRequisicaoHttp(ambiente, api, body, method, fail),
);

Cypress.Commands.add('executarRequest2', (ambiente, api, body = '', method = 'GET', fail = true) =>
  executarRequisicaoHttp(ambiente, api, body, method, fail),
);
