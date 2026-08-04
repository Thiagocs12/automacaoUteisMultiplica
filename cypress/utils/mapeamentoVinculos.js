const MAPEAMENTO_VINCULOS = {
  MOP: {
    nomeArquivo: 'Vinculos/mop.json',
    nivelDependencia: 1,
    tabela: 'MC_MOP_VINCULO_ESTEIRA',
    campoIdentificador: 'idProduto',
    geraLog: true,
    chaveLog: 'MOP',
    dependencia: [
      { idSubstituido: 'idProduto',            arquivoDependencia: 'Produtos/1 - Produtos.json' },
      { idSubstituido: 'codigoModeloEsteira',  arquivoDependencia: 'Esteiras/1 - esteiras.json' },
      { idSubstituido: 'codigoModeloEsteira2', arquivoDependencia: 'Esteiras/1 - esteiras.json' }
    ],
    camposUpdate: [
      { campo: 'idConsultoriaEspecializada', tipo: 'number' },
      { campo: 'idProduto',                  tipo: 'number' },
      { campo: 'codigoModeloEsteira',        tipo: 'string' },
      { campo: 'codigoModeloEsteira2',       tipo: 'string' },
      { campo: 'codigoRegraMotor',           tipo: 'string' },
      { campo: 'indGeraAnaliseMotorCredito', tipo: 'boolean' },
    ],
  },
};

export default MAPEAMENTO_VINCULOS;