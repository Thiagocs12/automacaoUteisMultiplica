// arquivo: gruposPermissoes.js
//
// Sincronização de Grupos e Permissões (roles) do Keycloak, PROD -> HML.
// Diferente de Produtos/Esteiras, este domínio NÃO usa o pipeline genérico de
// `sincronizacaoNivel.js`: grupos e roles são localizados em HML por busca
// textual (`?search=nome`, que faz correspondência PARCIAL — o resultado
// precisa ser filtrado pelo nome exato) e criados quando a busca não encontra
// nada; o vínculo grupo -> role não usa um endpoint de "role-mappings" à
// parte — vem embutido na representação completa do grupo (`GET
// /groups/{id}`, campos `realmRoles: string[]` e `clientRoles: {[clientId]:
// string[]}`), que é a mesma forma usada para atribuir (POST
// `/groups/{id}/role-mappings/realm|clients/{uuid}` com a representação
// completa da role, não só `{id, name}`).
//
// Ambientes: 'keycloakProd' (leitura, bloqueado para escrita — ver
// producaoSomenteLeitura.js) e 'keycloak' (HML, leitura e escrita). O token
// desses dois ambientes é obtido sob demanda a cada requisição (ver
// `obterTokenKeycloak` em `apiCommands.js`) — não há UI/cache aqui.

import MAPEAMENTO_GRUPOS_PERMISSOES from '../../utils/mapeamentoGruposPermissoes';
import { encontrarPorNomeExato, calcularNomesFaltantes } from '../shared/keycloakHelpers';

const { GRUPOS, ROLES_REALM, ROLES_CLIENTE } = MAPEAMENTO_GRUPOS_PERMISSOES;

/** Tamanho de página usado nas buscas/listagens — realm pequeno, uma página cobre tudo. */
const MAX_REGISTROS = 1000;

/**
 * @description Resolve o UUID interno de um client a partir do seu `clientId`
 * (identificador público, o mesmo em PROD e HML — diferente do UUID interno,
 * que é gerado por ambiente).
 * @param {'keycloak'|'keycloakProd'} ambiente - Ambiente Keycloak consultado.
 * @param {string} clientId - clientId público do client.
 * @returns {Cypress.Chainable<string>}
 */
Cypress.Commands.add('buscarUuidClienteKeycloak', (ambiente, clientId) => {
  return cy
    .executarRequest2(ambiente, `${ROLES_CLIENTE.urlClientes}?clientId=${encodeURIComponent(clientId)}`)
    .then((resposta) => {
      const cliente = (resposta.body || [])[0];

      if (!cliente?.id) {
        throw new Error(
          `[buscarUuidClienteKeycloak] Client "${clientId}" não encontrado no ambiente "${ambiente}".`,
        );
      }

      return cliente.id;
    });
});

/**
 * @description Consulta os dados atuais de produção (grupos, realm roles e
 * roles do client configurado em `KEYCLOAK_CLIENT_ID`) e grava em
 * `cypress/output/GruposPermissoes/`, no formato `{ id, name, ..., idHml: null }`
 * usado pelo restante do fluxo (compatível com `preencherIdsHmlPeloEstoque`/
 * `atualizarEstoqueIds`, que só exigem `id`/`idHml` no primeiro nível).
 * @returns {Cypress.Chainable<void>}
 */
Cypress.Commands.add('buscarGruposERolesDeProducao', () => {
  const clientId = Cypress.env('KEYCLOAK_CLIENT_ID');

  cy.executarRequest2('keycloakProd', `${GRUPOS.urlGrupos}?max=${MAX_REGISTROS}`).then((resposta) => {
    const paraSalvar = (resposta.body || []).map((grupo) => ({
      id: grupo.id,
      name: grupo.name,
      description: grupo.description,
      idHml: null,
    }));
    cy.logExecucao(`[buscarGruposERolesDeProducao] GRUPOS: ${paraSalvar.length} grupo(s) em produção`);
    cy.task('escreverJson', { caminhoArquivo: `cypress/output/${GRUPOS.nomeArquivo}`, conteudo: paraSalvar });
  });

  cy.executarRequest2('keycloakProd', `${ROLES_REALM.urlRoles}?max=${MAX_REGISTROS}`).then((resposta) => {
    const paraSalvar = (resposta.body || []).map((role) => ({
      id: role.id,
      name: role.name,
      description: role.description,
      idHml: null,
    }));
    cy.logExecucao(`[buscarGruposERolesDeProducao] ROLES_REALM: ${paraSalvar.length} role(s) em produção`);
    cy.task('escreverJson', { caminhoArquivo: `cypress/output/${ROLES_REALM.nomeArquivo}`, conteudo: paraSalvar });
  });

  cy.buscarUuidClienteKeycloak('keycloakProd', clientId)
    .then((clienteUuid) =>
      cy.executarRequest2('keycloakProd', `${ROLES_CLIENTE.urlClientes}/${clienteUuid}/roles?max=${MAX_REGISTROS}`),
    )
    .then((resposta) => {
      const paraSalvar = (resposta.body || []).map((role) => ({
        id: role.id,
        name: role.name,
        description: role.description,
        idHml: null,
      }));
      cy.logExecucao(`[buscarGruposERolesDeProducao] ROLES_CLIENTE: ${paraSalvar.length} role(s) em produção`);
      cy.task('escreverJson', { caminhoArquivo: `cypress/output/${ROLES_CLIENTE.nomeArquivo}`, conteudo: paraSalvar });
    });
});

