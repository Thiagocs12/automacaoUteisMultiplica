import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  montarPayloadNovoUsuario,
  gerarEmailInvalidoUnico,
  extrairNomesRolesRealm,
  extrairRolesPorCliente,
  extrairNomesGrupos,
  clonarUsuariosEmLote,
  removerUsuariosClonadosComSucesso,
  normalizarUsername,
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

test('normalizarUsername sempre normaliza para minúsculas, qualquer combinação de case', () => {
  assert.equal(normalizarUsername('formalizacao.Automacao'), 'formalizacao.automacao');
  assert.equal(normalizarUsername('AUTOMACAO'), 'automacao');
  assert.equal(normalizarUsername('Automacao'), 'automacao');
  assert.equal(normalizarUsername('automacao'), 'automacao');
});

test('normalizarUsername trata entrada vazia/ausente sem lançar erro', () => {
  assert.equal(normalizarUsername(''), '');
  assert.equal(normalizarUsername(undefined), '');
  assert.equal(normalizarUsername(null), '');
});

test('montarPayloadNovoUsuario normaliza o username informado com maiúsculas para minúsculas', () => {
  const payload = montarPayloadNovoUsuario(usuarioOrigem, 'formalizacao.Automacao', 'SenhaForte123!');

  assert.equal(payload.username, 'formalizacao.automacao');
});

test('montarPayloadNovoUsuario gera o email a partir do username já normalizado (minúsculas)', () => {
  const payload = montarPayloadNovoUsuario(usuarioOrigem, 'Formalizacao.AUTOMACAO', 'SenhaForte123!');

  assert.match(payload.email, /^formalizacao\.automacao\.[0-9a-f]{8}@invalido\.multiplica\.local$/);
});

test('montarPayloadNovoUsuario usa o novo username/senha, nunca os do usuário de origem', () => {
  const payload = montarPayloadNovoUsuario(usuarioOrigem, 'fulano.hml', 'SenhaForte123!');

  assert.equal(payload.username, 'fulano.hml');
  assert.notEqual(payload.username, usuarioOrigem.username);
  assert.deepEqual(payload.credentials, [{ type: 'password', value: 'SenhaForte123!', temporary: false }]);
});

test('montarPayloadNovoUsuario mantém atributos, nome e flags do usuário de origem', () => {
  const payload = montarPayloadNovoUsuario(usuarioOrigem, 'fulano.hml', 'SenhaForte123!');

  assert.equal(payload.enabled, usuarioOrigem.enabled);
  assert.equal(payload.emailVerified, usuarioOrigem.emailVerified);
  assert.equal(payload.firstName, usuarioOrigem.firstName);
  assert.equal(payload.lastName, usuarioOrigem.lastName);
  assert.deepEqual(payload.attributes, usuarioOrigem.attributes);
  assert.deepEqual(payload.requiredActions, usuarioOrigem.requiredActions);
  assert.equal(payload.id, undefined);
});

test('montarPayloadNovoUsuario nunca copia o email do usuário de origem — sempre gera um inválido/único', () => {
  const payload = montarPayloadNovoUsuario(usuarioOrigem, 'fulano.hml', 'SenhaForte123!');

  assert.notEqual(payload.email, usuarioOrigem.email);
  assert.match(payload.email, /^fulano\.hml\.[0-9a-f]{8}@invalido\.multiplica\.local$/);
});

test('montarPayloadNovoUsuario gera emails diferentes em duas chamadas seguidas, mesmo com o mesmo usuário de origem', () => {
  const payload1 = montarPayloadNovoUsuario(usuarioOrigem, 'fulano.hml', 'SenhaForte123!');
  const payload2 = montarPayloadNovoUsuario(usuarioOrigem, 'fulano.hml', 'SenhaForte123!');

  assert.notEqual(payload1.email, payload2.email);
  assert.notEqual(payload1.email, usuarioOrigem.email);
  assert.notEqual(payload2.email, usuarioOrigem.email);
});

test('gerarEmailInvalidoUnico nunca repete e nunca é o email real do usuário de origem', () => {
  const email1 = gerarEmailInvalidoUnico('fulano.hml');
  const email2 = gerarEmailInvalidoUnico('fulano.hml');

  assert.notEqual(email1, email2);
  assert.notEqual(email1, usuarioOrigem.email);
  assert.match(email1, /^fulano\.hml\.[0-9a-f]{8}@invalido\.multiplica\.local$/);
});

test('montarPayloadNovoUsuario preenche attributes/requiredActions vazios quando o usuário de origem não os tiver', () => {
  const payload = montarPayloadNovoUsuario({ ...usuarioOrigem, attributes: undefined, requiredActions: undefined }, 'fulano.hml', 'x');

  assert.deepEqual(payload.attributes, {});
  assert.deepEqual(payload.requiredActions, []);
});

