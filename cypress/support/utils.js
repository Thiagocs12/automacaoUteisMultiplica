// arquivo: utils.js

import MAPEAMENTOS_APIS from '../utils/mapeamentoProdutos';

const CLASSIFICACAO_PRODUTO = MAPEAMENTOS_APIS.CLASSIFICACAO_PRODUTO;
const GRUPOS_KEYCLOAK = MAPEAMENTOS_APIS.GRUPOS_KEYCLOAK;

/** Ambientes que se autenticam via `client_credentials` (client de automação dedicado). */
const AMBIENTES_CLIENT_CREDENTIALS = ['keycloak', 'keycloakProd'];

/** clientId do client usado pela própria aplicação Beyond por trás da UI — o mesmo em 'prod' e 'hml'. */
const CLIENT_ID_AUTENTICACAO = 'autenticacao';

/**
 * @description Obtém um token novo via POST direto ao endpoint de token do
 * Keycloak, sem passar por UI, e o salva em 'cypress/temp/tokens.json'.
 *
 * 'prod'/'hml' usam `grant_type=password` no client `autenticacao` (o mesmo
 * client que a aplicação usa por trás da UI) — replica exatamente as
 * permissões que o usuário já tem, sem precisar atribuir nenhuma role: o
 * `mc-cadastro-ms` depende de claims (`idAnalista`, `cargoPrincipal`, etc.)
 * que só o client `autenticacao` emite (protocol mappers dedicados a ele), daí
 * não dar pra usar um client de automação genérico aqui.
 *
 * 'keycloak'/'keycloakProd' usam `grant_type=client_credentials` num client de
 * automação dedicado (`clientId`/`clientSecret` do ambiente), criado no realm
 * `multiplicacapital` com "Service accounts roles" habilitado.
 * @param {'prod'|'hml'|'keycloak'|'keycloakProd'} ambiente - Ambiente para o qual obter o token.
 * @returns {Cypress.Chainable<void>}
 */
Cypress.Commands.add('obterToken', (ambiente) => {
  return cy.definirAmbiente(ambiente).then(({ urlToken, loginUsername, loginPassword, clientId, clientSecret }) => {
    const form = AMBIENTES_CLIENT_CREDENTIALS.includes(ambiente)
      ? { grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret }
      : { grant_type: 'password', client_id: CLIENT_ID_AUTENTICACAO, username: loginUsername, password: loginPassword };

    return cy
      .request({ method: 'POST', url: urlToken, form: true, body: form })
      .then((resposta) => {
        const accessToken = resposta.body?.access_token;

        if (!accessToken) {
          throw new Error(`[obterToken] Token não encontrado na resposta para o ambiente "${ambiente}".`);
        }

        return salvarTokenObtido(ambiente, accessToken);
      });
  });
});

/**
 * @description Verifica se o token do ambiente informado ainda é válido
 * executando uma requisição de teste. Caso o token esteja expirado (status
 * diferente de 200), obtém um novo via `cy.obterToken`.
 * @param {'prod'|'hml'|'keycloak'|'keycloakProd'} ambiente - Ambiente cujo token será verificado.
 * @returns {Cypress.Chainable<void>}
 */
Cypress.Commands.add('verificarTokens', (ambiente) => {
  const urlTeste = AMBIENTES_CLIENT_CREDENTIALS.includes(ambiente)
    ? `${GRUPOS_KEYCLOAK.urlBusca}APC`
    : `${CLASSIFICACAO_PRODUTO.urlBusca}PRODUTO`;

  return cy.executarRequest(ambiente, urlTeste, '', 'GET', false).then((response) => {
    if (response.status === 200) return;
    return cy.obterToken(ambiente);
  });
});

/**
 * @description Grava o access token obtido para um ambiente em
 * 'cypress/temp/tokens.json' (uma única leitura + escrita).
 * @param {string} ambiente - Ambiente cujo token foi obtido.
 * @param {string} accessToken - Access token obtido.
 * @returns {Cypress.Chainable<void>}
 */
const salvarTokenObtido = (ambiente, accessToken) => {
  const filePath = 'cypress/temp/tokens.json';

  return cy
    .readFile(filePath, { log: false, timeout: 5000 })
    .then(
      (existentes) => (typeof existentes === 'object' && existentes !== null ? existentes : {}),
      (err) => {
        if (err.code === 'ENOENT') return {};
        throw new Error(`[obterToken] Erro ao ler tokens.json: ${err.message}`);
      }
    )
    .then((tokens) => {
      tokens[ambiente] = { token: accessToken };
      return cy.writeFile(filePath, tokens, { log: false });
    });
};

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
