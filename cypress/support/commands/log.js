// arquivo: log.js

/**
 * @description Loga uma mensagem tanto na UI do Cypress (cy.log, útil no modo
 * interativo) quanto no terminal via cy.task (útil em `cypress run` headless,
 * onde cy.log() sozinho não aparece em lugar nenhum visível).
 * @param {string} mensagem - Mensagem a ser exibida.
 * @returns {Cypress.Chainable<void>}
 */
Cypress.Commands.add('logExecucao', (mensagem) => {
  cy.log(mensagem);
  return cy.task('log', mensagem, { log: false });
});
