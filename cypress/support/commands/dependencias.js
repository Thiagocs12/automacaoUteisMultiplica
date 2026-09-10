// arquivo: dependencias.js

import { CAMINHO_LOG } from '../shared/constants';
import {
  extrairValoresDoCaminho,
  mesclarSemDuplicatas,
  normalizarObjetosNumericos,
  restaurarCamposOld,
} from '../shared/helpers';

/** Entidades ignoradas no fluxo de pesquisa de dependências de ligação */
const ENTIDADES_IGNORADAS = [
  'ESTEIRA_VALIDADOR',
  'GRUPOS_KEYCLOAK',
  'MULTIFLOW',
  'ESTEIRAS',
  'PRODUTO',
  'MOP',
  'POC',
];

/** Limites para cada entidade */
const LIMITE_ESTEIRAS = 20;
const LIMITE_PRODUTO = 20;
const LIMITE_MOP = 100;
const LIMITE_POC = 100;

/**
 * @description Pesquisa e vincula dependências de ligação entre entidades,
 * buscando dados de produção e salvando no diretório de output.
 * Suporta entidades especiais (CONDICOES, ACOES, OPERADORES, OBSERVADORES, GESTORES)
 * com comportamentos de busca e deduplicação diferenciados.
 * @param {Object} entidade - Mapeamento de entidades com suas configurações.
 * @returns {Cypress.Chainable<void>}
 */
Cypress.Commands.add('pesquisarDependenciasLigacao', (entidade) => {
  Object.entries(entidade)
    .filter(([chave]) => !ENTIDADES_IGNORADAS.includes(chave))
    .filter(
      ([, config]) =>
        config?.nomeArquivoReferencia &&
        config?.campoBusca &&
        config?.nomeArquivo &&
        (config?.urlListAll || config?.urlBuscaId),
    )
    .forEach(([chave, config]) => {
      cy.logExecucao(`[pesquisarDependenciasLigacao] ${chave}`);

      const { nomeArquivoReferencia, campoBusca, nomeArquivo, urlBuscaId, urlListAll } = config;
      const caminhoArquivo = `cypress/output/${nomeArquivo}`;
      const ehEntidadeSemBusca = ['ACOES', 'OPERADORES', 'OBSERVADORES', 'GESTORES'].includes(
        chave,
      );
      const ehArquivoBase = ['Produtos/1 - Produtos.json', 'Esteiras/1 - esteiras.json'].includes(
        nomeArquivoReferencia,
      );
      const deveZerar = config.adiciona != true;
      const registrosAcumulados = [];

      cy.readFile(`cypress/output/${nomeArquivoReferencia}`).then((dadosDoArquivo) => {
        const dadosFiltrados = (
          ehArquivoBase ? dadosDoArquivo.filter((item) => item.atualizar === true) : dadosDoArquivo
        ).map(normalizarObjetosNumericos);

        if (deveZerar) {
          cy.writeFile(caminhoArquivo, [], { log: false });
        }

        if (ehEntidadeSemBusca) {
          const campoDeduplicacao = chave === 'ACOES' ? 'id' : 'grupo';

          const objetosUnicos = dadosFiltrados
            .flatMap((dado) => extrairValoresDoCaminho(dado, campoBusca))
            .flatMap((item) => (Array.isArray(item) ? item : [item]))
            .filter((obj) => obj != null && typeof obj === 'object')
            .filter(
              (obj, index, self) =>
                obj?.[campoDeduplicacao] &&
                self.findIndex((o) => o[campoDeduplicacao] === obj[campoDeduplicacao]) === index,
            );

          cy.salvarNovosRegistros(objetosUnicos, caminhoArquivo, entidade);
          return;
        }

        const idsUnicos = [
          ...new Set(dadosFiltrados.flatMap((dado) => extrairValoresDoCaminho(dado, campoBusca))),
        ];

        if (urlListAll) {
          cy.executarRequest2('prod', urlListAll).then((resposta) => {
            const todos = Array.isArray(resposta.body)
              ? resposta.body
              : (resposta.body?.content ?? []);

            // ✅ Separa encontrados e não encontrados
            const idsEncontrados = new Set();

            todos
              .filter((item) => idsUnicos.includes(item.id))
              .forEach((item) => {
                if (!registrosAcumulados.some((r) => r.id === item.id)) {
                  registrosAcumulados.push(item);
                  idsEncontrados.add(item.id);
                }
              });

            // ✅ Fallback: IDs que o listAll não retornou
            const idsFaltando = idsUnicos.filter((id) => !idsEncontrados.has(id));

            if (idsFaltando.length && urlBuscaId) {
              cy.log(
                `[${chave}] listAll não retornou ${idsFaltando.length} item(s) — buscando por ID`,
              );

              idsFaltando.forEach((id) => {
                cy.executarRequest2('prod', `${urlBuscaId}${encodeURIComponent(id)}`).then(
                  (resposta) => {
                    const itens = Array.isArray(resposta.body) ? resposta.body : [resposta.body];
                    itens.forEach((item) => {
                      if (item?.id && !registrosAcumulados.some((r) => r.id === item.id)) {
                        registrosAcumulados.push(item);
                      }
                    });
                  },
                );
              });
            }
          });
        } else if (urlBuscaId) {
          // Sem listAll — busca direto por ID
          idsUnicos.forEach((id) => {
            cy.executarRequest2('prod', `${urlBuscaId}${encodeURIComponent(id)}`).then(
              (resposta) => {
                const itens = Array.isArray(resposta.body) ? resposta.body : [resposta.body];
                itens.forEach((item) => {
                  if (item?.id && !registrosAcumulados.some((r) => r.id === item.id)) {
                    registrosAcumulados.push(item);
                  }
                });
              },
            );
          });
        }

        cy.then(() => cy.salvarNovosRegistros(registrosAcumulados, caminhoArquivo, entidade));
      });
    });
});

