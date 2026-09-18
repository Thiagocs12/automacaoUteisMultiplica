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

import {
  normalizarDocumento,
  decidirEstrategiaClonagemCedente,
  decidirAcaoOrquestracaoCedente,
  construirGrafoEstrutural,
  ordenarTabelasPorDependenciaEstrutural,
  ordenarTabelasParaExclusaoEstrutural,
  construirSementesGrafoEstrutural,
  cicloCascataCedenteDetectado,
  montarMensagemCicloCascataCedente,
  TABELA_ANCORA_POR_FASE,
  FASE_PROSPECT,
  FASE_POC,
  FASE_COMITE,
  FASE_CEDENTE,
  ESTRATEGIA_CRIAR,
  ACAO_CLONAGEM_BLOQUEADO,
  ACAO_CLONAGEM_APAGAR_E_RECRIAR,
} from '../shared/clonagemCedente';
import { MAPEAMENTO_CEDENTE_UNIFICADO } from '../../utils/mapeamentoCedente';

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
 * @description Busca em PROD o documento (CNPJ/CPF, com máscara, sem
 * normalizar) da pessoa vinculada a um `MC_CED_CEDENTE.id` — usado só pela
 * dependência `cascata` (`cy.resolverIdCedenteCascataEmHml` abaixo) para
 * descobrir qual documento a coluna `MC_CED_CEDENTE_VINCULADO.idCedenteVinculado`
 * aponta (o valor da coluna é o id do cedente vinculado, não o documento) antes
 * de localizá-lo/cloná-lo em HML pela mesma chave de match usada no cedente
 * principal. Devolve `null` se o id não existir em `MC_CED_CEDENTE` em PROD ou
 * a pessoa vinculada não tiver `cnpjCpf` — dado inconsistente, tratado como
 * erro por quem chama, não decidido aqui.
 * @param {number} idCedente - id de `MC_CED_CEDENTE` em PROD.
 * @returns {Cypress.Chainable<string|null>}
 */
Cypress.Commands.add('buscarDocumentoCedentePorIdEmProd', (idCedente) =>
  cy
    .executarQuery(
      'prod',
      `SELECT p.cnpjCpf FROM MC_CED_CEDENTE c INNER JOIN MC_CAD_PESSOA p ON p.id = c.idPessoa WHERE c.id = ${Number(idCedente)}`,
    )
    .then((registros) => (registros ?? [])[0]?.cnpjCpf ?? null),
);

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

/**
 * @description Resolve, em HML, o id do cedente vinculado referenciado por
 * `MC_CED_CEDENTE_VINCULADO.idCedenteVinculado` (dependência tipo `cascata`,
 * ver `duvidas.md`, tarefa 20260915130215, Resposta-7 item 2): se o cedente
 * vinculado (localizado pelo mesmo documento/CNPJ-CPF do cedente principal)
 * já existir em HML, usa o id existente **sem tocar nele** — nunca aciona
 * `apagar-e-recriar` como efeito colateral de resolver uma FK de um cedente
 * diferente do que está sendo clonado nesta execução. Só clona em cascata
 * (`cy.inserirGrafoCompletoCedenteEmHml`, o mesmo caminho de INSERT usado pela
 * ação `criar`, nunca o de `apagar-e-recriar`) quando o vinculado realmente
 * não existir ainda em HML.
 *
 * `cadeiaDocumentos` (documentos normalizados já em processamento nesta
 * execução, do mais externo para o mais interno) detecta ciclo (A vinculado a
 * B vinculado a A) e interrompe com erro descritivo
 * (`cicloCascataCedenteDetectado`/`montarMensagemCicloCascataCedente`,
 * `shared/clonagemCedente.js`) em vez de recursão infinita — decisão de
 * design, não de negócio: o Thiago já decidiu clonar em cascata ciente do
 * risco (Resposta-7), mas não há canal de dúvida bloqueante em tempo de
 * execução do Cypress, então um ciclo real vira erro imediato, mesmo padrão
 * já usado no modo único de clonagem de usuário Keycloak.
 * @param {number} idCedenteVinculadoProd - valor de origem da coluna (PROD).
 * @param {string[]} cadeiaDocumentos - documentos normalizados já em processamento.
 * @returns {Cypress.Chainable<number>}
 */
