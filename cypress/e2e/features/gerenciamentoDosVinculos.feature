# language: pt

Funcionalidade: Sincronização de Vínculos de Esteira entre Produção e Homologação

  Como um engenheiro de automação
  Eu quero sincronizar os vínculos de esteiras de Produção para Homologação
  Para garantir que o ambiente de Homologação tenha dados consistentes para testes

  Contexto:
    Dado que os bancos de dados de Produção e Homologação estão acessíveis

  @vinculos
  Cenário: Sincronizar vínculos de esteira da MOP
    Dado que existem vínculos das esteiras cadastrados em Produção
    Quando pesquiso as dependências dos vínculos
    E processo as dependências do nivel 1 da entidade "vinculos"
    E processo as dependências do nivel 2 da entidade "vinculos"
    Então confirmo que todos os vínculos foram sincronizados corretamente