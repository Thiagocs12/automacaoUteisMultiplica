// arquivo: commands.js

// ─── Imports ─────────────────────────────────────────────────────────────────

import { obterValor } from './utils';
import tokens from '../temp/tokens.json';
import MAPEAMENTOS_APIS from '../utils/mapeamentoProdutos';

// ─── Constantes ──────────────────────────────────────────────────────────────

/** Caminho do arquivo de log com os registros de última atualização */
const CAMINHO_LOG = 'cypress/output/ultimosUpdates.json';

/** Entidades ignoradas no fluxo de pesquisa de dependências de ligação */
const ENTIDADES_IGNORADAS = [
  'PRODUTO',
  'GRUPOS_KEYCLOAK',
  'MULTIFLOW',
  'SELECIONAR_CEDENTE',
  'ESTEIRAS',
  'MOP',
  'POC',
];

/** Entidades que contêm URLs de ambiente que devem ser substituídas */
const ENTIDADES_COM_URL = ['SUB_ETAPAS', 'ESTEIRAS', 'ESTEIRA_VINCULADA'];

/** Mapeamento de substituição de URLs de produção para HML */
const SUBSTITUICOES_URL = [
  {
    de: 'https://beyond.grupomultiplica.com.br',
    para: 'https://beyond-hml.grupomultiplica.com.br',
  },
  {
    de: 'https://beyond-us.grupomultiplica.com.br',
    para: 'https://beyond-hml.grupomultiplica.com.br',
  },
];

/** Entidades que não atualizam */
const ENTIDADES_SEM_ATUALIZACAO = [
  'GRUPOS_KEYCLOAK',
  'CONDICOES',
  'MOTIVOS_RETORNO',
  'GESTORES',
  'OBSERVADORES',
  'OPERADORES',
  'TIPOESTEIRAS_VINCULADAS',
  'PRODUTO_TARIFA',
  'PRODUTO_GARANTIA',
  'PRODUTO_KIT',
  'KIT_DOCUMENTO',
  'TIPO_SITUACAO',
  'GRUPO_GARANTIA',
  'CLASSIFICACAO_GARANTIA',
  'NIVEL_GARANTIA',
  'TIPO_GARANTIA',
  'GRUPO_PRODUTO_RISCO',
  'SEGMENTO_TARIFADOR',
  'PRODUTO_INDEXADOR',
  'CLASSIFICACAO_PRODUTO',
  'TIPO_EVENTO',
  'TIPOESTEIRAS',
];

/** Limites para cada entidade */
const LIMITE_ESTEIRAS = 20;
const LIMITE_PRODUTO = 20;
const LIMITE_MOP = 100;
const LIMITE_POC = 100;

/** Caminho do arquivo que armazena o estoque de IDs de produção e HML. */
const CAMINHO_ESTOQUE = 'cypress/output/estoqueIds.json';

/** Período máximo de validade dos registros mantidos no estoque de IDs. */
const TRINTA_DIAS_EM_MS = 30 * 24 * 60 * 60 * 1000;

/** Entidades que não devem participar dos fluxos de leitura e atualização do estoque. */
const ENTIDADE_SEM_ESTOQUE = [
  'OPERADORES',
  'OBSERVADORES',
  'GESTORES',
];

// ─── Helpers ─────────────────────────────────────────────────────────────────
/**
 * Mescla profundamente dois objetos de log, combinando os arrays de cada entidade
 * sem sobrescrever entradas existentes — atualiza pelo id ou adiciona se novo.
 */
function mesclarLog(logAtual, logNovo) {
  const resultado = { ...(logAtual ?? {}) };

  for (const chave in logNovo) {
    if (!resultado[chave]) {
      resultado[chave] = logNovo[chave];
      continue;
    }

    for (const entrada of logNovo[chave]) {
      const indice = resultado[chave].findIndex((r) => r.id === entrada.id);
      if (indice >= 0) {
        resultado[chave][indice] = entrada;
      } else {
        resultado[chave].push(entrada);
      }
    }
  }

  return resultado;
}

