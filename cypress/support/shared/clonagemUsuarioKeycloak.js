// arquivo: clonagemUsuarioKeycloak.js
//
// Lógica pura (sem dependência do global `Cypress`) usada pela clonagem de usuário do
// Keycloak PROD -> HML (`commands/usuariosKeycloak.js`), para poder ser coberta por
// node:test puro em `__tests__/`, sem precisar rodar o Cypress.

/**
 * @description Monta o corpo de criação do novo usuário em HML a partir da
 * representação completa do usuário de origem em PROD (`GET /users/{id}`): mantém
 * tudo (atributos, nome, email, enabled, emailVerified, requiredActions), exceto
 * username e senha — sempre os informados a cada execução, nunca copiados do
 * usuário original.
 * @param {object} usuarioOrigem - Representação completa do usuário de origem em PROD.
 * @param {string} novoUsername - Novo username, informado a cada execução.
 * @param {string} novaSenha - Nova senha, informada a cada execução.
 * @returns {object} Corpo de criação (`POST /users`) do novo usuário em HML.
 */
export const montarPayloadNovoUsuario = (usuarioOrigem, novoUsername, novaSenha) => ({
  username: novoUsername,
  enabled: usuarioOrigem.enabled,
  emailVerified: usuarioOrigem.emailVerified,
  firstName: usuarioOrigem.firstName,
  lastName: usuarioOrigem.lastName,
  email: usuarioOrigem.email,
  attributes: usuarioOrigem.attributes ?? {},
  requiredActions: usuarioOrigem.requiredActions ?? [],
  credentials: [{ type: 'password', value: novaSenha, temporary: false }],
});

/**
 * @description Extrai os nomes das realm roles atribuídas a um usuário, a partir da
 * resposta de `GET /users/{id}/role-mappings`.
 * @param {{realmMappings?: Array<{name: string}>}} roleMappings - Resposta de `GET /users/{id}/role-mappings`.
 * @returns {Array<string>}
 */
export const extrairNomesRolesRealm = (roleMappings) => (roleMappings?.realmMappings ?? []).map((role) => role.name);

/**
 * @description Extrai, por client (identificado pelo `clientId` público — a mesma
 * chave usada pela resposta do Keycloak), os nomes das client roles atribuídas a um
 * usuário, a partir da resposta de `GET /users/{id}/role-mappings`. Cobre TODOS os
 * clients em que o usuário tiver role atribuída, não só um client configurado fixo.
 * @param {{clientMappings?: Object<string, {mappings: Array<{name: string}>}>}} roleMappings - Resposta de `GET /users/{id}/role-mappings`.
 * @returns {Array<{clientId: string, nomesRoles: Array<string>}>}
 */
export const extrairRolesPorCliente = (roleMappings) =>
  Object.entries(roleMappings?.clientMappings ?? {}).map(([clientId, info]) => ({
    clientId,
    nomesRoles: (info.mappings ?? []).map((role) => role.name),
  }));

/**
 * @description Extrai os nomes dos grupos a que um usuário pertence, a partir da
 * resposta de `GET /users/{id}/groups`.
 * @param {Array<{name: string}>} grupos - Resposta de `GET /users/{id}/groups`.
 * @returns {Array<string>}
 */
export const extrairNomesGrupos = (grupos) => (grupos ?? []).map((grupo) => grupo.name);
