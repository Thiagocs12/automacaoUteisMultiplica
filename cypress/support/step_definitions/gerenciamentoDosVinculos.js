import { Given, When, Then } from '@badeball/cypress-cucumber-preprocessor';
import MAPEAMENTO_VINCULOS from '../../utils/mapeamentoVinculos';
const MOP = MAPEAMENTO_VINCULOS.MOP;
const POC = MAPEAMENTO_VINCULOS.POC;

Given('que os bancos de dados de Produção e Homologação estão acessíveis', () => {
  cy.executarQuery('prod', 'select * from MC_CAD_CLASSIFICACAO_PRODUTO');
  cy.executarQuery('hml', 'select * from MC_CAD_CLASSIFICACAO_PRODUTO');
})

Given('que existem vínculos da {string} cadastrados em Produção', (entidade) => {
  if (entidade === 'MOP') {
    cy.executarQuery('prod', 'select * from MC_MOP_VINCULO_ESTEIRA').then(resultado => {
      cy.salvarNovosRegistros(resultado, `cypress/output/${MOP.nomeArquivo}`, MAPEAMENTO_VINCULOS);
    })
  }
  if (entidade === 'POC') {
    cy.executarQuery('prod', 'select * from MC_CAD_VINCULO_ESTEIRA').then(resultado => {
      cy.salvarNovosRegistros(resultado, `cypress/output/${POC.nomeArquivo}`, MAPEAMENTO_VINCULOS);
    })
  }
});

When('pesquiso as dependências dos vínculos da POC', () => {
  cy.pesquisar
})

When('mapeio os IDs equivalentes em Homologação da entidade {string}', (entidade) => {
  cy.atualizarIdsDeDependencias(MOP.nivelDependencia, MAPEAMENTO_VINCULOS);
})

When('verifico quais vínculos já existem em Homologação da entidade {string}', (entidade) => {
  cy.pesquisarVinculoEsteiraHml(MOP)
})

Then('atualizo os vínculos existentes com os dados de Produção da entidade {string}', (entidade) => {
  cy.atualizarItensHml(MOP);
})

Then('crio os vínculos que ainda não existem em Homologação da entidade {string}', (entidade) => {
  cy.inserirItensHml(MOP);
})

Then('confirmo que todos os vínculos da entidade {string} foram sincronizados corretamente', (entidade) => {
  cy.log(`Todos os vínculos da ${entidade} foram sincronizados corretamente entre Produção e Homologação`);
})