Cypress.Commands.add('resolverIdCedenteCascataEmHml', (idCedenteVinculadoProd, cadeiaDocumentos) =>
  cy.buscarDocumentoCedentePorIdEmProd(idCedenteVinculadoProd).then((documentoOrigem) => {
    if (!documentoOrigem) {
      throw new Error(
        `[resolverIdCedenteCascataEmHml] Nenhum cedente/pessoa em PROD para o id ${idCedenteVinculadoProd} (MC_CED_CEDENTE_VINCULADO.idCedenteVinculado) — dado inconsistente, não é uma decisão de escopo a tomar aqui.`,
      );
    }

    const documentoNormalizado = normalizarDocumento(documentoOrigem);

    if (cicloCascataCedenteDetectado(cadeiaDocumentos, documentoNormalizado)) {
      throw new Error(montarMensagemCicloCascataCedente(cadeiaDocumentos, documentoNormalizado));
    }

    return cy.buscarCedenteExistenteEmHmlPorDocumento(documentoNormalizado).then((cedenteHmlExistente) => {
      if (cedenteHmlExistente) {
        return cedenteHmlExistente.id;
      }

      return cy.resolverEstrategiaClonagemCedente(documentoNormalizado).then((resultadoEstrategiaVinculado) => {
        if (resultadoEstrategiaVinculado.estrategia !== ESTRATEGIA_CRIAR) {
          throw new Error(
            `[resolverIdCedenteCascataEmHml] Cedente vinculado (documento ${documentoNormalizado}) não pode ser clonado em cascata: ${resultadoEstrategiaVinculado.motivo ?? resultadoEstrategiaVinculado.estrategia}.`,
          );
        }

        return cy
          .inserirGrafoCompletoCedenteEmHml(resultadoEstrategiaVinculado, [...(cadeiaDocumentos ?? []), documentoNormalizado])
          .then(
            (resultadoClonagemVinculado) =>
              resultadoClonagemVinculado.idsHmlPorTabela?.[TABELA_ANCORA_POR_FASE[FASE_CEDENTE]]?.get(
                Number(idCedenteVinculadoProd),
              ),
          );
      });
    });
  }),
);

/**
 * @description Apaga em HML, na ordem de exclusão estrutural
 * (`ordenarTabelasParaExclusaoEstrutural`, filhas antes de pais, regra 12 do
 * `AGENTE.md`), o cadastro completo de um cedente já existente ("apaga e
 * refaz") — usado só pela ação `ACAO_CLONAGEM_APAGAR_E_RECRIAR`
 * (`cy.clonarCedenteCompleto`), nunca isoladamente por outro fluxo. As raízes
 * de prospect/POC/comitê a apagar são descobertas a partir das colunas
 * próprias de `cedenteHmlExistente` (`idProspect`/`idProposta`, nullable —
 * ver `docs/documentacao.md`, Ciclo 19, "O DELETE... tem o mesmo problema de
 * raiz única"), seguindo o mesmo raciocínio de "todas as propostas/comitês
 * relacionados" já usado do lado do INSERT
 * (`cy.buscarPropostasRelacionadasAoProspectEmAmbiente`/
 * `cy.buscarComitesRelacionadosEmAmbiente`), mas lendo de HML em vez de PROD.
 * Um `idProspect`/`idProposta` nulo em `cedenteHmlExistente` (coluna
 * opcional) simplesmente não semeia aquela fase — não é erro, só significa
 * que este cedente em HML não tem prospect/proposta própria vinculada.
 *
 * Tabelas de catálogo nunca são apagadas (`cy.executarExclusaoEstruturalEmHml`
 * já filtra isso) — são compartilhadas entre cedentes.
 * @param {Object} cedenteHmlExistente - linha de `MC_CED_CEDENTE` em HML (ver
 * `cy.buscarCedenteExistenteEmHmlPorDocumento`).
 * @returns {Cypress.Chainable<Object<string, Set<number>>>} ids apagados por tabela.
 */
