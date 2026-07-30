// arquivo: commands.js

import { obterValor } from './utils';
import tokens from '../temp/tokens.json';
import MAPEAMENTOS_APIS from '../utils/mapeamentoProdutos';

const LIMITE_LOTE = 10;
const CAMINHO_LOG = 'cypress/output/ultimosUpdates.json';
const ENTIDADES_IGNORADAS = ['PRODUTO', 'GRUPOS_KEYCLOAK', 'MULTIFLOW', 'SELECIONAR_CEDENTE', 'ESTEIRAS'];
const ENTIDADES_COM_VALIDACAO = ['PRODUTO', 'ESTEIRAS'];

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * @description Remove campos apenas no primeiro nível do objeto.
 * @param {Object} obj - Objeto a ser limpo.
 * @param {string[]} chavesIgnoradas - Campos a serem removidos.
 * @returns {Object}
 */
function removerChavesIgnoradas(obj, chavesIgnoradas) {
  return Object.fromEntries(
    Object.entries(obj).filter(([chave]) => !chavesIgnoradas.includes(chave))
  );
}

/**
 * @description Remove recursivamente todas as chaves que terminam com '.old' de um objeto.
 * @param {object} obj - Objeto a ser limpo.
 * @returns {object}
 */
function removerCamposOld(obj) {
  if (Array.isArray(obj)) {
    return obj.map((item) => removerCamposOld(item));
  }

  if (typeof obj !== 'object' || obj === null) return obj;

  return Object.fromEntries(
    Object.entries(obj)
      .filter(([chave]) => !chave.endsWith('.old'))
      .map(([chave, valor]) => [chave, removerCamposOld(valor)])
  );
}

/**
 * @description Restaura recursivamente todos os campos `.old` para seus campos originais,
 * removendo a chave `.old` após a restauração.
 * @param {object} obj - Objeto com campos `.old` a serem restaurados.
 * @returns {object}
 */
function restaurarCamposOld(obj) {
  if (typeof obj !== 'object' || obj === null) return obj;

  const resultado = {};

  for (const [chave, valor] of Object.entries(obj)) {
    if (chave.endsWith('.old')) continue;

    const chaveOld = `${chave}.old`;
    resultado[chave] = Object.prototype.hasOwnProperty.call(obj, chaveOld)
      ? obj[chaveOld]
      : restaurarCamposOld(valor);
  }

  return resultado;
}

/**
 * @description Mescla dois arrays evitando duplicatas com base em um campo chave.
 * @param {Array<Object>} base - Dados já existentes no arquivo.
 * @param {Array<Object>} novos - Dados novos a serem adicionados.
 * @param {string} campoChave - Campo usado para identificar duplicatas.
 * @returns {Array<Object>}
 */
function mesclarSemDuplicatas(base, novos, campoChave) {
  const chavesDaBase = new Set(base.map((item) => item[campoChave]));
  return [...base, ...novos.filter((item) => !chavesDaBase.has(item[campoChave]))];
}

/**
 * @description Extrai valores de um caminho que pode conter arrays em qualquer nível.
 * Funciona para: 'id', 'grupoProduto.id', 'modeloEtapas.modeloEtapa.id'
 * @param {object} obj - Objeto de origem.
 * @param {string} caminho - Caminho em notação de ponto.
 * @returns {Array<any>}
 */
function extrairValoresDoCaminho(obj, caminho) {
  const percorrer = (atual, partes) => {
    if (!atual || partes.length === 0) return [atual];

    const [parte, ...resto] = partes;
    const proximo = Array.isArray(atual)
      ? atual.flatMap((item) => percorrer(item?.[parte], resto))
      : percorrer(atual[parte], resto);

    return [proximo].flat();
  };

  return percorrer(obj, caminho.split('.')).filter((v) => v != null);
}

// ─── Commands ────────────────────────────────────────────────────────────────

/**
 * @description Define e retorna os dados base para um ambiente específico,
 * incluindo URLs, credenciais e token de acesso.
 * @param {'prod'|'hml'|'keycloak'|'bhml'} ambiente - Nome do ambiente desejado.
 * @returns {Cypress.Chainable<{baseUrl: string, loginUrl: string, loginUsername: string, loginPassword: string, urlTokenApiIntercept: string, token: string}>}
 */