/**
 * @description Salva registros no arquivo de output com comportamento diferenciado por entidade.
 *
 * Para demais entidades:
 * - Salva todos os dados recebidos da API sem validações adicionais
 *
 * @param {Array<Object>} novosDados - Lista de registros recebidos da API de produção.
 * @param {string} caminhoArquivo - Caminho do arquivo de output da entidade.
 * @param {Object} entidade - Mapa de entidades com seus metadados.
 * @returns {Cypress.Chainable<void>}
 */
Cypress.Commands.add('salvarNovosRegistros', (novosDados, caminhoArquivo, entidade) => {
  const chaveEntidade = Object.keys(entidade).find((chave) =>
    caminhoArquivo.endsWith(entidade[chave].nomeArquivo),
  );

  cy.task('lerJsonSeExistir', { caminhoArquivo }).then((dadosExistentes) => {
    cy.task('lerJsonSeExistir', { caminhoArquivo: CAMINHO_LOG }).then((logAtual) => {
      const agora = new Date();
      const TEMPO_LOG = 14 * 24 * 60 * 60 * 1000;
      const registrosLog = (logAtual ?? {})[chaveEntidade] ?? [];
      const listaExistente = dadosExistentes ?? [];
      const idsExistentes = new Set(listaExistente.map((item) => item.id));

      const LIMITE_LOTE =
        chaveEntidade === 'ESTEIRAS'
          ? LIMITE_ESTEIRAS
          : chaveEntidade === 'PRODUTO'
            ? LIMITE_PRODUTO
            : chaveEntidade === 'MOP'
              ? LIMITE_MOP
              : chaveEntidade === 'POC'
                ? LIMITE_POC
                : Infinity;

      const estaVencido = (id) => {
        const registroLog = registrosLog.find((r) => r.id === id);
        return !registroLog || agora - new Date(registroLog.dataAtualizacao) > TEMPO_LOG;
      };

      const apenasNovos = novosDados.filter((novo) => !idsExistentes.has(novo.id));

      const candidatos = listaExistente
        .map((existente) => {
          if (!novosDados.some((novo) => novo.id === existente.id)) return null;
          if (!estaVencido(existente.id)) return null;

          const registroLog = registrosLog.find((r) => r.id === existente.id);
          return {
            id: existente.id,
            dataOrdenacao: registroLog ? new Date(registroLog.dataAtualizacao) : new Date(0),
          };
        })
        .filter(Boolean);

      // ✅ apenasNovos também respeita o log
      const novosVencidos = apenasNovos
        .filter((novo) => estaVencido(novo.id))
        .map((novo) => {
          const registroLog = registrosLog.find((r) => r.id === novo.id);
          return {
            id: novo.id,
            dataOrdenacao: registroLog ? new Date(registroLog.dataAtualizacao) : new Date(0),
          };
        });

      const idsLoteParaAtualizar = [...candidatos, ...novosVencidos]
        .sort((a, b) => a.dataOrdenacao - b.dataOrdenacao)
        .slice(0, LIMITE_LOTE)
        .map((item) => item.id);

      const dadosAtualizados = [
        ...listaExistente.map((existente) => {
          const deveAtualizar = idsLoteParaAtualizar.includes(existente.id);
          const dadoNovo = deveAtualizar
            ? novosDados.find((novo) => novo.id === existente.id)
            : null;
          // Para entidades sem limite de lote (ex.: ETAPAS, que dependem do
          // 'atualizar' da ESTEIRA pai para entrar no fetch da rodada), nunca
          // rebaixa para false um item que ainda não existe em HML — senão ele
          // fica travado para sempre, pois criarItensInexistentesPorNivel só cria
          // quem tem atualizar === true. Entidades com LIMITE_LOTE real (ESTEIRAS,
          // PRODUTO, MOP, POC) continuam respeitando o corte do lote normalmente.
          const precisaCriar = !Number.isFinite(LIMITE_LOTE) && existente.idHml == null;

          return {
            ...(dadoNovo ?? existente),
            idHml: existente.idHml,
            atualizar: deveAtualizar || precisaCriar,
          };
        }),
        ...apenasNovos.map((novo) => ({
          ...novo,
          idHml: null,
          atualizar: idsLoteParaAtualizar.includes(novo.id),
        })),
      ];

      cy.writeFile(caminhoArquivo, dadosAtualizados);
    });
  });
});

