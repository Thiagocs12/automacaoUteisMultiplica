// arquivo: catalogoCedente.js
//
// Resolvedor genérico de dependência de catálogo/domínio compartilhado para a
// clonagem de cedente PROD -> HML (ver docs/documentacao.md do módulo,
// "Ainda NÃO implementado" no Ciclo 13) — busca em HML pela chave natural
// declarada em `METADADOS_CATALOGO_CEDENTE` (mesma convenção já usada em
// `commands/sincronizacaoNivel.js`: `descricao`/`nome`) e cria o registro
// completo (copiado de PROD, minus colunas de auditoria) se não existir.
// Reaproveita `cy.executarQuery` (já usado por `commands/cedente.js`) em vez
// de duplicar acesso a `dbClient.cjs`.

import { METADADOS_CATALOGO_CEDENTE } from '../../utils/mapeamentoCedente';
import { montarInsertCatalogo } from '../shared/clonagemCedente';

const escaparValorBusca = (valor) => String(valor ?? '').trim().replace(/'/g, "''");

/**
 * @description Busca em PROD, por `id`, a linha completa de uma tabela de
 * catálogo (`SELECT *`) — usada como origem para a comparação por chave
 * natural e, se necessário, para a cópia em HML.
 * @param {string} tabela
 * @param {number|string} idProducao
 * @returns {Cypress.Chainable<object|null>}
 */
Cypress.Commands.add('buscarRegistroCatalogoPorIdEmProd', (tabela, idProducao) =>
  cy
    .executarQuery('prod', `SELECT * FROM ${tabela} WHERE id = ${Number(idProducao)}`)
    .then((registros) => (registros ?? [])[0] ?? null),
);

/**
 * @description Busca em HML, por chave natural (`campoChaveNatural`, ex.:
 * `descricao`/`nome`), um registro já existente de uma tabela de catálogo —
 * comparação tolerante a espaço nas pontas (`LTRIM`/`RTRIM`); a distinção
 * maiúsculas/minúsculas segue a collation padrão do banco (mesmo
 * comportamento já observado nas comparações de documento em `commands/cedente.js`).
 * @param {string} tabela
 * @param {string} campoChaveNatural
 * @param {*} valor
 * @returns {Cypress.Chainable<object|null>}
 */
Cypress.Commands.add('buscarRegistroCatalogoPorChaveNaturalEmHml', (tabela, campoChaveNatural, valor) =>
  cy
    .executarQuery(
      'hml',
      `SELECT * FROM ${tabela} WHERE LTRIM(RTRIM(${campoChaveNatural})) = '${escaparValorBusca(valor)}'`,
    )
    .then((registros) => (registros ?? [])[0] ?? null),
);

/**
 * @description Cria em HML uma cópia de uma linha de catálogo vinda de PROD
 * (`montarInsertCatalogo` — exclui colunas de auditoria/identidade) e devolve
 * o novo id gerado por HML.
 * @param {string} tabela
 * @param {Object} linhaOrigem - linha de PROD (`SELECT *`).
 * @returns {Cypress.Chainable<number>}
 */
Cypress.Commands.add('criarRegistroCatalogoEmHml', (tabela, linhaOrigem) =>
  cy
    .executarQuery('hml', montarInsertCatalogo(tabela, linhaOrigem))
    .then((registros) => (registros ?? [])[0]?.id),
);

/**
 * @description Resolve o id equivalente em HML de uma dependência de
 * catálogo (`tipo: 'catalogo'` em `mapeamentoCedente.js`), dado o id de
 * origem em PROD: busca a linha de origem em PROD, procura em HML um
 * registro com a mesma chave natural (`METADADOS_CATALOGO_CEDENTE[tabela]`)
 * e, se não encontrar, cria a cópia. `idProducao` nulo (coluna opcional sem
 * valor na linha de origem) devolve `null` sem consultar nada — mesmo
 * critério já usado para colunas de referência a arquivo/documento não
 * resolvidas (ex. `idArquivoLogo`).
 * @param {string} tabela
 * @param {number|string|null|undefined} idProducao
 * @returns {Cypress.Chainable<number|null>}
 */
Cypress.Commands.add('resolverIdCatalogoEmHml', (tabela, idProducao) => {
  const metadados = METADADOS_CATALOGO_CEDENTE[tabela];

  if (!metadados) {
    throw new Error(
      `[resolverIdCatalogoEmHml] "${tabela}" não tem chave natural declarada em METADADOS_CATALOGO_CEDENTE — tabela de catálogo nova/não mapeada, não decidir sozinho (regra 8 do AGENTE.md).`,
    );
  }

  if (idProducao == null) {
    return cy.wrap(null, { log: false });
  }

  return cy.buscarRegistroCatalogoPorIdEmProd(tabela, idProducao).then((linhaOrigem) => {
    if (!linhaOrigem) {
      return null;
    }

    const valorChave = linhaOrigem[metadados.campoChaveNatural];

    return cy
      .buscarRegistroCatalogoPorChaveNaturalEmHml(tabela, metadados.campoChaveNatural, valorChave)
      .then((existente) => {
        if (existente) {
          return existente.id;
        }

        return cy.criarRegistroCatalogoEmHml(tabela, linhaOrigem);
      });
  });
});
