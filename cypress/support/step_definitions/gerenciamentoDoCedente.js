// arquivo: gerenciamentoDoCedente.js
//
// Primeira etapa executável da clonagem de cedente PROD -> HML (ver
// docs/documentacao.md do módulo `cedente`) — só resolve, contra bancos
// reais, a estratégia de clonagem (`cy.resolverEstrategiaClonagemCedente`,
// `commands/cedente.js`) a partir de um CNPJ/CPF informado via `--env
// documentoOrigem=...`. Parâmetro ausente não é erro — mesmo padrão já usado
// em `gerenciamentoDeUsuarios.js` para `usuarioOrigem`/`novoUsername`/
// `novaSenha`: loga e pula, sem falhar o cenário, para não quebrar uma
// execução da suíte completa sem `tags=@cedente`. Só LEITURA; os comandos de
// INSERT/DELETE em HML são a próxima etapa, ainda não implementada.
//
//   npx cypress run --env tags=@cedente,documentoOrigem=12345678000190

import { When, Then } from '@badeball/cypress-cucumber-preprocessor';

let resultado = null;
let execucaoPulada = false;

When('resolvo a estratégia de clonagem do cedente informado via parâmetros de execução', () => {
  const documentoOrigem = Cypress.env('documentoOrigem');

  if (!documentoOrigem) {
    execucaoPulada = true;
    resultado = null;
    return cy.logExecucao(
      '[gerenciamentoDoCedente] Parâmetro "documentoOrigem" (CNPJ/CPF) não informado via --env — nenhuma resolução executada.',
    );
  }

  execucaoPulada = false;

  return cy.resolverEstrategiaClonagemCedente(documentoOrigem).then((valor) => {
    resultado = valor;
  });
});

Then('a estratégia resolvida é exibida no log com os dados de origem encontrados', () => {
  if (execucaoPulada) {
    cy.log('documentoOrigem não informado via --env — nada a verificar.');
    return;
  }

  expect(resultado, 'resultado da resolução de estratégia').to.not.be.null;
  expect(resultado.estrategia, 'estratégia resolvida').to.be.a('string');

  return cy.logExecucao(
    `[gerenciamentoDoCedente] Estratégia resolvida para "${Cypress.env('documentoOrigem')}": "${resultado.estrategia}"` +
      (resultado.motivo ? ` (${resultado.motivo})` : '') +
      ` — pessoa em PROD: ${resultado.pessoaOrigem ? 'encontrada' : 'não encontrada'}, prospect em PROD: ${resultado.prospectOrigem ? 'encontrado' : 'não encontrado'}, cedente já existente em HML: ${resultado.cedenteHmlExistente ? 'sim' : 'não'}.`,
  );
});