Cypress.Commands.add('definirAmbiente', (ambiente) => {
  const ambientes = {
    prod: {
      baseUrl: Cypress.env('PROD_API_BASE_URL'),
      loginUrl: Cypress.env('PROD_API_LOGIN_URL'),
      loginUsername: Cypress.env('PROD_API_USERNAME'),
      loginPassword: Cypress.env('PROD_API_PASSWORD'),
      urlTokenApiIntercept: `${Cypress.env('PROD_API_LOGIN_URL')}/auth/realms/multiplicacapital/protocol/openid-connect/token`,
      token: tokens?.prod?.token ?? '',
    },
    hml: {
      baseUrl: Cypress.env('HML_API_BASE_URL'),
      loginUrl: Cypress.env('HML_API_LOGIN_URL'),
      loginUsername: Cypress.env('HML_API_USERNAME'),
      loginPassword: Cypress.env('HML_API_PASSWORD'),
      urlTokenApiIntercept: `${Cypress.env('HML_API_LOGIN_URL')}/auth/realms/multiplicacapital/protocol/openid-connect/token`,
      token: tokens?.hml?.token ?? '',
    },
    keycloak: {
      baseUrl: Cypress.env('HML_KEYCLOAK_BASE_URL'),
      loginUrl: Cypress.env('HML_KEYCLOAK_LOGIN_URL'),
      loginUsername: Cypress.env('HML_KEYCLOAK_USERNAME'),
      loginPassword: Cypress.env('HML_KEYCLOAK_PASSWORD'),
      urlTokenApiIntercept: `${Cypress.env('HML_KEYCLOAK_LOGIN_URL')}/auth/realms/master/protocol/openid-connect/token`,
      token: tokens?.keycloak?.token ?? '',
    },
    bhml: {
      baseUrl: Cypress.env('BHML_API_BASE_URL'),
      loginUrl: Cypress.env('BHML_API_LOGIN_URL'),
      loginUsername: Cypress.env('BHML_API_USERNAME'),
      loginPassword: Cypress.env('BHML_API_PASSWORD'),
      urlTokenApiIntercept: `${Cypress.env('BHML_API_LOGIN_URL')}/auth/realms/beyondbanking-hml/protocol/openid-connect/token`,
      token: tokens?.bhml?.token ?? '',
    },
  };

  const config = ambientes[ambiente];

  if (!config) throw new Error(`[definirAmbiente] Ambiente desconhecido: "${ambiente}"`);

  return cy.wrap(config);
});

/**
 * @description Lê um arquivo JSON do diretório 'cypress/output'.
 * Retorna null se o arquivo não existir ou estiver vazio.
 * @param {string} nomeArquivo - Nome do arquivo JSON (ex: 'meuArquivo.json').
 * @returns {Cypress.Chainable<Array<object>|null>}
 */
