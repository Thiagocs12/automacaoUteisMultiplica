// arquivo: exclusaoEstrutural.js
//
// Núcleo puro (sem dependência do global `Cypress`) da exclusão em HML de um
// grafo de linhas ligadas por FK: descoberta do grafo estrutural mapeado da
// clonagem de cedente, expansão pelas FKs reais do banco (`sys.foreign_keys`),
// ordem de exclusão e montagem dos DELETEs.
//
// A descoberta é escrita como "roteiro" (função geradora que devolve, a cada
// passo, `{ sql }` e recebe de volta as linhas lidas). Assim a mesma lógica é
// executada tanto por um comando Cypress (`cy.executarRoteiroSqlEmAmbiente`,
// `commands/estruturaCedente.js`) quanto por um script Node
// (`executarRoteiroSql`, abaixo), e é testável com `node:test` alimentando o
// roteiro com linhas falsas.

import {
  classificarTabelaCedente,
  FASE_CATALOGO,
  montarCondicaoBuscaSatelite,
  montarDeleteEmLote,
  formatarValorSql,
  ordenarTabelasParaExclusaoEstrutural,
} from './clonagemCedente.js';

/**
 * @description Executa um roteiro SQL (função geradora que devolve `{ sql }`
 * e recebe as linhas lidas) com uma função de consulta assíncrona qualquer.
 * @param {Generator<{sql: string}, *, Object[]>} roteiro
 * @param {(sql: string) => Promise<Object[]|null|undefined>} consultar
 * @returns {Promise<*>} o valor de retorno do roteiro.
 */
export const executarRoteiroSql = async (roteiro, consultar) => {
  let passo = roteiro.next();
  while (!passo.done) {
    const linhas = await consultar(passo.value.sql);
    passo = roteiro.next(linhas ?? []);
  }
  return passo.value;
};

/**
 * @description Divide uma lista em pedaços de no máximo `tamanho` itens.
 * `tamanho` infinito (ou não positivo) devolve a lista inteira num só pedaço.
 * @template T
 * @param {T[]} itens
 * @param {number} tamanho
 * @returns {T[][]}
 */
export const dividirEmLotes = (itens, tamanho) => {
  if (!itens.length) return [];
  if (!Number.isFinite(tamanho) || tamanho <= 0) return [itens];
  const lotes = [];
  for (let inicio = 0; inicio < itens.length; inicio += tamanho) {
    lotes.push(itens.slice(inicio, inicio + tamanho));
  }
  return lotes;
};

const naoECatalogo = (tabela) => classificarTabelaCedente(tabela).fase !== FASE_CATALOGO;

/**
 * @description Roteiro de descoberta, em um ambiente, do grafo estrutural
 * mapeado (formato de `MAPEAMENTO_CEDENTE_UNIFICADO`) a partir de um mapa de
 * sementes `{ [tabela]: linhas[] }`, percorrendo `ordemTabelas` (ordem de
 * inserção, pais antes de filhas). Tabela semeada usa as linhas da semente;
 * as demais são buscadas como satélites das tabelas-pai já percorridas
 * (`montarCondicaoBuscaSatelite`); tabela que não é satélite de nada já
 * percorrido é pulada. Tabelas de catálogo nunca entram. Só lê ids.
 * @param {string[]} ordemTabelas
 * @param {Object<string, Object[]>} sementes
 * @param {Object} mapeamento
 * @returns {Generator<{sql: string}, Object<string, Set<number>>, Object[]>} ids por tabela.
 */
export function* roteiroDescobertaGrafoEstrutural(ordemTabelas, sementes, mapeamento) {
  const idsPorTabela = {};
  const tabelasJaProcessadas = new Set();

  const registrarLinhas = (tabela, linhas) => {
    idsPorTabela[tabela] = idsPorTabela[tabela] ?? new Set();
    linhas.forEach((linha) => idsPorTabela[tabela].add(Number(linha.id)));
    tabelasJaProcessadas.add(tabela);
  };

  for (const tabela of ordemTabelas.filter(naoECatalogo)) {
    if (sementes[tabela]) {
      registrarLinhas(tabela, sementes[tabela]);
      continue;
    }

    const condicao = montarCondicaoBuscaSatelite(tabela, mapeamento, tabelasJaProcessadas, idsPorTabela);
    if (!condicao) {
      tabelasJaProcessadas.add(tabela);
      continue;
    }

    const linhas = yield { sql: `SELECT * FROM ${tabela} WHERE ${condicao}` };
    registrarLinhas(tabela, linhas ?? []);
  }

  return idsPorTabela;
}

