// cypress/e2e/steps/esteiras/sincronizacao-esteiras.steps.js

import { Given, When, Then } from '@badeball/cypress-cucumber-preprocessor';
import MAPEAMENTO_ESTEIRAS from '../../utils/mapeamentoEsteiras';

Given('uma consulta às esteiras de produção é realizada para obter os dados atuais', () => {
  cy.executarRequest('prod', `${MAPEAMENTO_ESTEIRAS.ESTEIRAS.urlListAll}`).then((resposta) => {
    cy.salvarNovosRegistros(resposta.body, `cypress/output/${MAPEAMENTO_ESTEIRAS.ESTEIRAS.nomeArquivo}`, MAPEAMENTO_ESTEIRAS);
  });
});

Given('a pesquisa retornou dados de esteiras para serem copiados de produção para homologação', () => {
  return cy.lerJsonDeOutput(MAPEAMENTO_ESTEIRAS.ESTEIRAS.nomeArquivo).then((dadosDoArquivo) => {
    expect(dadosDoArquivo[0]['id']).to.be.a('string');
  });
});

Then('os dados das esteiras e suas dependências estão copiados de produção para homologação', () => {
  cy.atualizarEstoqueIds(MAPEAMENTO_ESTEIRAS);
  cy.log('SUCESSO: Os dados das esteiras e suas dependências foram copiados de produção para homologação');
});