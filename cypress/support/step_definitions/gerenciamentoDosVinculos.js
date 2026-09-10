import { Given, When, Then } from '@badeball/cypress-cucumber-preprocessor';
import MAPEAMENTO_VINCULOS from '../../utils/mapeamentoVinculos';
const MOP = MAPEAMENTO_VINCULOS.MOP;
const POC = MAPEAMENTO_VINCULOS.POC;
const PARAMETRO_ETAPAS = MAPEAMENTO_VINCULOS.PARAMETRO_ETAPAS;
const PARAMETRO_ESTEIRAS = MAPEAMENTO_VINCULOS.PARAMETRO_ESTEIRAS;
const PARAMETRO_TIPO_ESTEIRAS = MAPEAMENTO_VINCULOS.PARAMETRO_TIPO_ESTEIRAS;

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
      'CODIGO_MODELO_ESTEIRA_CONTRATO_APROVACAO', 'MOP_ESTEIRA_APROVACAO_ESPECIAL',
      'CODIGO_MODELO_ESTEIRA_PORTAL_FORNECEDOR' , 'ESTEIRA2_OPERACAO_REPACTUACAO',
      'ESTEIRA_LIQ_ORDEM_PAGAMENTO_BACKOFFICE'  , 'ESTEIRA1_OPERACAO_REPACTUACAO',
      'CODIGO_ESTEIRA_MOP_PORTAL_FORNECEDOR'    , 'ESTEIRA_CESSAO_ENTRE_FUNDO',
      'ESTEIRA_LIQ_ORDEM_PAGAMENTO_CEDENTE'     , 'ESTEIRA_LIQ_INSTRUCAO',
      'ESTEIRA_LIQ_INSTRUCAO_LOTE'
    )`).then(resultado => {
    cy.salvarNovosRegistros(resultado, `cypress/output/${PARAMETRO_ESTEIRAS.nomeArquivo}`, MAPEAMENTO_VINCULOS);
  })
  cy.executarQuery('prod', `select * from MC_CAD_PARAMETRO where identificador in (
    'GARANTIA_SITUACAO_ESTEIRA_MONITOR', 'ID_TIPO_ESTEIRA_HOMOLOGACAO', 'GARANTIA_ESTEIRA_MONITOR',
    'ID_TIPO_ESTEIRA_PRE_HOMOLOGACAO'  , 'ID_TIPO_ESTEIRA_ADITAMENTO' , 'ID_TIPO_ESTEIRA'    
    )`).then(resultado => {
    cy.salvarNovosRegistros(resultado, `cypress/output/${PARAMETRO_TIPO_ESTEIRAS.nomeArquivo}`, MAPEAMENTO_VINCULOS);
  })
});

// function (não arrow): precisa do `this` do Mocha para poder pular o cenário
// via `this.skip()` sem quebrar a pipeline quando não há nada a sincronizar.
// Precisa ser um step à parte (com `return` do chain) para que o Cucumber espere
// esse step terminar antes de chamar "pesquiso as dependências dos vínculos" —
// senão os comandos desse próximo step já estariam na fila do Cypress antes do
// this.skip() ter chance de agir (mesmo bug seria escondido se estivesse tudo
// no mesmo step, como acontecia aqui antes).
Given('a pesquisa retornou vínculos mop ou poc para serem copiados de produção para homologação', function () {
  return cy.lerJsonDeOutput(MOP.nomeArquivo).then((dadosMop) => {
    return cy.lerJsonDeOutput(POC.nomeArquivo).then((dadosPoc) => {
      const possuiAtualizacao = [...(dadosMop ?? []), ...(dadosPoc ?? [])].some(
        (item) => item.atualizar === true,
      );

      if (!possuiAtualizacao) {
        cy.logExecucao('[Vínculos] Nenhum vínculo MOP/POC novo ou desatualizado encontrado — não há nada a ser sincronizado. Cenário pulado.');
        this.skip();
      }
    });
  });
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