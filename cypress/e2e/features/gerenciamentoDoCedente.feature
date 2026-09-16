# language: pt

Funcionalidade: Clonagem de Cedente entre Produção e Homologação

  Como um engenheiro de automação
  Eu quero resolver a estratégia de clonagem de um cedente a partir do seu CNPJ/CPF
  Para saber se ele deve ser criado, apagado e recriado, ou se falta pessoa/prospect de origem em produção

  @cedente
  Cenário: Resolver a estratégia de clonagem para o CNPJ/CPF informado via parâmetros de execução
    Quando resolvo a estratégia de clonagem do cedente informado via parâmetros de execução
    Então a estratégia resolvida é exibida no log com os dados de origem encontrados
