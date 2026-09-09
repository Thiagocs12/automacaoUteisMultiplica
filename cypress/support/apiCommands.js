import { validarSomenteLeituraEmProducao } from './shared/producaoSomenteLeitura';

const CABECALHOS_PADRAO = (token) => ({
  accept: 'application/json, text/plain, */*',
  'accept-language': 'pt-BR,pt;q=0.9,en;q=0.8,en-GB;q=0.7,en-US;q=0.6',
  authorization: `Bearer ${token}`,
  'content-type': 'application/json',
});

/**
 * @description Monta o comando curl equivalente a uma requisição, para facilitar a
 * reprodução manual de falhas. O token de acesso NUNCA é incluído (risco de vazamento
 * de credencial em logs) — o cabeçalho authorization é logado apenas como "Bearer ",
 * para ser completado manualmente por quem for reproduzir a chamada.
 * @param {'GET'|'POST'|'PUT'|'PATCH'|'DELETE'} method - Método HTTP da requisição.
 * @param {string} url - URL completa da requisição.
 * @param {object} headers - Cabeçalhos enviados na requisição.
 * @param {object|string} body - Corpo da requisição.
 * @returns {string}
 */
const montarCurl = (method, url, headers, body) => {
  const headersString = Object.entries(headers)
    .map(([chave, valor]) => {
      const valorParaLog = chave.toLowerCase() === 'authorization' ? 'Bearer ' : valor;
      return `-H '${chave}: ${valorParaLog}'`;
    })
    .join(' ');

  const corpoSerializado = typeof body === 'string' ? body : JSON.stringify(body ?? '');
  const bodyString = corpoSerializado
    ? ` -d '${corpoSerializado.replace(/'/g, `'\\''`)}'`
    : '';

  return `curl -X ${method} '${url}' ${headersString}${bodyString}`;
};

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
    const headers = CABECALHOS_PADRAO(token);

    return cy
      .request({
        method,
        url,
        headers,
        body,
        // Sempre false: o status é conferido manualmente abaixo, para poder logar o
        // curl de reprodução ANTES de decidir se a requisição deve falhar o teste.
        failOnStatusCode: false,
      })
      .then((resposta) => {
        if (resposta.isOkStatusCode) {
          return resposta;
        }

        return cy
          .logExecucao(
            `[HTTP] ${method} (${ambiente}) ${url} -> ${resposta.status}\nFalha — curl para reproduzir (complete o token):\n${montarCurl(method, url, headers, body)}`,
          )
          .then(() => {
            if (fail) {
              throw new Error(`[executarRequest] ${method} ${url} falhou com status ${resposta.status}`);
            }
            return resposta;
          });
      });
  });
};

Cypress.Commands.add('executarRequest', (ambiente, api, body = '', method = 'GET', fail = true) =>
  executarRequisicaoHttp(ambiente, api, body, method, fail),
);

Cypress.Commands.add('executarRequest2', (ambiente, api, body = '', method = 'GET', fail = true) =>
  executarRequisicaoHttp(ambiente, api, body, method, fail),
);