/**
 * Converte recursivamente objetos com chaves numéricas sequenciais em arrays.
 * Ex: { "0": {...}, "1": {...} } → [{...}, {...}]
 * Não altera arrays ou objetos com chaves mistas.
 */
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
      Object.entries(obj).map(([k, v]) => [k, normalizarObjetosNumericos(v)]),
    );
  }

  return obj;
}

/**
 * Força campos específicos a serem arrays, navegando via dot-notation.
 * Suporta objetos com índices numéricos durante a travessia.
 */
function forcarCampoComoArray(obj, partes) {
  if (!obj || !partes.length) return obj;

  if (Array.isArray(obj)) {
    return obj.map((item) => forcarCampoComoArray(item, partes));
  }

  if (typeof obj !== 'object') return obj;

  const [proxima, ...resto] = partes;

  if (!(proxima in obj)) return obj;

  if (resto.length === 0) {
    const valor = obj[proxima];
    const comoArray = Array.isArray(valor)
      ? valor
      : valor !== null && typeof valor === 'object'
        ? Object.values(valor)
        : [];
    return { ...obj, [proxima]: comoArray };
  }

  return {
    ...obj,
    [proxima]: forcarCampoComoArray(normalizarObjetosNumericos(obj[proxima]), resto),
  };
}

/**
 * Aplica `forcarCampoComoArray` para cada caminho em dot-notation de `camposLista`.
 * Retorna o objeto original se `camposLista` estiver vazio ou ausente.
 */
function normalizarCamposLista(obj, camposLista) {
  if (!camposLista?.length) return obj;

  let resultado = obj;
  camposLista.forEach((caminho) => {
    resultado = forcarCampoComoArray(resultado, caminho.split('.'));
  });
  return resultado;
}

/**
 * Navega recursivamente pelo caminho em dot-notation e remove a chave final.
 * Normaliza objetos com índices numéricos durante a travessia.
 * Não muta o objeto original — retorna uma nova estrutura.
 */
function removerCaminhoAninhado(obj, partes) {
  if (!obj || !partes.length) return obj;

  const [proxima, ...resto] = partes;

  if (Array.isArray(obj)) {
    return obj.map((item) => removerCaminhoAninhado(item, partes));
  }

  if (typeof obj !== 'object' || !(proxima in obj)) return obj;

  if (resto.length === 0) {
    const { [proxima]: _, ...semChave } = obj;
    return semChave;
  }

  const valor = normalizarObjetosNumericos(obj[proxima]);
  const valorAtualizado = Array.isArray(valor)
    ? valor.map((item) => removerCaminhoAninhado(item, resto))
    : removerCaminhoAninhado(valor, resto);

  return { ...obj, [proxima]: valorAtualizado };
}

/**
 * Remove campos do objeto com base em `chavesIgnoradas`.
 * Suporta chaves simples e caminhos em dot-notation (ex: modeloEtapas.modeloEtapa.usuario).
 */
function removerChavesIgnoradas(obj, chavesIgnoradas) {
  const chavesSimples = chavesIgnoradas.filter((c) => !c.includes('.'));
  const chavesAninhadas = chavesIgnoradas.filter((c) => c.includes('.'));

  let resultado = Object.fromEntries(
    Object.entries(obj).filter(([chave]) => !chavesSimples.includes(chave)),
  );

  chavesAninhadas.forEach((caminho) => {
    resultado = removerCaminhoAninhado(resultado, caminho.split('.'));
  });

  return resultado;
}

/**
 * Remove recursivamente todas as chaves que terminam com `.old` de um objeto.
 */
function removerCamposOld(obj) {
  if (Array.isArray(obj)) return obj.map((item) => removerCamposOld(item));

  if (typeof obj !== 'object' || obj === null) return obj;

  return Object.fromEntries(
    Object.entries(obj)
      .filter(([chave]) => !chave.endsWith('.old'))
      .map(([chave, valor]) => [chave, removerCamposOld(valor)]),
  );
}

