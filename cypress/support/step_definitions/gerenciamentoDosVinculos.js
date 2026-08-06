import { Given, When, Then } from '@badeball/cypress-cucumber-preprocessor';
import MAPEAMENTO_VINCULOS from '../../utils/mapeamentoVinculos';
const MOP = MAPEAMENTO_VINCULOS.MOP;
const POC = MAPEAMENTO_VINCULOS.POC;

Given('que os bancos de dados de Produção e Homologação estão acessíveis', () => {
  cy.executarQuery('prod', 'select * from MC_CAD_CLASSIFICACAO_PRODUTO');
  cy.executarQuery('hml', 'select * from MC_CAD_CLASSIFICACAO_PRODUTO');
})

Given('que existem vínculos das esteiras cadastrados em Produção', () => {
  cy.executarQuery('prod', 'select * from MC_MOP_VINCULO_ESTEIRA').then(resultado => {
    cy.salvarNovosRegistros(resultado, `cypress/output/${MOP.nomeArquivo}`, MAPEAMENTO_VINCULOS);
  })
  cy.executarQuery('prod', 'select * from MC_CAD_VINCULO_ESTEIRA').then(resultado => {
    cy.salvarNovosRegistros(resultado, `cypress/output/${POC.nomeArquivo}`, MAPEAMENTO_VINCULOS);
  })
});

When('pesquiso as dependências dos vínculos', () => {
  cy.voltarIdsOriginais(MAPEAMENTO_VINCULOS);
  cy.pesquisarDependenciasBanco(MAPEAMENTO_VINCULOS)
  cy.preencherIdsHmlPeloEstoque(MAPEAMENTO_VINCULOS)
})

Then('confirmo que todos os vínculos foram sincronizados corretamente', () => {
  cy.atualizarEstoqueIds(MAPEAMENTO_VINCULOS);
  cy.log(`Todos os vínculos foram sincronizados corretamente entre Produção e Homologação`);
})