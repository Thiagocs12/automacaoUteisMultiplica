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

import {
  NOME_ANALISTA_RESPONSAVEL_CLONAGEM_CEDENTE,
  montarInsertEstrutural,
  montarCondicaoBuscaSatelite,
  montarDeleteEmLote,
  classificarTabelaCedente,
  FASE_CATALOGO,
} from '../shared/clonagemCedente';

const TABELA_JUNCAO_PROSPECT_PROPOSTA = 'MC_POC_PROSPECT';
const TABELA_PROPOSTA = 'MC_POC_PROPOSTA';
const TABELA_COMITE = 'MC_CAD_COMITE';

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

/**
 * @description Busca, no ambiente informado (`prod`/`hml`), as linhas
 * satélite de uma tabela ESTRUTURAL já localizadas por
 * `montarCondicaoBuscaSatelite` (lógica pura, `shared/clonagemCedente.js`) —
 * um `SELECT *` simples com a condição já pronta, sem lógica adicional aqui
 * (a decisão de qual condição usar já foi tomada antes de chamar este
 * comando). Parametrizado por ambiente (Ciclo 20) para ser reaproveitado
 * tanto pela descoberta do grafo a INSERIR em HML a partir de PROD
 * (`cy.clonarGrafoEstruturalCedente`) quanto pela descoberta do grafo a
 * EXCLUIR de HML no "apaga e refaz" (`cy.descobrirGrafoEstruturalCedenteEmHml`)
 * — mesma query, ambiente diferente, nunca duplicar a lógica de busca.
 * @param {'prod'|'hml'} ambiente
 * @param {string} tabela
 * @param {string} condicaoWhere
 * @returns {Cypress.Chainable<Array<Object>>}
 */
Cypress.Commands.add('buscarLinhasSatelitesEmAmbiente', (ambiente, tabela, condicaoWhere) =>
  cy.executarQuery(ambiente, `SELECT * FROM ${tabela} WHERE ${condicaoWhere}`).then((registros) => registros ?? []),
);

/**
 * @description Busca, no ambiente informado (`prod`/`hml`), via a tabela de
 * junção `MC_POC_PROSPECT` (`idProspect`/`idProposta`, ambas colunas
 * estruturais já mapeadas), TODAS as propostas (`MC_POC_PROPOSTA`)
 * relacionadas a um prospect — não só a mais recente (ver
 * `construirSementesGrafoEstrutural`, `shared/clonagemCedente.js`, para o
 * porquê disso não ser uma decisão de negócio nova). Nenhuma proposta
 * relacionada devolve array vazio (prospect que nunca avançou para POC), não
 * um erro. Parametrizado por ambiente (Ciclo 20) pelo mesmo motivo de
 * `cy.buscarLinhasSatelitesEmAmbiente` — a descoberta do grafo a EXCLUIR em
 * HML precisa da mesma busca, mas contra HML em vez de PROD.
 * @param {'prod'|'hml'} ambiente
 * @param {number} idProspect
 * @returns {Cypress.Chainable<Object[]>}
 */
Cypress.Commands.add('buscarPropostasRelacionadasAoProspectEmAmbiente', (ambiente, idProspect) =>
  cy
    .executarQuery(
      ambiente,
      `SELECT DISTINCT idProposta FROM ${TABELA_JUNCAO_PROSPECT_PROPOSTA} WHERE idProspect = ${Number(idProspect)}`,
    )
    .then((registros) => (registros ?? []).map((registro) => Number(registro.idProposta)))
    .then((idsProposta) =>
      idsProposta.length === 0
        ? cy.wrap([], { log: false })
        : cy
            .executarQuery(ambiente, `SELECT * FROM ${TABELA_PROPOSTA} WHERE id IN (${idsProposta.join(', ')})`)
            .then((registros) => registros ?? []),
    ),
);

/**
 * @description Busca, no ambiente informado (`prod`/`hml`), os comitês
 * (`MC_CAD_COMITE`) referenciados por `idComite` (nullable) num conjunto de
 * propostas já localizadas — mesmo raciocínio de "tudo relacionado, não só o
 * mais recente" de `cy.buscarPropostasRelacionadasAoProspectEmAmbiente`.
 * Devolve array vazio se nenhuma proposta tiver `idComite` preenchido.
 * Parametrizado por ambiente pelo mesmo motivo dos dois comandos acima.
 * @param {'prod'|'hml'} ambiente
 * @param {Object[]} propostas - linhas de `MC_POC_PROPOSTA` no mesmo ambiente.
 * @returns {Cypress.Chainable<Object[]>}
 */
Cypress.Commands.add('buscarComitesRelacionadosEmAmbiente', (ambiente, propostas) => {
  const idsComite = [...new Set((propostas ?? []).map((proposta) => proposta.idComite).filter((id) => id != null))];

  if (idsComite.length === 0) {
    return cy.wrap([], { log: false });
  }

  return cy
    .executarQuery(ambiente, `SELECT * FROM ${TABELA_COMITE} WHERE id IN (${idsComite.join(', ')})`)
    .then((registros) => registros ?? []);
});

