// arquivo: sincronizacaoNivel.js

import { obterValor } from '../utils';
import { CAMINHO_LOG } from '../shared/constants';
import {
  mesclarLog,
  normalizarCamposLista,
  normalizarObjetosNumericos,
  removerCamposOld,
  removerChavesIgnoradas,
} from '../shared/helpers';

/** Entidades que não atualizam */
const ENTIDADES_SEM_ATUALIZACAO = [
  'TIPOESTEIRAS_VINCULADAS',
  'CLASSIFICACAO_GARANTIA',
  'CLASSIFICACAO_PRODUTO',
  'GRUPO_PRODUTO_RISCO',
  'SEGMENTO_TARIFADOR',
  'PRODUTO_INDEXADOR',
  'PRODUTO_GARANTIA',
  'GRUPOS_KEYCLOAK',
  'MOTIVOS_RETORNO',
  'PRODUTO_TARIFA',
  'GRUPO_GARANTIA',
  'NIVEL_GARANTIA',
  'KIT_DOCUMENTO',
  'TIPO_SITUACAO',
  'TIPO_GARANTIA',
  'OBSERVADORES',
  'TIPOESTEIRAS',
  'PRODUTO_KIT',
  'TIPO_EVENTO',
  'OPERADORES',
  'CONDICOES',
  'GESTORES',
];

/**
 * @description Pesquisa no ambiente HML o ID equivalente para cada item do arquivo de output,
 * salvando o resultado em 'idHml'. Suporta busca simples, busca composta (array de campos)
 * e busca especial para entidades Keycloak (sem parâmetro na URL).
 * Ignora itens que já possuem 'idHml' preenchido.
 * @param {number} nivel - Nível de dependência das entidades a serem processadas.
 * @param {Object} mapeamentoEntidade - Mapeamento de entidades com suas configurações.
 * @returns {Cypress.Chainable<void>}
 */
