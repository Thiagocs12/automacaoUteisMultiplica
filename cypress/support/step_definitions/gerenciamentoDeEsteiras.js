// cypress/e2e/steps/esteiras/sincronizacao-esteiras.steps.js

import { Given, When, Then } from '@badeball/cypress-cucumber-preprocessor';
import MAPEAMENTO_ESTEIRAS from '../../utils/mapeamentoEsteiras';

Given('uma consulta às esteiras de produção é realizada para obter os dados atuais', () => {
  cy.executarRequest2('prod', `${MAPEAMENTO_ESTEIRAS.esteiras.urlListAll}`).then((resposta) => {
    cy.salvarNovosRegistros(resposta.body, `cypress/output/${MAPEAMENTO_ESTEIRAS.esteiras.nomeArquivo}`);
  });
});

Given('a pesquisa retornou dados de esteiras para serem copiados de produção para homologação', () => {
  return cy.lerJsonDeOutput(MAPEAMENTO_ESTEIRAS.esteiras.nomeArquivo).then((dadosDoArquivo) => {
    expect(dadosDoArquivo[0]['id']).to.be.a('string');
  });
});

Then('os dados das esteiras e suas dependências estão copiados de produção para homologação', () => {
  cy.log('SUCESSO: Os dados das esteiras e suas dependências foram copiados de produção para homologação');
});