test('montarPayloadNovoUsuario cria a credencial com temporary: false por padrão (modo de execução única)', () => {
  const payload = montarPayloadNovoUsuario(usuarioOrigem, 'fulano.hml', 'SenhaForte123!');

  assert.deepEqual(payload.credentials, [{ type: 'password', value: 'SenhaForte123!', temporary: false }]);
});

test('montarPayloadNovoUsuario cria a credencial com temporary: true quando informado (modo em lote)', () => {
  const payload = montarPayloadNovoUsuario(usuarioOrigem, 'fulano.hml', 'Automacao@123', true);

  assert.deepEqual(payload.credentials, [{ type: 'password', value: 'Automacao@123', temporary: true }]);
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

test('clonarUsuariosEmLote processa o caso de sucesso mesmo com outro item do lote falhando', async () => {
  const mapaUsuarios = { 'joao.silva': 'joao.silva.hml', 'usuario.inexistente': 'usuario.inexistente.hml' };
  const chamadas = [];

  const clonarUmUsuario = (usuarioProd, usuarioHml) => {
    chamadas.push(usuarioProd);

    if (usuarioProd === 'usuario.inexistente') {
      return Promise.resolve({
        ok: false,
        motivo: `Usuário de origem "${usuarioProd}" não encontrado em produção (realm multiplicacapital).`,
      });
    }

    return Promise.resolve({ ok: true, valor: { id: 'uuid-hml-1', username: usuarioHml } });
  };

  const resultados = await clonarUsuariosEmLote(mapaUsuarios, clonarUmUsuario);

  assert.deepEqual(chamadas, ['joao.silva', 'usuario.inexistente']);
  assert.equal(resultados.length, 2);

  assert.equal(resultados[0].usuarioProd, 'joao.silva');
  assert.equal(resultados[0].usuarioHml, 'joao.silva.hml');
  assert.equal(resultados[0].ok, true);
  assert.deepEqual(resultados[0].valor, { id: 'uuid-hml-1', username: 'joao.silva.hml' });

  assert.equal(resultados[1].usuarioProd, 'usuario.inexistente');
  assert.equal(resultados[1].ok, false);
  assert.match(resultados[1].motivo, /não encontrado em produção/);
});

test('clonarUsuariosEmLote devolve lista vazia para um mapa vazio, sem chamar clonarUmUsuario', async () => {
  const clonarUmUsuario = () => {
    throw new Error('não deveria ser chamado');
  };

  const resultados = await clonarUsuariosEmLote({}, clonarUmUsuario);

  assert.deepEqual(resultados, []);
});

test('removerUsuariosClonadosComSucesso remove só quem teve ok: true, mantém quem falhou', () => {
  const mapaUsuarios = { 'joao.silva': 'joao.silva.hml', 'usuario.inexistente': 'usuario.inexistente.hml' };
  const resultados = [
    { usuarioProd: 'joao.silva', usuarioHml: 'joao.silva.hml', ok: true, valor: { id: 'uuid-hml-1', username: 'joao.silva.hml' } },
    { usuarioProd: 'usuario.inexistente', usuarioHml: 'usuario.inexistente.hml', ok: false, motivo: 'não encontrado' },
  ];

  const restante = removerUsuariosClonadosComSucesso(mapaUsuarios, resultados);

  assert.deepEqual(restante, { 'usuario.inexistente': 'usuario.inexistente.hml' });
});

test('removerUsuariosClonadosComSucesso não remove nada quando todo o lote falhou', () => {
  const mapaUsuarios = { 'a.prod': 'a.hml', 'b.prod': 'b.hml' };
  const resultados = [
    { usuarioProd: 'a.prod', usuarioHml: 'a.hml', ok: false, motivo: 'x' },
    { usuarioProd: 'b.prod', usuarioHml: 'b.hml', ok: false, motivo: 'y' },
  ];

  assert.deepEqual(removerUsuariosClonadosComSucesso(mapaUsuarios, resultados), mapaUsuarios);
});

test('removerUsuariosClonadosComSucesso remove tudo quando o lote inteiro teve sucesso', () => {
  const mapaUsuarios = { 'a.prod': 'a.hml', 'b.prod': 'b.hml' };
  const resultados = [
    { usuarioProd: 'a.prod', usuarioHml: 'a.hml', ok: true, valor: {} },
    { usuarioProd: 'b.prod', usuarioHml: 'b.hml', ok: true, valor: {} },
  ];

  assert.deepEqual(removerUsuariosClonadosComSucesso(mapaUsuarios, resultados), {});
});

test('removerUsuariosClonadosComSucesso trata mapa/resultados vazios ou ausentes sem lançar erro', () => {
  assert.deepEqual(removerUsuariosClonadosComSucesso({}, []), {});
  assert.deepEqual(removerUsuariosClonadosComSucesso(undefined, undefined), {});
});
