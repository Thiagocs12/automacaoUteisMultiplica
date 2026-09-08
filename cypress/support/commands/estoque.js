// arquivo: estoque.js

/** Caminho do arquivo que armazena o estoque de IDs de produção e HML. */
const CAMINHO_ESTOQUE = 'cypress/output/estoqueIds.json';

/** Período máximo de validade dos registros mantidos no estoque de IDs. */
const TEMPO_ESTOQUE = 60 * 24 * 60 * 60 * 1000;

/** Entidades que não devem participar dos fluxos de leitura e atualização do estoque. */
const ENTIDADE_SEM_ESTOQUE = [
  'OBSERVADORES',
  'OPERADORES',
  'GESTORES',
];

/**
 * Atualiza o estoque de IDs de produção e HML a partir dos arquivos
 * associados às entidades do mapeamento.
 *
 * @param {Object} mapeamentoEntidade Mapeamento das entidades.
 * @returns {Cypress.Chainable<void>}
 */
Cypress.Commands.add('atualizarEstoqueIds', (mapeamentoEntidade) => {
  const possuiValorValido = (valor) =>
    valor !== null && valor !== undefined && !(typeof valor === 'string' && valor.trim() === '');

  const gerarChaveId = (id) => `${typeof id}:${String(id)}`;

  const entidadesParaProcessar = Object.entries(mapeamentoEntidade)
    .filter(([chaveEntidade]) => !ENTIDADE_SEM_ESTOQUE.includes(chaveEntidade))
    .filter(
      ([, entidade]) =>
        typeof entidade?.nomeArquivo === 'string' && entidade.nomeArquivo.trim() !== '',
    );

  return cy
    .task('lerJsonSeExistir', { caminhoArquivo: CAMINHO_ESTOQUE }, { log: false })
    .then((estoqueExistente) => {
      const estoque =
        estoqueExistente && typeof estoqueExistente === 'object' && !Array.isArray(estoqueExistente)
          ? estoqueExistente
          : {};

      return cy
        .wrap(entidadesParaProcessar, { log: false })
        .each(([chaveEntidade, entidade]) => {
          const caminhoArquivo = `cypress/output/${entidade.nomeArquivo}`;

          return cy
            .task('lerJsonSeExistir', { caminhoArquivo }, { log: false })
            .then((dadosDoArquivo) => {
              if (!Array.isArray(dadosDoArquivo) || !dadosDoArquivo.length) {
                return;
              }

              if (!Array.isArray(estoque[chaveEntidade])) {
                estoque[chaveEntidade] = [];
              }

              const estoqueDaEntidade = estoque[chaveEntidade];

              const indicesPorIdProducao = new Map(
                estoqueDaEntidade.reduce((indices, registro, indice) => {
                  if (possuiValorValido(registro?.idProducao)) {
                    indices.push([gerarChaveId(registro.idProducao), indice]);
                  }

                  return indices;
                }, []),
              );

              let possuiRegistroForaDoPadrao = false;

              dadosDoArquivo.forEach((item) => {
                const ehObjetoPrimeiroNivel =
                  item !== null && typeof item === 'object' && !Array.isArray(item);

                if (!ehObjetoPrimeiroNivel) {
                  possuiRegistroForaDoPadrao = true;
                  return;
                }

                const idProducao = item.id;
                const idHml = item.idHml;

                if (!possuiValorValido(idProducao) || !possuiValorValido(idHml)) {
                  possuiRegistroForaDoPadrao = true;
                  return;
                }

                const chaveIdProducao = gerarChaveId(idProducao);
                const indiceExistente = indicesPorIdProducao.get(chaveIdProducao);

                if (indiceExistente !== undefined) {
                  const registroExistente = estoqueDaEntidade[indiceExistente];

                  if (registroExistente.idHml !== idHml) {
                    estoqueDaEntidade[indiceExistente] = {
                      idProducao,
                      idHml,
                      dataAtualizacao: new Date().toISOString().replace('T', ' ').slice(0, 23),
                    };
                  }

                  return;
                }

                estoqueDaEntidade.push({
                  idProducao,
                  idHml,
                  dataAtualizacao: new Date().toISOString().replace('T', ' ').slice(0, 23),
                });

                indicesPorIdProducao.set(chaveIdProducao, estoqueDaEntidade.length - 1);
              });

              if (possuiRegistroForaDoPadrao) {
                cy.log(
                  `[atualizarEstoqueIds] "${chaveEntidade}" possui registro(s) sem id ou idHml diretamente no primeiro nível.`,
                );
              }
            });
        })
        .then(() => cy.writeFile(CAMINHO_ESTOQUE, estoque, { log: false }));
    });
});

