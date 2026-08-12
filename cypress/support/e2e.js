// arquivo: e2e.js

import './commands';
import './apiCommands';
import './utils';

const ERROS_IGNORADOS = [
  /Cannot read properties of undefined |reading 'content'|/,
  /Request failed with status code 50[02]/,
  /Request failed with status code 40[46]/,
  /Network Error/,
  /ResizeObserver loop (completed with undelivered notifications|limit exceeded)/,
];

Cypress.on('uncaught:exception', (err) => {
  if (ERROS_IGNORADOS.some((pattern) => pattern.test(err.message))) return false;
});