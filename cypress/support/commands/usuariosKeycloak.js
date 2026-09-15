// arquivo: usuariosKeycloak.js
//
// Clonagem de um usuário do Keycloak de PRODUÇÃO (`keycloakProd`, somente leitura)
// para HML (`keycloak`), com novo username/senha a cada execução — mantendo o resto
// do usuário igual: realm roles, client roles (de TODOS os clients em que o usuário
// tiver role atribuída, via `GET /users/{id}/role-mappings`, não só o client
// configurado em `KEYCLOAK_CLIENT_ID` usado pela sincronização de Grupos e
// Permissões), grupos (por nome exato) e atributos/nome/enabled/
// emailVerified/requiredActions. O email NUNCA é copiado do usuário de origem —
// é sempre gerado, inválido/não-real e único (`gerarEmailInvalidoUnico`, em
// clonagemUsuarioKeycloak.js), para nunca colidir com um email já existente em HML.
//
// Diferente do domínio Grupos e Permissões (sincronização em lote, contínua, com
// cache de ids em estoqueIds.json), este é um recurso pontual sob demanda: uma
// execução clona um usuário (`cy.clonarUsuarioKeycloak`, modo único via `--env`)
// ou vários (`cy.clonarUsuariosKeycloakEmLote`, modo em lote via fixture
// `cypress/fixtures/usuariosParaClonar.json`) — sem estoque nem reprocessamento.
//
// Nunca decide sozinho diante de ambiguidade: usuário de origem não encontrado,
// role/grupo sem correspondente em HML (nunca cria o que falta), ou novo username
// já existente em HML são a "dúvida bloqueante" deste recurso (conflito de email
// deixou de existir, já que o email nunca mais vem do usuário original). No modo
// único isso lança erro descritivo, interrompendo a clonagem — sempre executado
// sob demanda por um humano, que vê exatamente o que precisa resolver antes de
// rodar de novo, em vez de seguir silenciosamente ou duplicar. No modo em lote, a
// mesma checagem (`executarClonagem`, compartilhada pelos dois modos) NÃO lança
// erro — devolve `{ ok: false, motivo }` para aquele item específico, sem
// interromper o restante do lote.

import MAPEAMENTO_USUARIOS from '../../utils/mapeamentoUsuarios';
import MAPEAMENTO_GRUPOS_PERMISSOES from '../../utils/mapeamentoGruposPermissoes';
import { encontrarPorNomeExato } from '../shared/keycloakHelpers';
import {
  montarPayloadNovoUsuario,
  extrairNomesRolesRealm,
  extrairRolesPorCliente,
  extrairNomesGrupos,
  clonarUsuariosEmLote,
  normalizarUsername,
} from '../shared/clonagemUsuarioKeycloak';

const { USUARIOS } = MAPEAMENTO_USUARIOS;
const { GRUPOS, ROLES_REALM, ROLES_CLIENTE } = MAPEAMENTO_GRUPOS_PERMISSOES;

/** Tamanho de página usado nas buscas/listagens — realm pequeno, uma página cobre tudo. */
const MAX_REGISTROS = 1000;

/**
 * Senha temporária fixa do modo em lote — sempre criada com `temporary: true`
 * (mecanismo nativo do Keycloak para forçar troca no primeiro login), nunca gerada
 * aleatoriamente nem pedida por item da lista. Não se aplica ao modo de execução
 * única (`--env`), que continua recebendo `novaSenha` explicitamente.
 */
const SENHA_TEMPORARIA_LOTE = 'Automacao@123';

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
 * @description Resolve, em HML, o UUID interno de um client pelo `clientId`
 * público, sem lançar erro se não existir (diferente de `cy.buscarUuidClienteKeycloak`,
 * usado por Grupos e Permissões) — quem chama decide o que fazer com `null`, para
 * permitir tanto o modo único (lança erro) quanto o modo em lote (segue para o
 * próximo item do lote).
 * @param {string} clientId - clientId público do client.
 * @returns {Cypress.Chainable<string|null>}
 */
const buscarUuidClienteEmHmlOuNulo = (clientId) =>
  cy
    .executarRequest2('keycloak', `${ROLES_CLIENTE.urlClientes}?clientId=${encodeURIComponent(clientId)}`)
    .then((resposta) => (resposta.body || [])[0]?.id ?? null);

