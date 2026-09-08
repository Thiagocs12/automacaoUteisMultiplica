// arquivo: producaoSomenteLeitura.js
//
// Módulo puro (sem dependência do global `Cypress`) para que a regra de
// "produção é somente leitura" possa ser testada com Node puro (node:test),
// sem precisar rodar dentro do Cypress.

/**
 * @description Garante que nenhuma requisição de escrita seja enviada para os
 * ambientes de produção ('prod'/'bprod'). Lança erro se o método não for GET.
 * @param {string} ambiente - Ambiente alvo da requisição.
 * @param {string} method - Método HTTP da requisição.
 * @returns {void}
 */
export const validarSomenteLeituraEmProducao = (ambiente, method) => {
  if ((ambiente === 'prod' || ambiente === 'bprod') && String(method).toUpperCase() !== 'GET') {
    throw new Error(
      `[${ambiente}] Bloqueado: produção é somente leitura. Método "${method}" não é permitido.`,
    );
  }
};
