const LIMITE_LOTE = 20;
const ENTIDADES_IGNORADAS = ['PRODUTO', 'GRUPOS_KEYCLOAK', 'MULTIFLOW', 'SELECIONAR_CEDENTE', 'ESTEIRAS'];
const CAMINHO_LOG = 'cypress/output/Produtos/ultimosUpdates.json';
import { obterValor } from './utils';
import tokens from '../temp/tokens.json';
import MAPEAMENTOS_APIS from '../utils/mapeamentoProdutos';

const multiflow = MAPEAMENTOS_APIS.MULTIFLOW;

/**
 * @description Define e retorna os dados base para um ambiente específico.
 * @param {string} ambiente - O nome do ambiente ('prod', 'hml', 'keycloak', 'bhml').
 * @returns {Cypress.Chainable<object>} Um objeto contendo baseUrl, loginUrl, loginUsername e loginPassword.
 */
Cypress.Commands.add('definirAmbiente', (ambiente) => {
  const prod = {
    baseUrl: Cypress.env('PROD_API_BASE_URL'),
    loginUrl: Cypress.env('PROD_API_LOGIN_URL'),
    loginUsername: Cypress.env('PROD_API_USERNAME'),
    loginPassword: Cypress.env('PROD_API_PASSWORD'),
    urlTokenApiIntercept: `${Cypress.env('PROD_API_LOGIN_URL')}/auth/realms/multiplicacapital/protocol/openid-connect/token`,
    token: tokens?.prod?.token ?? ''
  };
  const hml = {
    baseUrl: Cypress.env('HML_API_BASE_URL'),
    loginUrl: Cypress.env('HML_API_LOGIN_URL'),
    loginUsername: Cypress.env('HML_API_USERNAME'),
    loginPassword: Cypress.env('HML_API_PASSWORD'),
    urlTokenApiIntercept: `${Cypress.env('HML_API_LOGIN_URL')}/auth/realms/multiplicacapital/protocol/openid-connect/token`,
    token: tokens?.hml?.token ?? ''
  };
  const keycloak = {
    baseUrl: Cypress.env('HML_KEYCLOAK_BASE_URL'),
    loginUrl: Cypress.env('HML_KEYCLOAK_LOGIN_URL'),
    loginUsername: Cypress.env('HML_KEYCLOAK_USERNAME'),
    loginPassword: Cypress.env('HML_KEYCLOAK_PASSWORD'),
    urlTokenApiIntercept: `${Cypress.env('HML_KEYCLOAK_LOGIN_URL')}/auth/realms/master/protocol/openid-connect/token`,
    token: tokens?.keycloak?.token ?? ''
  };
  const bhml = {
    baseUrl: Cypress.env('BHML_API_BASE_URL'),
    loginUrl: Cypress.env('BHML_API_LOGIN_URL'),
    loginUsername: Cypress.env('BHML_API_USERNAME'),
    loginPassword: Cypress.env('BHML_API_PASSWORD'),
    urlTokenApiIntercept: `${Cypress.env('BHML_API_LOGIN_URL')}/auth/realms/beyondbanking-hml/protocol/openid-connect/token`,
    token: tokens?.bhml?.token ?? ''
  };

  if (ambiente === 'prod') {
    return cy.wrap(prod);
  } else if (ambiente === 'hml') {
    return cy.wrap(hml);
  } else if (ambiente === 'keycloak') {
    return cy.wrap(keycloak);
  } else if (ambiente === 'bhml') {
    return cy.wrap(bhml);
  } else {
    throw new Error(`Ambiente desconhecido: ${ambiente}`);
  }
});

/**
 * @description Lê um arquivo JSON do diretório 'cypress/output'.
 * Retorna null se o arquivo não existir ou estiver vazio.
 * @param {string} nomeArquivo - Nome do arquivo JSON (ex: 'meuArquivo.json').
 * @returns {Cypress.Chainable<Array<object>|null>} Conteúdo do JSON ou null.
 */
Cypress.Commands.add('lerJsonDeOutput', (nomeArquivo) => {
  const caminhoArquivo = `cypress/output/${nomeArquivo}`;
  return cy.task('lerJsonSeExistir', { caminhoArquivo }, { log: false });
});