/**
 * @description Para um grupo pendente (sem `idHml`), pesquisa em HML por nome
 * exato (a busca `?search=` é parcial — o resultado é filtrado); se não
 * existir, cria e trata `409` (grupo já existe) como sucesso, buscando o id
 * existente em seguida.
 * @param {{id: string, name: string}} grupo - Grupo pendente de produção.
 * @param {Map<string, string>} idHmlPorId - Mapa acumulado de id de produção -> idHml resolvido nesta execução.
 * @returns {Cypress.Chainable<void>}
 */
const resolverOuCriarGrupoEmHml = (grupo, idHmlPorId) => {
  const urlBusca = `${GRUPOS.urlGrupos}?search=${encodeURIComponent(grupo.name)}&max=${MAX_REGISTROS}`;

  return cy.executarRequest2('keycloak', urlBusca).then((resposta) => {
    const existente = encontrarPorNomeExato(resposta.body, grupo.name);

    if (existente) {
      idHmlPorId.set(grupo.id, existente.id);
      return;
    }

    return cy
      .executarRequest2(
        'keycloak',
        `${GRUPOS.urlGrupos}/`,
        { name: grupo.name, description: grupo.description },
        'POST',
        false,
      )
      .then((resultado) => {
        const jaExiste = resultado.status === 409;

        if (!jaExiste && (resultado.status < 200 || resultado.status >= 300)) {
          throw new Error(
            `[sincronizarGruposKeycloak] Falha ao criar grupo "${grupo.name}": ${resultado.status} - ${JSON.stringify(resultado.body)}`,
          );
        }

        if (jaExiste) {
          cy.logExecucao(`[sincronizarGruposKeycloak] Grupo "${grupo.name}" já existe em HML — ignorando.`);
        }

        return cy.executarRequest2('keycloak', urlBusca).then((resp) => {
          const criado = encontrarPorNomeExato(resp.body, grupo.name);

          if (!criado) {
            throw new Error(
              `[sincronizarGruposKeycloak] Grupo "${grupo.name}" criado, mas não encontrado na busca em seguida.`,
            );
          }

          idHmlPorId.set(grupo.id, criado.id);
        });
      });
  });
};

/**
 * @description Sincroniza os grupos pendentes (`idHml === null`) do arquivo de
 * output de produção: pesquisa por nome em HML e cria os que faltarem. Grava
 * o `idHml` resolvido de volta no arquivo ao final (uma única leitura +
 * escrita).
 * @returns {Cypress.Chainable<void>}
 */
Cypress.Commands.add('sincronizarGruposKeycloak', () => {
  cy.lerJsonDeOutput(GRUPOS.nomeArquivo).then((grupos) => {
    const todos = grupos ?? [];
    const pendentes = todos.filter((grupo) => grupo.idHml == null);

    cy.logExecucao(`[sincronizarGruposKeycloak] ${pendentes.length} grupo(s) pendente(s) de vínculo/criação em HML`);

    if (!pendentes.length) return;

    const idHmlPorId = new Map();

    pendentes
      .reduce((cadeia, grupo) => cadeia.then(() => resolverOuCriarGrupoEmHml(grupo, idHmlPorId)), cy.wrap(null, { log: false }))
      .then(() => {
        const atualizado = todos.map((grupo) => ({
          ...grupo,
          idHml: idHmlPorId.get(grupo.id) ?? grupo.idHml ?? null,
        }));

        cy.task('escreverJson', { caminhoArquivo: `cypress/output/${GRUPOS.nomeArquivo}`, conteudo: atualizado });
      });
  });
});

/**
 * @description Sincroniza roles pendentes (`idHml === null`) de um arquivo de
 * output: pesquisa por nome em HML (busca parcial, filtrada pelo nome exato) e
 * cria as que faltarem, tratando `409` como sucesso.
 * @param {string} nomeArquivo - Arquivo de output (`entidade.nomeArquivo`) com as roles de produção.
 * @param {(nome: string) => string} montarUrlBusca - Monta a URL de busca (`?search=...`) por nome.
 * @param {string} urlCriacao - URL de criação (POST) das roles.
 * @returns {Cypress.Chainable<void>}
 */