/**
 * @description Orquestra a clonagem ESTRUTURAL completa (INSERT) de um
 * cedente em HML, a partir de um mapa de "sementes" — raízes de cada fase já
 * localizadas em PROD (`sementes`, `{ [tabela]: linhas[] }`, ver
 * `construirSementesGrafoEstrutural` em `shared/clonagemCedente.js` para o
 * porquê de precisar de mais de uma raiz, não só o prospect) — e da ordem de
 * dependência já calculada (`ordemTabelas`,
 * `ordenarTabelasPorDependenciaEstrutural(construirGrafoEstrutural(mapeamento))`).
 *
 * Um único `Array.prototype.reduce` percorre `ordemTabelas` (que já inclui
 * toda tabela-âncora de fase, com dependência estrutural vazia — a ordem
 * topológica cuida de colocá-las antes de suas satélites, e antes de
 * qualquer outra âncora que dependa delas, ex.: `MC_CAD_COMITE` antes de
 * `MC_POC_PROPOSTA.idComite`), pulando tabelas de catálogo (resolvidas à
 * parte pelo padrão já existente — nunca por este orquestrador). Para cada
 * tabela:
 *
 * 1. Se já há linhas semeadas para ela em `sementes[tabela]`, usa essas
 *    linhas diretamente — é uma raiz, não uma satélite a descobrir.
 * 2. Senão, monta a condição de busca satélite contra as tabelas-pai já
 *    processadas (`montarCondicaoBuscaSatelite` — `null` significa "não é
 *    satélite de nada já processado", ex.: um template compartilhado como
 *    `MC_CAD_MODELO_ATA_COMITE`, pulado sem inserir nada) e busca as linhas
 *    em PROD (`cy.buscarLinhasSatelitesEmAmbiente('prod', ...)`).
 *
 * Em ambos os casos, cada linha encontrada é inserida em HML
 * (`cy.inserirLinhaEstruturalEmHml`), acumulando o novo id em
 * `idsHmlPorTabela`/`idsProdPorTabela` (nunca Promise nativa misturada com
 * comandos `cy.` — mesma armadilha já documentada em
 * `docs/conhecimento-geral.md` — tanto para percorrer as tabelas em ordem
 * quanto, dentro de cada tabela, para suas várias linhas uma a uma).
 *
 * A dependência `cascata` (`MC_CED_CEDENTE_VINCULADO.idCedenteVinculado`)
 * nunca é resolvida aqui — mesmo comportamento já existente em
 * `cy.resolverValoresDependenciasLinhaEstrutural` (coluna fica sem entrada em
 * `valoresResolvidos`, execução da cascata em si ainda não implementada).
 * @param {string[]} ordemTabelas
 * @param {Object<string, Object[]>} sementes - `{ [tabela]: linhas[] }`, ver `construirSementesGrafoEstrutural`.
 * @param {Object} mapeamento - mesmo formato de `MAPEAMENTO_CEDENTE_UNIFICADO`.
 * @returns {Cypress.Chainable<{idsHmlPorTabela: Object<string, Map<number, number>>, idsProdPorTabela: Object<string, Set<number>>}>}
 */
Cypress.Commands.add('clonarGrafoEstruturalCedente', (ordemTabelas, sementes, mapeamento) => {
  const idsHmlPorTabela = {};
  const idsProdPorTabela = {};
  const tabelasJaProcessadas = new Set();

  const inserirLinhasDaTabela = (tabela, linhas) => {
    idsHmlPorTabela[tabela] = idsHmlPorTabela[tabela] ?? new Map();
    idsProdPorTabela[tabela] = idsProdPorTabela[tabela] ?? new Set();

    return linhas
      .reduce(
        (acc, linha) =>
          acc.then(() =>
            cy.inserirLinhaEstruturalEmHml(tabela, linha, mapeamento, idsHmlPorTabela).then((idHml) => {
              idsHmlPorTabela[tabela].set(linha.id, idHml);
              idsProdPorTabela[tabela].add(linha.id);
            }),
          ),
        cy.wrap(null, { log: false }),
      )
      .then(() => {
        tabelasJaProcessadas.add(tabela);
      });
  };

  return ordemTabelas
    .filter((tabela) => classificarTabelaCedente(tabela).fase !== FASE_CATALOGO)
    .reduce((acumulado, tabela) => {
      const linhasSemente = sementes[tabela];

      return acumulado.then(() => {
        if (linhasSemente) {
          return inserirLinhasDaTabela(tabela, linhasSemente);
        }

        const condicao = montarCondicaoBuscaSatelite(tabela, mapeamento, tabelasJaProcessadas, idsProdPorTabela);

        if (!condicao) {
          tabelasJaProcessadas.add(tabela);
          return cy.wrap(null, { log: false });
        }

        return cy
          .buscarLinhasSatelitesEmAmbiente('prod', tabela, condicao)
          .then((linhas) => inserirLinhasDaTabela(tabela, linhas));
      });
    }, cy.wrap(null, { log: false }))
    .then(() => ({ idsHmlPorTabela, idsProdPorTabela }));
});

