const MAPEAMENTO_ESTEIRAS = {
    ESTEIRAS: {
        urlListAll: 'mc-multiflow-ms/api/v1/modeloesteira/all',
        nomeArquivo: 'Esteiras/1 - esteiras.json'
    },
    ESTEIRA_VINCULADA: {
        buscaId: 'mc-multiflow-ms/api/v1/modeloesteira/pesquisarporid/',
        nomeArquivo: 'Esteiras/8 - esteirasVinculadas.json',
        nomeArquivoReferencia: 'Esteiras/1 - esteiras.json',
        campoBusca: 'idModeloEsteiraVinculado',
    },
    /*
    TIPOESTEIRAS: {
         urlBuscaId: 'mc-multiflow-ms/api/v1/tipoesteira/pesquisarporid/',
         nomeArquivo: 'Esteiras/7 - tipoEsteiras.json',
         nomeArquivoReferencia: 'Esteiras/1 - esteiras.json',
         campoBusca: 'tipoEsteira.id',
    },
    ETAPAS: {
        urlBuscaId: 'mc-multiflow-ms/api/v1/modeloetapa/pesquisarporid/',
        nomeArquivo: 'Esteiras/2 - etapas.json',
        nomeArquivoReferencia: 'Esteiras/1 - esteiras.json',
        campoBusca: 'modeloEtapas.modeloEtapa.id',
    },
    SUB_ETAPAS: {
        urlBuscaId: 'mc-multiflow-ms/api/v1/modelosubetapa/pesquisarporid/',
        nomeArquivo: 'Esteiras/3 - subetapas.json',
        nomeArquivoReferencia: 'Esteiras/2 - etapas.json',
        campoBusca: 'modeloSubEtapaModel.modeloSubEtapa.id',
    },
    ACOES: {
        urlBuscaId: 'mc-multiflow-ms/api/v1/modeloacao/pesquisarporid/',
        nomeArquivo: 'Esteiras/4 - acoes.json',
        nomeArquivoReferencia: 'Esteiras/3 - subetapas.json',
        campoBusca: 'modeloAcao',
    },
    MOTIVOS_RETORNO: {
        urlBuscaId: 'mc-multiflow-ms/api/v1/motivo-retorno-esteira/pesquisarporid/',
        nomeArquivo: 'Esteiras/5 - motivosRetorno.json',
        nomeArquivoReferencia: 'Esteiras/3 - subetapas.json',
        campoBusca: 'motivosRetornoEsteira.id',
    },
    OPERADORES: {
        urlBuscaId: 'mc-multiflow-ms/api/v1/operador/pesquisarporid/',
        nomeArquivo: 'Esteiras/6 - operadores.json',
        nomeArquivoReferencia: 'Esteiras/3 - subetapas.json',
        campoBusca: 'operadores',
    },*/
    CONDICOES: {
        urlBuscaId: 'mc-multiflow-ms/api/v1/operador/pesquisarporid/',
        nomeArquivo: 'Esteiras/1 - esteiras.json',
        nomeArquivoReferencia: 'Esteiras/3 - subetapas.json',
        campoBusca: 'codicoes',
    },
};

export default MAPEAMENTO_ESTEIRAS;