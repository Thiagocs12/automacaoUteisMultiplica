import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { dbTasks } = require('../dbTasks.cjs');

test('queryProd rejeita query com UPDATE', async () => {
  await assert.rejects(() => dbTasks.queryProd({ sqlQuery: 'UPDATE tabela SET x = 1' }));
});

test('queryProd rejeita query com INSERT', async () => {
  await assert.rejects(() => dbTasks.queryProd({ sqlQuery: 'INSERT INTO tabela VALUES (1)' }));
});

test('queryProd rejeita query com DELETE', async () => {
  await assert.rejects(() => dbTasks.queryProd({ sqlQuery: 'DELETE FROM tabela' }));
});

test('queryProd rejeita query com palavra de escrita em minúsculo', async () => {
  await assert.rejects(() => dbTasks.queryProd({ sqlQuery: 'drop table tabela' }));
});
