import js from '@eslint/js';
import cypressPlugin from 'eslint-plugin-cypress';
import globals from 'globals';

export default [
  {
    ignores: [
      'node_modules/**',
      'cypress/output/**',
      'cypress/temp/**',
      'cypress/downloads/**',
      'cypress/screenshots/**',
      'cypress/videos/**',
    ],
  },
  js.configs.recommended,
  // cypress.config.js mistura `import` (ESM) com `require` (o Cypress carrega este
  // arquivo com seu próprio bundler CJS, independente do "type":"module" do projeto).
  {
    files: ['cypress.config.js'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
  // Arquivos .cjs de fato (tasks/db) — CommonJS puro.
  {
    files: ['cypress/support/tasks/**/*.cjs', 'cypress/support/db/**/*.cjs'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: { ...globals.node },
    },
  },
  // Testes node:test (rodam com Node puro, fora do Cypress).
  {
    files: ['**/__tests__/**/*.test.js'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
  // Código Cypress (comandos, steps, config de entidades) — globais do Cypress/Mocha.
  {
    files: ['cypress/e2e/**/*.js', 'cypress/support/**/*.js', 'cypress/utils/**/*.js'],
    ignores: [
      'cypress/support/tasks/**/*.cjs',
      'cypress/support/db/**/*.cjs',
      '**/__tests__/**/*.test.js',
    ],
    plugins: { cypress: cypressPlugin },
    languageOptions: {
      globals: {
        ...cypressPlugin.configs.recommended.languageOptions.globals,
        ...globals.node,
      },
    },
    rules: {
      ...cypressPlugin.configs.recommended.rules,
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // Este projeto não é uma suíte de testes de UI: é uma ferramenta de
      // orquestração de sincronização de dados PROD→HML. O encadeamento
      // sequencial via `cadeia = cadeia.then(...)` dentro de loops (para
      // processar entidades uma após a outra, preservando ordem e logs
      // compartilhados) e o uso de `.each()` seguido de `.then()` são
      // padrões intencionais dessa orquestração — não erros de teste de UI.
      // Rebaixadas para aviso em vez de desabilitadas, para manter
      // visibilidade em revisões futuras sem quebrar `npm run lint`.
      'cypress/no-assigning-return-values': 'warn',
      'cypress/unsafe-to-chain-command': 'warn',
    },
  },
];