/**
 * Restaura recursivamente os campos `.old` para seus campos originais,
 * removendo as chaves `.old` após a restauração.
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
 * Mescla dois arrays evitando duplicatas com base em um campo chave.
 */
function mesclarSemDuplicatas(base, novos, campoChave) {
  const chavesDaBase = new Set(base.map((item) => item[campoChave]));
  return [...base, ...novos.filter((item) => !chavesDaBase.has(item[campoChave]))];
}

/**
 * Extrai valores de um caminho que pode conter arrays em qualquer nível.
 * Funciona para: 'id', 'grupoProduto.id', 'modeloEtapas.modeloEtapa.id'
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

// ─── Commands ─────────────────────────────────────────────────────────────────

/**
 * @description Define e retorna os dados base para um ambiente específico,
 * incluindo URLs, credenciais e token de acesso.
 * @param {'prod'|'hml'|'keycloak'|'bhml'} ambiente - Nome do ambiente desejado.
 * @returns {Cypress.Chainable<{baseUrl, loginUrl, loginUsername, loginPassword, urlTokenApiIntercept, token}>}
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
          cy.executarRequest('prod', urlListAll).then((resposta) => {
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
                cy.executarRequest('prod', `${urlBuscaId}${encodeURIComponent(id)}`).then(
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
            cy.executarRequest('prod', `${urlBuscaId}${encodeURIComponent(id)}`).then(
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
      const seteDiasEmMs = 7 * 24 * 60 * 60 * 1000;
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
        return !registroLog || agora - new Date(registroLog.dataAtualizacao) > seteDiasEmMs;
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
          return {
            ...(dadoNovo ?? existente),
            idHml: existente.idHml,
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
                const elemento = atual[proxima];

                if (Array.isArray(elemento)) {
                  elemento.forEach((el) => {
                    if (Object.prototype.hasOwnProperty.call(el, chaveOld)) return;
                    const idOriginal = el[chaveId];
                    if (!idOriginal) return;

                    const equivalente = listaDependencias.find(
                      (dep) => dep[idDependecia] === idOriginal,
                    );

                    if (!equivalente) {
                      marcarRemocao(itemRaiz);
                      return;
                    }

                    el[chaveOld] = idOriginal;
                    el[chaveId] = equivalente.idHml;
                  });
                } else if (elemento && typeof elemento === 'object') {
                  if (Object.prototype.hasOwnProperty.call(elemento, chaveOld)) return;
                  const idOriginal = elemento[chaveId];
                  if (!idOriginal) return;

                  const equivalente = listaDependencias.find(
                    (dep) => dep[idDependecia] === idOriginal,
                  );

                  if (!equivalente) {
                    marcarRemocao(itemRaiz);
                    return;
                  }

                  elemento[chaveOld] = idOriginal;
                  elemento[chaveId] = equivalente.idHml;
                }
                return;
              }

              substituir(atual[proxima], resto, itemRaiz);
            };

            itens.forEach((item) => {
              if (partesParent.length === 0) {
                if (Object.prototype.hasOwnProperty.call(item, chaveOld)) return;
                const idOriginal = item[chaveId];
                if (!idOriginal) return;

                const equivalente = listaDependencias.find(
                  (dep) => dep[idDependecia] === idOriginal,
                );

                if (!equivalente) {
                  marcarRemocao(item);
                  return;
                }

                item[chaveOld] = idOriginal;
                item[chaveId] = equivalente.idHml;
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
 * @description Substitui URLs de produção por URLs de HML em todos os campos string
 * das entidades listadas em ENTIDADES_COM_URL.
 * Percorre recursivamente toda a estrutura do arquivo, substituindo qualquer
 * ocorrência dos domínios mapeados em SUBSTITUICOES_URL.
 * @param {number} nivel - Nível de dependência das entidades a serem processadas.
 * @param {Object} mapeamentoEntidade - Mapeamento de entidades com suas configurações.
 * @returns {Cypress.Chainable<void>}
 */
