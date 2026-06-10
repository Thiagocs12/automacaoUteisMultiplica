import { Given, When, Then } from '@badeball/cypress-cucumber-preprocessor';
import MAPEAMENTOS_APIS from '../../utils/mapeamentoProdutos';


Given('que possuo acesso aos ambientes necessarios', () => {
  cy.verificarTokens('prod')
  cy.verificarTokens('hml')
  cy.verificarTokens('keycloak')
});

Given('uma consulta aos produtos de produção é realizada para obter os dados atuais', () => {
  cy.executarRequest('prod', `${MAPEAMENTOS_APIS.PRODUTO.urlListAll}`).then((resposta) => {
    cy.salvarNovosRegistros(resposta.body, `cypress/output/${MAPEAMENTOS_APIS.PRODUTO.nomeArquivo}`);
  });
});

Given('a pesquisa retornou dados de produtos para serem copiados de produção para homologação', () => {
  return cy.lerJsonDeOutput(MAPEAMENTOS_APIS.PRODUTO.nomeArquivo).then((dadosDoArquivo) => {
    expect(dadosDoArquivo[0]['id']).to.be.a('number');
  });
});

When('pesquiso as dependências desses produtos', () => {
  cy.voltarIdsOriginais();
  cy.pesquisarDependenciasLigacao();
});

When('processo as dependências do nivel {int} da entidade {string}', (nivel, entidade) => {
  if (entidade === 'produtos') {
    cy.processarEntidadesPorNivel(nivel, MAPEAMENTOS_APIS);
  }
});

Then('os dados dos produtos e suas dependências estão copiados de produção para homologação', () => {
  cy.log('SUCESSO: Os dados dos produtos e suas dependências foram copiados de produção para homologação');
});