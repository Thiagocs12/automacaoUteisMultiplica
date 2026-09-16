// arquivo: cedente.js
//
// Comandos de leitura para resolver, contra PROD/HML reais, a estratégia de
// clonagem PROD -> HML de um cedente (ver `decidirEstrategiaClonagemCedente`,
// `shared/clonagemCedente.js`), a partir de um CNPJ/CPF informado via `--env`.
//
// Primeira etapa executável desta automação (ver docs/documentacao.md do
// módulo `cedente`, "Próximos passos", item 4) — só LEITURA, nenhum
// INSERT/DELETE ainda: localiza pessoa + prospect de origem em PROD e checa
// se já existe um cedente com o mesmo documento em HML, o suficiente para
// decidir a estratégia (bloqueado-sem-origem / criar / apagar-e-recriar) sem
// nenhum risco de escrita. Os comandos de INSERT/DELETE em HML (ordenados
// pelo grafo de FK já mapeado em `utils/mapeamentoCedente.js`, via
// `ordenarTabelasPorDependenciaEstrutural`) são a próxima etapa, ainda não
// implementada.

import { normalizarDocumento, decidirEstrategiaClonagemCedente } from '../shared/clonagemCedente';

/**
 * @description Monta a condição SQL que compara uma coluna `cnpjCpf`
 * (removendo os separadores de máscara usuais de CPF/CNPJ — `.`, `-`, `/`)
 * com um documento já normalizado (só dígitos, ver `normalizarDocumento`).
 * T-SQL não tem suporte nativo a regex; encadear `REPLACE` é suficiente para
 * o conjunto fechado de caracteres de máscara usados nesses dois formatos de
 * documento.
 * @param {string} colunaCnpjCpf - Nome (ou `alias.coluna`) da coluna a comparar.
 * @param {string} documentoNormalizado - Já passado por `normalizarDocumento` (só dígitos).
 * @returns {string}
 */
const condicaoDocumentoIgual = (colunaCnpjCpf, documentoNormalizado) =>
  `REPLACE(REPLACE(REPLACE(${colunaCnpjCpf}, '.', ''), '-', ''), '/', '') = '${documentoNormalizado}'`;

/**
 * @description Busca em um ambiente (`prod`/`hml`) a pessoa (`MC_CAD_PESSOA`)
 * cujo `cnpjCpf` (ignorando máscara) bate com o documento informado.
 * @param {'prod'|'hml'} ambiente
 * @param {string} documento - CNPJ/CPF, com ou sem máscara.
 * @returns {Cypress.Chainable<object|null>}
 */
Cypress.Commands.add('buscarPessoaCedentePorDocumento', (ambiente, documento) => {
  const documentoNormalizado = normalizarDocumento(documento);

  if (!documentoNormalizado) {
    return cy.wrap(null, { log: false });
  }

  return cy
    .executarQuery(ambiente, `SELECT * FROM MC_CAD_PESSOA WHERE ${condicaoDocumentoIgual('cnpjCpf', documentoNormalizado)}`)
    .then((registros) => (registros ?? [])[0] ?? null);
});

/**
 * @description Busca em PROD o prospect (`MC_PRT_PROSPECT`) vinculado a uma
 * pessoa (por `idPessoa`) — devolve o primeiro encontrado, se houver mais de
 * um. Suficiente para a checagem "existe prospect de origem?" exigida por
 * `decidirEstrategiaClonagemCedente`; qual prospect específico usar quando
 * houver mais de um é uma decisão da etapa de INSERT (ainda não
 * implementada), não desta checagem.
 * @param {number} idPessoa - id da pessoa em PROD.
 * @returns {Cypress.Chainable<object|null>}
 */
Cypress.Commands.add('buscarProspectPorPessoaEmProd', (idPessoa) =>
  cy
    .executarQuery('prod', `SELECT * FROM MC_PRT_PROSPECT WHERE idPessoa = ${Number(idPessoa)}`)
    .then((registros) => (registros ?? [])[0] ?? null),
);

/**
 * @description Busca em HML um cedente (`MC_CED_CEDENTE`) já existente para o
 * documento informado, via join com `MC_CAD_PESSOA` (`idPessoa`) — o cedente
 * em si não guarda CNPJ/CPF próprio (ver docs/documentacao.md, Ciclo 1).
 * @param {string} documento - CNPJ/CPF, com ou sem máscara.
 * @returns {Cypress.Chainable<object|null>}
 */
Cypress.Commands.add('buscarCedenteExistenteEmHmlPorDocumento', (documento) => {
  const documentoNormalizado = normalizarDocumento(documento);

  if (!documentoNormalizado) {
    return cy.wrap(null, { log: false });
  }

  return cy
    .executarQuery(
      'hml',
      `SELECT c.* FROM MC_CED_CEDENTE c INNER JOIN MC_CAD_PESSOA p ON p.id = c.idPessoa WHERE ${condicaoDocumentoIgual('p.cnpjCpf', documentoNormalizado)}`,
    )
    .then((registros) => (registros ?? [])[0] ?? null);
});

/**
 * @description Resolve, contra PROD/HML reais, a estratégia de clonagem PROD
 * -> HML de um cedente a partir do CNPJ/CPF informado (ver
 * `decidirEstrategiaClonagemCedente`, `shared/clonagemCedente.js`): localiza
 * pessoa + prospect de origem em PROD e checa se já existe um cedente com o
 * mesmo documento em HML. Só LEITURA — nenhuma escrita é feita aqui.
 * @param {string} documento - CNPJ/CPF de origem, com ou sem máscara.
 * @returns {Cypress.Chainable<{estrategia: string, motivo?: string, pessoaOrigem: object|null, prospectOrigem: object|null, cedenteHmlExistente: object|null}>}
 */
Cypress.Commands.add('resolverEstrategiaClonagemCedente', (documento) =>
  cy.buscarPessoaCedentePorDocumento('prod', documento).then((pessoaOrigem) => {
    const buscarProspect = pessoaOrigem
      ? cy.buscarProspectPorPessoaEmProd(pessoaOrigem.id)
      : cy.wrap(null, { log: false });

    return buscarProspect.then((prospectOrigem) =>
      cy.buscarCedenteExistenteEmHmlPorDocumento(documento).then((cedenteHmlExistente) => {
        const { estrategia, motivo } = decidirEstrategiaClonagemCedente({
          pessoaOrigemEncontrada: Boolean(pessoaOrigem),
          prospectOrigemEncontrado: Boolean(prospectOrigem),
          cedenteHmlExistente: Boolean(cedenteHmlExistente),
        });

        return { estrategia, motivo, pessoaOrigem, prospectOrigem, cedenteHmlExistente };
      }),
    );
  }),
);