/**
 * @description Descobre, em HML, o grafo estrutural completo (só ids — não
 * insere/apaga nada) de um cedente já existente, a partir de um mapa de
 * "sementes" (`sementes`, `{ [tabela]: linhas[] }` — mesmo formato de
 * `cy.clonarGrafoEstruturalCedente`, mas as linhas já lidas de HML em vez de
 * PROD) e da ordem de dependência (`ordemTabelas`, mesma ordem de INSERÇÃO
 * usada pelo comando irmão — a ordem topológica é a mesma independente do
 * ambiente, já que reflete a estrutura do grafo, não os dados). Usado como
 * primeiro passo do "apaga e refaz" (`cy.apagarCedenteEmHml`,
 * `commands/cedente.js`): descobre TUDO que existe em HML para este cedente
 * antes de decidir a ordem de exclusão (`ordenarTabelasParaExclusaoEstrutural`,
 * regra 12 do `AGENTE.md`).
 *
 * Mesma estrutura de travessia de `cy.clonarGrafoEstruturalCedente`
 * (semente conhecida vs. busca de satélite via `montarCondicaoBuscaSatelite`),
 * mas sem inserir nada — só acumula os ids já existentes em HML por tabela
 * (`idsPorTabela`, `{ [tabela]: Set<idEmHml> }`), reaproveitados diretamente
 * como condição de busca de satélite da tabela seguinte (em HML, o id do pai
 * já É o id usado pelas FKs das tabelas filhas, ao contrário do INSERT, que
 * precisa de dois mapas separados — `idsHmlPorTabela`/`idsProdPorTabela` —
 * porque ali os ids de origem, em PROD, são diferentes dos ids gerados em
 * HML).
 * @param {string[]} ordemTabelas
 * @param {Object<string, Object[]>} sementes
 * @param {Object} mapeamento
 * @returns {Cypress.Chainable<Object<string, Set<number>>>}
 */
Cypress.Commands.add('descobrirGrafoEstruturalCedenteEmHml', (ordemTabelas, sementes, mapeamento) => {
  const idsPorTabela = {};
  const tabelasJaProcessadas = new Set();

  const registrarLinhas = (tabela, linhas) => {
    idsPorTabela[tabela] = idsPorTabela[tabela] ?? new Set();
    linhas.forEach((linha) => idsPorTabela[tabela].add(Number(linha.id)));
    tabelasJaProcessadas.add(tabela);
  };

  return ordemTabelas
    .filter((tabela) => classificarTabelaCedente(tabela).fase !== FASE_CATALOGO)
    .reduce((acumulado, tabela) => {
      const linhasSemente = sementes[tabela];

      return acumulado.then(() => {
        if (linhasSemente) {
          registrarLinhas(tabela, linhasSemente);
          return cy.wrap(null, { log: false });
        }

        const condicao = montarCondicaoBuscaSatelite(tabela, mapeamento, tabelasJaProcessadas, idsPorTabela);

        if (!condicao) {
          tabelasJaProcessadas.add(tabela);
          return cy.wrap(null, { log: false });
        }

        return cy
          .buscarLinhasSatelitesEmAmbiente('hml', tabela, condicao)
          .then((linhas) => registrarLinhas(tabela, linhas));
      });
    }, cy.wrap(null, { log: false }))
    .then(() => idsPorTabela);
});

/**
 * @description Executa em HML, na ordem informada (`ordemExclusao` —
 * sempre `ordenarTabelasParaExclusaoEstrutural`, filhas antes de pais, regra
 * 12 do `AGENTE.md`), o `DELETE` em lote (`montarDeleteEmLote`, lógica pura)
 * de cada tabela com ids descobertos por `cy.descobrirGrafoEstruturalCedenteEmHml`
 * — uma tabela sem nenhum id descoberto (não fazia parte do grafo deste
 * cedente em HML) é pulada, nunca um `DELETE` sem `WHERE`. Tabelas de
 * catálogo nunca são apagadas por este comando (são compartilhadas entre
 * cedentes — apagar quebraria outros registros que dependem delas).
 * @param {string[]} ordemExclusao
 * @param {Object<string, Set<number>>} idsPorTabela
 * @returns {Cypress.Chainable<Object<string, Set<number>>>}
 */
Cypress.Commands.add('executarExclusaoEstruturalEmHml', (ordemExclusao, idsPorTabela) =>
  ordemExclusao
    .filter((tabela) => classificarTabelaCedente(tabela).fase !== FASE_CATALOGO)
    .reduce((acumulado, tabela) => {
      const deleteSql = montarDeleteEmLote(tabela, idsPorTabela[tabela]);

      return acumulado.then(() => {
        if (!deleteSql) return cy.wrap(null, { log: false });
        return cy.executarQuery('hml', deleteSql);
      });
    }, cy.wrap(null, { log: false }))
    .then(() => idsPorTabela),
);
