const MAPEAMENTOS_ETAPAS = {
    DISTRIBUICAO: {
        tipoEsteira: 'poc',
        caminhoTela: ['Beyond BackOffice', 'Crédito', 'Home', 'Prospect', 'Distribuição'],
        baseUrl: 'mc-poc-ms/api/v1/distribuicaoProposta',
        method: 'POST',
        etapasParaAvanco: ['salvaComitePropostas', 'avancarEsteiraComitePropostas']
    },
    COMITE: {
        criar: 'mc-poc-ms/api/v1/pocVotacao/criarPocComite',
        modeloEtapa: '621024e72eb7d56d6ac917f5',
        criarVotacao: 'mc-poc-ms/api/v1/pocVotacao/criarVotacaoModeloEtapa?',
        encontrarComite: 'mc-poc-ms/api/v1/pocVotacao/findComiteByProposta?idProposta=',
        consultaVotos: 'mc-poc-ms/api/v1/pocVotacao/consultaVotos?idComiteProposta=',
        copiaPleito: 'mc-poc-ms/api/v1/pocPleito/findByPropostaAndCopy/',
        copiaPleitoProduto: 'mc-poc-ms/api/v1/pocPleitoProduto/listAllAndCopy/',
        copiaPleitoBoleto: 'mc-poc-ms/api/v1/pocComiteLimiteBoleto/listAllDadosBoletoLimiteAndCopy/',
        copiaPoc: 'mc-poc-ms/api/v1/pocVotacao/copiaPleitoComite/',
        copiaPocProduto: 'mc-poc-ms/api/v1/pocComiteLimiteProduto/listAllDadosProdutoLimiteAndCopy/',
        copiaLimiteGlobal: 'mc-poc-ms/api/v1/pocComiteLimiteGlobal/findDadosComite?idComiteProposta=',
        iniciarVotacao: 'mc-poc-ms/api/v1/pocVotacao/iniciarVotacao?idComiteVotacao=',
        copiaLinkVotacao: 'mc-whatsapp-ms/v1/mensagens/votacaoUnica?apenasLink=true',
        aprovarVoto: 'mc-whatsapp-ms/v1/votacao/aprovaVoto?idComiteProposta=',
        salvarComite: 'mc-poc-ms/api/v1/pocVotacao/updateDataVigencia',
        votantesHml: [
          {
            nome: 'Lucas Carnovalli',
            telefone: '5511965969554'
          },
          {
            nome: 'Eduardo Ribeiro',
            telefone: '5511990084884'
          },
          {
            nome: 'Leonardo Adelino',
            telefone: '5511989518880'
          }
        ],
        votantesProd: [
          {
            nome: "Thiago Novaes",
            telefone: '5511966650011'
          },
          {
            nome: "Eduardo Barbosa",
            telefone: '5511941236400'
          }
        ],
        votacao: 'mc-whatsapp-ms/v1/mensagens/votacao',        
        method: 'POST',
    }
};

export default MAPEAMENTOS_ETAPAS;