Cypress.Commands.add('apagarCedenteEmHml', (cedenteHmlExistente) => {
  const buscarPropostas =
    cedenteHmlExistente.idProspect != null
      ? cy.buscarPropostasRelacionadasAoProspectEmAmbiente('hml', cedenteHmlExistente.idProspect)
      : cy.wrap([], { log: false });

  return buscarPropostas.then((propostas) =>
    cy.buscarComitesRelacionadosEmAmbiente('hml', propostas).then((comites) => {
      const sementes = {
        [TABELA_ANCORA_POR_FASE[FASE_CEDENTE]]: [cedenteHmlExistente],
        ...(cedenteHmlExistente.idProspect != null
          ? { [TABELA_ANCORA_POR_FASE[FASE_PROSPECT]]: [{ id: cedenteHmlExistente.idProspect }] }
          : {}),
        ...(propostas.length ? { [TABELA_ANCORA_POR_FASE[FASE_POC]]: propostas } : {}),
        ...(comites.length ? { [TABELA_ANCORA_POR_FASE[FASE_COMITE]]: comites } : {}),
      };

      const grafo = construirGrafoEstrutural(MAPEAMENTO_CEDENTE_UNIFICADO);
      const ordemInsercao = ordenarTabelasPorDependenciaEstrutural(grafo);
      const ordemExclusao = ordenarTabelasParaExclusaoEstrutural(grafo);

      return cy
        .descobrirGrafoEstruturalCedenteEmHml(ordemInsercao, sementes, MAPEAMENTO_CEDENTE_UNIFICADO)
        .then((idsPorTabela) => cy.executarExclusaoEstruturalEmHml(ordemExclusao, idsPorTabela));
    }),
  );
});

/**
 * @description Insere em HML o grafo estrutural completo de um cedente a
 * partir do prospect de origem já resolvido em PROD (`resultadoEstrategia`,
 * ver `cy.resolverEstrategiaClonagemCedente`): descobre em PROD todas as
 * propostas (POC) relacionadas ao prospect (via `MC_POC_PROSPECT`,
 * `cy.buscarPropostasRelacionadasAoProspectEmAmbiente`) e todos os comitês
 * relacionados a essas propostas (`cy.buscarComitesRelacionadosEmAmbiente`) —
 * ver `construirSementesGrafoEstrutural`/`shared/clonagemCedente.js` para o
 * porquê disso ser necessário (as âncoras de fase POC/comitê não são
 * descobríveis só a partir do prospect pela busca de satélite genérica) — e
 * então clona o grafo estrutural inteiro (`cy.clonarGrafoEstruturalCedente`)
 * a partir dessas raízes. Compartilhado pelas duas ações que terminam
 * inserindo (`inserir` e `apagar-e-recriar`, depois do DELETE) e também pela
 * clonagem em cascata de um cedente vinculado
 * (`cy.resolverIdCedenteCascataEmHml`) — nunca duplicado entre elas.
 * `cadeiaDocumentos` (documentos normalizados já em processamento nesta
 * execução) é só repassado adiante, até chegar em
 * `cy.resolverValoresDependenciasLinhaEstrutural` (`estruturaCedente.js`), que
 * o usa para detectar ciclo ao resolver uma dependência `cascata`.
 * @param {{prospectOrigem: object}} resultadoEstrategia
 * @param {string[]} cadeiaDocumentos - documentos normalizados já em processamento.
 * @returns {Cypress.Chainable<{idsHmlPorTabela: Object<string, Map<number, number>>, idsProdPorTabela: Object<string, Set<number>>}>}
 */
Cypress.Commands.add('inserirGrafoCompletoCedenteEmHml', (resultadoEstrategia, cadeiaDocumentos) =>
  cy
    .buscarPropostasRelacionadasAoProspectEmAmbiente('prod', resultadoEstrategia.prospectOrigem.id)
    .then((propostas) =>
      cy.buscarComitesRelacionadosEmAmbiente('prod', propostas).then((comites) => {
        const sementes = construirSementesGrafoEstrutural({
          tabelaProspect: TABELA_ANCORA_POR_FASE[FASE_PROSPECT],
          prospectOrigem: resultadoEstrategia.prospectOrigem,
          tabelaProposta: TABELA_ANCORA_POR_FASE[FASE_POC],
          propostas,
          tabelaComite: TABELA_ANCORA_POR_FASE[FASE_COMITE],
          comites,
        });

        const ordemTabelas = ordenarTabelasPorDependenciaEstrutural(construirGrafoEstrutural(MAPEAMENTO_CEDENTE_UNIFICADO));

        return cy.clonarGrafoEstruturalCedente(ordemTabelas, sementes, MAPEAMENTO_CEDENTE_UNIFICADO, cadeiaDocumentos);
      }),
    ),
);

