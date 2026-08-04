# language: pt

Funcionalidade: Sincronização de Vínculos de Esteira entre Produção e Homologação

  Como um engenheiro de automação
  Eu quero sincronizar os vínculos de esteiras de Produção para Homologação
  Para garantir que o ambiente de Homologação tenha dados consistentes para testes

  Contexto:
    Dado que os bancos de dados de Produção e Homologação estão acessíveis

  @vinculosMop
  Cenário: Sincronizar vínculos de esteira da MOP
    Dado que existem vínculos da "MOP" cadastrados em Produção
    Quando mapeio os IDs equivalentes em Homologação da entidade "MOP"
    E verifico quais vínculos já existem em Homologação da entidade "MOP"
    Então atualizo os vínculos existentes com os dados de Produção da entidade "MOP"
    E crio os vínculos que ainda não existem em Homologação da entidade "MOP"
    E confirmo que todos os vínculos da "MOP" foram sincronizados corretamente

  @vinculosPoc
  Cenário: Sincronizar vínculos de esteira da POC
    Dado que existem vínculos da "POC" cadastrados em Produção
    Quando pesquiso as dependências dos vínculos da POC
    E mapeio os IDs equivalentes em Homologação da entidade "POC"
    E verifico quais vínculos já existem em Homologação da entidade "POC"
    E processo as dependências do nivel 1 da entidade "POC"
    E processo as dependências do nivel 2 da entidade "POC"
    Então atualizo os vínculos existentes com os dados de Produção da entidade "POC"
    E crio os vínculos que ainda não existem em Homologação da entidade "POC" 
    E confirmo que todos os vínculos da "POC" foram sincronizados corretamente