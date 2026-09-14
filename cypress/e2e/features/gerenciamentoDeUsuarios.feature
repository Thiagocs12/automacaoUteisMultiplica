# language: pt

Funcionalidade: Clonagem de Usuário do Keycloak

  Como um engenheiro de automação
  Eu quero clonar um usuário do Keycloak de Produção para Homologação, com um novo username e senha
  Para reproduzir em Homologação o comportamento exato de um usuário real de produção, sem usar as credenciais reais dele

  Contexto: Clonagem de Usuário do Keycloak
    Dado que possuo acesso aos ambientes de Keycloak necessarios para usuários

  @keycloakUsuario
  Cenário: Clonar um usuário de Produção para Homologação com novo username e senha
    Quando clono o usuário de produção informado via parâmetros de execução para homologação
    Então o novo usuário está criado em homologação com as mesmas roles, grupos e atributos do usuário de origem
