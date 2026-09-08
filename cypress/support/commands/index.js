// arquivo: index.js
//
// Registra todos os comandos customizados. A ordem dos imports não importa:
// cada módulo só registra funções em `Cypress.Commands`, e a chamada entre
// comandos (`cy.outroComando(...)`) só é resolvida em runtime, quando os
// steps do Cucumber executam — não em tempo de import.

import './log';
import './ambiente';
import './arquivos';
import './urls';
import './dependencias';
import './sincronizacaoNivel';
import './estoque';
import './vinculos';