export const SQL_CATALOGO_FKS = [
  'SELECT fk.name AS nome,',
  ' OBJECT_NAME(fk.parent_object_id) AS tabelaFilha,',
  ' COL_NAME(fkc.parent_object_id, fkc.parent_column_id) AS colunaFilha,',
  ' OBJECT_NAME(fk.referenced_object_id) AS tabelaPai,',
  ' COL_NAME(fkc.referenced_object_id, fkc.referenced_column_id) AS colunaPai,',
  ' fk.is_disabled AS desabilitada,',
  ' c.is_nullable AS colunaFilhaNulavel',
  ' FROM sys.foreign_keys fk',
  ' INNER JOIN sys.foreign_key_columns fkc ON fkc.constraint_object_id = fk.object_id',
  ' INNER JOIN sys.columns c ON c.object_id = fkc.parent_object_id AND c.column_id = fkc.parent_column_id',
].join('');

export const SQL_TABELAS_COM_COLUNA_ID =
  "SELECT t.name AS tabela FROM sys.tables t INNER JOIN sys.columns c ON c.object_id = t.object_id AND c.name = 'id'";

/**
 * @description Normaliza as linhas de `SQL_CATALOGO_FKS` numa lista de FKs de
 * coluna única. FK composta (mais de uma coluna) não é suportada pela
 * expansão em cascata e vira erro descritivo, nunca uma exclusão parcial.
 * @param {Object[]} linhas
 * @returns {Array<{nome: string, tabelaFilha: string, colunaFilha: string, tabelaPai: string, colunaPai: string, desabilitada: boolean, colunaFilhaNulavel: boolean}>}
 */
export const normalizarCatalogoFks = (linhas) => {
  const porNome = new Map();
  (linhas ?? []).forEach((linha) => {
    porNome.set(linha.nome, [...(porNome.get(linha.nome) ?? []), linha]);
  });

  return [...porNome.entries()].map(([nome, colunas]) => {
    if (colunas.length > 1) {
      throw new Error(`[normalizarCatalogoFks] FK composta não suportada pela exclusão em cascata: ${nome}.`);
    }
    const [fk] = colunas;
    return {
      nome,
      tabelaFilha: fk.tabelaFilha,
      colunaFilha: fk.colunaFilha,
      tabelaPai: fk.tabelaPai,
      colunaPai: fk.colunaPai,
      desabilitada: Boolean(fk.desabilitada),
      colunaFilhaNulavel: Boolean(fk.colunaFilhaNulavel),
    };
  });
};

/**
 * @description Cria uma seleção de exclusão vazia. A seleção guarda, por
 * tabela, os ids a apagar (`ids`) ou, para tabela sem coluna `id`, as
 * condições `coluna IN (valores)` que localizam as linhas (`condicoes`).
 * @returns {Object<string, {ids: Set<number>, condicoes: Map<string, Set<*>>}>}
 */
export const criarSelecaoExclusao = () => ({});

const entradaSelecao = (selecao, tabela) => {
  selecao[tabela] = selecao[tabela] ?? { ids: new Set(), condicoes: new Map() };
  return selecao[tabela];
};

/**
 * @description Acrescenta ids de uma tabela a uma seleção de exclusão.
 * @param {Object} selecao - ver `criarSelecaoExclusao`.
 * @param {string} tabela
 * @param {Iterable<number|string>} ids
 * @returns {Object} a mesma seleção.
 */
export const adicionarIdsNaSelecao = (selecao, tabela, ids) => {
  const entrada = entradaSelecao(selecao, tabela);
  [...(ids ?? [])].forEach((id) => entrada.ids.add(Number(id)));
  return selecao;
};

/**
 * @description Converte o resultado de `roteiroDescobertaGrafoEstrutural`
 * (`{ [tabela]: Set<id> }`) numa seleção de exclusão, sem tabelas de catálogo.
 * @param {Object<string, Iterable<number>>} idsPorTabela
 * @returns {Object} seleção de exclusão.
 */
