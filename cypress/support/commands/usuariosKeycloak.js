// arquivo: usuariosKeycloak.js
//
// Clonagem de um usuário do Keycloak de PRODUÇÃO (`keycloakProd`, somente leitura)
// para HML (`keycloak`), com novo username/senha a cada execução — mantendo o resto
// do usuário igual: realm roles, client roles (de TODOS os clients em que o usuário
// tiver role atribuída, via `GET /users/{id}/role-mappings`, não só o client
// configurado em `KEYCLOAK_CLIENT_ID` usado pela sincronização de Grupos e
// Permissões), grupos (por nome exato) e atributos/email/nome/enabled/
// emailVerified/requiredActions.
//
// Diferente do domínio Grupos e Permissões (sincronização em lote, contínua, com
// cache de ids em estoqueIds.json), este é um recurso pontual sob demanda: uma
// execução = um usuário clonado, sem estoque nem reprocessamento.
//
// Nunca decide sozinho diante de ambiguidade: usuário de origem não encontrado,
// role/grupo sem correspondente em HML (nunca cria o que falta), ou novo
// username/email já existente em HML lançam erro descritivo — a "dúvida bloqueante"
// deste recurso, sempre executado sob demanda por um humano, que vê exatamente o que
// precisa resolver antes de rodar de novo, em vez de seguir silenciosamente ou
// duplicar.

import MAPEAMENTO_USUARIOS from '../../utils/mapeamentoUsuarios';
import MAPEAMENTO_GRUPOS_PERMISSOES from '../../utils/mapeamentoGruposPermissoes';
import { encontrarPorNomeExato } from '../shared/keycloakHelpers';
import {
  montarPayloadNovoUsuario,
  extrairNomesRolesRealm,
  extrairRolesPorCliente,
  extrairNomesGrupos,
} from '../shared/clonagemUsuarioKeycloak';

const { USUARIOS } = MAPEAMENTO_USUARIOS;
const { GRUPOS, ROLES_REALM, ROLES_CLIENTE } = MAPEAMENTO_GRUPOS_PERMISSOES;

/** Tamanho de página usado nas buscas/listagens — realm pequeno, uma página cobre tudo. */
const MAX_REGISTROS = 1000;

/**
 * @description Busca um usuário pelo username exato. Diferente de grupos/roles (que
 * só têm busca parcial via `?search=`), a API de usuários do Keycloak já suporta
 * correspondência exata nativamente (`exact=true`), sem precisar filtrar o
 * resultado depois.
 * @param {'keycloak'|'keycloakProd'} ambiente - Ambiente Keycloak consultado.
 * @param {string} username - Username exato procurado.
 * @returns {Cypress.Chainable<object|null>}
 */
Cypress.Commands.add('buscarUsuarioKeycloakPorUsername', (ambiente, username) =>
  cy
    .executarRequest2(ambiente, `${USUARIOS.urlUsuarios}?username=${encodeURIComponent(username)}&exact=true`)
    .then((resposta) => (resposta.body || [])[0] ?? null),
);

/**
 * @description Busca um usuário pelo email exato (`exact=true`), mesma lógica de
 * `buscarUsuarioKeycloakPorUsername`.
 * @param {'keycloak'|'keycloakProd'} ambiente - Ambiente Keycloak consultado.
 * @param {string} email - Email exato procurado.
 * @returns {Cypress.Chainable<object|null>}
 */
Cypress.Commands.add('buscarUsuarioKeycloakPorEmail', (ambiente, email) =>
  cy
    .executarRequest2(ambiente, `${USUARIOS.urlUsuarios}?email=${encodeURIComponent(email)}&exact=true`)
    .then((resposta) => (resposta.body || [])[0] ?? null),
);

/** @description Busca a representação completa de uma realm role em HML, por nome exato. */
const buscarRoleRealmEmHml = (nome) =>
  cy
    .executarRequest2('keycloak', `${ROLES_REALM.urlRoles}?first=0&max=${MAX_REGISTROS}&search=${encodeURIComponent(nome)}`)
    .then((resposta) => encontrarPorNomeExato(resposta.body, nome));

/** @description Busca a representação completa de um grupo em HML, por nome exato. */
const buscarGrupoEmHml = (nome) =>
  cy
    .executarRequest2('keycloak', `${GRUPOS.urlGrupos}?search=${encodeURIComponent(nome)}&max=${MAX_REGISTROS}`)
    .then((resposta) => encontrarPorNomeExato(resposta.body, nome));

/**
 * @description Resolve, em HML, as representações completas das realm roles do
 * usuário de origem. Lança erro na primeira role sem correspondente em HML —
 * clonagem de usuário nunca cria role faltante.
 * @param {Array<string>} nomesRoles - Nomes das realm roles do usuário de origem.
 * @returns {Cypress.Chainable<Array<object>>}
 */