Cypress.Commands.add('pesquisarItensPorNivel', (nivel, mapeamentoEntidade) => {
  for (const chaveEntidade in mapeamentoEntidade) {
    if (!Object.prototype.hasOwnProperty.call(mapeamentoEntidade, chaveEntidade)) {
      continue;
    }

    const entidade = mapeamentoEntidade[chaveEntidade];

    if (
      ['GRUPOS_KEYCLOAK', 'CONDICOES'].includes(chaveEntidade) ||
      entidade.nivelDependencia !== nivel
    ) {
      continue;
    }

    const nomeArquivo = entidade.nomeArquivo;
    const campoDescricao = entidade.campoDescricao || 'descricao';
    const contentBusca = entidade.contentBusca || 'falseId';

    const entidadeKeycloak = [
      'OPERADORES',
      'OBSERVADORES',
      'GESTORES',
    ].includes(chaveEntidade);

    const CAMPO_DESCRICAO_KEYCLOAK = 'name';

    const normalizarValor = (valor) =>
      String(valor ?? '')
        .trim()
        .toLowerCase();

    // Algumas entidades têm nomes diferentes entre ambientes por diferença de
    // configuração (ex.: tipo de esteira "OPE" em produção é "MOP" em HML).
    // Quando `entidade.traducaoBusca` está definido, o valor é traduzido antes
    // de consultar/comparar com HML — a busca por chave é sempre feita ignorando
    // maiúsculas/minúsculas.
    const traduzirParaHml = (valor) => {
      const mapa = entidade.traducaoBusca;
      if (!mapa) return valor;

      const chaveEncontrada = Object.keys(mapa).find(
        (chave) => normalizarValor(chave) === normalizarValor(valor),
      );

      return chaveEncontrada ? mapa[chaveEncontrada] : valor;
    };

    const extrairContent = (body) => {
      if (Array.isArray(body)) {
        return body;
      }

      return (
        body?.tiposEsteira ||
        body?.modelosAcao ||
        body?.motivosRetornoEsteira ||
        body?.modelosSubEtapa ||
        body?.modelosEtapa ||
        body?.modelosEsteira ||
        body?.content ||
        []
      );
    };

    // Acumula os pares {idProducao, idHml} resolvidos para esta entidade e
    // persiste com uma única leitura+escrita ao final (cy.aplicarResolucoesIdHml),
    // em vez de 1 leitura + 1 escrita de arquivo por item — a pesquisa em HML é
    // apenas leitura (idempotente), então perder o progresso de um crash no meio
    // do processamento é barato de refazer.
    const resolucoesAcumuladas = [];
    const registrarResolucao = (idOriginal, id) => {
      if (idOriginal == null) return;
      resolucoesAcumuladas.push({ idProducao: idOriginal, idHml: id });
    };

    if (Array.isArray(contentBusca)) {
      cy.lerJsonDeOutput(nomeArquivo).then((dadosDoArquivo) => {
        const dadosPendentes = dadosDoArquivo.filter((dado) => {
          if (dado.idHml !== null && dado.idHml !== undefined) {
            return false;
          }

          if (chaveEntidade === 'ESTEIRAS' && dado.atualizar !== true) {
            return false;
          }

          return true;
        });
        const gruposPorPrimeiroCampo = new Map();

        for (const dado of dadosPendentes) {
          const valorChave1 = obterValor(dado, contentBusca[0]);
          const chaveAgrupamento = normalizarValor(valorChave1);

          if (!gruposPorPrimeiroCampo.has(chaveAgrupamento)) {
            gruposPorPrimeiroCampo.set(chaveAgrupamento, {
              valorChave1,
              dados: [],
            });
          }

          gruposPorPrimeiroCampo.get(chaveAgrupamento).dados.push(dado);
        }
        return Array.from(gruposPorPrimeiroCampo.values())
          .reduce((cadeiaDeGrupos, grupo) => {
            return cadeiaDeGrupos.then(() => {
              const { valorChave1, dados } = grupo;

              return cy
                .executarRequest2(
                  'hml',
                  `${entidade.urlBusca}${encodeURIComponent(valorChave1)}`,
                )
                .then((resposta) => {
                  const content = extrairContent(resposta.body);

                  /*
                   * Processa todos os registros encontrados para o mesmo
                   * primeiro campo utilizando o retorno de uma única chamada.
                   */
                  dados.forEach((dado) => {
                    const valorChave2 = obterValor(dado, contentBusca[1]);

                    const itemEncontrado = content.find((item) => {
                      const valorRetornado = obterValor(item, contentBusca[1]);

                      return (
                        normalizarValor(valorRetornado) ===
                        normalizarValor(valorChave2)
                      );
                    });

                    registrarResolucao(dado.id, itemEncontrado?.id ?? null);
                  });
                });
            });
          }, cy.wrap(null, { log: false }))
          .then(() => cy.aplicarResolucoesIdHml(nomeArquivo, resolucoesAcumuladas));
      });

      continue;
    }

    cy.lerJsonDeOutput(nomeArquivo).then((dadosDoArquivo) => {
      const dadosPendentes = dadosDoArquivo.filter((dado) => {
        if (dado.idHml !== null && dado.idHml !== undefined) {
          return false;
        }

        if (chaveEntidade === 'ESTEIRAS' && dado.atualizar !== true) {
          return false;
        }

        return true;
      });

      if (entidadeKeycloak) {
        return cy
          .executarRequest2('hml', entidade.urlBusca)
          .then((resposta) => {
            const content = extrairContent(resposta.body);

            dadosPendentes.forEach((dado) => {
              const valorBusca = obterValor(dado, campoDescricao);

              const itemEncontrado = content.find((item) => {
                return (
                  normalizarValor(item?.[CAMPO_DESCRICAO_KEYCLOAK]) ===
                  normalizarValor(valorBusca)
                );
              });

              registrarResolucao(dado.id, itemEncontrado?.id ?? null);
            });
          })
          .then(() => cy.aplicarResolucoesIdHml(nomeArquivo, resolucoesAcumuladas));
      }

      // Agrupa por valor normalizado de busca antes de consultar HML: evita disparar
      // uma requisição idêntica por registro quando há nomes duplicados (ex.: duas
      // etapas de mesmo nome em esteiras diferentes) — cada registro do grupo ainda
      // é resolvido individualmente pelo seu próprio id de produção.
      const gruposPorValorBusca = new Map();

      for (const dado of dadosPendentes) {
        const valorBusca = traduzirParaHml(obterValor(dado, campoDescricao));
        const chaveAgrupamento = normalizarValor(valorBusca);

        if (!gruposPorValorBusca.has(chaveAgrupamento)) {
          gruposPorValorBusca.set(chaveAgrupamento, { valorBusca, dados: [] });
        }

        gruposPorValorBusca.get(chaveAgrupamento).dados.push(dado);
      }

      return Array.from(gruposPorValorBusca.values())
        .reduce((cadeia, grupo) => {
          return cadeia.then(() => {
            const { valorBusca, dados } = grupo;

            return cy
              .executarRequest2(
                'hml',
                `${entidade.urlBusca}${encodeURIComponent(valorBusca)}`,
              )
              .then((resposta) => {
                const content = extrairContent(resposta.body);

                const itemEncontrado = content.find((item) => {
                  const valorRetornado = obterValor(item, campoDescricao);

                  return (
                    normalizarValor(valorRetornado) ===
                    normalizarValor(valorBusca)
                  );
                });

                const id = itemEncontrado?.id ?? null;

                dados.forEach((dado) => registrarResolucao(dado.id, id));
              });
          });
        }, cy.wrap(null, { log: false }))
        .then(() => cy.aplicarResolucoesIdHml(nomeArquivo, resolucoesAcumuladas));
    });
  }
});