export const selecaoAPartirDeIdsPorTabela = (idsPorTabela) => {
  const selecao = criarSelecaoExclusao();
  Object.entries(idsPorTabela ?? {})
    .filter(([tabela]) => naoECatalogo(tabela))
    .forEach(([tabela, ids]) => {
      if ([...(ids ?? [])].length) adicionarIdsNaSelecao(selecao, tabela, ids);
    });
  return selecao;
};

const formatarListaSql = (valores) => valores.map((valor) => formatarValorSql(valor)).join(', ');

const normalizarValorChave = (valor) => {
  if (typeof valor === 'bigint') return Number(valor);
  if (typeof valor === 'string' && /^-?\d+$/.test(valor) && Number.isSafeInteger(Number(valor))) return Number(valor);
  return valor;
};

/**
 * @description Roteiro de expansão em cascata de uma seleção pelas FKs reais
 * do banco: toda linha que referencia, por qualquer FK (habilitada ou não),
 * uma linha já selecionada entra também na seleção, até não haver mais
 * referências novas. Só segue o sentido "quem referencia" (filhas), nunca o
 * sentido dos pais. Lê o catálogo de FKs e de colunas `id` do próprio banco.
 * @param {Object} selecaoInicial - seleção com ids por tabela (não é alterada).
 * @param {{tamanhoLote?: number}} [opcoes] - quantos valores por `IN (...)` nas buscas.
 * @returns {Generator<{sql: string}, {selecao: Object, fks: Array<Object>, tabelasComId: Set<string>}, Object[]>}
 */
export function* roteiroExpansaoPorFk(selecaoInicial, opcoes = {}) {
  const tamanhoLote = opcoes.tamanhoLote ?? 1000;
  const fks = normalizarCatalogoFks(yield { sql: SQL_CATALOGO_FKS });
  const tabelasComId = new Set((yield { sql: SQL_TABELAS_COM_COLUNA_ID }).map((linha) => linha.tabela));

  const fksPorPai = new Map();
  fks.forEach((fk) => {
    const chave = `${fk.tabelaPai}.${fk.colunaPai}`;
    fksPorPai.set(chave, [...(fksPorPai.get(chave) ?? []), fk]);
  });
  const colunasReferenciadas = (tabela) => [
    ...new Set(fks.filter((fk) => fk.tabelaPai === tabela).map((fk) => fk.colunaPai)),
  ];

  const selecao = criarSelecaoExclusao();
  const valoresConhecidos = new Map();
  const fila = [];

  const registrarValores = (tabela, coluna, valores) => {
    const chave = `${tabela}.${coluna}`;
    const conhecidos = valoresConhecidos.get(chave) ?? new Set();
    valoresConhecidos.set(chave, conhecidos);
    const novos = valores.map(normalizarValorChave).filter((valor) => valor != null && !conhecidos.has(valor));
    novos.forEach((valor) => conhecidos.add(valor));
    if (novos.length && fksPorPai.has(chave)) fila.push({ tabela, coluna, valores: [...new Set(novos)] });
  };

  const registrarLinhas = (tabela, linhas) => {
    if (!linhas.length) return;
    const colunas = colunasReferenciadas(tabela);
    const idsNovos = [];
    if (tabelasComId.has(tabela)) {
      const entrada = entradaSelecao(selecao, tabela);
      linhas.forEach((linha) => {
        const id = Number(linha.id);
        if (!entrada.ids.has(id)) {
          entrada.ids.add(id);
          idsNovos.push(linha);
        }
      });
    }
    const linhasNovas = tabelasComId.has(tabela) ? idsNovos : linhas;
    colunas.forEach((coluna) => registrarValores(tabela, coluna, linhasNovas.map((linha) => linha[coluna])));
  };

  for (const [tabela, entrada] of Object.entries(selecaoInicial ?? {})) {
    const ids = [...entrada.ids];
    if (!ids.length) continue;
    const colunasExtras = colunasReferenciadas(tabela).filter((coluna) => coluna !== 'id');
    if (!colunasExtras.length) {
      registrarLinhas(tabela, ids.map((id) => ({ id })));
      continue;
    }
    for (const lote of dividirEmLotes(ids, tamanhoLote)) {
      const linhas = yield {
        sql: `SELECT id, ${colunasExtras.join(', ')} FROM ${tabela} WHERE id IN (${lote.join(', ')})`,
      };
      registrarLinhas(tabela, linhas);
    }
  }

  while (fila.length) {
    const { tabela, coluna, valores } = fila.shift();
    for (const fk of fksPorPai.get(`${tabela}.${coluna}`)) {
      const filha = fk.tabelaFilha;
      const temId = tabelasComId.has(filha);
      const colunas = [...new Set([...(temId ? ['id'] : []), ...colunasReferenciadas(filha)])];
      const projecao = colunas.length ? colunas.join(', ') : 'TOP 1 1 AS existe';

      for (const lote of dividirEmLotes(valores, tamanhoLote)) {
        const linhas = yield {
          sql: `SELECT ${projecao} FROM ${filha} WHERE ${fk.colunaFilha} IN (${formatarListaSql(lote)})`,
        };
        if (!temId && linhas.length) {
          const entrada = entradaSelecao(selecao, filha);
          const condicao = entrada.condicoes.get(fk.colunaFilha) ?? new Set();
          lote.forEach((valor) => condicao.add(valor));
          entrada.condicoes.set(fk.colunaFilha, condicao);
        }
        if (colunas.length) registrarLinhas(filha, linhas);
      }
    }
  }

  for (const [tabela, entrada] of Object.entries(selecaoInicial ?? {})) {
    adicionarIdsNaSelecao(selecao, tabela, entrada.ids);
  }

  return { selecao, fks, tabelasComId };
}

