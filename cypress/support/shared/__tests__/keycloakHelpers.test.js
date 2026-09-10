import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encontrarPorNomeExato, calcularNomesFaltantes } from '../keycloakHelpers.js';

test('encontrarPorNomeExato ignora correspondências parciais da busca', () => {
  const itens = [{ id: '1', name: 'BKO_FOR_CEDENTE' }, { id: '2', name: 'BKO_FOR_CEDENTE_2' }];
  assert.deepEqual(encontrarPorNomeExato(itens, 'BKO_FOR_CEDENTE'), itens[0]);
});

test('encontrarPorNomeExato ignora maiúsculas/minúsculas e espaços', () => {
  const itens = [{ id: '1', name: 'Operadores' }];
  assert.deepEqual(encontrarPorNomeExato(itens, '  operadores  '), itens[0]);
});

test('encontrarPorNomeExato retorna null quando não há correspondência exata', () => {
  const itens = [{ id: '1', name: 'BKO_FOR_CEDENTE_2' }];
  assert.equal(encontrarPorNomeExato(itens, 'BKO_FOR_CEDENTE'), null);
  assert.equal(encontrarPorNomeExato([], 'BKO_FOR_CEDENTE'), null);
  assert.equal(encontrarPorNomeExato(undefined, 'BKO_FOR_CEDENTE'), null);
});

test('calcularNomesFaltantes retorna apenas nomes de produção ainda não presentes em HML', () => {
  assert.deepEqual(calcularNomesFaltantes(['ADMIN', 'OPERADOR'], ['ADMIN']), ['OPERADOR']);
});

test('calcularNomesFaltantes ignora maiúsculas/minúsculas e espaços na comparação', () => {
  assert.deepEqual(calcularNomesFaltantes(['Admin'], [' admin ']), []);
});

test('calcularNomesFaltantes retorna todos os nomes quando HML não tem nenhum', () => {
  assert.deepEqual(calcularNomesFaltantes(['ADMIN'], []), ['ADMIN']);
  assert.deepEqual(calcularNomesFaltantes(['ADMIN'], undefined), ['ADMIN']);
});

test('calcularNomesFaltantes retorna vazio quando produção não tem nomes', () => {
  assert.deepEqual(calcularNomesFaltantes([], ['ADMIN']), []);
  assert.deepEqual(calcularNomesFaltantes(undefined, ['ADMIN']), []);
});