Cypress.Commands.add('substituirUrlsDeAmbiente', (nivel, mapeamentoEntidade) => {
  for (const chaveEntidade in mapeamentoEntidade) {
    if (!Object.prototype.hasOwnProperty.call(mapeamentoEntidade, chaveEntidade)) continue;
    if (!ENTIDADES_COM_URL.includes(chaveEntidade)) continue;

    const entidade = mapeamentoEntidade[chaveEntidade];

    if (entidade.nivelDependencia !== nivel) continue;

    cy.readFile(`cypress/output/${entidade.nomeArquivo}`).then((itensRaw) => {
      const itens = normalizarObjetosNumericos(itensRaw);

      const substituirUrls = (obj) => {
        if (!obj || typeof obj !== 'object') return;

        if (Array.isArray(obj)) {
          obj.forEach((item) => substituirUrls(item));
          return;
        }

        for (const chave in obj) {
          if (!Object.prototype.hasOwnProperty.call(obj, chave)) continue;

          const valor = obj[chave];

          if (typeof valor === 'string') {
            SUBSTITUICOES_URL.forEach(({ de, para }) => {
              if (obj[chave].includes(de)) obj[chave] = obj[chave].replaceAll(de, para);
            });
          } else {
            substituirUrls(valor);
          }
        }
      };

      itens.forEach((item) => substituirUrls(item));

      cy.writeFile(`cypress/output/${entidade.nomeArquivo}`, itens);
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
    )
      continue;

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
        Array.isArray(contentBusca) ? contentBusca : campoDescricao,
      );
    };

    if (Array.isArray(contentBusca)) {
      cy.lerJsonDeOutput(nomeArquivo).then((dadosDoArquivo) => {
        for (const dado of dadosDoArquivo) {
          if (dado.idHml !== null && dado.idHml !== undefined) continue;
          if (chaveEntidade === 'ESTEIRAS' && dado.atualizar !== true) continue;

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

            const itemEncontrado = content.find(
              (item) =>
                String(obterValor(item, contentBusca[1]))?.trim()?.toLowerCase() ===
                String(valorChave2)?.trim()?.toLowerCase(),
            );

            const id = itemEncontrado?.id ?? null;
            salvarId(id, { [contentBusca[0]]: valorChave1, [contentBusca[1]]: valorChave2 });
          });
        }
      });
      continue;
    }

    cy.lerJsonDeOutput(nomeArquivo).then((dadosDoArquivo) => {
      for (const dado of dadosDoArquivo) {
        if (dado.idHml !== null && dado.idHml !== undefined) continue;
        if (chaveEntidade === 'ESTEIRAS' && dado.atualizar !== true) continue;

        const valorBusca = dado[campoDescricao];

        if (entidadeKeycloak) {
          cy.executarRequest('hml', entidade.urlBusca).then((resposta) => {
            const content = Array.isArray(resposta.body)
              ? resposta.body
              : resposta.body?.tiposEsteira || resposta.body?.content || [];

            const id =
              content.find(
                (item) =>
                  String(item?.[CAMPO_DESCRICAO_KEYCLOAK])?.trim()?.toLowerCase() ===
                  String(valorBusca)?.trim()?.toLowerCase(),
              )?.id ?? null;

            salvarId(id, valorBusca);
          });
        } else {
          cy.executarRequest('hml', `${entidade.urlBusca}${encodeURIComponent(valorBusca)}`).then(
            (resposta) => {
              const content = Array.isArray(resposta.body)
                ? resposta.body
                : resposta.body?.tiposEsteira ||
                  resposta.body?.modelosAcao ||
                  resposta.body?.motivosRetornoEsteira ||
                  resposta.body?.modelosSubEtapa ||
                  resposta.body?.modelosEtapa ||
                  resposta.body?.modelosEsteira ||
                  resposta.body?.content ||
                  [];

              const id =
                content.find(
                  (item) =>
                    String(item?.[campoDescricao])?.trim()?.toLowerCase() ===
                    String(valorBusca)?.trim()?.toLowerCase(),
                )?.id ?? null;

              salvarId(id, valorBusca);
            },
          );
        }
      }
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

        const camposNormalizados = normalizarCamposLista(
          normalizarObjetosNumericos(camposLimpos),
          entidade.camposLista,
        );

        const body = entidade.novoArray
          ? { [entidade.novoArray]: camposNormalizados }
          : camposNormalizados;

        cy.executarRequest(env, entidade.url, body, method).then((resultado) => {
          if (!entidadeKeycloak) {
            cy.setIdHmlPorDescricao(
              resultado.body['id'],
              item[campoDescricao],
              entidade.nomeArquivo,
              campoDescricao,
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
 * @description Executa uma consulta SQL no banco de dados do ambiente informado.
 * Direciona a execução para a task de produção ou homologação conforme o valor de `env`.
 * @param {'prod'|'hml'} env - Ambiente em que a consulta será executada.
 * @param {string} query - Consulta SQL a ser executada.
 * @returns {Cypress.Chainable<unknown>}
 */
Cypress.Commands.add('executarQuery', (env, query) => {
  console.log(query);

  if (env === 'prod') {
    cy.task('queryProd', { sqlQuery: query }).then((result) => {
      return result;
    });
  } else if (env === 'hml') {
    cy.task('queryHml', { sqlQuery: query }).then((result) => {
      return result;
    });
  } else {
    cy.log(`Ambiente ${env} não suportado para execução de query.`);
  }
});

/**
 * @description Pesquisa no banco de HML os vínculos correspondentes aos itens sem `idHml`,
 * comparando os campos identificadores definidos no mapeamento da entidade.
 * @param {number} nivel - Nível de dependência das entidades a serem processadas.
 * @param {Object} mapeamentoEntidade - Mapeamento de entidades com suas configurações.
 * @returns {Cypress.Chainable<void>}
 */
Cypress.Commands.add('pesquisarVinculoEsteiraHml', (nivel, mapeamentoEntidade) => {
  for (const chaveEntidade in mapeamentoEntidade) {
    if (!Object.prototype.hasOwnProperty.call(mapeamentoEntidade, chaveEntidade)) {
      continue;
    }

    const entidade = mapeamentoEntidade[chaveEntidade];

    if (entidade.nivelDependencia !== nivel) continue;

    const campos = Array.isArray(entidade.campoIdentificador)
      ? entidade.campoIdentificador
      : [entidade.campoIdentificador];

    const montarIdentificador = (dado) =>
      campos.length === 1
        ? dado[campos[0]]
        : Object.fromEntries(
            campos.map((campo) => [campo, dado[campo]])
          );

    cy.lerJsonDeOutput(entidade.nomeArquivo).then((dadosDoArquivo) => {
      if (!dadosDoArquivo?.length) return;

      const itensSemId = dadosDoArquivo.filter(
        (dado) => dado.idHml == null
      );

      if (!itensSemId.length) return;

      cy.executarQuery(
        'hml',
        `SELECT * FROM ${entidade.tabela}`
      ).then((registros) => {
        for (const dado of itensSemId) {
          if (dado.idHml != null) continue;

          const encontrado = registros.find((reg) =>
            campos.every(
              (campo) =>
                String(reg[campo]) === String(dado[campo])
            )
          );

          const idHml = encontrado?.id ?? null;

          cy.setIdHmlPorDescricao(
            idHml,
            montarIdentificador(dado),
            entidade.nomeArquivo,
            entidade.campoIdentificador
          );
        }
      });
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
    cy.log('[pesquisarDependenciasBanco] Nenhuma entidade com dependência definida');
    return;
  }

  cy.wrap(entidadesComDependencia).each((entidade) => {
    const caminhoArquivo = `cypress/output/${entidade.nomeArquivo}`;
    const arquivoReferencia = `cypress/output/${entidade.arquivoReferencia}`;

    const inicializar = adiciona
      ? cy.wrap(null)
      : cy.task('escreverJson', { caminhoArquivo, conteudo: [] });

    inicializar.then(() => {
      cy.task('lerJsonSeExistir', { caminhoArquivo: arquivoReferencia }).then((dadosReferencia) => {
        if (!dadosReferencia?.length) {
          cy.log(`[${entidade.chaveLog}] Referência vazia: ${arquivoReferencia}`);
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
          const registrosFiltrados = registrosHml.filter((item) =>
            filtros.every(({ campoTabela, valores }) => valores.includes(item[campoTabela])),
          );

          if (entidade.geraLog) {
            cy.log(`[${entidade.chaveLog}] ${registrosFiltrados.length} registro(s) encontrado(s)`);
          }

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
                  Date.now() - dataAtualizacao.getTime() > TRINTA_DIAS_EM_MS;

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

/**
 * @description Atualiza diretamente no banco de HML os itens que possuem `idHml`,
 * utilizando os campos de atualização configurados para cada entidade.
 * @param {number} nivel - Nível de dependência das entidades a serem processadas.
 * @param {Object} mapeamentoEntidade - Mapeamento de entidades com tabela, campos e controle de log.
 * @param {Object} log - Objeto compartilhado com os registros de atualização.
 * @returns {Cypress.Chainable<void>}
 */
Cypress.Commands.add('atualizarItensHml', (nivel, mapeamentoEntidade, log = {}) => {
  for (const chaveEntidade in mapeamentoEntidade) {
    if (!Object.prototype.hasOwnProperty.call(mapeamentoEntidade, chaveEntidade)) {
      continue;
    }

    const entidade = mapeamentoEntidade[chaveEntidade];

    if (
      entidade.nivelDependencia !== nivel ||
      ['TIPO_PROPOSTA', 'TIPO_PROSPECT'].includes(chaveEntidade)
    ) {
      continue;
    }

    const { nomeArquivo, tabela, camposUpdate, geraLog, chaveLog } = entidade;

    cy.lerJsonDeOutput(nomeArquivo).then((dadosDoArquivo) => {
      if (!dadosDoArquivo?.length) return;

      const itensParaAtualizar = dadosDoArquivo.filter(
        (dado) => dado.idHml != null && (!geraLog || dado.atualizar === true)
      );

      if (!itensParaAtualizar.length) return;

      for (const dado of itensParaAtualizar) {
        const camposOpcionais = camposUpdate
          .filter(({ campo }) => dado[campo] != null)
          .map(({ campo, tipo }) => {
            const valor = dado[campo];

            if (tipo === 'boolean') return `${campo} = ${valor ? 1 : 0}`;
            if (tipo === 'string') return `${campo} = '${valor}'`;

            return `${campo} = ${valor}`;
          });

        const setClauses = [
          ...camposOpcionais,
          `usuarioUltimaAlteracao = 'automacao'`,
          `dataUltimaAlteracao = GETDATE()`,
        ];

        const query = `
          UPDATE ${tabela}
          SET ${setClauses.join(', ')}
          WHERE id = ${dado.idHml}
        `;

        cy.executarQuery('hml', query).then(() => {
          if (!geraLog) return;

          if (!log[chaveLog]) {
            log[chaveLog] = [];
          }

          const dataAtualizacao = new Date()
            .toISOString()
            .replace('T', ' ')
            .slice(0, 23);

          const registroExistente = log[chaveLog].find(
            (registro) => registro.id === dado.id
          );

          if (registroExistente) {
            registroExistente.dataAtualizacao = dataAtualizacao;
          } else {
            log[chaveLog].push({
              id: dado.id,
              dataAtualizacao,
            });
          }
        });
      }
    });
  }
});

/**
 * @description Insere diretamente no banco de HML os itens que ainda não possuem `idHml`,
 * salva o ID criado no arquivo de output e registra a atualização quando configurado.
 * @param {number} nivel - Nível de dependência das entidades a serem processadas.
 * @param {Object} mapeamentoEntidade - Mapeamento de entidades com tabela, campos e controle de log.
 * @param {Object} log - Objeto compartilhado com os registros de atualização.
 * @returns {Cypress.Chainable<void>}
 */
Cypress.Commands.add('inserirItensHml', (nivel, mapeamentoEntidade, log = {}) => {
  for (const chaveEntidade in mapeamentoEntidade) {
    if (!Object.prototype.hasOwnProperty.call(mapeamentoEntidade, chaveEntidade)) {
      continue;
    }

    const entidade = mapeamentoEntidade[chaveEntidade];

    if (entidade.nivelDependencia !== nivel) continue;

    const {
      nomeArquivo,
      tabela,
      camposUpdate,
      campoIdentificador,
      geraLog,
      chaveLog,
    } = entidade;

    cy.lerJsonDeOutput(nomeArquivo).then((dadosDoArquivo) => {
      if (!dadosDoArquivo?.length) return;

      const itensParaInserir = dadosDoArquivo.filter(
        (dado) => dado.idHml == null && (!geraLog || dado.atualizar === true)
      );

      if (!itensParaInserir.length) return;

      for (const dado of itensParaInserir) {
        const camposValidos = camposUpdate.filter(
          ({ campo }) => dado[campo] != null
        );

        const colunas = [
          ...camposValidos.map(({ campo }) => campo),
          'usuarioCadastro',
          'dataCadastro',
          'usuarioUltimaAlteracao',
          'dataUltimaAlteracao',
        ];

        const valores = [
          ...camposValidos.map(({ campo, tipo }) => {
            const valor = dado[campo];

            if (tipo === 'boolean') return valor ? 1 : 0;
            if (tipo === 'string') return `'${valor}'`;

            return valor;
          }),
          `'automacao'`,
          `GETDATE()`,
          `'automacao'`,
          `GETDATE()`,
        ];

        const query = `
          INSERT INTO ${tabela} (${colunas.join(', ')})
          OUTPUT INSERTED.id
          VALUES (${valores.join(', ')})
        `;

        cy.executarQuery('hml', query).then((resultado) => {
          const idCriado = resultado[0]?.id ?? resultado[0]?.ID ?? null;

          cy.setIdHmlPorDescricao(
            idCriado,
            dado[campoIdentificador],
            nomeArquivo,
            campoIdentificador
          );

          if (!geraLog) return;

          if (!log[chaveLog]) {
            log[chaveLog] = [];
          }

          const dataAtualizacao = new Date()
            .toISOString()
            .replace('T', ' ')
            .slice(0, 23);

          const registroExistente = log[chaveLog].find(
            (registro) => registro.id === dado.id
          );

          if (registroExistente) {
            registroExistente.dataAtualizacao = dataAtualizacao;
          } else {
            log[chaveLog].push({
              id: dado.id,
              dataAtualizacao,
            });
          }
        });
      }
    });
  }
});

/**
 * @description Orquestra o processamento dos vínculos de uma entidade por nível,
 * compartilha o log entre atualizações e inserções e grava o arquivo somente ao final.
 * @param {number} nivel - Nível de dependência das entidades a serem processadas.
 * @param {Object} mapeamentoEntidade - Mapeamento de entidades com suas configurações.
 * @returns {Cypress.Chainable<void>}
 */
Cypress.Commands.add('processarVinculosPorNivel', (nivel, mapeamentoEntidade) => {
  cy.task(
    'lerJsonSeExistir',
    { caminhoArquivo: CAMINHO_LOG },
    { log: false }
  ).then((logAtual) => {
    const log = logAtual ?? {};

    cy.log('Rodando atualizarIdsDeDependencias');
    cy.atualizarIdsDeDependencias(nivel, mapeamentoEntidade);

    cy.log('Rodando pesquisarVinculoEsteiraHml');
    cy.pesquisarVinculoEsteiraHml(nivel, mapeamentoEntidade);

    cy.log('Rodando atualizarItensHml');
    cy.atualizarItensHml(nivel, mapeamentoEntidade, log);

    cy.log('Rodando inserirItensHml');
    cy.inserirItensHml(nivel, mapeamentoEntidade, log);

    cy.then(() => {
      cy.writeFile(CAMINHO_LOG, log, { log: false });
    });
  });
});