/**
 * @description Condição SQL que localiza as linhas de uma entrada da seleção
 * (`id IN (...)` e/ou `coluna IN (...)`, unidas por OR).
 * @param {{ids: Set<number>, condicoes: Map<string, Set<*>>}|undefined} entrada
 * @returns {string|null} `null` se a entrada não seleciona nada.
 */
export const montarCondicaoDaEntrada = (entrada) => {
  if (!entrada) return null;
  const partes = [];
  const ids = [...entrada.ids];
  if (ids.length) partes.push(`id IN (${ids.join(', ')})`);
  entrada.condicoes.forEach((valores, coluna) => {
    if (valores.size) partes.push(`${coluna} IN (${formatarListaSql([...valores])})`);
  });
  return partes.length ? partes.join(' OR ') : null;
};

/**
 * @description Mesma seleção de `montarCondicaoDaEntrada`, dividida em várias
 * condições de no máximo `tamanhoLote` valores cada (listas `IN` muito longas
 * esgotam o planejador de consultas do SQL Server).
 * @param {{ids: Set<number>, condicoes: Map<string, Set<*>>}|undefined} entrada
 * @param {number} [tamanhoLote]
 * @returns {string[]}
 */
export const montarCondicoesDaEntradaEmLotes = (entrada, tamanhoLote = 1000) => {
  if (!entrada) return [];
  const condicoes = dividirEmLotes([...entrada.ids], tamanhoLote).map((lote) => `id IN (${lote.join(', ')})`);
  entrada.condicoes.forEach((valores, coluna) => {
    dividirEmLotes([...valores], tamanhoLote).forEach((lote) => condicoes.push(`${coluna} IN (${formatarListaSql(lote)})`));
  });
  return condicoes;
};

/**
 * @description Tabelas da seleção que têm ao menos um id ou condição.
 * @param {Object} selecao
 * @returns {string[]}
 */
export const tabelasComLinhasNaSelecao = (selecao) =>
  Object.entries(selecao ?? {})
    .filter(([, entrada]) => entrada.ids.size || [...entrada.condicoes.values()].some((valores) => valores.size))
    .map(([tabela]) => tabela);

const montarCondicaoForaDaSelecao = (entrada) => {
  const condicao = montarCondicaoDaEntrada(entrada);
  return condicao ? `NOT (${condicao})` : null;
};

/**
 * @description Roteiro que separa, dentre ids candidatos de uma tabela, os
 * que só são referenciados (por qualquer FK real) por linhas já presentes na
 * seleção — ou seja, os que podem ser apagados sem levar junto dados de fora
 * dela. Usado para tabelas "pai" compartilháveis (ex.: um comitê com
 * propostas de vários CNPJs), que só entram na exclusão se forem exclusivas.
 * @param {string} tabela
 * @param {Iterable<number>} idsCandidatos
 * @param {Object} selecao
 * @param {Array<Object>} fks - ver `normalizarCatalogoFks`.
 * @returns {Generator<{sql: string}, {exclusivos: number[], compartilhados: number[]}, Object[]>}
 */