const sincronizarRolesPendentes = (nomeArquivo, montarUrlBusca, urlCriacao) => {
  return cy.lerJsonDeOutput(nomeArquivo).then((roles) => {
    const todas = roles ?? [];
    const pendentes = todas.filter((role) => role.idHml == null);

    cy.logExecucao(`[sincronizarRolesPendentes] ${nomeArquivo}: ${pendentes.length} role(s) pendente(s)`);

    if (!pendentes.length) return;

    const idHmlPorId = new Map();

    pendentes
      .reduce((cadeia, role) => {
        return cadeia.then(() =>
          cy.executarRequest2('keycloak', montarUrlBusca(role.name)).then((resposta) => {
            const existente = encontrarPorNomeExato(resposta.body, role.name);

            if (existente) {
              idHmlPorId.set(role.id, existente.id);
              return;
            }

            return cy
              .executarRequest2(
                'keycloak',
                urlCriacao,
                { name: role.name, description: role.description, attributes: {} },
                'POST',
                false,
              )
              .then((resultado) => {
                const jaExiste = resultado.status === 409;

                if (!jaExiste && (resultado.status < 200 || resultado.status >= 300)) {
                  throw new Error(
                    `[sincronizarRolesPendentes] Falha ao criar role "${role.name}": ${resultado.status} - ${JSON.stringify(resultado.body)}`,
                  );
                }

                if (jaExiste) {
                  cy.logExecucao(`[sincronizarRolesPendentes] Role "${role.name}" já existe em HML — ignorando.`);
                }

                return cy.executarRequest2('keycloak', montarUrlBusca(role.name)).then((resp) => {
                  const criada = encontrarPorNomeExato(resp.body, role.name);

                  if (!criada) {
                    throw new Error(
                      `[sincronizarRolesPendentes] Role "${role.name}" criada, mas não encontrada na busca em seguida.`,
                    );
                  }

                  idHmlPorId.set(role.id, criada.id);
                });
              });
          }),
        );
      }, cy.wrap(null, { log: false }))
      .then(() => {
        const atualizado = todas.map((role) => ({
          ...role,
          idHml: idHmlPorId.get(role.id) ?? role.idHml ?? null,
        }));

        cy.task('escreverJson', { caminhoArquivo: `cypress/output/${nomeArquivo}`, conteudo: atualizado });
      });
  });
};

/** @description Sincroniza as realm roles pendentes de produção para HML. */
Cypress.Commands.add('sincronizarRolesRealmKeycloak', () => {
  return sincronizarRolesPendentes(
    ROLES_REALM.nomeArquivo,
    (nome) => `${ROLES_REALM.urlRoles}?first=0&max=${MAX_REGISTROS}&search=${encodeURIComponent(nome)}`,
    ROLES_REALM.urlRoles,
  );
});

/**
 * @description Sincroniza as roles pendentes do client configurado
 * (`KEYCLOAK_CLIENT_ID`) de produção para HML, resolvendo antes o UUID do
 * client em HML (pode diferir do UUID em produção).
 * @returns {Cypress.Chainable<void>}
 */
Cypress.Commands.add('sincronizarRolesClienteKeycloak', () => {
  const clientId = Cypress.env('KEYCLOAK_CLIENT_ID');

  return cy.buscarUuidClienteKeycloak('keycloak', clientId).then((clienteUuidHml) => {
    const urlRolesCliente = `${ROLES_CLIENTE.urlClientes}/${clienteUuidHml}/roles`;

    return sincronizarRolesPendentes(
      ROLES_CLIENTE.nomeArquivo,
      (nome) => `${urlRolesCliente}?first=0&max=${MAX_REGISTROS}&search=${encodeURIComponent(nome)}`,
      urlRolesCliente,
    );
  });
});

/**
 * @description Busca em HML, por nome exato, a representação completa de uma
 * role (necessária para o corpo de `role-mappings`, que exige a role inteira,
 * não só `{id, name}`) — sempre uma busca fresca, nunca cacheada: o `idHml` de
 * uma role pode ter vindo do estoque de ids de uma execução anterior (sem
 * passar pela busca desta rodada), então não dá pra confiar em nenhum valor
 * lido do arquivo de output além do nome.
 * @param {string} urlBase - URL base de listagem/criação de roles (realm ou de um client específico).
 * @param {string} nome - Nome da role.
 * @returns {Cypress.Chainable<object|null>}
 */
const buscarRepresentacaoRoleEmHml = (urlBase, nome) =>
  cy
    .executarRequest2('keycloak', `${urlBase}?first=0&max=${MAX_REGISTROS}&search=${encodeURIComponent(nome)}`)
    .then((resposta) => encontrarPorNomeExato(resposta.body, nome));