/**
 * @description Itera sobre todas as entidades de um determinado nível de dependência
 * e substitui os IDs de produção pelos IDs equivalentes no ambiente HML,
 * com base nas configurações de dependência de cada entidade.
 * Ignora 'GRUPOS_KEYCLOAK' e entidades sem dependências definidas.
 * @param {number} nivel - Nível de dependência das entidades a serem processadas.
 * @param {Object} mapeamentoEntidade - Mapeamento de entidades com suas configurações.
 * @returns {Cypress.Chainable<void>}
 */
Cypress.Commands.add('atualizarIdsDeDependencias', (nivel, mapeamentoEntidade) => {
  for (const chaveEntidade in mapeamentoEntidade) {
    if (!Object.prototype.hasOwnProperty.call(mapeamentoEntidade, chaveEntidade)) continue;

    const entidade = mapeamentoEntidade[chaveEntidade];

    if (
      chaveEntidade === 'GRUPOS_KEYCLOAK' ||
      entidade.nivelDependencia !== nivel ||
      !entidade.dependencia?.length
    )
      continue;

    cy.logExecucao(`[atualizarIdsDeDependencias] ${chaveEntidade}`);

    const removerSeNaoEncontrado = entidade.removerSeNaoEncontrado === true;

    cy.readFile(`cypress/output/${entidade.nomeArquivo}`).then((itensRaw) => {
      const itens = normalizarObjetosNumericos(itensRaw);

      cy.wrap(entidade.dependencia)
        .each((dependencia) => {
          const { arquivoDependencia, idSubstituido } = dependencia;
          const idDependecia = dependencia.idDependecia || 'id';

          return cy.readFile(`cypress/output/${arquivoDependencia}`).then((dependencias) => {
            const dependenciasNormalizadas = normalizarObjetosNumericos(dependencias);

            const listaDependencias = Array.isArray(dependenciasNormalizadas[0])
              ? dependenciasNormalizadas.flat()
              : dependenciasNormalizadas;

            const partes = idSubstituido.split('.');
            const chaveId = partes[partes.length - 1];
            const chaveOld = `${chaveId}.old`;
            const partesParent = partes.slice(0, -1);

            const marcarRemocao = (itemRaiz) => {
              if (removerSeNaoEncontrado) itemRaiz._remover = true;
            };

            const substituirIdsParametro = (objeto, chave) => {
              // Esta função só deve ser chamada se idSubstituido for 'valor'
              if (idSubstituido !== 'valor') return false;
              if (!objeto || typeof objeto !== 'object') return false;

              const chaveOldParametro = `${chave}.old`;
              const valorAtual = objeto[chave];

              // Se o valor não for uma string ou estiver vazio, não faz sentido processar como IDs separados por vírgula
              if (typeof valorAtual !== 'string' || !valorAtual.trim()) {
                return false;
              }

              // Salva o valor original em chaveOldParametro APENAS SE AINDA NÃO EXISTIR
              if (!Object.prototype.hasOwnProperty.call(objeto, chaveOldParametro)) {
                objeto[chaveOldParametro] = valorAtual;
              }

              const idsAtuais = valorAtual
                .split(',')
                .map((id) => id.trim())
                .filter(Boolean);

              const idsAtualizados = idsAtuais.map((idAtual) => {
                const equivalente = listaDependencias.find(
                  (dep) =>
                    dep &&
                    dep[idDependecia] != null &&
                    String(dep[idDependecia]).trim() === String(idAtual).trim()
                );

                if (!equivalente || equivalente.idHml == null) {
                  // Se não encontrou equivalente nesta dependência, mantém o ID original
                  return idAtual;
                }

                return String(equivalente.idHml).trim();
              });

              // Atualiza o campo com os IDs que foram substituídos e os que não foram
              objeto[chave] = idsAtualizados.join(',');

              return true;
            };

            const substituir = (atual, partesRestantes, itemRaiz) => {
              if (!atual || partesRestantes.length === 0) return;

              if (Array.isArray(atual)) {
                atual.forEach((elemento) => substituir(elemento, partesRestantes, itemRaiz));
                return;
              }

              const chaves = Object.keys(atual);
              if (chaves.length > 0 && chaves.every((c) => /^\d+$/.test(c))) {
                chaves.forEach((chave) => substituir(atual[chave], partesRestantes, itemRaiz));
                return;
              }

              const [proxima, ...resto] = partesRestantes;

              if (resto.length === 0) {
                // Se idSubstituido é 'valor', tenta substituir como parâmetro de IDs
                if (idSubstituido === 'valor' && substituirIdsParametro(atual, proxima)) {
                  return; // Se foi tratado como parâmetro de IDs, não faz mais nada
                }

                // Lógica original para substituição de ID único
                const elemento = atual[proxima];

                if (Array.isArray(elemento)) {
                  elemento.forEach((el) => {
                    // Salva o idOriginal em chaveOld APENAS SE AINDA NÃO EXISTIR
                    if (!Object.prototype.hasOwnProperty.call(el, chaveOld)) {
                      const idOriginal = el[chaveId];
                      if (!idOriginal) return;

                      const equivalente = listaDependencias.find(
                        (dep) => dep[idDependecia] === idOriginal,
                      );

                      if (!equivalente || equivalente.idHml == null) {
                        marcarRemocao(itemRaiz);
                        return;
                      }

                      el[chaveOld] = idOriginal;
                      el[chaveId] = equivalente.idHml;
                    }
                  });
                } else if (elemento && typeof elemento === 'object') {
                  // Salva o idOriginal em chaveOld APENAS SE AINDA NÃO EXISTIR
                  if (!Object.prototype.hasOwnProperty.call(elemento, chaveOld)) {
                    const idOriginal = elemento[chaveId];
                    if (!idOriginal) return;

                    const equivalente = listaDependencias.find(
                      (dep) => dep[idDependecia] === idOriginal,
                    );

                    if (!equivalente || equivalente.idHml == null) {
                      marcarRemocao(itemRaiz);
                      return;
                    }

                    elemento[chaveOld] = idOriginal;
                    elemento[chaveId] = equivalente.idHml;
                  }
                }
                return;
              }

              substituir(atual[proxima], resto, itemRaiz);
            };

            itens.forEach((item) => {
              if (partesParent.length === 0) {
                // Se idSubstituido é 'valor', tenta substituir como parâmetro de IDs
                if (idSubstituido === 'valor' && substituirIdsParametro(item, chaveId)) {
                  return; // Se foi tratado como parâmetro de IDs, não faz mais nada
                }

                // Lógica original para substituição de ID único no nível raiz do item
                // Salva o idOriginal em chaveOld APENAS SE AINDA NÃO EXISTIR
                if (!Object.prototype.hasOwnProperty.call(item, chaveOld)) {
                  const idOriginal = item[chaveId];
                  if (!idOriginal) return;

                  const equivalente = listaDependencias.find(
                    (dep) => dep[idDependecia] === idOriginal,
                  );

                  if (!equivalente || equivalente.idHml == null) {
                    marcarRemocao(item);
                    return;
                  }

                  item[chaveOld] = idOriginal;
                  item[chaveId] = equivalente.idHml;
                }
              } else {
                substituir(item, partesParent, item);
              }
            });
          });
        })
        .then(() => {
          const itensFinal = removerSeNaoEncontrado
            ? itens.filter((item) => !item._remover)
            : itens;

          cy.writeFile(`cypress/output/${entidade.nomeArquivo}`, itensFinal);
        });
    });
  }
});