Cypress.Commands.add('lerJsonDeOutput', (nomeArquivo) => {
  return cy.task('lerJsonSeExistir', { caminhoArquivo: `cypress/output/${nomeArquivo}` }, { log: false });
});

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
    .filter(([, config]) => config?.nomeArquivoReferencia && config?.campoBusca && config?.nomeArquivo && config?.urlBuscaId)
    .forEach(([chave, config]) => {
      const { nomeArquivoReferencia, campoBusca, nomeArquivo, urlBuscaId, adiciona } = config;
      const caminhoArquivo = `cypress/output/${nomeArquivo}`;
      const ehArquivoBase = ['Produtos/1 - Produtos.json', 'Esteiras/1 - esteiras.json'].includes(nomeArquivoReferencia);
      const ehEntidadeSemBusca = ['ACOES', 'OPERADORES', 'OBSERVADORES', 'GESTORES'].includes(chave);
      const registrosAcumulados = [];
      cy.log(chave)

      const inicializar = adiciona
        ? cy.wrap(null)
        : cy.task('escreverJson', { caminhoArquivo, conteudo: [] });

      inicializar.then(() => {
        cy.readFile(`cypress/output/${nomeArquivoReferencia}`).then((dadosDoArquivo) => {
          const dadosFiltrados = (ehArquivoBase
            ? dadosDoArquivo.filter((item) => item.atualizar === true)
            : dadosDoArquivo
          ).map(normalizarObjetosNumericos);

          if (ehEntidadeSemBusca) {
            const campoDeduplicacao = chave === 'ACOES' ? 'id' : 'grupo';

            const objetosUnicos = dadosFiltrados
              .flatMap((dado) => extrairValoresDoCaminho(dado, campoBusca))
              .flatMap((item) => (Array.isArray(item) ? item : [item]))
              .filter((obj) => obj != null && typeof obj === 'object')
              .filter(
                (obj, index, self) =>
                  obj?.[campoDeduplicacao] &&
                  self.findIndex((o) => o[campoDeduplicacao] === obj[campoDeduplicacao]) === index
              );

            if (adiciona) {
              cy.task('lerJsonSeExistir', { caminhoArquivo }).then((existentes) => {
                const mesclado = mesclarSemDuplicatas(existentes ?? [], objetosUnicos, campoDeduplicacao);
                cy.task('escreverJson', { caminhoArquivo, conteudo: mesclado });
              });
            } else {
              cy.task('escreverJson', { caminhoArquivo, conteudo: objetosUnicos });
            }
            return;
          }

          const idsUnicos = [...new Set(
            dadosFiltrados.flatMap((dado) => extrairValoresDoCaminho(dado, campoBusca))
          )];

          idsUnicos.forEach((id) => {
            cy.executarRequest('prod', `${urlBuscaId}${encodeURIComponent(id)}`).then((resposta) => {
              const itens = Array.isArray(resposta.body) ? resposta.body : [resposta.body];
              itens.forEach((item) => {
                if (!registrosAcumulados.some((r) => r.id === item.id)) {
                  registrosAcumulados.push(item);
                }
              });
            });
          });

          cy.then(() => {
            if (adiciona) {
              cy.task('lerJsonSeExistir', { caminhoArquivo }).then((existentes) => {
                const mesclado = mesclarSemDuplicatas(existentes ?? [], registrosAcumulados, 'id');
                cy.task('escreverJson', { caminhoArquivo, conteudo: mesclado });
              });
            } else {
              cy.task('escreverJson', { caminhoArquivo, conteudo: registrosAcumulados });
            }
          });
        });
      });
    });
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
    ) continue;

    const geraLog = ['PRODUTO', 'ESTEIRAS'].includes(chaveEntidade);
    const entidadeKeycloak = ['OPERADORES'].includes(chaveEntidade);
    const method = entidade.method || 'POST';
    const env = entidade.env || 'hml';
    const caminhoArquivo = `cypress/output/${entidade.nomeArquivo}`;
    const campoDescricao = entidade.campoDescricao || 'descricao';
    const chavesIgnoradas = [
      'idHml', 'id', 'dataCadastro', 'dataUltimaAlteracao',
      'usuarioCadastro', 'usuarioUltimaAlteracao', 'tipoSeguranca', 'podeAlterarFormulario',
      ...(entidade.chavesIgnoradas || []),
    ];

    cy.readFile(caminhoArquivo).then((itens) => {
      const itensValidos = itens
        .filter((item) => item.idHml === null)
        .filter((item) => !geraLog || item.atualizar === true);

      const executar = (log) => {
        itensValidos.forEach((item) => {
          let camposLimpos = removerCamposOld(removerChavesIgnoradas(item, chavesIgnoradas));

          if (entidadeKeycloak && 'grupo' in camposLimpos) {
            const { grupo, ...restante } = camposLimpos;
            camposLimpos = { ...restante, name: grupo };
          }

          const body = entidade.novoArray
            ? { [entidade.novoArray]: camposLimpos }
            : camposLimpos;

          cy.executarRequest(env, entidade.url, body, method).then((resultado) => {
            if (!entidadeKeycloak) {
              cy.setIdHmlPorDescricao(resultado.body['id'], item[campoDescricao], entidade.nomeArquivo, campoDescricao);
            }

            if (!geraLog) return;

            if (!log[chaveEntidade]) log[chaveEntidade] = [];

            const registroExistente = log[chaveEntidade].find((r) => r.id === item.id);
            if (registroExistente) {
              registroExistente.dataAtualizacao = new Date().toISOString().replace('T', ' ').slice(0, 23);
            } else {
              log[chaveEntidade].push({
                id: item.id,
                dataAtualizacao: new Date().toISOString().replace('T', ' ').slice(0, 23),
              });
            }

            cy.writeFile(CAMINHO_LOG, log);
          });
        });
      };

      if (geraLog) {
        cy.task('lerJsonSeExistir', { caminhoArquivo: CAMINHO_LOG }).then((logAtual) => executar(logAtual ?? {}));
      } else {
        executar({});
      }
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

    if (
      ['GRUPOS_KEYCLOAK', 'CONDICOES', 'MOTIVOS_RETORNO',
       'GESTORES', 'OBSERVADORES', 'OPERADORES', 'TIPOESTEIRAS',
      ].includes(chaveEntidade) ||
      entidade.nivelDependencia !== nivel
    ) continue;

    const geraLog = ['PRODUTO', 'ESTEIRAS'].includes(chaveEntidade);
    const method = entidade.methodAtualizacao || 'POST';
    const chavesIgnoradas = [
      'idHml', 'id', 'dataCadastro', 'dataUltimaAlteracao',
      'usuarioCadastro', 'usuarioUltimaAlteracao', 'usuario',
      ...(entidade.chavesIgnoradas || []),
    ];

    cy.readFile(`cypress/output/${entidade.nomeArquivo}`).then((itens) => {
      const itensValidos = itens
        .filter((item) => item.idHml != null)
        .filter((item) => !geraLog || item.atualizar === true);

      const executar = (log) => {
        itensValidos.forEach((item) => {
          const camposLimpos = {
            ...removerCamposOld(removerChavesIgnoradas(item, chavesIgnoradas)),
            id: String(item.idHml),
          };

          const body = entidade.novoArray
            ? { [entidade.novoArray]: camposLimpos }
            : camposLimpos;

          cy.executarRequest('hml', entidade.url, body, method).then(() => {
            if (!geraLog) return;

            if (!log[chaveEntidade]) log[chaveEntidade] = [];

            const registroExistente = log[chaveEntidade].find((r) => r.id === item.id);
            if (registroExistente) {
              registroExistente.dataAtualizacao = new Date().toISOString().replace('T', ' ').slice(0, 23);
            } else {
              log[chaveEntidade].push({
                id: item.id,
                dataAtualizacao: new Date().toISOString().replace('T', ' ').slice(0, 23),
              });
            }

            cy.writeFile(CAMINHO_LOG, log);
          });
        });
      };

      if (geraLog) {
        cy.task('lerJsonSeExistir', { caminhoArquivo: CAMINHO_LOG }).then((logAtual) => executar(logAtual ?? {}));
      } else {
        executar({});
      }
    });
  }
});

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
    if (!Object.prototype.hasOwnProperty.call(mapeamentoEntidade, chaveEntidade)) continue;

    const entidade = mapeamentoEntidade[chaveEntidade];

    if (
      ['GRUPOS_KEYCLOAK', 'CONDICOES'].includes(chaveEntidade) ||
      entidade.nivelDependencia !== nivel
    ) continue;

    const nomeArquivo = entidade.nomeArquivo;
    const campoDescricao = entidade.campoDescricao || 'descricao';
    const contentBusca = entidade.contentBusca || 'falseId';
    const entidadeKeycloak = ['OPERADORES', 'OBSERVADORES', 'GESTORES'].includes(chaveEntidade);
    const CAMPO_DESCRICAO_KEYCLOAK = 'name';

    const salvarId = (id, dado) => {
      cy.setIdHmlPorDescricao(
        id,
        dado,
        nomeArquivo,
        Array.isArray(contentBusca) ? contentBusca : campoDescricao
      );
    };

    if (Array.isArray(contentBusca)) {
      cy.lerJsonDeOutput(nomeArquivo).then((dadosDoArquivo) => {
        for (const dado of dadosDoArquivo) {
          if (dado.idHml !== null && dado.idHml !== undefined) continue;

          const valorChave1 = obterValor(dado, contentBusca[0]);
          const valorChave2 = obterValor(dado, contentBusca[1]);

          cy.executarRequest('hml', `${entidade.urlBusca}${valorChave1}`).then((resposta) => {
            const content = Array.isArray(resposta.body)
              ? resposta.body
              : resposta.body?.content || [];

            if (!content.length) {
              salvarId(null, { [contentBusca[0]]: valorChave1, [contentBusca[1]]: valorChave2 });
              return;
            }

            const itemEncontrado = content.find((item) =>
              String(obterValor(item, contentBusca[1]))?.trim()?.toLowerCase() ===
              String(valorChave2)?.trim()?.toLowerCase()
            );

            salvarId(itemEncontrado?.id ?? null, {
              [contentBusca[0]]: valorChave1,
              [contentBusca[1]]: valorChave2,
            });
          });
        }
      });
      continue;
    }

    cy.lerJsonDeOutput(nomeArquivo).then((dadosDoArquivo) => {
      for (const dado of dadosDoArquivo) {
        if (dado.idHml !== null && dado.idHml !== undefined) continue;

        const valorBusca = dado[campoDescricao];

        if (entidadeKeycloak) {
          cy.executarRequest('hml', entidade.urlBusca).then((resposta) => {
            const content = Array.isArray(resposta.body)
              ? resposta.body
              : resposta.body?.tiposEsteira || resposta.body?.content || [];

            const id = content.find((item) =>
              String(item?.[CAMPO_DESCRICAO_KEYCLOAK])?.trim()?.toLowerCase() ===
              String(valorBusca)?.trim()?.toLowerCase()
            )?.id ?? null;

            salvarId(id, valorBusca);
          });
        } else {
          cy.executarRequest('hml', `${entidade.urlBusca}${encodeURIComponent(valorBusca)}`).then((resposta) => {
            const content = Array.isArray(resposta.body)
              ? resposta.body
              : resposta.body?.tiposEsteira          ||
                resposta.body?.modelosAcao           ||
                resposta.body?.motivosRetornoEsteira ||
                resposta.body?.modelosSubEtapa       ||
                resposta.body?.modelosEtapa          ||
                resposta.body?.modelosEsteira        ||
                resposta.body?.content               ||
                [];

            const id = content.find((item) =>
              String(item?.[campoDescricao])?.trim()?.toLowerCase() ===
              String(valorBusca)?.trim()?.toLowerCase()
            )?.id ?? null;

            salvarId(id, valorBusca);
          });
        }
      }
    });
  }
});