export function* roteiroIdsSemReferenciaExterna(tabela, idsCandidatos, selecao, fks) {
  const candidatos = [...new Set([...(idsCandidatos ?? [])].map(Number))];
  const compartilhados = new Set();
  if (!candidatos.length) return { exclusivos: [], compartilhados: [] };

  for (const fk of fks.filter((item) => item.tabelaPai === tabela && item.colunaPai === 'id')) {
    const foraDaSelecao = montarCondicaoForaDaSelecao(selecao[fk.tabelaFilha]);
    const linhas = yield {
      sql: `SELECT DISTINCT ${fk.colunaFilha} AS idReferenciado FROM ${fk.tabelaFilha} WHERE ${fk.colunaFilha} IN (${candidatos.join(', ')})${foraDaSelecao ? ` AND ${foraDaSelecao}` : ''}`,
    };
    linhas.forEach((linha) => compartilhados.add(Number(linha.idReferenciado)));
  }

  return {
    exclusivos: candidatos.filter((id) => !compartilhados.has(id)),
    compartilhados: candidatos.filter((id) => compartilhados.has(id)),
  };
}

/**
 * @description FKs que impõem ordem de exclusão entre as tabelas informadas:
 * habilitadas, entre duas tabelas diferentes do conjunto. FK desabilitada não
 * é verificada pelo banco; FK de uma tabela para ela mesma é resolvida
 * apagando a tabela num só DELETE.
 * @param {string[]} tabelas
 * @param {Array<Object>} fks
 * @param {Array<Object>} [fksIgnoradas]
 * @returns {Array<Object>}
 */
const fksQueImpoemOrdem = (tabelas, fks, fksIgnoradas = []) => {
  const conjunto = new Set(tabelas);
  const ignoradas = new Set(fksIgnoradas.map((fk) => fk.nome));
  return fks.filter(
    (fk) =>
      !fk.desabilitada &&
      fk.tabelaFilha !== fk.tabelaPai &&
      conjunto.has(fk.tabelaFilha) &&
      conjunto.has(fk.tabelaPai) &&
      !ignoradas.has(fk.nome),
  );
};

/**
 * @description Grafo de dependência (formato de `construirGrafoEstrutural`:
 * `{ [tabela]: tabelasPai[] }`) entre as tabelas de uma seleção, a partir das
 * FKs reais habilitadas do banco, sem as FKs informadas em `fksIgnoradas`
 * (as anuladas para quebrar ciclo, ver `planejarExclusaoDaSelecao`).
 * @param {string[]} tabelas
 * @param {Array<Object>} fks
 * @param {Array<Object>} [fksIgnoradas]
 * @returns {Object<string, string[]>}
 */
export const montarGrafoExclusaoPorFk = (tabelas, fks, fksIgnoradas = []) => {
  const grafo = Object.fromEntries(tabelas.map((tabela) => [tabela, []]));
  fksQueImpoemOrdem(tabelas, fks, fksIgnoradas).forEach((fk) => {
    if (!grafo[fk.tabelaFilha].includes(fk.tabelaPai)) grafo[fk.tabelaFilha].push(fk.tabelaPai);
  });
  return grafo;
};

/**
 * @description Procura um ciclo de FKs (filha -> pai) entre as tabelas.
 * @param {string[]} tabelas
 * @param {Array<Object>} fks - já filtradas por `fksQueImpoemOrdem`.
 * @returns {Array<Object>|null} as FKs que formam o ciclo, ou `null`.
 */