/**
 * @description Restaura os IDs originais de produção nos arquivos de output,
 * revertendo as substituições feitas pelo comando 'atualizarIdsDeDependencias'.
 * Ignora 'GRUPOS_KEYCLOAK' e entidades sem dependências definidas.
 * @param {Object} entidade - Mapeamento de entidades com suas configurações.
 * @returns {Cypress.Chainable<void>}
 */
Cypress.Commands.add('voltarIdsOriginais', (entidade) => {
  for (const chaveEntidade in entidade) {
    if (!Object.prototype.hasOwnProperty.call(entidade, chaveEntidade)) continue;

    const configEntidade = entidade[chaveEntidade];

    if (chaveEntidade === 'GRUPOS_KEYCLOAK' || !configEntidade.dependencia?.length) continue;

    const caminhoArquivo = `cypress/output/${configEntidade.nomeArquivo}`;

    cy.task('lerJsonSeExistir', { caminhoArquivo }).then((itens) => {
      if (!itens) return;
      cy.writeFile(
        caminhoArquivo,
        itens.map((item) => restaurarCamposOld(item)),
      );
    });
  }
});

/**
 * @description Pesquisa no banco de produção as dependências referenciadas nos arquivos de output
 * e salva os registros encontrados no arquivo correspondente de cada entidade.
 * @param {Object} mapeamento - Mapeamento das entidades e de suas referências de banco.
 * @param {boolean} [adiciona=false] - Indica se os registros devem ser mesclados ao arquivo existente.
 * @returns {Cypress.Chainable<void>}
 */
