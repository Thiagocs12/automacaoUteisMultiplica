// arquivo: estruturaCedente.js
//
// Comandos de INSERT das tabelas ESTRUTURAIS (não-catálogo) da clonagem de
// cedente PROD -> HML (ver docs/documentacao.md do módulo, "próximo passo
// pendente" registrado no Ciclo 15) — usa `MAPEAMENTO_CEDENTE_UNIFICADO`/
// `ordenarTabelasPorDependenciaEstrutural` (chamado pelo comando/feature que
// orquestra a clonagem completa, ainda não implementado) para calcular a
// ordem; este arquivo resolve, linha a linha, cada dependência declarada em
// `dependeDe`:
//
// - `catalogo`: `cy.resolverIdCatalogoEmHml` (já existente, `catalogoCedente.js`).
// - `participante-fixo`: `cy.resolverIdParticipanteFixoEmHml` (novo abaixo) —
//   nunca o votante real de PROD (Resposta-4, duvidas.md).
// - `estrutural`: id já resolvido nesta mesma execução para a tabela-pai
//   (`idsHmlPorTabela`, mapa por tabela de `idProducao -> idHml`) — a
//   tabela-pai precisa ter sido inserida antes, respeitando a ordem de
//   `ordenarTabelasPorDependenciaEstrutural`.
// - `cascata` (`MC_CED_CEDENTE_VINCULADO.idCedenteVinculado`): AINDA NÃO
//   resolvida aqui — fica sem entrada em `valoresResolvidos`, mesmo
//   tratamento de uma coluna nullable sem valor (a execução da cascata em
//   si, disparar a clonagem recursiva do cedente vinculado, é um passo
//   futuro, ver `TIPO_DEPENDENCIA_CASCATA` em `shared/clonagemCedente.js`).

import { NOME_ANALISTA_RESPONSAVEL_CLONAGEM_CEDENTE, montarInsertEstrutural } from '../shared/clonagemCedente';

const TABELA_PARTICIPANTE_FIXO = 'MC_CAD_ANALISTA';

/**
 * @description Resolve, em HML, o id do participante fixo usado em toda
 * linha de votação clonada (comitê/ata) — nunca o votante real de PROD (ver
 * `duvidas.md`, tarefa 20260915130215, Resposta-4). Busca por chave natural
 * (`nome`) em `MC_CAD_ANALISTA`, reaproveitando o mesmo comando de busca já
 * usado pelo resolvedor de catálogo (`cy.buscarRegistroCatalogoPorChaveNaturalEmHml`,
 * `catalogoCedente.js`) em vez de duplicar a query. Lança erro se o registro
 * não existir em HML — é uma pré-condição já confirmada pelo Thiago (existe
 * exatamente um registro ativo com este nome em HML no momento da
 * confirmação), não uma decisão de escopo a tomar aqui; se ocorrer de
 * verdade, é sinal de registrar dúvida bloqueante (regra 8 do `AGENTE.md`),
 * não de a automação decidir sozinha um substituto.
 * @returns {Cypress.Chainable<number>}
 */
Cypress.Commands.add('resolverIdParticipanteFixoEmHml', () =>
  cy
    .buscarRegistroCatalogoPorChaveNaturalEmHml(TABELA_PARTICIPANTE_FIXO, 'nome', NOME_ANALISTA_RESPONSAVEL_CLONAGEM_CEDENTE)
    .then((registro) => {
      if (!registro) {
        throw new Error(
          `[resolverIdParticipanteFixoEmHml] Nenhum registro em ${TABELA_PARTICIPANTE_FIXO} (HML) com nome "${NOME_ANALISTA_RESPONSAVEL_CLONAGEM_CEDENTE}" — pré-condição já confirmada pelo Thiago (Resposta-4, duvidas.md); se isso ocorrer de verdade, registrar dúvida bloqueante em vez de decidir um substituto.`,
        );
      }

      return registro.id;
    }),
);

