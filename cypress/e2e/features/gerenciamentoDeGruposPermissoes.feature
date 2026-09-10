# language: pt

Funcionalidade: Sincronização de Grupos e Permissões do Keycloak

  Como um engenheiro de automação
  Eu quero copiar grupos, roles (realm e client) e seus vínculos do Keycloak de Produção para Homologação
  Para garantir que o ambiente de Homologação tenha os mesmos grupos e permissões de Produção

  Contexto: Sincronização de Grupos e Permissões
    Dado que possuo acesso aos ambientes de Keycloak necessarios

  @keycloak
  Cenário: Copiar e Sincronizar Grupos, Roles e seus Vínculos
    Dado uma consulta aos grupos e roles do Keycloak de produção é realizada para obter os dados atuais
    Quando processo os grupos do Keycloak
    E processo as roles de realm do Keycloak
    E processo as roles de client do Keycloak
    E processo os vínculos entre grupos e roles do Keycloak
    Então os grupos, roles e vínculos do Keycloak estão copiados de produção para homologação