/**
 * @description Cria no ambiente HML os itens que ainda não possuem 'idHml' (idHml === null),
 * para todas as entidades do nível de dependência informado.
 * Entidades Keycloak (OPERADORES) possuem tratamento especial:
 * o campo 'grupo' é renomeado para 'name' no body e o 'idHml' não é salvo após criação.
 * @param {number} nivel - Nível de dependência das entidades a serem processadas.
 * @param {Object} mapeamentoEntidade - Mapeamento de entidades com suas configurações.
 * @returns {Cypress.Chainable<void>}
 */
Cypress.Commands.add('criarItensInexistentesPorNivel', (nivel, mapeamentoEntidade) => {
  for (const chaveEntidade in mapeamentoEntidade) {
    if (!Object.prototype.hasOwnProperty.call(mapeamentoEntidade, chaveEntidade)) continue;

    const entidade = mapeamentoEntidade[chaveEntidade];

    if (
      ['GRUPOS_KEYCLOAK', 'CONDICOES', 'OBSERVADORES', 'GESTORES'].includes(chaveEntidade) ||
      entidade.nivelDependencia !== nivel
    )
      continue;

    const entidadeKeycloak = chaveEntidade === 'OPERADORES';
    const method = entidade.method || 'POST';
    const env = entidade.env || 'hml';
    const caminhoArquivo = `cypress/output/${entidade.nomeArquivo}`;
    const campoDescricao = entidade.campoDescricao || 'descricao';
    const chavesIgnoradas = [
      'idHml',
      'id',
      'dataCadastro',
      'dataUltimaAlteracao',
      'usuarioCadastro',
      'usuarioUltimaAlteracao',
      'usuario',
      'atualizar',
      'tipoSeguranca',
      'podeAlterarFormulario',
      ...(entidade.chavesIgnoradas || []),
    ];

    cy.readFile(caminhoArquivo).then((itens) => {
      const itensValidos = itens
        .filter((item) => item.idHml === null)
        .filter((item) => item.atualizar === true);

      const log = {};

      itensValidos.forEach((item) => {
        let camposLimpos = removerCamposOld(removerChavesIgnoradas(item, chavesIgnoradas));

        if (entidadeKeycloak && 'grupo' in camposLimpos) {
          const { grupo, ...restante } = camposLimpos;
          camposLimpos = { ...restante, name: grupo };
        }

        // Diferença de nomenclatura entre ambientes (ex.: tipo de esteira "OPE" em
        // produção é "MOP" em HML): traduz só o valor enviado no body de criação,
        // sem alterar o registro local (que continua com o nome original de produção).
        if (entidade.traducaoBusca && campoDescricao in camposLimpos) {
          const valorOriginal = camposLimpos[campoDescricao];
          const chaveEncontrada = Object.keys(entidade.traducaoBusca).find(
            (chave) => chave.toLowerCase() === String(valorOriginal ?? '').toLowerCase(),
          );

          if (chaveEncontrada) {
            camposLimpos = { ...camposLimpos, [campoDescricao]: entidade.traducaoBusca[chaveEncontrada] };
          }
        }

        const camposNormalizados = normalizarCamposLista(
          normalizarObjetosNumericos(camposLimpos),
          entidade.camposLista,
        );

        const body = entidade.novoArray
          ? { [entidade.novoArray]: camposNormalizados }
          : camposNormalizados;

        // Para grupos do Keycloak, a busca (mc-keycloak-ms) e a criação (API do
        // Keycloak direto) são serviços diferentes e podem divergir sobre o que já
        // existe. Nesse caso o Keycloak responde 409 — tratamos como sucesso (o
        // grupo já existe, que é exatamente o estado desejado), em vez de falhar
        // a execução inteira.
        cy.executarRequest2(env, entidade.url, body, method, !entidadeKeycloak).then((resultado) => {
          if (entidadeKeycloak && resultado.status === 409) {
            cy.log(`[criarItensInexistentesPorNivel] Grupo Keycloak "${item[campoDescricao]}" já existe — ignorando.`);
          } else if (entidadeKeycloak && (resultado.status < 200 || resultado.status >= 300)) {
            throw new Error(
              `[criarItensInexistentesPorNivel] Falha ao criar grupo Keycloak "${item[campoDescricao]}": ${resultado.status} - ${JSON.stringify(resultado.body)}`,
            );
          }

          if (!entidadeKeycloak) {
            cy.setIdHmlPorDescricao(
              resultado.body['id'],
              item[campoDescricao],
              entidade.nomeArquivo,
              campoDescricao,
              item.id,
            );
          }

          if (!log[chaveEntidade]) log[chaveEntidade] = [];

          const dataAtualizacao = new Date().toISOString().replace('T', ' ').slice(0, 23);
          const registroExistente = log[chaveEntidade].find((r) => r.id === item.id);

          if (registroExistente) {
            registroExistente.dataAtualizacao = dataAtualizacao;
          } else {
            log[chaveEntidade].push({ id: item.id, dataAtualizacao });
          }
        });
      });

      cy.then(() => {
        if (itensValidos.length > 0) {
          cy.task('lerJsonSeExistir', { caminhoArquivo: CAMINHO_LOG }).then((logAtual) => {
            cy.writeFile(CAMINHO_LOG, mesclarLog(logAtual, log));
          });
        }
      });
    });
  }
});

