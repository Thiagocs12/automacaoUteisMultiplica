// arquivo: arquivos.js

import { obterValor } from '../utils';

/**
 * @description Lê um arquivo JSON do diretório 'cypress/output'.
 * Retorna null se o arquivo não existir ou estiver vazio.
 * @param {string} nomeArquivo - Nome do arquivo JSON (ex: 'meuArquivo.json').
 * @returns {Cypress.Chainable<Array<object>|null>}
 */
Cypress.Commands.add('lerJsonDeOutput', (nomeArquivo) => {
  return cy.task(
    'lerJsonSeExistir',
    { caminhoArquivo: `cypress/output/${nomeArquivo}` },
    { log: false },
  );
});

/**
 * @description Localiza um item no arquivo JSON pelo valor do campo descrição
 * e atualiza sua propriedade 'idHml' com o ID fornecido.
 * Suporta busca simples (string) e busca composta (objeto com múltiplos campos).
 * Quando `idOriginal` é informado, a busca é restrita ao item cujo `id` de produção
 * corresponda a ele — evitando que dois itens com a mesma descrição (ex.: duas
 * etapas de nome igual, uma na esteira POC e outra na MOP) sejam tratados como
 * um único item e recebam o mesmo `idHml`.
 * @param {string|number|null} id - ID do ambiente HML a ser salvo no item.
 * @param {string|object} descricao - Valor usado para localizar o item no arquivo.
 * @param {string} nomeArquivo - Nome do arquivo JSON localizado em 'cypress/output/'.
 * @param {string|string[]} campoDescricao - Campo(s) usados para localizar o item.
 * @param {string|number|null} [idOriginal] - ID de produção do item específico a ser atualizado.
 * @returns {Cypress.Chainable<void>}
 */
Cypress.Commands.add('setIdHmlPorDescricao', (id, descricao, nomeArquivo, campoDescricao, idOriginal) => {
  const filePath = `cypress/output/${nomeArquivo}`;

  cy.readFile(filePath, { log: false }).then((conteudo) => {
    const itens = conteudo.filter((entry) => {
      const combinaComDescricao = Array.isArray(campoDescricao)
        ? campoDescricao.every((campo) => obterValor(entry, campo) === descricao[campo])
        : entry[campoDescricao] === descricao;

      if (!combinaComDescricao) return false;
      if (idOriginal != null && entry.id !== idOriginal) return false;

      return true;
    });

    if (!itens.length) {
      throw new Error(`[setIdHmlPorDescricao] Nenhum item encontrado em "${nomeArquivo}".`);
    }

    itens.forEach((item) => {
      item.idHml = id;
    });

    cy.writeFile(filePath, conteudo, { log: false });
  });
});
