// arquivo: commands.js

// ─── Imports ─────────────────────────────────────────────────────────────────

import { obterValor } from './utils';
import tokens from '../temp/tokens.json';
import MAPEAMENTOS_APIS from '../utils/mapeamentoProdutos';

// ─── Constantes ──────────────────────────────────────────────────────────────

/** Tamanho máximo do lote de produtos processados por execução */
const LIMITE_LOTE_PRODUTO = 20;

/** Tamanho máximo do lote de esteiras processadas por execução */
const LIMITE_LOTE_ESTEIRAS = 20;

/** Caminho do arquivo de log com os registros de última atualização */
const CAMINHO_LOG = 'cypress/output/ultimosUpdates.json';

/** Entidades ignoradas no fluxo de pesquisa de dependências de ligação */
const ENTIDADES_IGNORADAS = ['PRODUTO', 'GRUPOS_KEYCLOAK', 'MULTIFLOW', 'SELECIONAR_CEDENTE', 'ESTEIRAS'];

/** Entidades que aplicam validação de lote e regra dos 7 dias */
const ENTIDADES_COM_VALIDACAO = ['PRODUTO', 'ESTEIRAS', 'MOP'];

/** Entidades que contêm URLs de ambiente que devem ser substituídas */
const ENTIDADES_COM_URL = ['SUB_ETAPAS', 'ESTEIRAS', 'ESTEIRA_VINCULADA'];

/** Mapeamento de substituição de URLs de produção para HML */
const SUBSTITUICOES_URL = [
  { de: 'https://beyond.grupomultiplica.com.br', para: 'https://beyond-hml.grupomultiplica.com.br' },
  { de: 'https://beyond-us.grupomultiplica.com.br', para: 'https://beyond-hml.grupomultiplica.com.br' },
];

/** Valores para controle do estoque */
const CAMINHO_ESTOQUE = 'cypress/output/estoqueIds.json';
const TRINTA_DIAS_EM_MS = 30 * 24 * 60 * 60 * 1000;

// ─── Helpers ─────────────────────────────────────────────────────────────────

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
      Object.entries(obj).map(([k, v]) => [k, normalizarObjetosNumericos(v)])
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
    Object.entries(obj).filter(([chave]) => !chavesSimples.includes(chave))
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
      .map(([chave, valor]) => [chave, removerCamposOld(valor)])
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
  return cy.task('lerJsonSeExistir', { caminhoArquivo: `cypress/output/${nomeArquivo}` }, { log: false });
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

    itens.forEach((item) => { item.idHml = id; });

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
    .filter(([, config]) => config?.nomeArquivoReferencia && config?.campoBusca && config?.nomeArquivo && config?.urlBuscaId)
    .forEach(([chave, config]) => {
      const { nomeArquivoReferencia, campoBusca, nomeArquivo, urlBuscaId, adiciona } = config;
      const caminhoArquivo = `cypress/output/${nomeArquivo}`;
      const ehArquivoBase = ['Produtos/1 - Produtos.json', 'Esteiras/1 - esteiras.json'].includes(nomeArquivoReferencia);
      const ehEntidadeSemBusca = ['ACOES', 'OPERADORES', 'OBSERVADORES', 'GESTORES'].includes(chave);
      const registrosAcumulados = [];

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
      const LIMITE_LOTE = chaveEntidade === 'ESTEIRA' ? LIMITE_LOTE_ESTEIRAS : LIMITE_LOTE_PRODUTO;

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
    ) continue;

    cy.readFile(`cypress/output/${entidade.nomeArquivo}`).then((itensRaw) => {
      const itens = normalizarObjetosNumericos(itensRaw);

      cy.wrap(entidade.dependencia).each((dependencia) => {
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

          const substituir = (atual, partesRestantes) => {
            if (!atual || partesRestantes.length === 0) return;

            if (Array.isArray(atual)) {
              atual.forEach((elemento) => substituir(elemento, partesRestantes));
              return;
            }

            const chaves = Object.keys(atual);
             if (chaves.length > 0 && chaves.every((c) => /^\d+$/.test(c))) {
              chaves.forEach((chave) => substituir(atual[chave], partesRestantes));
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
          if (chaveEntidade === 'ESTEIRAS' && dado.atualizar !== true) continue;

          const valorChave1 = obterValor(dado, contentBusca[0]);
          const valorChave2 = obterValor(dado, contentBusca[1]);

          cy.buscarIdHmlNoEstoque(chaveEntidade, dado.id).then((idDoEstoque) => {
            if (idDoEstoque != null) {
              salvarId(idDoEstoque, { [contentBusca[0]]: valorChave1, [contentBusca[1]]: valorChave2 });
              return;
            }

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

              const id = itemEncontrado?.id ?? null;
              salvarId(id, { [contentBusca[0]]: valorChave1, [contentBusca[1]]: valorChave2 });
              if (id != null) cy.salvarIdHmlNoEstoque(chaveEntidade, dado.id, id);
            });
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

            const id = content.find((item) =>
              String(item?.[CAMPO_DESCRICAO_KEYCLOAK])?.trim()?.toLowerCase() ===
              String(valorBusca)?.trim()?.toLowerCase()
            )?.id ?? null;

            salvarId(id, valorBusca);
          });
        } else {
          cy.buscarIdHmlNoEstoque(chaveEntidade, dado.id).then((idDoEstoque) => {
            if (idDoEstoque !== null) {
              salvarId(idDoEstoque, valorBusca);
              return;
            }

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
              if (id != null) cy.salvarIdHmlNoEstoque(chaveEntidade, dado.id, id);
            });
          });
        }
      }
    });
  }
});

