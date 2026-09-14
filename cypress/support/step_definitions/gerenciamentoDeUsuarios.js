// arquivo: gerenciamentoDeUsuarios.js
//
// Steps da clonagem de usuário do Keycloak (PROD -> HML), nos dois modos:
//
// - Único (`@keycloakUsuario`), parametrizado a cada execução via `cypress run
//   --env` — não uma lista fixa nem um script de uso único (mesmo padrão de
//   parametrização de `Cypress.env(...)` já usado no projeto, ex.:
//   `KEYCLOAK_CLIENT_ID` em `commands/gruposPermissoes.js`):
//
//     npx cypress run --env tags=@keycloakUsuario,usuarioOrigem=fulano,novoUsername=fulano.hml,novaSenha=SenhaForte123!
//
// - Em lote (`@clonarUsuariosEmLote`), lendo o mapa `usuarioProd: usuarioHml` do
//   fixture `cypress/fixtures/usuariosParaClonar.json` (populado antes de rodar):
//
//     npx cypress run --env tags=@clonarUsuariosEmLote

import { Given, When, Then } from '@badeball/cypress-cucumber-preprocessor';

let usuarioClonado = null;
let resultadosLote = [];

Given('que possuo acesso aos ambientes de Keycloak necessarios para usuários', () => {
  cy.verificarTokens('keycloakProd');
  cy.verificarTokens('keycloak');
});

When('clono o usuário de produção informado via parâmetros de execução para homologação', () => {
  const usuarioOrigem = Cypress.env('usuarioOrigem');
  const novoUsername = Cypress.env('novoUsername');
  const novaSenha = Cypress.env('novaSenha');

  if (!usuarioOrigem || !novoUsername || !novaSenha) {
    throw new Error(
      '[gerenciamentoDeUsuarios] Informe usuarioOrigem, novoUsername e novaSenha via --env, ex.: ' +
        'cypress run --env tags=@keycloakUsuario,usuarioOrigem=fulano,novoUsername=fulano.hml,novaSenha=SenhaForte123!',
    );
  }

  // Reverifica: o login do passo anterior já pode ter consumido boa parte dos ~60s
  // de vida do token (às vezes os dois logins, PROD e HML, juntos).
  cy.verificarTokens('keycloakProd');
  cy.verificarTokens('keycloak');

  cy.clonarUsuarioKeycloak({ usuarioOrigem, novoUsername, novaSenha }).then((criado) => {
    usuarioClonado = criado;
  });
});

Then('o novo usuário está criado em homologação com as mesmas roles, grupos e atributos do usuário de origem', () => {
  expect(usuarioClonado, 'usuário clonado').to.not.be.null;
  expect(usuarioClonado.username).to.equal(Cypress.env('novoUsername'));
  cy.log(`Usuário "${usuarioClonado.username}" clonado com sucesso para HML (id: ${usuarioClonado.id}).`);
});

When('clono os usuários do fixture de lote para homologação', () => {
  cy.verificarTokens('keycloakProd');
  cy.verificarTokens('keycloak');

  cy.fixture('usuariosParaClonar.json').then((mapaUsuarios) => {
    // Reverifica: os logins acima já podem ter consumido boa parte da vida do
    // token, e o lote pode levar bem mais tempo que uma clonagem única.
    cy.verificarTokens('keycloakProd');
    cy.verificarTokens('keycloak');

    cy.clonarUsuariosKeycloakEmLote(mapaUsuarios).then((resultados) => {
      resultadosLote = resultados;
    });
  });
});

Then('cada usuário do lote foi clonado com sucesso ou gerou uma dúvida bloqueante registrada', () => {
  expect(resultadosLote, 'resultados do lote').to.have.length.greaterThan(0);

  resultadosLote.forEach(({ usuarioProd, usuarioHml, ok, motivo }) => {
    expect(ok || Boolean(motivo), `item "${usuarioProd}" -> "${usuarioHml}" sem resultado nem motivo`).to.be.true;
  });

  const sucesso = resultadosLote.filter((resultado) => resultado.ok).length;
  cy.log(`Lote processado: ${sucesso}/${resultadosLote.length} usuário(s) clonado(s) com sucesso.`);
});