const resolverRolesRealmEmHml = (nomesRoles) =>
  nomesRoles.reduce(
    (cadeia, nome) =>
      cadeia.then((acumulado) =>
        buscarRoleRealmEmHml(nome).then((role) => {
          if (!role) {
            throw new Error(
              `[clonarUsuarioKeycloak] Realm role "${nome}" do usuário de origem não existe em HML — sincronize Grupos e Permissões antes de clonar, ou confirme o nome. Clonagem interrompida.`,
            );
          }
          return [...acumulado, role];
        }),
      ),
    cy.wrap([], { log: false }),
  );

/**
 * @description Resolve, em HML, as representações completas das client roles do
 * usuário de origem, agrupadas por client (UUID resolvido em HML via
 * `buscarUuidClienteKeycloak`, que já lança erro descritivo se o client não existir
 * em HML). Lança erro na primeira role sem correspondente em HML.
 * @param {Array<{clientId: string, nomesRoles: Array<string>}>} rolesPorCliente - Client roles do usuário de origem, por client.
 * @returns {Cypress.Chainable<Array<{clienteUuidHml: string, roles: Array<object>}>>}
 */
const resolverRolesClienteEmHml = (rolesPorCliente) =>
  rolesPorCliente.reduce(
    (cadeia, { clientId, nomesRoles }) =>
      cadeia.then((acumulado) =>
        cy.buscarUuidClienteKeycloak('keycloak', clientId).then((clienteUuidHml) => {
          const urlRolesClienteHml = `${ROLES_CLIENTE.urlClientes}/${clienteUuidHml}/roles`;

          return nomesRoles
            .reduce(
              (cadeiaInterna, nome) =>
                cadeiaInterna.then((rolesAcumuladas) =>
                  cy
                    .executarRequest2(
                      'keycloak',
                      `${urlRolesClienteHml}?first=0&max=${MAX_REGISTROS}&search=${encodeURIComponent(nome)}`,
                    )
                    .then((resposta) => {
                      const role = encontrarPorNomeExato(resposta.body, nome);

                      if (!role) {
                        throw new Error(
                          `[clonarUsuarioKeycloak] Client role "${nome}" do client "${clientId}" do usuário de origem não existe em HML — sincronize Grupos e Permissões antes de clonar, ou confirme o nome. Clonagem interrompida.`,
                        );
                      }

                      return [...rolesAcumuladas, role];
                    }),
                ),
              cy.wrap([], { log: false }),
            )
            .then((rolesResolvidas) => [...acumulado, { clienteUuidHml, roles: rolesResolvidas }]);
        }),
      ),
    cy.wrap([], { log: false }),
  );

/**
 * @description Resolve, em HML, os ids dos grupos a que o usuário de origem
 * pertence, por nome exato. Lança erro no primeiro grupo sem correspondente em HML —
 * clonagem de usuário nunca cria grupo faltante.
 * @param {Array<string>} nomesGrupos - Nomes dos grupos do usuário de origem.
 * @returns {Cypress.Chainable<Array<string>>}
 */
const resolverGruposEmHml = (nomesGrupos) =>
  nomesGrupos.reduce(
    (cadeia, nome) =>
      cadeia.then((acumulado) =>
        buscarGrupoEmHml(nome).then((grupo) => {
          if (!grupo) {
            throw new Error(
              `[clonarUsuarioKeycloak] Grupo "${nome}" do usuário de origem não existe em HML — sincronize Grupos e Permissões antes de clonar, ou confirme o nome. Clonagem interrompida.`,
            );
          }
          return [...acumulado, grupo.id];
        }),
      ),
    cy.wrap([], { log: false }),
  );

/**
 * @description Busca em PROD os dados do usuário de origem (roles de realm, roles de
 * TODOS os clients e grupos) necessários para a clonagem.
 * @param {string} idOrigem - Id (UUID) do usuário de origem em PROD.
 * @returns {Cypress.Chainable<{nomesRolesRealm: Array<string>, rolesPorCliente: Array<object>, nomesGrupos: Array<string>}>}
 */
const buscarDadosDoUsuarioDeOrigem = (idOrigem) =>
  cy.executarRequest2('keycloakProd', `${USUARIOS.urlUsuarios}/${idOrigem}/role-mappings`).then((respostaRoleMappings) =>
    cy.executarRequest2('keycloakProd', `${USUARIOS.urlUsuarios}/${idOrigem}/groups?max=${MAX_REGISTROS}`).then((respostaGrupos) => ({
      nomesRolesRealm: extrairNomesRolesRealm(respostaRoleMappings.body),
      rolesPorCliente: extrairRolesPorCliente(respostaRoleMappings.body),
      nomesGrupos: extrairNomesGrupos(respostaGrupos.body),
    })),
  );

/**
 * @description Cria o novo usuário em HML e atribui roles/grupos já resolvidos.
 * @param {object} origem - Representação completa do usuário de origem em PROD.
 * @param {string} novoUsername - Novo username.
 * @param {string} novaSenha - Nova senha.
 * @param {{realmRolesHml: Array<object>, clienteRolesHml: Array<object>, grupoIdsHml: Array<string>}} resolvidos - Roles/grupos já resolvidos em HML.
 * @returns {Cypress.Chainable<{id: string, username: string}>}
 */
