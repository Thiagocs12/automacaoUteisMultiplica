import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  montarPayloadNovoUsuario,
  extrairNomesRolesRealm,
  extrairRolesPorCliente,
  extrairNomesGrupos,
} from '../clonagemUsuarioKeycloak.js';

const usuarioOrigem = {
  id: 'uuid-prod-1',
  username: 'fulano.prod',
  enabled: true,
  emailVerified: true,
  firstName: 'Fulano',
  lastName: 'da Silva',
  email: 'fulano@grupomultiplica.com.br',
  attributes: { idAnalista: ['123'], cargoPrincipal: ['ANALISTA'] },
  requiredActions: [],
};

test('montarPayloadNovoUsuario usa o novo username/senha, nunca os do usuário de origem', () => {
  const payload = montarPayloadNovoUsuario(usuarioOrigem, 'fulano.hml', 'SenhaForte123!');

  assert.equal(payload.username, 'fulano.hml');
  assert.notEqual(payload.username, usuarioOrigem.username);
  assert.deepEqual(payload.credentials, [{ type: 'password', value: 'SenhaForte123!', temporary: false }]);
});

test('montarPayloadNovoUsuario mantém atributos, nome, email e flags do usuário de origem', () => {
  const payload = montarPayloadNovoUsuario(usuarioOrigem, 'fulano.hml', 'SenhaForte123!');

  assert.equal(payload.enabled, usuarioOrigem.enabled);
  assert.equal(payload.emailVerified, usuarioOrigem.emailVerified);
  assert.equal(payload.firstName, usuarioOrigem.firstName);
  assert.equal(payload.lastName, usuarioOrigem.lastName);
  assert.equal(payload.email, usuarioOrigem.email);
  assert.deepEqual(payload.attributes, usuarioOrigem.attributes);
  assert.deepEqual(payload.requiredActions, usuarioOrigem.requiredActions);
  assert.equal(payload.id, undefined);
});

test('montarPayloadNovoUsuario preenche attributes/requiredActions vazios quando o usuário de origem não os tiver', () => {
  const payload = montarPayloadNovoUsuario({ ...usuarioOrigem, attributes: undefined, requiredActions: undefined }, 'fulano.hml', 'x');

  assert.deepEqual(payload.attributes, {});
  assert.deepEqual(payload.requiredActions, []);
});

test('extrairNomesRolesRealm extrai os nomes das realm roles de GET /users/{id}/role-mappings', () => {
  const roleMappings = {
    realmMappings: [{ id: 'r1', name: 'OPERADOR' }, { id: 'r2', name: 'ANALISTA' }],
    clientMappings: {},
  };

  assert.deepEqual(extrairNomesRolesRealm(roleMappings), ['OPERADOR', 'ANALISTA']);
});

test('extrairNomesRolesRealm retorna vazio quando não há realmMappings', () => {
  assert.deepEqual(extrairNomesRolesRealm({}), []);
  assert.deepEqual(extrairNomesRolesRealm(undefined), []);
});

test('extrairRolesPorCliente cobre TODOS os clients em que o usuário tem role, não só um client fixo', () => {
  const roleMappings = {
    realmMappings: [],
    clientMappings: {
      'cypress-uteis-automation': { id: 'cliente-uuid-1', client: 'cypress-uteis-automation', mappings: [{ name: 'ADMIN' }] },
      'mc-cadastro-ms': { id: 'cliente-uuid-2', client: 'mc-cadastro-ms', mappings: [{ name: 'BKO_FOR_CEDENTE' }, { name: 'GESTOR' }] },
    },
  };

  assert.deepEqual(extrairRolesPorCliente(roleMappings), [
    { clientId: 'cypress-uteis-automation', nomesRoles: ['ADMIN'] },
    { clientId: 'mc-cadastro-ms', nomesRoles: ['BKO_FOR_CEDENTE', 'GESTOR'] },
  ]);
});

test('extrairRolesPorCliente retorna vazio quando não há clientMappings', () => {
  assert.deepEqual(extrairRolesPorCliente({}), []);
  assert.deepEqual(extrairRolesPorCliente(undefined), []);
});

test('extrairNomesGrupos extrai os nomes dos grupos de GET /users/{id}/groups', () => {
  const grupos = [{ id: 'g1', name: 'OPERADORES', path: '/OPERADORES' }, { id: 'g2', name: 'GESTORES', path: '/GESTORES' }];

  assert.deepEqual(extrairNomesGrupos(grupos), ['OPERADORES', 'GESTORES']);
});

test('extrairNomesGrupos retorna vazio quando o usuário não pertence a nenhum grupo', () => {
  assert.deepEqual(extrairNomesGrupos([]), []);
  assert.deepEqual(extrairNomesGrupos(undefined), []);
});

test('cenário completo: usuário com realm role + client role + grupo é extraído corretamente para a clonagem', () => {
  const roleMappingsOrigem = {
    realmMappings: [{ name: 'OPERADOR' }],
    clientMappings: {
      'mc-cadastro-ms': { id: 'cliente-uuid', client: 'mc-cadastro-ms', mappings: [{ name: 'BKO_FOR_CEDENTE' }] },
    },
  };
  const gruposOrigem = [{ id: 'g1', name: 'OPERADORES' }];

  const nomesRolesRealm = extrairNomesRolesRealm(roleMappingsOrigem);
  const rolesPorCliente = extrairRolesPorCliente(roleMappingsOrigem);
  const nomesGrupos = extrairNomesGrupos(gruposOrigem);
  const payload = montarPayloadNovoUsuario(usuarioOrigem, 'fulano.hml', 'SenhaForte123!');

  assert.deepEqual(nomesRolesRealm, ['OPERADOR']);
  assert.deepEqual(rolesPorCliente, [{ clientId: 'mc-cadastro-ms', nomesRoles: ['BKO_FOR_CEDENTE'] }]);
  assert.deepEqual(nomesGrupos, ['OPERADORES']);
  assert.equal(payload.username, 'fulano.hml');
});
