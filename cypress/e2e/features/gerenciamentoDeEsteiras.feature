# language: pt

Funcionalidade: Sincronização de Dados das Esteiras

  Como um engenheiro de automação
  Eu quero copiar dados de esteiras e suas dependências de Produção para Homologação
  Para garantir que o ambiente de Homologação tenha dados consistentes para testes

  Contexto: Sincronização de Esteiras
    Dado que possuo acesso aos ambientes necessarios

  @esteira
  Cenário: Copiar e Sincronizar uma Esteira e suas Dependências
    #Dado uma consulta às esteiras de produção é realizada para obter os dados atuais
    #E a pesquisa retornou dados de esteiras para serem copiados de produção para homologação
    #Quando pesquiso as dependências da entidade "esteiras"
    #E processo as dependências do nivel 1 da entidade "esteiras"
    #E processo as dependências do nivel 2 da entidade "esteiras"
    E processo as dependências do nivel 3 da entidade "esteiras"
    #E processo as dependências do nivel 4 da entidade "esteiras"
    #E processo as dependências do nivel 5 da entidade "esteiras"
    #E processo as dependências do nivel 6 da entidade "esteiras"
    #Então os dados das esteiras e suas dependências estão copiados de produção para homologação