/**
 * @description Atualiza no ambiente HML os itens que já possuem 'idHml',
 * para todas as entidades do nível de dependência informado.
 * Entidades Keycloak, grupos e entidades de retorno são ignoradas neste fluxo.
 * @param {number} nivel - Nível de dependência das entidades a serem processadas.
 * @param {Object} mapeamentoEntidade - Mapeamento de entidades com suas configurações.
 * @returns {Cypress.Chainable<void>}
 */
Cypress.Commands.add('atualizarItensExistentesPorNivel', (nivel, mapeamentoEntidade) => {
  for (const chaveEntidade in mapeamentoEntidade) {
    if (!Object.prototype.hasOwnProperty.call(mapeamentoEntidade, chaveEntidade)) continue;

    const entidade = mapeamentoEntidade[chaveEntidade];

    if (entidade.nivelDependencia !== nivel) continue;

    const ehEntidadeSemAtualizacao = ENTIDADES_SEM_ATUALIZACAO.includes(chaveEntidade);
    const method = entidade.methodAtualizacao || 'POST';
    const env = entidade.env || 'hml';
    const chavesIgnoradas = [
      'idHml',
      'id',
      'dataCadastro',
      'dataUltimaAlteracao',
      'usuarioCadastro',
      'usuarioUltimaAlteracao',
      'usuario',
      'atualizar',
      ...(entidade.chavesIgnoradas || []),
    ];

    cy.readFile(`cypress/output/${entidade.nomeArquivo}`).then((itens) => {
      const itensValidos = itens
        .filter((item) => item.idHml != null)
        .filter((item) => item.atualizar === true);

      const log = {};

      if (ehEntidadeSemAtualizacao) {
        // Sem API — só registra no log
        itensValidos.forEach((item) => {
          if (!log[chaveEntidade]) log[chaveEntidade] = [];

          const dataAtualizacao = new Date().toISOString().replace('T', ' ').slice(0, 23);
          const registroExistente = log[chaveEntidade].find((r) => r.id === item.id);

          if (registroExistente) {
            registroExistente.dataAtualizacao = dataAtualizacao;
          } else {
            log[chaveEntidade].push({ id: item.id, dataAtualizacao });
          }
        });
      } else {
        itensValidos.forEach((item) => {
          const camposLimpos = {
            ...removerCamposOld(removerChavesIgnoradas(item, chavesIgnoradas)),
            id: String(item.idHml),
          };

          const camposNormalizados = normalizarCamposLista(
            normalizarObjetosNumericos(camposLimpos),
            entidade.camposLista,
          );

          const body = entidade.novoArray
            ? { [entidade.novoArray]: camposNormalizados }
            : camposNormalizados;

          cy.executarRequest2(env, entidade.url, body, method).then(() => {
            if (!log[chaveEntidade]) log[chaveEntidade] = [];

            const dataAtualizacao = new Date().toISOString().replace('T', ' ').slice(0, 23);
            const registroExistente = log[chaveEntidade].find((r) => r.id === item.id);

            if (registroExistente) {
              registroExistente.dataAtualizacao = dataAtualizacao;
            } else {
              log[chaveEntidade].push({ id: item.id, dataAtualizacao });
            }
          });
        });
      }

      cy.then(() => {
        if (itensValidos.length > 0) {
          cy.task('lerJsonSeExistir', { caminhoArquivo: CAMINHO_LOG }).then((logAtual) => {
            cy.writeFile(CAMINHO_LOG, mesclarLog(logAtual, log));
          });
        }
      });
    });
  }
});

