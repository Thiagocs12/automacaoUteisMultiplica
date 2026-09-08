// arquivo: vinculos.js

import { CAMINHO_LOG } from '../shared/constants';

/**
 * @description Executa uma consulta SQL no banco de dados do ambiente informado.
 * Direciona a execução para a task de produção ou homologação conforme o valor de `env`.
 * @param {'prod'|'hml'} env - Ambiente em que a consulta será executada.
 * @param {string} query - Consulta SQL a ser executada.
 * @returns {Cypress.Chainable<unknown>}
 */
Cypress.Commands.add('executarQuery', (env, query) => {
  const queryResumida = query.trim().replace(/\s+/g, ' ').slice(0, 200);

  if (env === 'prod') {
    cy.logExecucao(`[SQL] (prod) ${queryResumida}`);
    cy.task('queryProd', { sqlQuery: query }).then((result) => {
      cy.logExecucao(`[SQL] (prod) ${queryResumida} -> ${result?.length ?? 0} linha(s)`);
      return result;
    });
  } else if (env === 'hml') {
    cy.logExecucao(`[SQL] (hml) ${queryResumida}`);
    cy.task('queryHml', { sqlQuery: query }).then((result) => {
      cy.logExecucao(`[SQL] (hml) ${queryResumida} -> ${result?.length ?? 0} linha(s)`);
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

    cy.logExecucao(`[pesquisarVinculoEsteiraHml] ${chaveEntidade}`);

    const campos = Array.isArray(entidade.campoIdentificador)
      ? entidade.campoIdentificador
      : [entidade.campoIdentificador];

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
        // Consulta é uma única SELECT para toda a entidade; acumula as resoluções
        // e persiste com 1 leitura + 1 escrita ao final em vez de por item.
        const resolucoes = itensSemId.map((dado) => {
          const encontrado = registros.find((reg) =>
            campos.every(
              (campo) =>
                String(reg[campo]) === String(dado[campo])
            )
          );

          return { idProducao: dado.id, idHml: encontrado?.id ?? null };
        });

        return cy.aplicarResolucoesIdHml(entidade.nomeArquivo, resolucoes);
      });
    });
  }
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
  let cadeia = cy.wrap(null, { log: false });

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

    cadeia = cadeia.then(() => {
      cy.logExecucao(`[atualizarItensHml] ${chaveEntidade}`);

      return cy.lerJsonDeOutput(nomeArquivo).then((dadosDoArquivo) => {
        if (!dadosDoArquivo?.length) return;

        const itensParaAtualizar = dadosDoArquivo.filter(
          (dado) => dado.idHml != null && (!geraLog || dado.atualizar === true)
        );

        if (!itensParaAtualizar.length) return;

        return cy.wrap(itensParaAtualizar, { log: false }).each((dado) => {
          const camposOpcionais = camposUpdate
            .filter(({ campo }) => dado[campo] != null)
            .map(({ campo, tipo }) => {
              const valor = dado[campo];

              if (tipo === 'boolean') return `${campo} = ${valor ? 1 : 0}`;
              if (tipo === 'string') return `${campo} = '${String(valor).replace(/'/g, "''")}'`;

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

          return cy.executarQuery('hml', query).then(() => {
            if (!geraLog) return;

            if (!chaveLog) {
              throw new Error(
                `A entidade ${chaveEntidade} está com geraLog = true, mas não possui chaveLog.`
              );
            }

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
        });
      });
    });
  }

  return cadeia.then(() => {
    return cy.readFile(CAMINHO_LOG, { failOnNonExistence: false, log: false }).then((logExistente = {}) => {
      const logFinal = {
        ...logExistente,
      };

      Object.entries(log).forEach(([chaveLog, registros]) => {
        if (!logFinal[chaveLog]) {
          logFinal[chaveLog] = [];
        }

        registros.forEach((novoRegistro) => {
          const registroJaExiste = logFinal[chaveLog].some(
            (registroExistente) => String(registroExistente.id) === String(novoRegistro.id)
          );

          if (!registroJaExiste) {
            logFinal[chaveLog].push(novoRegistro);
          }
        });
      });

      return cy.writeFile(CAMINHO_LOG, logFinal, { log: false }).then(() => {
        Cypress.log({
          name: 'salvarLog',
          message: `Novos registros adicionados em ${CAMINHO_LOG}`,
          consoleProps: () => ({
            caminho: CAMINHO_LOG,
            novosRegistros: log,
            logFinal,
          }),
        });

        return logFinal;
      });
    });
  });
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

    cy.logExecucao(`[inserirItensHml] ${chaveEntidade}`);

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
            campoIdentificador,
            dado.id,
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
  cy.logExecucao(`[Nível ${nivel}] atualizarIdsDeDependencias`);
  cy.atualizarIdsDeDependencias(nivel, mapeamentoEntidade);
  cy.logExecucao(`[Nível ${nivel}] pesquisarVinculoEsteiraHml`);
  cy.pesquisarVinculoEsteiraHml(nivel, mapeamentoEntidade);
  cy.logExecucao(`[Nível ${nivel}] atualizarItensHml`);
  cy.atualizarItensHml(nivel, mapeamentoEntidade);
  cy.logExecucao(`[Nível ${nivel}] inserirItensHml`);
  cy.inserirItensHml(nivel, mapeamentoEntidade);
});
