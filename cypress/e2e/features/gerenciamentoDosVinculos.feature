# language: pt

Funcionalidade: Sincronização de Vínculos de Esteira entre Produção e Homologação

  Como um engenheiro de automação
  Eu quero sincronizar os vínculos de esteiras de Produção para Homologação
  Para garantir que o ambiente de Homologação tenha dados consistentes para testes

  Contexto:
    Dado que os bancos de dados de Produção e Homologação estão acessíveis

  @vinculosMop
  Cenário: Sincronizar vínculos de esteira da MOP
    #Dado que existem vínculos da MOP cadastrados em Produção
    #Quando mapeio os IDs equivalentes em Homologação
    E verifico quais vínculos já existem em Homologação
    Então atualizo os vínculos existentes com os dados de Produção
    E crio os vínculos que ainda não existem em Homologação
    E confirmo que todos os vínculos da MOP foram sincronizados corretamente