/**
 * @description Todas as resoluções (`resolverRolesRealmEmHml`,
 * `resolverRolesClienteEmHml`, `resolverGruposEmHml`) e a checagem de clonagem
 * (`executarClonagem`) devolvem esse formato — `{ ok: true, valor }` em caso de
 * sucesso, `{ ok: false, motivo }` na primeira "dúvida bloqueante" encontrada —
 * em vez de lançar erro diretamente, para que o modo em lote (`clonarUsuariosEmLote`)
 * consiga continuar processando o restante do lote quando um item específico cai
 * num desses casos. `cy.clonarUsuarioKeycloak` (modo único) converte `ok: false`
 * em `throw`, preservando o comportamento original desse comando.
 */

/**
 * @description Resolve, em HML, as representações completas das realm roles do
 * usuário de origem. Para na primeira role sem correspondente em HML — clonagem de
 * usuário nunca cria role faltante.
 * @param {Array<string>} nomesRoles - Nomes das realm roles do usuário de origem.
 * @returns {Cypress.Chainable<{ok: boolean, motivo?: string, valor?: Array<object>}>}
 */
const resolverRolesRealmEmHml = (nomesRoles) =>
  nomesRoles.reduce(
    (cadeia, nome) =>
      cadeia.then((acumulado) => {
        if (!acumulado.ok) {
          return acumulado;
        }

        return buscarRoleRealmEmHml(nome).then((role) => {
          if (!role) {
            return {
              ok: false,
              motivo: `Realm role "${nome}" do usuário de origem não existe em HML — sincronize Grupos e Permissões antes de clonar, ou confirme o nome.`,
            };
          }
          return { ok: true, valor: [...acumulado.valor, role] };
        });
      }),
    cy.wrap({ ok: true, valor: [] }, { log: false }),
  );

/**
 * @description Resolve, em HML, as representações completas das client roles do
 * usuário de origem, agrupadas por client (UUID resolvido em HML via
 * `buscarUuidClienteEmHmlOuNulo`). Para na primeira role — ou no primeiro client —
 * sem correspondente em HML.
 * @param {Array<{clientId: string, nomesRoles: Array<string>}>} rolesPorCliente - Client roles do usuário de origem, por client.
 * @returns {Cypress.Chainable<{ok: boolean, motivo?: string, valor?: Array<{clienteUuidHml: string, roles: Array<object>}>}>}
 */
const resolverRolesClienteEmHml = (rolesPorCliente) =>
  rolesPorCliente.reduce(
    (cadeia, { clientId, nomesRoles }) =>
      cadeia.then((acumulado) => {
        if (!acumulado.ok) {
          return acumulado;
        }

        return buscarUuidClienteEmHmlOuNulo(clientId).then((clienteUuidHml) => {
          if (!clienteUuidHml) {
            return {
              ok: false,
              motivo: `Client "${clientId}" do usuário de origem não existe em HML — sincronize Grupos e Permissões antes de clonar, ou confirme o nome.`,
            };
          }

          const urlRolesClienteHml = `${ROLES_CLIENTE.urlClientes}/${clienteUuidHml}/roles`;

          return nomesRoles
            .reduce(
              (cadeiaInterna, nome) =>
                cadeiaInterna.then((rolesAcumuladas) => {
                  if (!rolesAcumuladas.ok) {
                    return rolesAcumuladas;
                  }

                  return cy
                    .executarRequest2(
                      'keycloak',
                      `${urlRolesClienteHml}?first=0&max=${MAX_REGISTROS}&search=${encodeURIComponent(nome)}`,
                    )
                    .then((resposta) => {
                      const role = encontrarPorNomeExato(resposta.body, nome);

                      if (!role) {
                        return {
                          ok: false,
                          motivo: `Client role "${nome}" do client "${clientId}" do usuário de origem não existe em HML — sincronize Grupos e Permissões antes de clonar, ou confirme o nome.`,
                        };
                      }

                      return { ok: true, valor: [...rolesAcumuladas.valor, role] };
                    });
                }),
              cy.wrap({ ok: true, valor: [] }, { log: false }),
            )
            .then((rolesResolvidas) => {
              if (!rolesResolvidas.ok) {
                return rolesResolvidas;
              }
              return { ok: true, valor: [...acumulado.valor, { clienteUuidHml, roles: rolesResolvidas.valor }] };
            });
        });
      }),
    cy.wrap({ ok: true, valor: [] }, { log: false }),
  );