/**
 * @description Consulta o estoque de IDs mapeados entre produção e HML,
 * retornando o 'idHml' em cache caso exista e não tenha expirado (30 dias).
 * Retorna null se não encontrado, sem 'idHml' ou com entrada expirada.
 * @param {string} chaveEntidade - Chave da entidade no estoque (ex: 'ESTEIRAS', 'PRODUTO').
 * @param {string|number} idProd - ID de produção a ser consultado.
 * @returns {Cypress.Chainable<string|number|null>}
 */
Cypress.Commands.add('buscarIdHmlNoEstoque', (chaveEntidade, idProd) => {
  return cy.task('lerJsonSeExistir', { caminhoArquivo: CAMINHO_ESTOQUE }, { log: false }).then((estoque) => {
    if (!estoque) return null;

    const entrada = (estoque[chaveEntidade] ?? []).find((e) => e.id === idProd);
    if (!entrada || entrada.idHml == null) return null;

    const expirado = new Date() - new Date(entrada.dataAtualizacao) > TRINTA_DIAS_EM_MS;
    return expirado ? null : entrada.idHml;
  });
});

/**
 * @description Persiste o mapeamento entre um ID de produção e seu equivalente HML
 * no arquivo de estoque. Atualiza a entrada se já existir, adiciona caso contrário.
 * Registra a data de atualização para controle de expiração (30 dias).
 * @param {string} chaveEntidade - Chave da entidade no estoque (ex: 'ESTEIRAS', 'PRODUTO').
 * @param {string|number} idProd - ID de produção a ser armazenado.
 * @param {string|number} idHml - ID equivalente no ambiente HML.
 * @returns {Cypress.Chainable<void>}
 */
