// arquivo: producaoSomenteLeitura.js
//
// Módulo puro (sem dependência do global `Cypress`) para que a regra de
// "produção é somente leitura" possa ser testada com Node puro (node:test),
// sem precisar rodar dentro do Cypress.

/** Ambientes que apontam para dados de PRODUÇÃO e por isso são somente leitura. */
const AMBIENTES_SOMENTE_LEITURA = ['prod', 'keycloakProd'];

/**
 * @description Garante que nenhuma requisição de escrita seja enviada para os
 * ambientes de produção ('prod'/'keycloakProd'). Lança erro se o método não for GET.
 * @param {string} ambiente - Ambiente alvo da requisição.
 * @param {string} method - Método HTTP da requisição.
 * @returns {void}
 */
export const validarSomenteLeituraEmProducao = (ambiente, method) => {
  if (AMBIENTES_SOMENTE_LEITURA.includes(ambiente) && String(method).toUpperCase() !== 'GET') {
    throw new Error(
      `[${ambiente}] Bloqueado: produção é somente leitura. Método "${method}" não é permitido.`,
    );
  }
};
