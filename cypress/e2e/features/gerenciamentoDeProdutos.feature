# language: pt

Funcionalidade: Sincronização de Dados de Produtos

  Como um engenheiro de automação
  Eu quero copiar dados de produtos e suas dependências de Produção para Homologação
  Para garantir que o ambiente de Homologação tenha dados consistentes para testes

  Contexto: Sincronização de Produtos
    Dado que possuo acesso aos ambientes necessarios

  @produto
  Cenário: Copiar e Sincronizar um Produto e suas Dependências
    Dado uma consulta aos produtos de produção é realizada para obter os dados atuais
    E a pesquisa retornou dados de produtos para serem copiados de produção para homologação
    Quando pesquiso as dependências desses produtos
    E processo as dependências do nivel 1 da entidade "produtos"
    E processo as dependências do nivel 2 da entidade "produtos"
    E processo as dependências do nivel 3 da entidade "produtos"
    E processo as dependências do nivel 4 da entidade "produtos"
    E processo as dependências do nivel 5 da entidade "produtos"
    Então os dados dos produtos e suas dependências estão copiados de produção para homologação