/**
 * @description Resolve, para uma linha de origem (PROD) de uma tabela
 * estrutural, o mapa `{ [campo]: valorEmHml }` de todas as dependências
 * declaradas em `mapeamento[tabela].dependeDe` que este comando já sabe
 * resolver (`catalogo`, `participante-fixo`, `estrutural`) — usado por
 * `cy.inserirLinhaEstruturalEmHml` antes de montar o INSERT
 * (`montarInsertEstrutural`, lógica pura, `shared/clonagemCedente.js`). Uma
 * dependência `estrutural` cujo valor de origem seja `null`/`undefined`
 * (coluna opcional) ou cujo id de origem ainda não tenha sido resolvido em
 * `idsHmlPorTabela` (tabela-pai fora de escopo desta execução, ou ainda não
 * processada) não entra no mapa — a coluna final mantém o valor original.
 * Mesmo critério para `cascata`/qualquer tipo futuro ainda sem resolução
 * automática aqui.
 *
 * Encadeia os comandos `cy.*` de resolução via `Array.prototype.reduce`
 * sobre um acumulador `cy.wrap({})` (nunca uma Promise nativa) — mesmo
 * padrão já documentado em `docs/conhecimento-geral.md` para não misturar
 * Promise nativa com comandos `cy.` dentro dela.
 * @param {string} tabela
 * @param {Object} linhaOrigem
 * @param {Object} mapeamento - mesmo formato de `MAPEAMENTO_CEDENTE_UNIFICADO`.
 * @param {Object<string, Map<number, number>>} idsHmlPorTabela - por tabela
 * estrutural já processada nesta execução, mapa `idProducao -> idHml`.
 * @returns {Cypress.Chainable<Object<string, *>>}
 */
Cypress.Commands.add('resolverValoresDependenciasLinhaEstrutural', (tabela, linhaOrigem, mapeamento, idsHmlPorTabela) => {
  const dependencias = mapeamento?.[tabela]?.dependeDe ?? [];

  return dependencias.reduce(
    (acumulado, dependencia) =>
      acumulado.then((valoresResolvidos) => {
        const valorOrigem = linhaOrigem[dependencia.campo];

        if (dependencia.tipo === 'catalogo') {
          return cy.resolverIdCatalogoEmHml(dependencia.tabela, valorOrigem).then((valorHml) =>
            valorHml != null ? { ...valoresResolvidos, [dependencia.campo]: valorHml } : valoresResolvidos,
          );
        }

        if (dependencia.tipo === 'participante-fixo') {
          return cy
            .resolverIdParticipanteFixoEmHml()
            .then((valorHml) => ({ ...valoresResolvidos, [dependencia.campo]: valorHml }));
        }

        if (dependencia.tipo === 'estrutural') {
          const valorHml = valorOrigem != null ? idsHmlPorTabela?.[dependencia.tabela]?.get(valorOrigem) : undefined;

          return cy.wrap(
            valorHml != null ? { ...valoresResolvidos, [dependencia.campo]: valorHml } : valoresResolvidos,
            { log: false },
          );
        }

        return cy.wrap(valoresResolvidos, { log: false });
      }),
    cy.wrap({}, { log: false }),
  );
});

/**
 * @description Insere em HML uma linha ESTRUTURAL clonada de PROD: resolve
 * as dependências da linha (`cy.resolverValoresDependenciasLinhaEstrutural`),
 * monta o INSERT (`montarInsertEstrutural`, lógica pura) e executa contra
 * HML, devolvendo o novo id gerado (via `OUTPUT INSERTED.id`, mesmo padrão
 * de `cy.criarRegistroCatalogoEmHml`).
 * @param {string} tabela
 * @param {Object} linhaOrigem
 * @param {Object} mapeamento
 * @param {Object<string, Map<number, number>>} idsHmlPorTabela
 * @returns {Cypress.Chainable<number>}
 */
Cypress.Commands.add('inserirLinhaEstruturalEmHml', (tabela, linhaOrigem, mapeamento, idsHmlPorTabela) =>
  cy
    .resolverValoresDependenciasLinhaEstrutural(tabela, linhaOrigem, mapeamento, idsHmlPorTabela)
    .then((valoresResolvidos) =>
      cy
        .executarQuery('hml', montarInsertEstrutural(tabela, linhaOrigem, mapeamento, valoresResolvidos))
        .then((registros) => (registros ?? [])[0]?.id),
    ),
);
