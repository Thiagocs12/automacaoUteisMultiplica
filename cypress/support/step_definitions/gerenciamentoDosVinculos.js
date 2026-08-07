import { Given, When, Then } from '@badeball/cypress-cucumber-preprocessor';
import MAPEAMENTO_VINCULOS from '../../utils/mapeamentoVinculos';
const MOP = MAPEAMENTO_VINCULOS.MOP;
const POC = MAPEAMENTO_VINCULOS.POC;
const PARAMETRO_ETAPAS = MAPEAMENTO_VINCULOS.PARAMETRO_ETAPAS;
const PARAMETRO_ESTEIRAS = MAPEAMENTO_VINCULOS.PARAMETRO_ESTEIRAS;

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
  cy.executarQuery('prod', `select * from MC_CAD_PARAMETRO where identificador in (
      'CODIGO_MODELO_ETAPA_APROVACAO_PORTAL_FORNECEDOR', 'ETAPAS_MULTIFLOW_ADITAMENTO',
      'ID_MODELO_ETAPA_APROVACAO_PORTAL_FORNECEDOR',     'MODELO_ETAPA_COMITE_PORTAL',
      'ETAPAS_PORTAL_FORNECEDOR_MULTIFLOW',              'ETAPAS_MULTIFLOW_CEDENTE',
      'BACKOFFICE_ID_ETAPA_CRIAR_OPERACAO',              'ETAPAS_MULTIFLOW_HOMOL'
    )`).then(resultado => {
    cy.salvarNovosRegistros(resultado, `cypress/output/${PARAMETRO_ETAPAS.nomeArquivo}`, MAPEAMENTO_VINCULOS);
  })
  cy.executarQuery('prod', `select * from MC_CAD_PARAMETRO where identificador in (
      'CODIGO_MODELO_ESTEIRA_CONTRATO_APROVACAO', 'ID_TIPO_ESTEIRA_PRE_HOMOLOGACAO', 'ESTEIRA_CESSAO_ENTRE_FUNDO',
      'CODIGO_MODELO_ESTEIRA_PORTAL_FORNECEDOR' , 'MOP_ESTEIRA_APROVACAO_ESPECIAL' , 'ID_TIPO_ESTEIRA_ADITAMENTO',
      'ESTEIRA_LIQ_ORDEM_PAGAMENTO_BACKOFFICE'  , 'ESTEIRA1_OPERACAO_REPACTUACAO'  , 'GARANTIA_ESTEIRA_MONITOR',
      'CODIGO_ESTEIRA_MOP_PORTAL_FORNECEDOR'    , 'ESTEIRA2_OPERACAO_REPACTUACAO'  , 'ESTEIRA_ESTRUTURADA_AF',
      'ESTEIRA_LIQ_ORDEM_PAGAMENTO_CEDENTE'     , 'ID_TIPO_ESTEIRA_HOMOLOGACAO'    , 'ESTEIRA_LIQ_INSTRUCAO',
      'GARANTIA_SITUACAO_ESTEIRA_MONITOR'       ,  'ESTEIRA_LIQ_INSTRUCAO_LOTE'    , 'ID_TIPO_ESTEIRA'
    )`).then(resultado => {
    cy.salvarNovosRegistros(resultado, `cypress/output/${PARAMETRO_ESTEIRAS.nomeArquivo}`, MAPEAMENTO_VINCULOS);
  })
});

When('pesquiso as dependências dos vínculos', () => {
  cy.voltarIdsOriginais(MAPEAMENTO_VINCULOS);
  cy.pesquisarDependenciasBanco(MAPEAMENTO_VINCULOS)
  cy.preencherIdsHmlPeloEstoque(MAPEAMENTO_VINCULOS)
})

Then('confirmo que todos os {string} foram sincronizados corretamente', (entidade) => {
  if (entidade === 'vínculos') {
    cy.atualizarEstoqueIds(MAPEAMENTO_VINCULOS);
  }
  cy.log(`Todos os ${entidade} foram sincronizados corretamente entre Produção e Homologação`);
})