const MAPEAMENTO_VINCULOS = {
  MOP: {
    nomeArquivo: 'Vinculos/1 - mop.json',
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
    removerSeNaoEncontrado: true
  },
  POC: {
    nomeArquivo: 'Vinculos/2 - poc.json',
    nivelDependencia: 2,
    tabela: 'MC_CAD_VINCULO_ESTEIRA',
    campoIdentificador: 'descricao',
    geraLog: true,
    chaveLog: 'POC',
    dependencia: [
      { idSubstituido: 'codigoModeloEsteira',              arquivoDependencia: 'Esteiras/1 - esteiras.json' },
      { idSubstituido: 'codigoModeloEtapaInicial',         arquivoDependencia: 'Esteiras/4 - etapas.json'   },
      { idSubstituido: 'codigoModeloEsteiraFormalizacao',  arquivoDependencia: 'Esteiras/1 - esteiras.json' },
      { idSubstituido: 'idTipoProspect',                   arquivoDependencia: 'Vinculos/3 - tipoProspect.json' },
      { idSubstituido: 'idTipoProposta',                   arquivoDependencia: 'Vinculos/4 - tipoProposta.json' },
    ],
    camposUpdate: [
      { campo: 'idConsultoriaEspecializada',      tipo: 'number'  },
      { campo: 'descricao',                       tipo: 'string'  },
      { campo: 'idTipoProspect',                  tipo: 'number'  },
      { campo: 'idTipoProposta',                  tipo: 'number'  },
      { campo: 'codigoModeloEsteira',             tipo: 'string'  },
      { campo: 'codigoModeloEtapaInicial',        tipo: 'string'  },
      { campo: 'codigoModeloEsteiraFormalizacao', tipo: 'string'  },
      { campo: 'indCedenteVinculado',             tipo: 'boolean' },
      { campo: 'indGeraSacado',                   tipo: 'boolean' },
      { campo: 'indPermiteCadastroFilial',        tipo: 'boolean' },
      { campo: 'qtdEsteiraAndamento',             tipo: 'number'  }
    ]
  },
  TIPO_PROSPECT: {
    nomeArquivo: 'Vinculos/3 - tipoProspect.json',
    nivelDependencia: 1,
    tabela: 'MC_CAD_TIPO_PROSPECT',
    campoIdentificador: 'descricao',
    geraLog: false,
    chaveLog: 'TIPO_PROSPECT',
    arquivoReferencia: 'Vinculos/2 - poc.json',
    camposReferencia: {id: 'idTipoProspect'},
    camposUpdate: [
      { campo: 'idConsultoriaEspecializada',      tipo: 'number'  },
      { campo: 'descricao',                       tipo: 'string'  },
      { campo: 'ativo',                           tipo: 'boolean' },
    ],
    removerSeNaoEncontrado: true
  },
  TIPO_PROPOSTA: {
    nomeArquivo: 'Vinculos/4 - tipoProposta.json',
    nivelDependencia: 1,
    tabela: 'MC_CAD_TIPO_PROPOSTA',
    campoIdentificador: 'descricao',
    geraLog: false,
    chaveLog: 'TIPO_PROPOSTA',
    arquivoReferencia: 'Vinculos/2 - poc.json',
    camposReferencia: {id: 'idTipoProposta'},
    camposUpdate: [
      { campo: 'idConsultoriaEspecializada',      tipo: 'number'  },
      { campo: 'descricao',                       tipo: 'string'  },
      { campo: 'ativo',                           tipo: 'boolean' },
      { campo: 'indExigePriorizacao',             tipo: 'boolean' },
    ],
    removerSeNaoEncontrado: true
  },
  PARAMETRO_ETAPAS: {
    nomeArquivo: 'Vinculos/5 - parametroEtapas.json',
    nivelDependencia: 3,
    tabela: 'MC_CAD_PARAMETRO',
    campoIdentificador: 'identificador',
    dependencia: [
      { idSubstituido: 'valor', arquivoDependencia: 'Esteiras/1 - esteiras.json' },
    ]
  },
  PARAMETRO_ESTEIRAS: {
    nomeArquivo: 'Vinculos/6 - parametroEsteiras.json',
    nivelDependencia: 3,
    tabela: 'MC_CAD_PARAMETRO',
    campoIdentificador: 'identificador',
    dependencia: [
      { idSubstituido: 'valor', arquivoDependencia: 'Esteiras/4 - etapas.json' },
    ]
  }
};

export default MAPEAMENTO_VINCULOS;