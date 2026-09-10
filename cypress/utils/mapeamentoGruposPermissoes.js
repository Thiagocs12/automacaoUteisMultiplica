// arquivo: mapeamentoGruposPermissoes.js
//
// Mapeamento do domínio "Grupos e Permissões" (grupos, realm roles, client
// roles e o vínculo grupo -> role do Keycloak). Diferente de Produtos/Esteiras,
// os recursos aqui não passam pelo pipeline genérico de `sincronizacaoNivel.js`
// (nivelDependencia/contentBusca/novoArray): grupos e roles são localizados em
// HML por busca textual (`?search=`, filtrando o resultado exato por nome — a
// busca faz correspondência parcial) e o vínculo grupo->role vem embutido na
// representação completa do grupo (`GET /groups/{id}`, campos `realmRoles`/
// `clientRoles`), não de um endpoint de role-mappings separado. A lógica
// específica vive em `commands/gruposPermissoes.js`.

const REALM = 'multiplicacapital';

const MAPEAMENTO_GRUPOS_PERMISSOES = {
  GRUPOS: {
    nomeArquivo: 'GruposPermissoes/1 - grupos.json',
    urlGrupos: `auth/admin/realms/${REALM}/groups`,
  },
  ROLES_REALM: {
    nomeArquivo: 'GruposPermissoes/2 - rolesRealm.json',
    urlRoles: `auth/admin/realms/${REALM}/roles`,
  },
  ROLES_CLIENTE: {
    nomeArquivo: 'GruposPermissoes/3 - rolesCliente.json',
    urlClientes: `auth/admin/realms/${REALM}/clients`,
    // clientId (não o UUID interno) do client cujas roles serão sincronizadas —
    // configurado via env (KEYCLOAK_CLIENT_ID), pode diferir de UUID entre PROD/HML.
  },
  // Não há uma entidade "GRUPO_ROLE_MAPPING" com arquivo próprio: o vínculo
  // grupo -> role é sempre recalculado por diff a cada execução
  // (`sincronizarRoleMappingsDosGrupos`, em commands/gruposPermissoes.js),
  // usando o `idHml` já resolvido de GRUPOS/ROLES_REALM/ROLES_CLIENTE.
};

export default MAPEAMENTO_GRUPOS_PERMISSOES;