/**
 * @description Preenche os IDs de HML nos arquivos de output a partir do estoque vigente.
 * Invalida os IDs associados a registros de estoque vencidos para permitir uma nova pesquisa em HML.
 * @param {Object} mapeamentoEntidade - Mapeamento das entidades e de seus arquivos de output.
 * @returns {Cypress.Chainable<void>}
 */
Cypress.Commands.add('preencherIdsHmlPeloEstoque', (mapeamentoEntidade) => {
  const possuiValorValido = (valor) =>
    valor !== null && valor !== undefined && !(typeof valor === 'string' && valor.trim() === '');

  const gerarChaveId = (id) => `${typeof id}:${String(id)}`;

  return cy
    .task('lerJsonSeExistir', { caminhoArquivo: CAMINHO_ESTOQUE }, { log: false })
    .then((estoque) => {
      if (!estoque || typeof estoque !== 'object' || Array.isArray(estoque)) {
        return;
      }

      let estoqueAlterado = false;

      const entidadesParaProcessar = Object.entries(mapeamentoEntidade)
        .filter(([chaveEntidade]) => !ENTIDADE_SEM_ESTOQUE.includes(chaveEntidade))
        .filter(
          ([, entidade]) =>
            typeof entidade?.nomeArquivo === 'string' && entidade.nomeArquivo.trim() !== '',
        );

      return cy
        .wrap(entidadesParaProcessar, { log: false })
        .each(([chaveEntidade, entidade]) => {
          const estoqueDaEntidade = estoque[chaveEntidade];

          if (!Array.isArray(estoqueDaEntidade) || !estoqueDaEntidade.length) {
            return;
          }

          const registrosPorIdProducao = new Map(
            estoqueDaEntidade
              .filter((registro) => possuiValorValido(registro?.idProducao))
              .map((registro) => [gerarChaveId(registro.idProducao), registro]),
          );

          const caminhoArquivo = `cypress/output/${entidade.nomeArquivo}`;

          return cy
            .task('lerJsonSeExistir', { caminhoArquivo }, { log: false })
            .then((dadosDoArquivo) => {
              if (!Array.isArray(dadosDoArquivo) || !dadosDoArquivo.length) {
                return;
              }

              let arquivoAlterado = false;

              const dadosAtualizados = dadosDoArquivo.map((item) => {
                if (
                  !item ||
                  typeof item !== 'object' ||
                  Array.isArray(item) ||
                  !possuiValorValido(item.id)
                ) {
                  return item;
                }

                const registroEstoque = registrosPorIdProducao.get(gerarChaveId(item.id));

                if (!registroEstoque) {
                  return item;
                }

                const dataAtualizacao = new Date(
                  String(registroEstoque.dataAtualizacao).replace(' ', 'T'),
                );

                const estoqueVencido =
                  Number.isNaN(dataAtualizacao.getTime()) ||
                  Date.now() - dataAtualizacao.getTime() > TEMPO_ESTOQUE;

                if (estoqueVencido) {
                  registroEstoque.dataAtualizacao = new Date()
                    .toISOString()
                    .replace('T', ' ')
                    .slice(0, 23);

                  estoqueAlterado = true;

                  if (item.idHml !== null) {
                    arquivoAlterado = true;
                    return {
                      ...item,
                      idHml: null,
                    };
                  }

                  return item;
                }

                if (possuiValorValido(item.idHml) || !possuiValorValido(registroEstoque.idHml)) {
                  return item;
                }

                arquivoAlterado = true;

                return {
                  ...item,
                  idHml: registroEstoque.idHml,
                };
              });

              if (arquivoAlterado) {
                return cy.writeFile(caminhoArquivo, dadosAtualizados, { log: false });
              }
            });
        })
        .then(() => {
          if (estoqueAlterado) {
            return cy.writeFile(CAMINHO_ESTOQUE, estoque, { log: false });
          }
        });
    });
});
