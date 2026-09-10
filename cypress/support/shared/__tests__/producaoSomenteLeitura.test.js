import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validarSomenteLeituraEmProducao } from '../producaoSomenteLeitura.js';

test('bloqueia POST em produção', () => {
  assert.throws(() => validarSomenteLeituraEmProducao('prod', 'POST'));
});

test('bloqueia DELETE em produção mesmo com método em minúsculo', () => {
  assert.throws(() => validarSomenteLeituraEmProducao('prod', 'delete'));
});

test('permite GET em produção', () => {
  assert.doesNotThrow(() => validarSomenteLeituraEmProducao('prod', 'GET'));
});

test('bloqueia POST em keycloakProd', () => {
  assert.throws(() => validarSomenteLeituraEmProducao('keycloakProd', 'POST'));
});

test('permite GET em keycloakProd', () => {
  assert.doesNotThrow(() => validarSomenteLeituraEmProducao('keycloakProd', 'GET'));
});

test('permite métodos de escrita em ambientes que não são produção', () => {
  assert.doesNotThrow(() => validarSomenteLeituraEmProducao('hml', 'POST'));
  assert.doesNotThrow(() => validarSomenteLeituraEmProducao('keycloak', 'PATCH'));
});
