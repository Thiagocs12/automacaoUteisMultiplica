import { Given, When, Then } from '@badeball/cypress-cucumber-preprocessor';
import MAPEAMENTO_GRUPOS_PERMISSOES from '../../utils/mapeamentoGruposPermissoes';

const { GRUPOS, ROLES_REALM, ROLES_CLIENTE } = MAPEAMENTO_GRUPOS_PERMISSOES;

Given('que possuo acesso aos ambientes de Keycloak necessarios', () => {
  cy.verificarTokens('keycloakProd');
  cy.verificarTokens('keycloak');
});

// function (não arrow): precisa do `this` do Mocha para poder pular o cenário
// via `this.skip()` sem quebrar a pipeline quando não há nada a sincronizar.
Given(
  'uma consulta aos grupos e roles do Keycloak de produção é realizada para obter os dados atuais',
  function () {
    // Reverifica: o login do passo anterior já pode ter consumido boa parte
    // dos ~60s de vida do token (às vezes os dois logins, PROD e HML, juntos).
    cy.verificarTokens('keycloakProd');
    cy.buscarGruposERolesDeProducao();
    cy.preencherIdsHmlPeloEstoque(MAPEAMENTO_GRUPOS_PERMISSOES);

    cy.lerJsonDeOutput(GRUPOS.nomeArquivo).then((grupos) => {
      return cy.lerJsonDeOutput(ROLES_REALM.nomeArquivo).then((rolesRealm) => {
        return cy.lerJsonDeOutput(ROLES_CLIENTE.nomeArquivo).then((rolesCliente) => {
          const possuiPendencia = [...(grupos ?? []), ...(rolesRealm ?? []), ...(rolesCliente ?? [])].some(
            (item) => item.idHml == null,
          );

          if (!possuiPendencia) {
            cy.logExecucao(
              '[Keycloak] Nenhum grupo/role novo encontrado em produção — não há nada a ser sincronizado. Cenário pulado.',
            );
            this.skip();
          }
        });
      });
    });
  },
);

// O access token de 'keycloak'/'keycloakProd' expira em segundos (ver
// `verificarTokens` em utils.js) — reverificar antes de cada fase (em vez de
// só uma vez no início) reduz a chance de o token vencer no meio do fluxo,
// mesmo sem eliminar o risco numa fase muito longa.
When('processo os grupos do Keycloak', () => {
  cy.verificarTokens('keycloak');
  cy.sincronizarGruposKeycloak();
});

When('processo as roles de realm do Keycloak', () => {
  cy.verificarTokens('keycloak');
  cy.sincronizarRolesRealmKeycloak();
});

When('processo as roles de client do Keycloak', () => {
  cy.verificarTokens('keycloak');
  cy.sincronizarRolesClienteKeycloak();
});

When('processo os vínculos entre grupos e roles do Keycloak', () => {
  cy.verificarTokens('keycloakProd');
  cy.verificarTokens('keycloak');
  cy.sincronizarRoleMappingsDosGrupos();
});

Then('os grupos, roles e vínculos do Keycloak estão copiados de produção para homologação', () => {
  cy.atualizarEstoqueIds(MAPEAMENTO_GRUPOS_PERMISSOES);
  cy.log('Todos os grupos, roles e vínculos do Keycloak foram sincronizados corretamente entre Produção e Homologação');
});