/**
 * @description Resolve, em HML, os ids dos grupos a que o usuário de origem
 * pertence, por nome exato. Para no primeiro grupo sem correspondente em HML —
 * clonagem de usuário nunca cria grupo faltante.
 * @param {Array<string>} nomesGrupos - Nomes dos grupos do usuário de origem.
 * @returns {Cypress.Chainable<{ok: boolean, motivo?: string, valor?: Array<string>}>}
 */
const resolverGruposEmHml = (nomesGrupos) =>
  nomesGrupos.reduce(
    (cadeia, nome) =>
      cadeia.then((acumulado) => {
        if (!acumulado.ok) {
          return acumulado;
        }

        return buscarGrupoEmHml(nome).then((grupo) => {
          if (!grupo) {
            return {
              ok: false,
              motivo: `Grupo "${nome}" do usuário de origem não existe em HML — sincronize Grupos e Permissões antes de clonar, ou confirme o nome.`,
            };
          }
          return { ok: true, valor: [...acumulado.valor, grupo.id] };
        });
      }),
    cy.wrap({ ok: true, valor: [] }, { log: false }),
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
 * @param {boolean} [temporary=false] - Repassado a `montarPayloadNovoUsuario` (ver descrição lá) — `true` só no modo em lote.
 * @returns {Cypress.Chainable<{id: string, username: string}>}
 */
const criarUsuarioEAtribuir = (origem, novoUsername, novaSenha, { realmRolesHml, clienteRolesHml, grupoIdsHml }, temporary = false) => {
  const payload = montarPayloadNovoUsuario(origem, novoUsername, novaSenha, temporary);

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
 * @description Executa a checagem + clonagem completa de um usuário (usada pelos
 * dois modos, único e em lote): busca o usuário de origem em PROD, checa conflito
 * de username em HML (o email nunca é copiado do usuário de origem — é sempre
 * gerado único, não tem mais como colidir), resolve roles/grupos em HML e cria o
 * novo usuário — nunca lança erro diretamente; toda "dúvida bloqueante" (usuário de
 * origem não encontrado, role/grupo sem correspondente em HML, conflito de
 * username) volta como `{ ok: false, motivo }`, para que o modo em lote possa
 * seguir para o próximo item. `cy.clonarUsuarioKeycloak` (modo único) converte isso
 * em `throw`.
 * @param {{usuarioOrigem: string, novoUsername: string, novaSenha: string, temporary?: boolean}} params
 * @returns {Cypress.Chainable<{ok: boolean, motivo?: string, valor?: {id: string, username: string}}>}
 */
const executarClonagem = ({ usuarioOrigem, novoUsername, novaSenha, temporary = false }) => {
  const usuarioOrigemNormalizado = normalizarUsername(usuarioOrigem);
  const novoUsernameNormalizado = normalizarUsername(novoUsername);

  return cy.buscarUsuarioKeycloakPorUsername('keycloakProd', usuarioOrigemNormalizado).then((origem) => {
    if (!origem) {
      return {
        ok: false,
        motivo: `Usuário de origem "${usuarioOrigemNormalizado}" não encontrado em produção (realm multiplicacapital).`,
      };
    }

    return cy.buscarUsuarioKeycloakPorUsername('keycloak', novoUsernameNormalizado).then((conflitoUsername) => {
      if (conflitoUsername) {
        return { ok: false, motivo: `Já existe um usuário com o username "${novoUsernameNormalizado}" em HML — escolha outro username.` };
      }

      return buscarDadosDoUsuarioDeOrigem(origem.id).then(({ nomesRolesRealm, rolesPorCliente, nomesGrupos }) => {
        cy.logExecucao(
          `[clonarUsuarioKeycloak] Usuário de origem "${usuarioOrigemNormalizado}": ${nomesRolesRealm.length} realm role(s), ${rolesPorCliente.length} client(s) com role(s), ${nomesGrupos.length} grupo(s).`,
        );

        return resolverRolesRealmEmHml(nomesRolesRealm).then((realmResultado) => {
          if (!realmResultado.ok) {
            return realmResultado;
          }

          return resolverRolesClienteEmHml(rolesPorCliente).then((clienteResultado) => {
            if (!clienteResultado.ok) {
              return clienteResultado;
            }

            return resolverGruposEmHml(nomesGrupos).then((gruposResultado) => {
              if (!gruposResultado.ok) {
                return gruposResultado;
              }

              return criarUsuarioEAtribuir(
                origem,
                novoUsernameNormalizado,
                novaSenha,
                {
                  realmRolesHml: realmResultado.valor,
                  clienteRolesHml: clienteResultado.valor,
                  grupoIdsHml: gruposResultado.valor,
                },
                temporary,
              ).then((criado) => ({ ok: true, valor: criado }));
            });
          });
        });
      });
    });
  });
};

/**
 * @description Clona um usuário do Keycloak de PRODUÇÃO para HML, com novo
 * username/senha — mantendo o resto igual (realm roles, client roles de todos os
 * clients, grupos e atributos/nome/enabled/emailVerified/requiredActions). O email
 * é sempre gerado, inválido/não-real e único — nunca copiado do usuário de origem.
 * Nunca escreve em PROD (só GET, via `keycloakProd`) nem decide sozinho diante de
 * ambiguidade (ver módulo acima) — qualquer dúvida bloqueante lança erro descritivo,
 * interrompendo a clonagem (comportamento inalterado do modo de execução única).
 * @param {{usuarioOrigem: string, novoUsername: string, novaSenha: string}} params - Username de origem em PROD, e novo username/senha para HML.
 * @returns {Cypress.Chainable<{id: string, username: string}>} O novo usuário criado em HML (sem senha).
 */
Cypress.Commands.add('clonarUsuarioKeycloak', ({ usuarioOrigem, novoUsername, novaSenha }) =>
  executarClonagem({ usuarioOrigem, novoUsername, novaSenha, temporary: false }).then((resultado) => {
    if (!resultado.ok) {
      throw new Error(`[clonarUsuarioKeycloak] ${resultado.motivo} Clonagem interrompida.`);
    }

    return cy
      .logExecucao(
        `[clonarUsuarioKeycloak] Usuário "${resultado.valor.username}" criado em HML com sucesso (a partir de "${normalizarUsername(usuarioOrigem)}").`,
      )
      .then(() => resultado.valor);
  }),
);

/**
 * @description Clona, numa única execução, todos os usuários de um mapa
 * `usuarioProd: usuarioHml` (ex.: `cypress/fixtures/usuariosParaClonar.json`) —
 * complementa o modo de execução única (`cy.clonarUsuarioKeycloak`), reaproveitando
 * integralmente a mesma lógica de clonagem (`executarClonagem`), sem duplicá-la.
 * Todo usuário criado pelo lote recebe a senha temporária fixa
 * `SENHA_TEMPORARIA_LOTE`, com `temporary: true` (troca obrigatória no primeiro
 * login) — nunca senha aleatória, nunca pedida por item.
 *
 * Um item que cair numa "dúvida bloqueante" (usuário de origem não encontrado,
 * role/grupo sem correspondente em HML, conflito de username em HML) **não**
 * interrompe o lote — vira um resultado `{ ok: false, motivo }` na lista final e o
 * processamento segue para o próximo item.
 * @param {Object<string,string>} mapaUsuarios - Mapa `usuarioProd: usuarioHml` a clonar.
 * @returns {Cypress.Chainable<Array<{usuarioProd: string, usuarioHml: string, ok: boolean, motivo?: string, valor?: {id: string, username: string}}>>}
 */
Cypress.Commands.add('clonarUsuariosKeycloakEmLote', (mapaUsuarios) => {
  const itens = Object.keys(mapaUsuarios ?? {});

  if (!itens.length) {
    throw new Error(
      '[clonarUsuariosKeycloakEmLote] Fixture de usuários para clonar em lote está vazia — popule cypress/fixtures/usuariosParaClonar.json antes de rodar.',
    );
  }

  return clonarUsuariosEmLote(
    mapaUsuarios,
    (usuarioProd, usuarioHml) =>
      executarClonagem({
        usuarioOrigem: usuarioProd,
        novoUsername: usuarioHml,
        novaSenha: SENHA_TEMPORARIA_LOTE,
        temporary: true,
      }),
    cy.wrap([], { log: false }),
  ).then((resultados) => {
    const sucesso = resultados.filter((resultado) => resultado.ok);
    const bloqueados = resultados.filter((resultado) => !resultado.ok);
    const detalheBloqueados = bloqueados
      .map(({ usuarioProd, usuarioHml, motivo }) => `  - "${usuarioProd}" -> "${usuarioHml}": ${motivo}`)
      .join('\n');

    return cy
      .logExecucao(
        `[clonarUsuariosKeycloakEmLote] ${sucesso.length}/${resultados.length} usuário(s) clonado(s) com sucesso.` +
          (bloqueados.length ? `\n${bloqueados.length} com dúvida bloqueante:\n${detalheBloqueados}` : ''),
      )
      .then(() => resultados);
  });
});
