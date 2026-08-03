import { Given, When, Then } from '@badeball/cypress-cucumber-preprocessor';
import MAPEAMENTO_VINCULOS from '../../utils/mapeamentoVinculos';
const MOP = MAPEAMENTO_VINCULOS.MOP;

Given('que os bancos de dados de Produção e Homologação estão acessíveis', () => {
  cy.executarQuery('prod', 'select * from MC_CAD_CLASSIFICACAO_PRODUTO');
  cy.executarQuery('hml', 'select * from MC_CAD_CLASSIFICACAO_PRODUTO');
})

Given('que existem vínculos da MOP cadastrados em Produção', () => {
  cy.executarQuery('prod', 'select * from MC_MOP_VINCULO_ESTEIRA').then(resultado => {
    cy.salvarNovosRegistros(resultado, `cypress/output/${MOP.nomeArquivo}`, MOP);
  })
});

When('mapeio os IDs equivalentes em Homologação', () => {
  cy.atualizarIdsDeDependencias(MOP.nivelDependencia, MAPEAMENTO_VINCULOS);
})

When('verifico quais vínculos já existem em Homologação', () => {
  cy.pesquisarVinculoEsteiraHml(MOP)
})

Then('atualizo os vínculos existentes com os dados de Produção', () => {

})

Then('crio os vínculos que ainda não existem em Homologação', () => {

})

Then('confirmo que todos os vínculos da MOP foram sincronizados corretamente', () => {

})