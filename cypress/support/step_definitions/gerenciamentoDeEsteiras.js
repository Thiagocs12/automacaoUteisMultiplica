// cypress/e2e/steps/esteiras/sincronizacao-esteiras.steps.js

import { Given, Then } from '@badeball/cypress-cucumber-preprocessor';
import MAPEAMENTO_ESTEIRAS from '../../utils/mapeamentoEsteiras';

Given('uma consulta às esteiras de produção é realizada para obter os dados atuais', () => {
  cy.executarRequest('prod', `${MAPEAMENTO_ESTEIRAS.ESTEIRAS.urlListAll}`).then((resposta) => {
    cy.salvarNovosRegistros(resposta.body, `cypress/output/${MAPEAMENTO_ESTEIRAS.ESTEIRAS.nomeArquivo}`, MAPEAMENTO_ESTEIRAS);
  });  
  cy.executarRequest('prod', `${MAPEAMENTO_ESTEIRAS.ESTEIRA_VALIDADOR.urlListAll}`).then((resposta) => {
    cy.salvarNovosRegistros(resposta.body, `cypress/output/${MAPEAMENTO_ESTEIRAS.ESTEIRA_VALIDADOR.nomeArquivo}`, MAPEAMENTO_ESTEIRAS);
  });
});

// function (não arrow): precisa do `this` do Mocha para poder pular o cenário
// via `this.skip()` sem quebrar a pipeline quando não há nada a sincronizar.
Given('a pesquisa retornou dados de esteiras para serem copiados de produção para homologação', function () {
  return cy.lerJsonDeOutput(MAPEAMENTO_ESTEIRAS.ESTEIRAS.nomeArquivo).then((dadosDoArquivo) => {
    expect(dadosDoArquivo[0]['id']).to.be.a('string');

    if (!dadosDoArquivo.some((item) => item.atualizar === true)) {
      cy.logExecucao('[Esteiras] Nenhuma esteira nova ou desatualizada encontrada — não há nada a ser sincronizado. Cenário pulado.');
      this.skip();
    }
  });
});

Then('os dados das esteiras e suas dependências estão copiados de produção para homologação', () => {
  cy.atualizarEstoqueIds(MAPEAMENTO_ESTEIRAS);
  cy.log('SUCESSO: Os dados das esteiras e suas dependências foram copiados de produção para homologação');
});