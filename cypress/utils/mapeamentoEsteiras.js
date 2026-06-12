const MAPEAMENTO_ESTEIRAS = {
    ESTEIRAS: {
        urlListAll: 'mc-multiflow-ms/api/v1/modeloesteira/all',
        nomeArquivo: 'Esteiras/1 - esteiras.json'
    },
    ETAPAS: {
        urlBuscaId: 'mc-multiflow-ms/api/v1/modeloetapa/pesquisaporid/',
        nomeArquivo: 'Esteiras/2 - etapas.json',
        nomeArquivoReferencia: 'Esteiras/1 - esteiras.json',
        campoBusca: 'modeloEtapas.modeloEtapa.id',
    }
};

export default MAPEAMENTO_ESTEIRAS;