const encontrarCicloDeFks = (tabelas, fks) => {
  const saidas = new Map(tabelas.map((tabela) => [tabela, []]));
  fks.forEach((fk) => saidas.get(fk.tabelaFilha).push(fk));
  const estado = new Map();
  const pilha = [];

  const visitar = (tabela) => {
    estado.set(tabela, 'visitando');
    for (const fk of saidas.get(tabela)) {
      pilha.push(fk);
      const destino = estado.get(fk.tabelaPai);
      if (destino === 'visitando') {
        const inicio = pilha.findIndex((item) => item.tabelaFilha === fk.tabelaPai);
        return pilha.slice(inicio);
      }
      if (destino !== 'concluido') {
        const ciclo = visitar(fk.tabelaPai);
        if (ciclo) return ciclo;
      }
      pilha.pop();
    }
    estado.set(tabela, 'concluido');
    return null;
  };

  for (const tabela of tabelas) {
    if (!estado.has(tabela)) {
      const ciclo = visitar(tabela);
      if (ciclo) return ciclo;
    }
  }
  return null;
};

/**
 * @description Planeja a exclusão de uma seleção pelas FKs reais: ordem
 * (filhas antes de pais, via `ordenarTabelasParaExclusaoEstrutural`) e, se
 * houver ciclo entre tabelas, quais FKs com coluna anulável serão anuladas
 * (`UPDATE ... SET coluna = NULL` nas próprias linhas selecionadas) antes dos
 * DELETEs para quebrá-lo. Ciclo sem nenhuma coluna anulável vira erro
 * descritivo com as FKs envolvidas — nunca se desliga constraint.
 * @param {Object} selecao
 * @param {Array<Object>} fks - ver `normalizarCatalogoFks`.
 * @returns {{ordem: string[], fksAnuladas: Array<Object>}}
 */
export const planejarExclusaoDaSelecao = (selecao, fks) => {
  const tabelas = tabelasComLinhasNaSelecao(selecao);
  const fksAnuladas = [];

  for (;;) {
    const ciclo = encontrarCicloDeFks(tabelas, fksQueImpoemOrdem(tabelas, fks, fksAnuladas));
    if (!ciclo) break;
    const anulavel = ciclo.find((fk) => fk.colunaFilhaNulavel);
    if (!anulavel) {
      throw new Error(
        `[planejarExclusaoDaSelecao] Ciclo de FKs sem coluna anulável, exclusão não resolvível pela cascata: ${ciclo
          .map((fk) => `${fk.nome} (${fk.tabelaFilha}.${fk.colunaFilha} -> ${fk.tabelaPai})`)
          .join(', ')}.`,
      );
    }
    fksAnuladas.push(anulavel);
  }

  return {
    ordem: ordenarTabelasParaExclusaoEstrutural(montarGrafoExclusaoPorFk(tabelas, fks, fksAnuladas)),
    fksAnuladas,
  };
};

/**
 * @description UPDATEs que anulam, só nas linhas selecionadas da tabela
 * filha, a coluna de cada FK escolhida para quebrar ciclo
 * (`planejarExclusaoDaSelecao`). Rodam antes dos DELETEs, na mesma transação.
 * @param {Array<Object>} fksAnuladas
 * @param {Object} selecao
 * @param {number} [tamanhoLote]
 * @returns {Array<{tabela: string, sql: string}>}
 */
export const montarAnulacoesDeCiclo = (fksAnuladas, selecao, tamanhoLote = 1000) =>
  fksAnuladas.flatMap((fk) =>
    montarCondicoesDaEntradaEmLotes(selecao[fk.tabelaFilha], tamanhoLote).map((condicao) => ({
      tabela: fk.tabelaFilha,
      sql: `UPDATE ${fk.tabelaFilha} SET ${fk.colunaFilha} = NULL WHERE ${fk.colunaFilha} IS NOT NULL AND (${condicao})`,
    })),
  );

/**
 * @description Tabelas que têm FK para elas mesmas: o DELETE dessas tabelas
 * não pode ser dividido em lotes (um lote poderia apagar o pai antes do filho).
 * @param {Array<{tabelaFilha: string, tabelaPai: string}>} fks
 * @returns {Set<string>}
 */
export const tabelasComAutorreferencia = (fks) =>
  new Set(fks.filter((fk) => fk.tabelaFilha === fk.tabelaPai).map((fk) => fk.tabelaFilha));

/**
 * @description Monta, na ordem informada, os DELETEs de uma seleção: por `id`
 * em lote (`montarDeleteEmLote`) para tabela com ids, e por
 * `coluna IN (valores)` para tabela sem `id`. Tabela sem nada selecionado não
 * gera DELETE (nunca um DELETE sem WHERE).
 * @param {string[]} ordemExclusao
 * @param {Object} selecao
 * @param {{tamanhoLote?: number, tabelasSemLote?: Set<string>}} [opcoes] - `tamanhoLote`
 * infinito por padrão (um DELETE por tabela).
 * @returns {Array<{tabela: string, sql: string}>}
 */