/**
 * @description Resolve, para uma lista de nomes de roles faltantes, suas
 * representações completas em HML (roles que ainda não existem lá — porque
 * ainda não foram sincronizadas — são ignoradas nesta rodada, com um log).
 * @param {string} urlBase - URL base de listagem/criação de roles (realm ou de um client específico).
 * @param {Array<string>} nomesFaltantes - Nomes das roles a resolver.
 * @returns {Cypress.Chainable<Array<object>>}
 */
const resolverRepresentacoesFaltantes = (urlBase, nomesFaltantes) =>
  nomesFaltantes.reduce(
    (cadeia, nome) =>
      cadeia.then((acumulado) =>
        buscarRepresentacaoRoleEmHml(urlBase, nome).then((representacao) => {
          if (!representacao) {
            cy.logExecucao(`[sincronizarRoleMappingsDosGrupos] Role "${nome}" ainda não existe em HML — pulando por ora.`);
            return acumulado;
          }
          return [...acumulado, representacao];
        }),
      ),
    cy.wrap([], { log: false }),
  );

/**
 * @description Para um grupo já vinculado (com `id` de produção e `idHml`),
 * compara as roles atribuídas a ele em PROD (`GET /groups/{id}` -> campos
 * `realmRoles`/`clientRoles`, embutidos na representação completa do grupo)
 * com as já atribuídas em HML, e atribui em HML as que estiverem faltando.
 * @param {{id: string, idHml: string}} grupo - Grupo já resolvido nos dois ambientes.
 * @param {string} urlRolesClienteHml - URL das roles do client configurado, em HML.
 * @param {string} clienteUuidHml - UUID do client configurado, em HML.
 * @param {string} clientId - clientId público do client configurado.
 * @returns {Cypress.Chainable<void>}
 */
const sincronizarRoleMappingsDoGrupo = (grupo, urlRolesClienteHml, clienteUuidHml, clientId) => {
  return cy
    .executarRequest2('keycloakProd', `${GRUPOS.urlGrupos}/${grupo.id}`)
    .then((respostaProd) =>
      cy.executarRequest2('keycloak', `${GRUPOS.urlGrupos}/${grupo.idHml}`).then((respostaHml) => ({
        prod: respostaProd.body,
        hml: respostaHml.body,
      })),
    )
    .then(({ prod, hml }) => {
      const nomesRealmFaltantes = calcularNomesFaltantes(prod.realmRoles, hml.realmRoles);
      const nomesClienteFaltantes = calcularNomesFaltantes(prod.clientRoles?.[clientId], hml.clientRoles?.[clientId]);

      return resolverRepresentacoesFaltantes(ROLES_REALM.urlRoles, nomesRealmFaltantes)
        .then((realmFaltantes) => {
          if (!realmFaltantes.length) return;
          return cy.executarRequest2('keycloak', `${GRUPOS.urlGrupos}/${grupo.idHml}/role-mappings/realm`, realmFaltantes, 'POST');
        })
        .then(() => resolverRepresentacoesFaltantes(urlRolesClienteHml, nomesClienteFaltantes))
        .then((clienteFaltantes) => {
          if (!clienteFaltantes.length) return;
          return cy.executarRequest2(
            'keycloak',
            `${GRUPOS.urlGrupos}/${grupo.idHml}/role-mappings/clients/${clienteUuidHml}`,
            clienteFaltantes,
            'POST',
          );
        });
    });
};

/**
 * @description Para todos os grupos já vinculados (grupo existe nos dois
 * ambientes), replica em HML as roles atribuídas a eles em produção que ainda
 * não estão atribuídas em HML.
 * @returns {Cypress.Chainable<void>}
 */
Cypress.Commands.add('sincronizarRoleMappingsDosGrupos', () => {
  const clientId = Cypress.env('KEYCLOAK_CLIENT_ID');

  cy.buscarUuidClienteKeycloak('keycloak', clientId).then((clienteUuidHml) => {
    const urlRolesClienteHml = `${ROLES_CLIENTE.urlClientes}/${clienteUuidHml}/roles`;

    cy.lerJsonDeOutput(GRUPOS.nomeArquivo).then((grupos) => {
      const vinculados = (grupos ?? []).filter((grupo) => grupo.idHml != null);

      cy.logExecucao(`[sincronizarRoleMappingsDosGrupos] ${vinculados.length} grupo(s) vinculado(s) a verificar`);

      vinculados.reduce(
        (cadeia, grupo) =>
          cadeia.then(() => sincronizarRoleMappingsDoGrupo(grupo, urlRolesClienteHml, clienteUuidHml, clientId)),
        cy.wrap(null, { log: false }),
      );
    });
  });
});