/**
 * @description Orquestra o processamento completo de entidades para um determinado nível de dependência,
 * executando em sequência: substituição de URLs, atualização de IDs de dependências,
 * pesquisa de itens, atualização de existentes e criação de inexistentes no ambiente HML.
 * @param {number} nivel - Nível de dependência das entidades a serem processadas.
 * @param {Object} mapeamentoEntidade - Mapeamento de entidades com suas configurações.
 * @returns {Cypress.Chainable<void>}
 */
Cypress.Commands.add('processarEntidadesPorNivel', (nivel, mapeamentoEntidade) => {
  cy.log('estou executando substituirUrlsDeAmbiente');
  cy.substituirUrlsDeAmbiente(nivel, mapeamentoEntidade);
  cy.log('estou executando atualizarIdsDeDependencias');
  cy.atualizarIdsDeDependencias(nivel, mapeamentoEntidade);
  cy.log('estou executando pesquisarItensPorNivel');
  cy.pesquisarItensPorNivel(nivel, mapeamentoEntidade);
  cy.log('estou executando atualizarItensExistentesPorNivel');
  cy.atualizarItensExistentesPorNivel(nivel, mapeamentoEntidade);
  cy.log('estou executando criarItensInexistentesPorNivel');
  cy.criarItensInexistentesPorNivel(nivel, mapeamentoEntidade);
});