export const montarDeletesDaSelecao = (ordemExclusao, selecao, opcoes = {}) => {
  const tamanhoLote = opcoes.tamanhoLote ?? Infinity;
  const tabelasSemLote = opcoes.tabelasSemLote ?? new Set();
  const deletes = [];

  ordemExclusao.forEach((tabela) => {
    const entrada = selecao[tabela];
    if (!entrada) return;
    const loteDaTabela = tabelasSemLote.has(tabela) ? Infinity : tamanhoLote;

    dividirEmLotes([...entrada.ids], loteDaTabela).forEach((lote) => {
      const sql = montarDeleteEmLote(tabela, lote);
      if (sql) deletes.push({ tabela, sql });
    });

    entrada.condicoes.forEach((valores, coluna) => {
      dividirEmLotes([...valores], loteDaTabela).forEach((lote) => {
        deletes.push({ tabela, sql: `DELETE FROM ${tabela} WHERE ${coluna} IN (${formatarListaSql(lote)})` });
      });
    });
  });

  return deletes;
};

/**
 * @description Junta uma lista de DELETEs num único lote T-SQL transacional
 * (`XACT_ABORT`: qualquer erro desfaz tudo) que devolve, ao final, as linhas
 * apagadas por tabela (`tabela`, `linhasApagadas`). As anulações de ciclo
 * (`montarAnulacoesDeCiclo`), se houver, rodam antes dos DELETEs, na mesma
 * transação, e não entram na contagem.
 * @param {Array<{tabela: string, sql: string}>} deletes
 * @param {Array<{tabela: string, sql: string}>} [anulacoes]
 * @returns {string|null} `null` se não houver nada a apagar.
 */
export const montarLoteTransacionalDeExclusao = (deletes, anulacoes = []) => {
  if (!deletes.length) return null;
  const preparacao = anulacoes.map(({ sql }) => `${sql};`);
  const corpo = deletes.map(
    ({ tabela, sql }) => `${sql};\nINSERT INTO @linhas (tabela, n) VALUES (${formatarValorSql(tabela)}, @@ROWCOUNT);`,
  );
  return [
    'SET XACT_ABORT ON;',
    'SET NOCOUNT ON;',
    'DECLARE @linhas TABLE (ordem INT IDENTITY(1,1), tabela SYSNAME, n INT);',
    'BEGIN TRANSACTION;',
    ...preparacao,
    ...corpo,
    'COMMIT TRANSACTION;',
    'SELECT tabela, SUM(n) AS linhasApagadas, MIN(ordem) AS ordem FROM @linhas GROUP BY tabela ORDER BY MIN(ordem);',
  ].join('\n');
};

/**
 * @description Monta as consultas de contagem (só leitura) das linhas de uma
 * seleção, para relatório antes/depois da exclusão: somar o `n` de todas as
 * consultas de uma tabela dá o total dela. Seleção pequena (até
 * `tamanhoLote` valores) vira uma única consulta exata; seleção maior é
 * dividida em lotes — exata para tabela com `id`; para tabela sem `id`
 * localizada por mais de uma coluna, uma linha que case com duas condições
 * pode ser contada duas vezes (o zero, usado na conferência, é sempre exato).
 * @param {Object} selecao
 * @param {number} [tamanhoLote]
 * @returns {Array<{tabela: string, sql: string}>}
 */
export const montarContagensDaSelecao = (selecao, tamanhoLote = 1000) =>
  Object.entries(selecao).flatMap(([tabela, entrada]) => {
    const total = entrada.ids.size + [...entrada.condicoes.values()].reduce((soma, valores) => soma + valores.size, 0);
    const exata = montarCondicaoDaEntrada(entrada);
    const condicoes = total <= tamanhoLote ? (exata ? [exata] : []) : montarCondicoesDaEntradaEmLotes(entrada, tamanhoLote);
    return condicoes.map((condicao) => ({ tabela, sql: `SELECT COUNT(*) AS n FROM ${tabela} WHERE ${condicao}` }));
  });