Cypress.Commands.add('salvarIdHmlNoEstoque', (chaveEntidade, idProd, idHml) => {
  return cy.task('lerJsonSeExistir', { caminhoArquivo: CAMINHO_ESTOQUE }, { log: false }).then((estoqueAtual) => {
    const estoque = estoqueAtual ?? {};
    if (!estoque[chaveEntidade]) estoque[chaveEntidade] = [];

    const entrada = {
      id: idProd,
      idHml,
      dataAtualizacao: new Date().toISOString().replace('T', ' ').slice(0, 23),
    };

    const indice = estoque[chaveEntidade].findIndex((e) => e.id === idProd);
    if (indice >= 0) {
      estoque[chaveEntidade][indice] = entrada;
    } else {
      estoque[chaveEntidade].push(entrada);
    }

    cy.writeFile(CAMINHO_ESTOQUE, estoque, { log: false });
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

          const camposNormalizados = normalizarCamposLista(
            normalizarObjetosNumericos(camposLimpos),
            entidade.camposLista
          );

          const body = entidade.novoArray
            ? { [entidade.novoArray]: camposNormalizados }
            : camposNormalizados;

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
      [
        'GRUPOS_KEYCLOAK', 'CONDICOES', 'MOTIVOS_RETORNO',
        'GESTORES', 'OBSERVADORES', 'OPERADORES', 'TIPOESTEIRAS',
        'TIPOESTEIRAS_VINCULADAS', 'PRODUTO_TARIFA', 'PRODUTO_GARANTIA',
        'PRODUTO_KIT','KIT_DOCUMENTO','TIPO_SITUACAO','TIPO_EVENTO',
        'GRUPO_GARANTIA','CLASSIFICACAO_GARANTIA','NIVEL_GARANTIA',
        'TIPO_GARANTIA','GRUPO_PRODUTO_RISCO','SEGMENTO_TARIFADOR',
        'PRODUTO_INDEXADOR','CLASSIFICACAO_PRODUTO'
      ].includes(chaveEntidade) ||
      entidade.nivelDependencia !== nivel
    ) continue;

    const geraLog = ['PRODUTO', 'ESTEIRAS'].includes(chaveEntidade);
    const method = entidade.methodAtualizacao || 'POST';
    const chavesIgnoradas = [
      'idHml', 'id', 'dataCadastro', 'dataUltimaAlteracao',
      'usuarioCadastro', 'usuarioUltimaAlteracao', 'usuario', 'atualizar',
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

          const camposNormalizados = normalizarCamposLista(
            normalizarObjetosNumericos(camposLimpos),
            entidade.camposLista
          );

          const body = entidade.novoArray
            ? { [entidade.novoArray]: camposNormalizados }
            : camposNormalizados;

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
 * @description Orquestra o processamento completo de entidades para um determinado nível de dependência,
 * executando em sequência: substituição de URLs, atualização de IDs de dependências,
 * pesquisa de itens, atualização de existentes e criação de inexistentes no ambiente HML.
 * @param {number} nivel - Nível de dependência das entidades a serem processadas.
 * @param {Object} mapeamentoEntidade - Mapeamento de entidades com suas configurações.
 * @returns {Cypress.Chainable<void>}
 */
Cypress.Commands.add('processarEntidadesPorNivel', (nivel, mapeamentoEntidade) => {
  cy.log('estou executando substituirUrlsDeAmbiente')
  cy.substituirUrlsDeAmbiente(nivel, mapeamentoEntidade);
  cy.log('estou executando atualizarIdsDeDependencias')
  cy.atualizarIdsDeDependencias(nivel, mapeamentoEntidade);
  cy.log('estou executando pesquisarItensPorNivel')
  cy.pesquisarItensPorNivel(nivel, mapeamentoEntidade);
  cy.log('estou executando atualizarItensExistentesPorNivel')
  cy.atualizarItensExistentesPorNivel(nivel, mapeamentoEntidade);
  cy.log('estou executando criarItensInexistentesPorNivel')
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

Cypress.Commands.add('executarQuery', (env, query) => {
  if (env === 'prod') {
    cy.task('queryProd', { sqlQuery: query }).then((result) => {
      expect(result).to.exist;
      return result;
    });
  } else if (env === 'hml') {
    cy.task('queryHml', { sqlQuery: query }).then((result) => {
      expect(result).to.exist;
      return result;
    });
  } else {
    cy.log(`Ambiente ${env} não suportado para execução de query.`);
  }
});

Cypress.Commands.add('pesquisarVinculoEsteiraHml', (entidade) => {
  cy.lerJsonDeOutput(entidade.nomeArquivo).then((dadosDoArquivo) => {
    if (!dadosDoArquivo?.length) return;

    const itensSemId = dadosDoArquivo.filter((dado) => dado.idHml == null);


    if (!itensSemId.length) return;

    cy.executarQuery('hml', 'SELECT * FROM MC_MOP_VINCULO_ESTEIRA').then((registros) => {
      for (const dado of itensSemId) {
        const encontrado = registros.find(
          (reg) => Number(reg.idProduto) === Number(dado.idProduto)
        );
        
        console.log(encontrado)
        
        const idHml = encontrado?.id ?? null;

        cy.setIdHmlPorDescricao(
          idHml,
          { idProduto: dado.idProduto },
          entidade.nomeArquivo,
          'idProduto'
        );
      }
    });
  });
});