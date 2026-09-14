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
 * @param {boolean} [temporary=false] - Se true, marca a credencial como temporária
 * (mecanismo nativo do Keycloak para forçar troca no primeiro login) — usado pelo
 * modo em lote, que sempre cria com senha temporária fixa. O modo de execução única
 * (`--env`) nunca passa `true` aqui, preservando o comportamento original.
 * @returns {object} Corpo de criação (`POST /users`) do novo usuário em HML.
 */
export const montarPayloadNovoUsuario = (usuarioOrigem, novoUsername, novaSenha, temporary = false) => ({
  username: novoUsername,
  enabled: usuarioOrigem.enabled,
  emailVerified: usuarioOrigem.emailVerified,
  firstName: usuarioOrigem.firstName,
  lastName: usuarioOrigem.lastName,
  email: usuarioOrigem.email,
  attributes: usuarioOrigem.attributes ?? {},
  requiredActions: usuarioOrigem.requiredActions ?? [],
  credentials: [{ type: 'password', value: novaSenha, temporary }],
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

/**
 * @description Orquestra a clonagem de uma lista de usuários (mapa `usuarioProd:
 * usuarioHml`) processando um de cada vez, em ordem, sem deixar um item
 * problemático interromper o restante do lote — cada item vira um resultado
 * `{ usuarioProd, usuarioHml, ok, ... }` na lista final, sucesso ou não. Pura (sem
 * dependência do global `Cypress`): `clonarUmUsuario` é injetado pelo chamador
 * (`commands/usuariosKeycloak.js` injeta a clonagem real via `cy.executarRequest2`;
 * os testes injetam um stub), e nunca deve rejeitar — casos de "dúvida bloqueante"
 * (usuário de origem não encontrado, role/grupo sem correspondente em HML,
 * conflito de username/email) são sinalizados via `{ ok: false, motivo }`, nunca
 * via exceção, exatamente para permitir continuar para o próximo item.
 *
 * `valorInicial` é recebido em vez de fixo em `Promise.resolve([])` porque, no uso
 * real dentro do Cypress, `clonarUmUsuario` devolve um `Cypress.Chainable` (não uma
 * Promise nativa) — o Cypress detecta e falha explicitamente se um comando `cy.`
 * for invocado a partir de dentro de uma Promise nativa "estranha" à sua própria
 * fila de comandos (ver `commands/usuariosKeycloak.js`, que passa
 * `cy.wrap([], { log: false })` aqui, mantendo toda a cadeia dentro do sistema de
 * comandos do Cypress). Os testes usam o padrão (`Promise.resolve([])`), com
 * `clonarUmUsuario` devolvendo Promises nativas.
 * @param {Object<string,string>} mapaUsuarios - Mapa `usuarioProd: usuarioHml` a clonar.
 * @param {(usuarioProd: string, usuarioHml: string) => PromiseLike<{ok: boolean, motivo?: string, valor?: object}>} clonarUmUsuario
 * - Clona um único item do lote; nunca deve rejeitar (ver descrição acima).
 * @param {PromiseLike<Array<object>>} [valorInicial=Promise.resolve([])] - Acumulador inicial (thenable) — ver descrição acima.
 * @returns {PromiseLike<Array<{usuarioProd: string, usuarioHml: string, ok: boolean, motivo?: string, valor?: object}>>}
 */
export const clonarUsuariosEmLote = (mapaUsuarios, clonarUmUsuario, valorInicial = Promise.resolve([])) =>
  Object.entries(mapaUsuarios ?? {}).reduce(
    (cadeia, [usuarioProd, usuarioHml]) =>
      cadeia.then((resultados) =>
        clonarUmUsuario(usuarioProd, usuarioHml).then((resultado) => [...resultados, { usuarioProd, usuarioHml, ...resultado }]),
      ),
    valorInicial,
  );