/**
 * @description Localiza um item no arquivo JSON pelo valor do campo descrição
 * e atualiza sua propriedade 'idHml' com o ID fornecido.
 * Suporta busca simples (string) e busca composta (objeto com múltiplos campos).
 * @param {string|number|null} id - ID do ambiente HML a ser salvo no item.
 * @param {string|object} descricao - Valor usado para localizar o item no arquivo.
 * @param {string} nomeArquivo - Nome do arquivo JSON localizado em 'cypress/output/'.
 * @param {string|string[]} campoDescricao - Campo(s) usados para localizar o item.
 * @returns {Cypress.Chainable<void>}
 */
Cypress.Commands.add('setIdHmlPorDescricao', (id, descricao, nomeArquivo, campoDescricao) => {
  const filePath = `cypress/output/${nomeArquivo}`;

  cy.readFile(filePath, { log: false }).then((conteudo) => {
    const itens = conteudo.filter((entry) => {
      if (Array.isArray(campoDescricao)) {
        return campoDescricao.every((campo) => obterValor(entry, campo) === descricao[campo]);
      }
      return entry[campoDescricao] === descricao;
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
    ) continue;

    cy.readFile(`cypress/output/${entidade.nomeArquivo}`).then((itens) => {
      cy.wrap(entidade.dependencia).each((dependencia) => {
        const { arquivoDependencia, idSubstituido } = dependencia;
        const idDependecia = dependencia.idDependecia || 'id';

        return cy.readFile(`cypress/output/${arquivoDependencia}`).then((dependencias) => {
          const listaDependencias = Array.isArray(dependencias[0])
            ? dependencias.flat()
            : dependencias;

          const partes = idSubstituido.split('.');
          const chaveId = partes[partes.length - 1];
          const chaveOld = `${chaveId}.old`;
          const partesParent = partes.slice(0, -1);

          const substituir = (atual, partesRestantes) => {
            if (!atual || partesRestantes.length === 0) return;

            if (Array.isArray(atual)) {
              atual.forEach((elemento) => substituir(elemento, partesRestantes));
              return;
            }

            const [proxima, ...resto] = partesRestantes;

            if (resto.length === 0) {
              const elemento = atual[proxima];

              if (Array.isArray(elemento)) {
                elemento.forEach((el) => {
                  if (Object.prototype.hasOwnProperty.call(el, chaveOld)) return;
                  const idOriginal = el[chaveId];
                  if (!idOriginal) return;

                  const equivalente = listaDependencias.find(
                    (dep) => dep[idDependecia] === idOriginal
                  );
                  if (!equivalente) return;

                  el[chaveOld] = idOriginal;
                  el[chaveId] = equivalente.idHml;
                });
              } else if (elemento && typeof elemento === 'object') {
                if (Object.prototype.hasOwnProperty.call(elemento, chaveOld)) return;
                const idOriginal = elemento[chaveId];
                if (!idOriginal) return;

                const equivalente = listaDependencias.find(
                  (dep) => dep[idDependecia] === idOriginal
                );
                if (!equivalente) return;

                elemento[chaveOld] = idOriginal;
                elemento[chaveId] = equivalente.idHml;
              }
              return;
            }

            substituir(atual[proxima], resto);
          };

          itens.forEach((item) => {
            if (partesParent.length === 0) {
              // ← campo direto no item, sem navegação
              if (Object.prototype.hasOwnProperty.call(item, chaveOld)) return;
              const idOriginal = item[chaveId];
              if (!idOriginal) return;

              const equivalente = listaDependencias.find(
                (dep) => dep[idDependecia] === idOriginal
              );
              if (!equivalente) return;

              item[chaveOld] = idOriginal;
              item[chaveId] = equivalente.idHml;
            } else {
              substituir(item, partesParent);
            }
          });
        });
      }).then(() => {
        cy.writeFile(`cypress/output/${entidade.nomeArquivo}`, itens);
      });
    });
  }
});

/**
 * @description Orquestra o processamento completo de entidades para um determinado nível de dependência,
 * executando em sequência: atualização de IDs de dependências, pesquisa de itens,
 * atualização de existentes e criação de inexistentes no ambiente HML.
 * @param {number} nivel - Nível de dependência das entidades a serem processadas.
 * @param {Object} mapeamentoEntidade - Mapeamento de entidades com suas configurações.
 * @returns {Cypress.Chainable<void>}
 */
Cypress.Commands.add('processarEntidadesPorNivel', (nivel, mapeamentoEntidade) => {
  cy.log('Iniciando processamento de entidades para o nível de dependência:', nivel);
  cy.log('atualizar id iniciando')
  cy.atualizarIdsDeDependencias(nivel, mapeamentoEntidade);
  cy.log('pesquisar iniciando')
  cy.pesquisarItensPorNivel(nivel, mapeamentoEntidade);
  cy.log('atualizar iniciando')
  cy.atualizarItensExistentesPorNivel(nivel, mapeamentoEntidade);
  cy.log('criar iniciando')
  cy.criarItensInexistentesPorNivel(nivel, mapeamentoEntidade);
});

/**
 * @description Verifica se um diretório possui ao menos um arquivo,
 * falhando o teste caso o diretório esteja vazio.
 * @param {string} caminho - Caminho do diretório a ser verificado.
 * @returns {Cypress.Chainable<void>}
 */
Cypress.Commands.add('verificarDiretorioNaoVazio', (caminho) => {
  cy.task('listarArquivos', caminho).then((arquivos) => {
    expect(arquivos.length, `Diretório "${caminho}" está vazio`).to.be.greaterThan(0);
  });
});

/**
 * @description Salva registros no arquivo de output com comportamento diferenciado por entidade.
 *
 * Para entidades em ENTIDADES_COM_VALIDACAO (PRODUTO, ESTEIRAS):
 * - Adiciona apenas IDs novos que ainda não existem no arquivo
 * - Valida regra dos 7 dias com base no 'ultimosUpdates.json'
 * - Marca 'atualizar: true' apenas nos itens elegíveis dentro do limite de lote
 *
 * Para demais entidades:
 * - Salva todos os dados recebidos da API sem validações adicionais
 *
 * Para ESTEIRAS (comportamento adicional):
 * - Marca com 'esteiraVinculada: true' os itens referenciados por 'idModeloEsteiraVinculado'
 *
 * @param {Array<Object>} novosDados - Lista de registros recebidos da API de produção.
 * @param {string} caminhoArquivo - Caminho do arquivo de output da entidade.
 * @param {Object} entidade - Mapa de entidades com seus metadados.
 * @returns {Cypress.Chainable<void>}
 */
Cypress.Commands.add('salvarNovosRegistros', (novosDados, caminhoArquivo, entidade) => {
  const chaveEntidade = Object.keys(entidade).find(
    (chave) => caminhoArquivo.endsWith(entidade[chave].nomeArquivo)
  );

  const comValidacao = ENTIDADES_COM_VALIDACAO.includes(chaveEntidade);

  cy.task('lerJsonSeExistir', { caminhoArquivo }).then((dadosExistentes) => {
    if (!comValidacao) {
      cy.writeFile(caminhoArquivo, novosDados);
      return;
    }

    cy.task('lerJsonSeExistir', { caminhoArquivo: CAMINHO_LOG }).then((logAtual) => {
      const agora = new Date();
      const seteDiasEmMs = 7 * 24 * 60 * 60 * 1000;
      const registrosLog = (logAtual ?? {})[chaveEntidade] ?? [];
      const listaExistente = dadosExistentes ?? [];
      const idsExistentes = new Set(listaExistente.map((item) => item.id));

      const apenasNovos = novosDados.filter((novo) => !idsExistentes.has(novo.id));

      const candidatos = listaExistente
        .map((existente) => {
          if (!novosDados.some((novo) => novo.id === existente.id)) return null;

          const registroLog = registrosLog.find((r) => r.id === existente.id);
          const estaVencido = !registroLog || agora - new Date(registroLog.dataAtualizacao) > seteDiasEmMs;

          if (!estaVencido) return null;

          return {
            id: existente.id,
            dataOrdenacao: registroLog ? new Date(registroLog.dataAtualizacao) : new Date(0),
          };
        })
        .filter(Boolean);

      const idsLoteParaAtualizar = [
        ...candidatos,
        ...apenasNovos.map((novo) => ({ id: novo.id, dataOrdenacao: new Date(0) })),
      ]
        .sort((a, b) => a.dataOrdenacao - b.dataOrdenacao)
        .slice(0, LIMITE_LOTE)
        .map((item) => item.id);

      let dadosAtualizados = [
        ...listaExistente.map((existente) => {
          const deveAtualizar = idsLoteParaAtualizar.includes(existente.id);
          const dadoNovo = deveAtualizar
            ? novosDados.find((novo) => novo.id === existente.id)
            : null;

          return {
            ...(dadoNovo ?? existente), // ← substitui pelo novo quando atualizar === true
            idHml: existente.idHml,     // ← preserva idHml sempre
            atualizar: deveAtualizar,
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

    if (
      chaveEntidade === 'GRUPOS_KEYCLOAK' ||
      !configEntidade.dependencia?.length
    ) continue;

    const caminhoArquivo = `cypress/output/${configEntidade.nomeArquivo}`;

    cy.task('lerJsonSeExistir', { caminhoArquivo }).then((itens) => {
      if (!itens) return;
      cy.writeFile(caminhoArquivo, itens.map((item) => restaurarCamposOld(item)));
    });
  }
});

function normalizarObjetosNumericos(obj) {
  if (Array.isArray(obj)) return obj.map(normalizarObjetosNumericos);

  if (obj !== null && typeof obj === 'object') {
    const chaves = Object.keys(obj);
    const todasNumericas = chaves.length > 0 && chaves.every((c) => /^\d+$/.test(c));

    if (todasNumericas) {
      return chaves
        .sort((a, b) => Number(a) - Number(b))
        .map((c) => normalizarObjetosNumericos(obj[c]));
    }

    return Object.fromEntries(
      Object.entries(obj).map(([k, v]) => [k, normalizarObjetosNumericos(v)])
    );
  }

  return obj;
}