Cypress.Commands.add('pesquisarDependenciasLigacao', (entidade) => {
  Object.entries(entidade)
    .filter(([chave]) => !ENTIDADES_IGNORADAS.includes(chave))
    .filter(([, config]) => config?.nomeArquivoReferencia && config?.campoBusca && config?.nomeArquivo && config?.urlBuscaId)
    .forEach(([chave, config]) => {
      const { nomeArquivoReferencia, campoBusca, nomeArquivo, urlBuscaId, adiciona } = config;
      const caminhoArquivo = `cypress/output/${nomeArquivo}`;
      const ehArquivoBase = ['Produtos/1 - Produtos.json', 'Esteiras/1 - esteiras.json'].includes(nomeArquivoReferencia);
      const ehEntidadeSemBusca = ['ACOES', 'OPERADORES', 'OBSERVADORES', 'GESTORES'].includes(chave);
      const ehCondicoes = chave === 'CONDICOES';
      const registrosAcumulados = [];

      const inicializar = adiciona
        ? cy.wrap(null)
        : cy.task('escreverJson', { caminhoArquivo, conteudo: [] });

      inicializar.then(() => {
        cy.readFile(`cypress/output/${nomeArquivoReferencia}`).then((dadosDoArquivo) => {
          const dadosFiltrados = ehArquivoBase
            ? dadosDoArquivo.filter((item) => item.atualizar === true)
            : dadosDoArquivo;

            if (ehCondicoes) {
              const registrosCondicoes = dadosFiltrados.flatMap((esteira) => {
                const modeloEtapas = esteira.modeloEtapas ?? [];
                return modeloEtapas
                  .filter((etapa) => etapa?.modeloEtapa?.condicoes?.length > 0)
                  .map((etapa) => ({
                    idEsteira: esteira.id,
                    idModeloEtapa: etapa.id,
                    IdEtapa: etapa.modeloEtapa.id,
                    condicoes: etapa.modeloEtapa.condicoes,
                  }));
              });

            if (adiciona) {
              cy.task('lerJsonSeExistir', { caminhoArquivo }).then((existentes) => {
                const base = existentes ?? [];
                const mesclado = mesclarSemDuplicatas(base, registrosCondicoes, 'idModeloEtapa');
                cy.task('escreverJson', { caminhoArquivo, conteudo: mesclado });
              });
            } else {
              cy.task('escreverJson', { caminhoArquivo, conteudo: registrosCondicoes });
            }
            return;
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
                  self.findIndex((o) => o[campoDeduplicacao] === obj[campoDeduplicacao]) === index
              );

            if (adiciona) {
              cy.task('lerJsonSeExistir', { caminhoArquivo }).then((existentes) => {
                const base = existentes ?? [];
                const mesclado = mesclarSemDuplicatas(base, objetosUnicos, campoDeduplicacao);
                cy.task('escreverJson', { caminhoArquivo, conteudo: mesclado });
              });
            } else {
              cy.task('escreverJson', { caminhoArquivo, conteudo: objetosUnicos });
            }
            return;
          }

          const idsUnicos = [
            ...new Set(
              dadosFiltrados.flatMap((dado) => extrairValoresDoCaminho(dado, campoBusca))
            ),
          ];

          idsUnicos.forEach((id) => {
            cy.executarRequest('prod', `${urlBuscaId}${encodeURIComponent(id)}`).then((resposta) => {
              const itens = Array.isArray(resposta.body) ? resposta.body : [resposta.body];
              itens.forEach((item) => {
                const jaExiste = registrosAcumulados.some((r) => r.id === item.id);
                if (!jaExiste) registrosAcumulados.push(item);
              });
            });
          });

          cy.then(() => {
            if (adiciona) {
              cy.task('lerJsonSeExistir', { caminhoArquivo }).then((existentes) => {
                const base = existentes ?? [];
                const mesclado = mesclarSemDuplicatas(base, registrosAcumulados, 'id');
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
 * @description Mescla dois arrays evitando duplicatas com base em um campo chave.
 * @param {Array<Object>} base - Dados já existentes no arquivo.
 * @param {Array<Object>} novos - Dados novos a serem adicionados.
 * @param {string} campoChave - Campo usado para identificar duplicatas.
 * @returns {Array<Object>}
 */
function mesclarSemDuplicatas(base, novos, campoChave) {
  const chavesDaBase = new Set(base.map((item) => item[campoChave]));
  const apenasNovos = novos.filter((item) => !chavesDaBase.has(item[campoChave]));
  return [...base, ...apenasNovos];
}

Cypress.Commands.add('criarItensInexistentesPorNivel', (nivel, mapeamentoEntidade) => {

  for (const chaveEntidade in mapeamentoEntidade) {
    if (!Object.prototype.hasOwnProperty.call(mapeamentoEntidade, chaveEntidade)) continue;

    const entidade = mapeamentoEntidade[chaveEntidade];

    if (chaveEntidade === 'GRUPOS_KEYCLOAK' || entidade.nivelDependencia !== nivel) continue;

    const isProduto = chaveEntidade === 'PRODUTO';
    const method = entidade.method || 'POST';
    const caminhoArquivo = `cypress/output/${entidade.nomeArquivo}`;
    const campoDescricao = entidade.campoDescricao || 'descricao';
    const chavesIgnoradas = [
      'idHml', 'id', 'dataCadastro', 'dataUltimaAlteracao',
      'usuarioCadastro', 'usuarioUltimaAlteracao',
      ...(entidade.chavesIgnoradas || []),
    ];

    cy.readFile(caminhoArquivo).then((itens) => {
      const itensValidos = itens
        .filter((item) => item.idHml === null)
        .filter((item) => !isProduto || item.atualizar === true);

      const executar = (log) => {
        itensValidos.forEach((item) => {
          const camposDoItem = Object.fromEntries(
            Object.entries(item).filter(([chave]) => !chavesIgnoradas.includes(chave))
          );
          const body = removerCamposOld(camposDoItem);

          cy.executarRequest('hml', entidade.url, body, method).then((resultado) => {
            cy.setIdHmlPorDescricao(resultado.body['id'], item[campoDescricao], entidade.nomeArquivo, campoDescricao);

            if (!isProduto) return;

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

      if (isProduto) {
        cy.task('lerJsonSeExistir', { caminhoArquivo: CAMINHO_LOG }).then((logAtual) => executar(logAtual ?? {}));
      } else {
        executar({});
      }
    });
  }
});

Cypress.Commands.add('atualizarItensExistentesPorNivel', (nivel, mapeamentoEntidade) => {
  for (const chaveEntidade in mapeamentoEntidade) {
    if (!Object.prototype.hasOwnProperty.call(mapeamentoEntidade, chaveEntidade)) continue;

    const entidade = mapeamentoEntidade[chaveEntidade];

    if (chaveEntidade === 'GRUPOS_KEYCLOAK' || entidade.nivelDependencia !== nivel) continue;

    const isProduto = chaveEntidade === 'PRODUTO';
    const method = entidade.method || 'POST';
    const chavesIgnoradas = [
      'idHml', 'id', 'dataCadastro', 'dataUltimaAlteracao',
      'usuarioCadastro', 'usuarioUltimaAlteracao',
      ...(entidade.chavesIgnoradas || []),
    ];

    cy.readFile(`cypress/output/${entidade.nomeArquivo}`).then((itens) => {
      const itensValidos = itens
        .filter((item) => item.idHml != null)
        .filter((item) => !isProduto || item.atualizar === true);

      const executar = (log) => {
        itensValidos.forEach((item) => {
          const camposDoItem = Object.fromEntries(
            Object.entries(item).filter(([chave]) => !chavesIgnoradas.includes(chave))
          );
          const body = {
            ...removerCamposOld(camposDoItem),
            id: String(item.idHml),
          };

          cy.executarRequest('hml', entidade.url, body, method).then(() => {
            if (!isProduto) return;

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

      if (isProduto) {
        cy.task('lerJsonSeExistir', { caminhoArquivo: CAMINHO_LOG }).then((logAtual) => executar(logAtual ?? {}));
      } else {
        executar({});
      }
    });
  }
});

Cypress.Commands.add('pesquisarItensPorNivel', (nivel, mapeamentoEntidade) => {
  for (const chaveEntidade in mapeamentoEntidade) {
    if (!Object.prototype.hasOwnProperty.call(mapeamentoEntidade, chaveEntidade)) continue;

    const entidade = mapeamentoEntidade[chaveEntidade];
    const nomeArquivo = entidade.nomeArquivo;
    const campoDescricao = entidade.campoDescricao || 'descricao';
    const contentBusca = entidade.contentBusca || 'falseId';
    const env = entidade.env || 'hml';

    if (chaveEntidade === 'GRUPOS_KEYCLOAK' || entidade.nivelDependencia !== nivel) continue;

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

          cy.executarRequest(env, `${entidade.urlBusca}${valorChave1}`).then((resposta) => {
            const content = Array.isArray(resposta.body)
              ? resposta.body
              : resposta.body?.content || [];

            if (!content.length) {
              salvarId(null, {
                [contentBusca[0]]: valorChave1,
                [contentBusca[1]]: valorChave2,
              });
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
    } else {
      cy.lerJsonDeOutput(nomeArquivo).then((dadosDoArquivo) => {
        for (const dado of dadosDoArquivo) {
          if (dado.idHml !== null && dado.idHml !== undefined) continue;

          const valorBusca = dado[campoDescricao];

          cy.executarRequest(env, `${entidade.urlBusca}${encodeURIComponent(valorBusca)}`).then((resposta) => {
            const content = Array.isArray(resposta.body)
              ? resposta.body
              : resposta.body?.content || [];

            const id = content.find((item) =>
              String(item?.[campoDescricao])?.trim()?.toLowerCase() ===
              String(valorBusca)?.trim()?.toLowerCase()
            )?.id ?? null;

            salvarId(id, valorBusca);
          });
        }
      });
    }
  }
});

/**
 * @description Localiza um item no arquivo JSON pelo valor do campo descrição
 * e atualiza sua propriedade 'idHml' com o ID fornecido.
 * Suporta busca simples (string) e busca composta (objeto).
 * 
 * @param {string|number|null} id - ID do ambiente HML a ser salvo no item.
 * @param {string|object} descricao - Valor usado para localizar o item.
 * @param {string} nomeArquivo - Nome do arquivo JSON localizado em 'cypress/output/'.
 * @param {string|string[]} campoDescricao - Campo(s) usados para localizar o item.
 * @returns {Cypress.Chainable<void>}
 */
Cypress.Commands.add('setIdHmlPorDescricao', (id, descricao, nomeArquivo, campoDescricao) => {
  const filePath = `cypress/output/${nomeArquivo}`;

  cy.readFile(filePath, { log: false }).then((conteudo) => {

    const item = conteudo.find((entry) => {

      // Busca composta
      if (Array.isArray(campoDescricao)) {
        return campoDescricao.every((campo) => {
          return obterValor(entry, campo) === descricao[campo];
        });
      }

      // Busca simples
      return entry[campoDescricao] === descricao;
    });

    if (!item) {
      throw new Error(
        `[setIdHmlPorDescricao] Nenhum item encontrado em "${nomeArquivo}".`
      );
    }

    item.idHml = id;

    cy.writeFile(filePath, conteudo, { log: false });
  });
});

/**
 * @description Itera sobre todas as entidades de um determinado nível de dependência
 * e substitui os IDs de produção pelos IDs equivalentes no ambiente HML,
 * com base nas configurações de dependência de cada entidade.
 * Ignora a entidade 'GRUPOS_KEYCLOAK' e entidades sem dependências definidas.
 * @param {number} nivel - Nível de dependência das entidades a serem processadas.
 * @returns {Cypress.Chainable<void>}
 */
Cypress.Commands.add('atualizarIdsDeDependencias', (nivel, mapeamentoEntidade) => {
  for (const chaveEntidade in mapeamentoEntidade) {
    if (!Object.prototype.hasOwnProperty.call(mapeamentoEntidade, chaveEntidade)) continue;

    const entidade = mapeamentoEntidade[chaveEntidade];

    if (
      chaveEntidade === 'GRUPOS_KEYCLOAK' ||
      entidade.nivelDependencia !== nivel ||
      !entidade.dependencia ||
      entidade.dependencia.length === 0
    ) continue;

    cy.readFile(`cypress/output/${entidade.nomeArquivo}`).then((itens) => {
      cy.wrap(entidade.dependencia).each((dependencia) => {
        const { arquivoDependencia, idSubstituido } = dependencia;
        const idDependecia = dependencia.idDependecia || 'id';

        return cy.readFile(`cypress/output/${arquivoDependencia}`).then((dependencias) => {
          const listaDependencias = Array.isArray(dependencias[0])
            ? dependencias.flat()
            : dependencias;

          // Separa o caminho pai do nome da chave final
          // ex: 'produto.id' → pai: 'produto', chave: 'id'
          // ex: 'id'         → pai: null,      chave: 'id'
          const partes = idSubstituido.split('.');
          const chaveId = partes[partes.length - 1];
          const caminhoParent = partes.slice(0, -1).join('.');

          itens.forEach((item) => {
            const idOriginal = Cypress._.get(item, idSubstituido);

            if (!idOriginal) return;

            const equivalente = listaDependencias.find(
              (depItem) => depItem[idDependecia] === idOriginal
            );

            if (!equivalente) return;

            // Obtém o objeto pai onde a chave será salva
            const objetoPai = caminhoParent
              ? Cypress._.get(item, caminhoParent)
              : item;

            objetoPai[`${chaveId}.old`] = idOriginal;          // salva original como "id.old"
            Cypress._.set(item, idSubstituido, equivalente.idHml); // substitui pelo HML
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
 * executando em sequência: atualização de IDs de dependências e pesquisa de itens no ambiente HML.
 * Os steps de atualização e criação estão comentados e podem ser habilitados conforme necessidade.
 * @param {number} nivel - Nível de dependência das entidades a serem processadas.
 * @returns {Cypress.Chainable<void>}
 */
Cypress.Commands.add('processarEntidadesPorNivel', (nivel, mapeamentoEntidade) => {
  cy.atualizarIdsDeDependencias(nivel, mapeamentoEntidade);
  cy.pesquisarItensPorNivel(nivel, mapeamentoEntidade);
  //cy.atualizarItensExistentesPorNivel(nivel, mapeamentoEntidade)
  //cy.criarItensInexistentesPorNivel(nivel, mapeamentoEntidade)
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
 * Para entidades incluídas em ENTIDADES_COM_VALIDACAO:
 *  - Compara IDs dos novos dados com os existentes no arquivo
 *  - Adiciona apenas IDs que ainda não existem no arquivo
 *  - Valida regra dos 7 dias com base no 'ultimosUpdates.json'
 *  - Seta 'atualizar: true' apenas nos itens que passam na regra
 *  - Respeita o limite de lote configurado
 *  - Não altera campos existentes além do 'atualizar'
 *
 * Para demais entidades:
 *  - Salva tudo que vier da API sem validações adicionais
 *
 * Para a entidade ESTEIRAS (comportamento adicional):
 *  - Após o processo padrão, varre os dados finais
 *  - Identifica itens que possuem 'idModeloEsteiraVinculado' não nulo
 *  - Marca com 'esteiraVinculada: true' os itens apontados por esse campo
 *
 * @param {Array<Object>} novosDados - Lista de registros recebidos da API de produção.
 * @param {string} caminhoArquivo - Caminho do arquivo de output da entidade.
 * @param {Object} entidade - Mapa de entidades com seus metadados.
 * @returns {Cypress.Chainable<void>}
 * @example
 * cy.executarRequest('prod', APIS.PRODUTO.urlListAll).then((resposta) => {
 *   cy.salvarNovosRegistros(resposta.body, `cypress/output/${APIS.PRODUTO.nomeArquivo}`, APIS);
 * });
 */

const ENTIDADES_COM_VALIDACAO = ['PRODUTO', 'ESTEIRAS'];

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
      const log = logAtual ?? {};
      const registrosLog = log[chaveEntidade] ?? [];

      const listaExistente = dadosExistentes ?? [];
      const idsExistentes = new Set(listaExistente.map((item) => item.id));

      const apenasNovos = novosDados.filter((novo) => !idsExistentes.has(novo.id));

      const candidatos = listaExistente
        .map((existente) => {
          const estaEmNovosDados = novosDados.some((novo) => novo.id === existente.id);
          if (!estaEmNovosDados) return null;

          const registroLog = registrosLog.find((r) => r.id === existente.id);
          const estaVencido =
            !registroLog || agora - new Date(registroLog.dataAtualizacao) > seteDiasEmMs;

          if (!estaVencido) return null;

          return {
            id: existente.id,
            dataOrdenacao: registroLog ? new Date(registroLog.dataAtualizacao) : new Date(0),
          };
        })
        .filter(Boolean);

      const novosParaLote = apenasNovos.map((novo) => ({
        id: novo.id,
        dataOrdenacao: new Date(0),
      }));

      const idsLoteParaAtualizar = [...candidatos, ...novosParaLote]
        .sort((a, b) => a.dataOrdenacao - b.dataOrdenacao)
        .slice(0, LIMITE_LOTE)
        .map((item) => item.id);

      let dadosAtualizados = [
        ...listaExistente.map((existente) => ({
          ...existente,
          atualizar: idsLoteParaAtualizar.includes(existente.id),
        })),
        ...apenasNovos.map((novo) => ({
          ...novo,
          idHml: null,
          atualizar: idsLoteParaAtualizar.includes(novo.id),
        })),
      ];

      if (chaveEntidade === 'ESTEIRAS') {
        dadosAtualizados = aplicarMarcacaoEsteiraVinculada(dadosAtualizados);
      }

      cy.writeFile(caminhoArquivo, dadosAtualizados);
    });
  });
});

/**
 * @description Varre os dados de esteiras e marca com 'esteiraVinculada: true'
 * todos os itens cujo 'id' é referenciado por algum 'idModeloEsteiraVinculado'.
 *
 * @param {Array<Object>} dados - Lista de esteiras já processadas.
 * @returns {Array<Object>} Lista com a marcação aplicada.
 */
function aplicarMarcacaoEsteiraVinculada(dados) {
  const idsVinculados = new Set(
    dados
      .filter((item) => item.idModeloEsteiraVinculado !== null)
      .map((item) => item.idModeloEsteiraVinculado)
  );

  return dados.map((item) => ({
    ...item,
    ...(idsVinculados.has(item.id) && { esteiraVinculada: true }),
  }));
}

Cypress.Commands.add('voltarIdsOriginais', (entidade) => {
  for (const chaveEntidade in entidade) {
    if (!Object.prototype.hasOwnProperty.call(entidade, chaveEntidade)) continue;

    const configEntidade = entidade[chaveEntidade];

    if (
      chaveEntidade === 'GRUPOS_KEYCLOAK' ||
      !configEntidade.dependencia ||
      configEntidade.dependencia.length === 0
    ) continue;

    const caminhoArquivo = `cypress/output/${configEntidade.nomeArquivo}`;

    cy.task('lerJsonSeExistir', { caminhoArquivo }).then((itens) => {
      if (!itens) {
        return;
      }

      const itensRestaurados = itens.map((item) => restaurarCamposOld(item));
      cy.writeFile(caminhoArquivo, itensRestaurados);
    });
  }
});

/**
 * Restaura recursivamente todos os campos `.old` para seus campos originais,
 * removendo a chave `.old` após a restauração.
 * @param {object} obj
 * @returns {object}
 */
function restaurarCamposOld(obj) {
  if (typeof obj !== 'object' || obj === null) return obj;

  const resultado = {};

  for (const [chave, valor] of Object.entries(obj)) {
    if (chave.endsWith('.old')) continue; // será tratado pelo campo original

    const chaveOld = `${chave}.old`;

    resultado[chave] = Object.prototype.hasOwnProperty.call(obj, chaveOld)
      ? obj[chaveOld]                  // restaura o valor original
      : restaurarCamposOld(valor);     // desce recursivamente
  }

  return resultado;
}

/**
 * Remove recursivamente todas as chaves que terminam com '.old' de um objeto.
 * @param {object} obj
 * @returns {object}
 */
function removerCamposOld(obj) {
  if (typeof obj !== 'object' || obj === null) return obj;

  return Object.fromEntries(
    Object.entries(obj)
      .filter(([chave]) => !chave.endsWith('.old'))
      .map(([chave, valor]) => [chave, removerCamposOld(valor)])
  );
}

/**
 * Extrai valores de um caminho que pode conter arrays em qualquer nível.
 * Funciona para: 'id', 'grupoProduto.id', 'modeloEtapas.modeloEtapa.id'
 */
function extrairValoresDoCaminho(obj, caminho) {
  const partes = caminho.split('.');

  const percorrer = (atual, partesRestantes) => {
    if (!atual || partesRestantes.length === 0) return [atual];

    const [parte, ...resto] = partesRestantes;
    const proximo = Array.isArray(atual)
      ? atual.flatMap((item) => percorrer(item?.[parte], resto))  // ✅ entra em cada item do array
      : percorrer(atual[parte], resto);

    return [proximo].flat();
  };

  return percorrer(obj, partes).filter((v) => v != null);
}