Cypress.Commands.add('pesquisarDependenciasBanco', (mapeamento, adiciona = false) => {
  const entidadesComDependencia = Object.entries(mapeamento)
    .filter(([chave]) => !ENTIDADES_IGNORADAS.includes(chave))
    .filter(([, entidade]) => entidade.arquivoReferencia && entidade.camposReferencia)
    .map(([, entidade]) => entidade);

  if (entidadesComDependencia.length === 0) {
    cy.logExecucao('[pesquisarDependenciasBanco] Nenhuma entidade com dependência definida');
    return;
  }

  cy.wrap(entidadesComDependencia).each((entidade) => {
    cy.logExecucao(`[pesquisarDependenciasBanco] ${entidade.chaveLog}`);

    const caminhoArquivo = `cypress/output/${entidade.nomeArquivo}`;
    const arquivoReferencia = `cypress/output/${entidade.arquivoReferencia}`;

    const inicializar = adiciona
      ? cy.wrap(null)
      : cy.task('escreverJson', { caminhoArquivo, conteudo: [] });

    inicializar.then(() => {
      cy.task('lerJsonSeExistir', { caminhoArquivo: arquivoReferencia }).then((dadosReferencia) => {
        if (!dadosReferencia?.length) {
          cy.logExecucao(`[pesquisarDependenciasBanco] ${entidade.chaveLog}: referência vazia (${arquivoReferencia})`);
          return;
        }

        const filtros = Object.entries(entidade.camposReferencia).map(
          ([campoTabela, campoArquivo]) => ({
            campoTabela,
            valores: [
              ...new Set(
                dadosReferencia
                  .flatMap((item) => extrairValoresDoCaminho(item, campoArquivo))
                  .filter((v) => v != null),
              ),
            ],
          }),
        );

        cy.executarQuery('prod', `SELECT * FROM ${entidade.tabela}`).then((registrosHml) => {
          // Comparação tolerante a tipo: colunas numeric/decimal costumam voltar do
          // msnodesqlv8 como string, enquanto os valores extraídos do JSON são number —
          // `.includes()` estrito filtraria tudo fora mesmo com as linhas existindo.
          const registrosFiltrados = registrosHml.filter((item) =>
            filtros.every(({ campoTabela, valores }) =>
              valores.some((valor) => String(valor) === String(item[campoTabela])),
            ),
          );

          if (adiciona) {
            cy.task('lerJsonSeExistir', { caminhoArquivo }).then((existentes) => {
              const mesclado = mesclarSemDuplicatas(existentes ?? [], registrosFiltrados, 'id');
              cy.task('escreverJson', { caminhoArquivo, conteudo: mesclado });
            });
          } else {
            cy.task('escreverJson', { caminhoArquivo, conteudo: registrosFiltrados });
          }
        });
      });
    });
  });
});
