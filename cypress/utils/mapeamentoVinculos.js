const MAPEAMENTO_VINCULOS = {
    MOP: {
        nomeArquivo: 'Vinculos/mop.json',
        nivelDependencia: 1,
        dependencia: [
            { idSubstituido: 'idProduto', arquivoDependencia: 'Produtos/1 - Produtos.json' },
            { idSubstituido: 'codigoModeloEsteira', arquivoDependencia: 'Esteiras/1 - esteiras.json' },
            { idSubstituido: 'codigoModeloEsteira2', arquivoDependencia: 'Esteiras/1 - esteiras.json' }
        ],
    },
};

export default MAPEAMENTO_VINCULOS;