const criarUsuarioEAtribuir = (origem, novoUsername, novaSenha, { realmRolesHml, clienteRolesHml, grupoIdsHml }) => {
  const payload = montarPayloadNovoUsuario(origem, novoUsername, novaSenha);

  return cy
    .executarRequest2('keycloak', `${USUARIOS.urlUsuarios}/`, payload, 'POST')
    .then(() => cy.buscarUsuarioKeycloakPorUsername('keycloak', novoUsername))
    .then((criado) => {
      if (!criado) {
        throw new Error(`[clonarUsuarioKeycloak] Usuário "${novoUsername}" criado, mas não encontrado na busca em seguida.`);
      }

      const atribuirRealmRoles = realmRolesHml.length
        ? cy.executarRequest2('keycloak', `${USUARIOS.urlUsuarios}/${criado.id}/role-mappings/realm`, realmRolesHml, 'POST')
        : cy.wrap(null, { log: false });

      const atribuirClientRoles = clienteRolesHml.reduce(
        (cadeia, { clienteUuidHml, roles }) =>
          cadeia.then(() =>
            roles.length
              ? cy.executarRequest2(
                  'keycloak',
                  `${USUARIOS.urlUsuarios}/${criado.id}/role-mappings/clients/${clienteUuidHml}`,
                  roles,
                  'POST',
                )
              : null,
          ),
        cy.wrap(null, { log: false }),
      );

      const atribuirGrupos = grupoIdsHml.reduce(
        (cadeia, grupoId) =>
          cadeia.then(() => cy.executarRequest2('keycloak', `${USUARIOS.urlUsuarios}/${criado.id}/groups/${grupoId}`, '', 'PUT')),
        cy.wrap(null, { log: false }),
      );

      return atribuirRealmRoles
        .then(() => atribuirClientRoles)
        .then(() => atribuirGrupos)
        .then(() => ({ id: criado.id, username: criado.username }));
    });
};

/**
 * @description Clona um usuário do Keycloak de PRODUÇÃO para HML, com novo
 * username/senha — mantendo o resto igual (realm roles, client roles de todos os
 * clients, grupos e atributos/email/nome/enabled/emailVerified/requiredActions).
 * Nunca escreve em PROD (só GET, via `keycloakProd`) nem decide sozinho diante de
 * ambiguidade (ver módulo acima).
 * @param {{usuarioOrigem: string, novoUsername: string, novaSenha: string}} params - Username de origem em PROD, e novo username/senha para HML.
 * @returns {Cypress.Chainable<{id: string, username: string}>} O novo usuário criado em HML (sem senha).
 */
Cypress.Commands.add('clonarUsuarioKeycloak', ({ usuarioOrigem, novoUsername, novaSenha }) => {
  return cy.buscarUsuarioKeycloakPorUsername('keycloakProd', usuarioOrigem).then((origem) => {
    if (!origem) {
      throw new Error(
        `[clonarUsuarioKeycloak] Usuário de origem "${usuarioOrigem}" não encontrado em produção (realm multiplicacapital). Clonagem interrompida.`,
      );
    }

    return cy.buscarUsuarioKeycloakPorUsername('keycloak', novoUsername).then((conflitoUsername) => {
      if (conflitoUsername) {
        throw new Error(
          `[clonarUsuarioKeycloak] Já existe um usuário com o username "${novoUsername}" em HML — escolha outro username. Clonagem interrompida.`,
        );
      }

      const verificarEmail = origem.email ? cy.buscarUsuarioKeycloakPorEmail('keycloak', origem.email) : cy.wrap(null, { log: false });

      return verificarEmail.then((conflitoEmail) => {
        if (conflitoEmail) {
          throw new Error(
            `[clonarUsuarioKeycloak] Já existe um usuário com o email "${origem.email}" (do usuário de origem "${usuarioOrigem}") em HML. Clonagem interrompida.`,
          );
        }

        return buscarDadosDoUsuarioDeOrigem(origem.id).then(({ nomesRolesRealm, rolesPorCliente, nomesGrupos }) => {
          cy.logExecucao(
            `[clonarUsuarioKeycloak] Usuário de origem "${usuarioOrigem}": ${nomesRolesRealm.length} realm role(s), ${rolesPorCliente.length} client(s) com role(s), ${nomesGrupos.length} grupo(s).`,
          );

          return resolverRolesRealmEmHml(nomesRolesRealm)
            .then((realmRolesHml) =>
              resolverRolesClienteEmHml(rolesPorCliente).then((clienteRolesHml) => ({ realmRolesHml, clienteRolesHml })),
            )
            .then(({ realmRolesHml, clienteRolesHml }) =>
              resolverGruposEmHml(nomesGrupos).then((grupoIdsHml) => ({ realmRolesHml, clienteRolesHml, grupoIdsHml })),
            )
            .then((resolvidos) => criarUsuarioEAtribuir(origem, novoUsername, novaSenha, resolvidos))
            .then((criado) => {
              cy.logExecucao(`[clonarUsuarioKeycloak] Usuário "${novoUsername}" criado em HML com sucesso (a partir de "${usuarioOrigem}").`);
              return criado;
            });
        });
      });
    });
  });
});