/**
 * @description Orquestra a clonagem completa de um cedente de PROD para HML
 * a partir do CNPJ/CPF informado: resolve a estratégia
 * (`cy.resolverEstrategiaClonagemCedente`) e, conforme a ação decidida
 * (`decidirAcaoOrquestracaoCedente`, `shared/clonagemCedente.js`):
 *
 * - **bloqueado** (falta pessoa/prospect de origem em PROD): só loga o
 *   motivo, nenhuma escrita em HML.
 * - **apagar-e-recriar** (cedente já existe em HML): apaga o cadastro
 *   completo em HML (`cy.apagarCedenteEmHml`, ordem de
 *   `ordenarTabelasParaExclusaoEstrutural`) e então insere de novo a partir
 *   de PROD (`cy.inserirGrafoCompletoCedenteEmHml`) — nunca insere sem apagar
 *   primeiro (duplicaria o cadastro/quebraria por violação de chave).
 * - **inserir** (não existe em HML ainda): insere direto
 *   (`cy.inserirGrafoCompletoCedenteEmHml`), sem apagar nada antes.
 *
 * Sempre a raiz de uma nova cadeia de documentos (`cadeiaDocumentos = [documento
 * normalizado]`, ver `cy.resolverIdCedenteCascataEmHml`/`cicloCascataCedenteDetectado`,
 * `shared/clonagemCedente.js`) — este comando só é chamado no topo (feature/step),
 * nunca recursivamente pela própria dependência `cascata` (que usa
 * `cy.inserirGrafoCompletoCedenteEmHml` diretamente, para nunca arriscar
 * disparar `apagar-e-recriar` como efeito colateral de resolver uma FK de um
 * cedente vinculado já existente em HML).
 * @param {string} documento - CNPJ/CPF de origem, com ou sem máscara.
 * @returns {Cypress.Chainable<{estrategia: string, acao: string, motivo?: string, pessoaOrigem: object|null, prospectOrigem: object|null, cedenteHmlExistente: object|null, idsApagadosPorTabela?: Object<string, Set<number>>, idsHmlPorTabela?: Object<string, Map<number, number>>, idsProdPorTabela?: Object<string, Set<number>>}>}
 */
Cypress.Commands.add('clonarCedenteCompleto', (documento) => {
  const cadeiaDocumentos = [normalizarDocumento(documento)];

  return cy.resolverEstrategiaClonagemCedente(documento).then((resultadoEstrategia) => {
    const acao = decidirAcaoOrquestracaoCedente(resultadoEstrategia.estrategia);

    if (acao === ACAO_CLONAGEM_BLOQUEADO) {
      return cy
        .logExecucao(`[clonarCedenteCompleto] Bloqueado para "${documento}": ${resultadoEstrategia.motivo}`)
        .then(() => ({ ...resultadoEstrategia, acao }));
    }

    if (acao === ACAO_CLONAGEM_APAGAR_E_RECRIAR) {
      return cy
        .logExecucao(
          `[clonarCedenteCompleto] Já existe um cedente em HML para "${documento}" — apagando cadastro completo em HML antes de recriar a partir de PROD.`,
        )
        .then(() => cy.apagarCedenteEmHml(resultadoEstrategia.cedenteHmlExistente))
        .then((idsApagadosPorTabela) =>
          cy
            .inserirGrafoCompletoCedenteEmHml(resultadoEstrategia, cadeiaDocumentos)
            .then((resultadoClonagem) => ({ ...resultadoEstrategia, acao, idsApagadosPorTabela, ...resultadoClonagem })),
        );
    }

    return cy
      .inserirGrafoCompletoCedenteEmHml(resultadoEstrategia, cadeiaDocumentos)
      .then((resultadoClonagem) => ({ ...resultadoEstrategia, acao, ...resultadoClonagem }));
  });
});
