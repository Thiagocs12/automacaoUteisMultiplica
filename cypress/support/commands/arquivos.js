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

    cy.logExecucao(
      `[setIdHmlPorDescricao] ${nomeArquivo}: ${itens.length} item(ns) -> idHml=${id}${
        idOriginal != null ? ` (id produção ${idOriginal})` : ''
      }`,
    );

    cy.writeFile(filePath, conteudo, { log: false });
  });
});

/**
 * @description Aplica em lote resoluções de `idHml` (por `id` de produção) a um
 * arquivo de output, com uma única leitura e uma única escrita — em vez de um
 * par leitura+escrita por item. Usado pelos fluxos de busca/pesquisa (idempotentes:
 * apenas resolvem `idHml` via consulta, não criam nada em HML), onde processar N
 * itens não precisa custar 2N operações de I/O de arquivo.
 * @param {string} nomeArquivo - Nome do arquivo JSON localizado em 'cypress/output/'.
 * @param {Array<{idProducao: string|number, idHml: string|number|null}>} resolucoes -
 * Pares de id de produção e o idHml resolvido para ele.
 * @returns {Cypress.Chainable<void>}
 */
Cypress.Commands.add('aplicarResolucoesIdHml', (nomeArquivo, resolucoes) => {
  if (!resolucoes?.length) return cy.wrap(null, { log: false });

  const caminhoArquivo = `cypress/output/${nomeArquivo}`;
  const idHmlPorIdProducao = new Map(resolucoes.map((r) => [r.idProducao, r.idHml]));
  const encontrados = resolucoes.filter((r) => r.idHml != null).length;

  cy.logExecucao(
    `[aplicarResolucoesIdHml] ${nomeArquivo}: ${resolucoes.length} resolução(ões) (${encontrados} encontrada(s) em HML)`,
  );

  return cy.task('lerJsonSeExistir', { caminhoArquivo }, { log: false }).then((conteudo) => {
    const atualizado = (conteudo ?? []).map((item) =>
      idHmlPorIdProducao.has(item.id) ? { ...item, idHml: idHmlPorIdProducao.get(item.id) } : item,
    );

    return cy.task('escreverJson', { caminhoArquivo, conteudo: atualizado }, { log: false });
  });
});
