import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  executarRoteiroSql,
  dividirEmLotes,
  roteiroDescobertaGrafoEstrutural,
  SQL_CATALOGO_FKS,
  SQL_TABELAS_COM_COLUNA_ID,
  normalizarCatalogoFks,
  criarSelecaoExclusao,
  adicionarIdsNaSelecao,
  selecaoAPartirDeIdsPorTabela,
  roteiroExpansaoPorFk,
  roteiroIdsSemReferenciaExterna,
  montarCondicaoDaEntrada,
  montarCondicoesDaEntradaEmLotes,
  tabelasComLinhasNaSelecao,
  montarGrafoExclusaoPorFk,
  planejarExclusaoDaSelecao,
  montarAnulacoesDeCiclo,
  tabelasComAutorreferencia,
  montarDeletesDaSelecao,
  montarLoteTransacionalDeExclusao,
  montarContagensDaSelecao,
} from '../exclusaoEstrutural.js';
import { montarDeleteEmLote } from '../clonagemCedente.js';

const fk = (nome, tabelaFilha, colunaFilha, tabelaPai, extras = {}) => ({
  nome,
  tabelaFilha,
  colunaFilha,
  tabelaPai,
  colunaPai: 'id',
  desabilitada: false,
  colunaFilhaNulavel: false,
  ...extras,
});

const executarComRespostas = (roteiro, responder) => {
  const consultas = [];
  let passo = roteiro.next();
  while (!passo.done) {
    consultas.push(passo.value.sql);
    passo = roteiro.next(responder(passo.value.sql));
  }
  return { consultas, resultado: passo.value };
};

test('executarRoteiroSql alimenta o roteiro com as linhas de cada consulta e devolve o retorno dele', async () => {
  function* roteiro() {
    const a = yield { sql: 'SELECT 1' };
    const b = yield { sql: 'SELECT 2' };
    return [a.length, b.length];
  }
  const recebidas = [];
  const resultado = await executarRoteiroSql(roteiro(), async (sql) => {
    recebidas.push(sql);
    return sql === 'SELECT 1' ? [{}, {}] : null;
  });
  assert.deepEqual(recebidas, ['SELECT 1', 'SELECT 2']);
  assert.deepEqual(resultado, [2, 0]);
});

test('dividirEmLotes divide pelo tamanho e trata tamanho infinito como um só lote', () => {
  assert.deepEqual(dividirEmLotes([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  assert.deepEqual(dividirEmLotes([1, 2, 3], Infinity), [[1, 2, 3]]);
  assert.deepEqual(dividirEmLotes([], 10), []);
});

test('roteiroDescobertaGrafoEstrutural usa sementes, busca satélites com SELECT * e pula catálogo e não-satélites', () => {
  const mapeamento = {
    MC_PRT_PROSPECT: { dependeDe: [] },
    MC_PRT_FILIAL: { dependeDe: [{ campo: 'idProspect', tabela: 'MC_PRT_PROSPECT', tipo: 'estrutural' }] },
    MC_CAD_MODELO_ATA_COMITE: { dependeDe: [] },
  };
  const ordem = ['MC_PRT_PROSPECT', 'MC_CAD_ALGUM_CATALOGO', 'MC_PRT_FILIAL', 'MC_CAD_MODELO_ATA_COMITE'];
  const { consultas, resultado } = executarComRespostas(
    roteiroDescobertaGrafoEstrutural(ordem, { MC_PRT_PROSPECT: [{ id: '7' }] }, mapeamento),
    () => [{ id: 10 }, { id: '11' }],
  );
  assert.deepEqual(consultas, ['SELECT * FROM MC_PRT_FILIAL WHERE idProspect IN (7)']);
  assert.deepEqual([...resultado.MC_PRT_PROSPECT], [7]);
  assert.deepEqual([...resultado.MC_PRT_FILIAL], [10, 11]);
  assert.equal(resultado.MC_CAD_ALGUM_CATALOGO, undefined);
  assert.equal(resultado.MC_CAD_MODELO_ATA_COMITE, undefined);
});

test('normalizarCatalogoFks converte as linhas do catálogo e recusa FK composta', () => {
  const [unica] = normalizarCatalogoFks([
    { nome: 'FK_A', tabelaFilha: 'F', colunaFilha: 'idP', tabelaPai: 'P', colunaPai: 'id', desabilitada: 0, colunaFilhaNulavel: 1 },
  ]);
  assert.deepEqual(unica, {
    nome: 'FK_A', tabelaFilha: 'F', colunaFilha: 'idP', tabelaPai: 'P', colunaPai: 'id', desabilitada: false, colunaFilhaNulavel: true,
  });
  assert.throws(
    () => normalizarCatalogoFks([
      { nome: 'FK_X', tabelaFilha: 'F', colunaFilha: 'a', tabelaPai: 'P', colunaPai: 'id' },
      { nome: 'FK_X', tabelaFilha: 'F', colunaFilha: 'b', tabelaPai: 'P', colunaPai: 'id2' },
    ]),
    /FK composta não suportada.*FK_X/,
  );
});

test('selecaoAPartirDeIdsPorTabela descarta catálogo e tabelas sem id', () => {
  const selecao = selecaoAPartirDeIdsPorTabela({
    MC_PRT_PROSPECT: new Set([1]),
    MC_PRT_FILIAL: new Set(),
    MC_CAD_ALGUM_CATALOGO: new Set([9]),
  });
  assert.deepEqual(Object.keys(selecao), ['MC_PRT_PROSPECT']);
  assert.deepEqual([...selecao.MC_PRT_PROSPECT.ids], [1]);
});

test('roteiroExpansaoPorFk segue só quem referencia, em cascata, incluindo tabela sem id e autorreferência', () => {
  const catalogo = [
    { nome: 'FK_F_P', tabelaFilha: 'F', colunaFilha: 'idP', tabelaPai: 'P', colunaPai: 'id', desabilitada: false, colunaFilhaNulavel: false },
    { nome: 'FK_N_F', tabelaFilha: 'N', colunaFilha: 'idF', tabelaPai: 'F', colunaPai: 'id', desabilitada: false, colunaFilhaNulavel: false },
    { nome: 'FK_F_F', tabelaFilha: 'F', colunaFilha: 'idFPai', tabelaPai: 'F', colunaPai: 'id', desabilitada: false, colunaFilhaNulavel: true },
    { nome: 'FK_P_Q', tabelaFilha: 'P', colunaFilha: 'idQ', tabelaPai: 'Q', colunaPai: 'id', desabilitada: false, colunaFilhaNulavel: false },
  ];
  const responder = (sql) => {
    if (sql === SQL_CATALOGO_FKS) return catalogo;
    if (sql === SQL_TABELAS_COM_COLUNA_ID) return [{ tabela: 'P' }, { tabela: 'F' }, { tabela: 'Q' }];
    if (sql === 'SELECT id FROM F WHERE idP IN (1)') return [{ id: '10' }];
    if (sql === 'SELECT id FROM F WHERE idFPai IN (10)') return [{ id: 11 }];
    if (sql === 'SELECT id FROM F WHERE idFPai IN (11)') return [];
    if (sql === 'SELECT TOP 1 1 AS existe FROM N WHERE idF IN (10)') return [{ existe: 1 }];
    if (sql === 'SELECT TOP 1 1 AS existe FROM N WHERE idF IN (11)') return [];
    throw new Error(`consulta inesperada: ${sql}`);
  };
  const { resultado } = executarComRespostas(roteiroExpansaoPorFk(adicionarIdsNaSelecao(criarSelecaoExclusao(), 'P', [1])), responder);
  const { selecao, tabelasComId } = resultado;

  assert.deepEqual([...selecao.P.ids], [1]);
  assert.deepEqual([...selecao.F.ids].sort(), [10, 11]);
  assert.deepEqual([...selecao.N.condicoes.get('idF')], [10]);
  assert.equal(selecao.Q, undefined, 'nunca sobe para o pai');
  assert.ok(tabelasComId.has('F'));
});

test('roteiroIdsSemReferenciaExterna separa ids referenciados só pela seleção dos compartilhados', () => {
  const fks = [fk('FK_PROP_COM', 'MC_POC_PROPOSTA', 'idComite', 'MC_CAD_COMITE')];
  const selecao = adicionarIdsNaSelecao(criarSelecaoExclusao(), 'MC_POC_PROPOSTA', [1, 2]);
  const { consultas, resultado } = executarComRespostas(
    roteiroIdsSemReferenciaExterna('MC_CAD_COMITE', [281, 300], selecao, fks),
    () => [{ idReferenciado: '281' }],
  );
  assert.deepEqual(consultas, [
    'SELECT DISTINCT idComite AS idReferenciado FROM MC_POC_PROPOSTA WHERE idComite IN (281, 300) AND NOT (id IN (1, 2))',
  ]);
  assert.deepEqual(resultado, { exclusivos: [300], compartilhados: [281] });
});

test('montarCondicaoDaEntrada e montarCondicoesDaEntradaEmLotes cobrem ids e condições', () => {
  const selecao = adicionarIdsNaSelecao(criarSelecaoExclusao(), 'T', [1, 2, 3]);
  selecao.T.condicoes.set('codigo', new Set(['A']));
  assert.equal(montarCondicaoDaEntrada(selecao.T), "id IN (1, 2, 3) OR codigo IN ('A')");
  assert.deepEqual(montarCondicoesDaEntradaEmLotes(selecao.T, 2), ['id IN (1, 2)', 'id IN (3)', "codigo IN ('A')"]);
  assert.equal(montarCondicaoDaEntrada(undefined), null);
});

test('tabelasComLinhasNaSelecao ignora entradas vazias', () => {
  const selecao = adicionarIdsNaSelecao(criarSelecaoExclusao(), 'A', [1]);
  selecao.VAZIA = { ids: new Set(), condicoes: new Map() };
  assert.deepEqual(tabelasComLinhasNaSelecao(selecao), ['A']);
});

test('montarGrafoExclusaoPorFk ignora FK desabilitada, autorreferência, tabelas fora da seleção e FKs ignoradas', () => {
  const fks = [
    fk('FK_1', 'F', 'idP', 'P'),
    fk('FK_2', 'F', 'idX', 'X'),
    fk('FK_3', 'F', 'idFPai', 'F'),
    fk('FK_4', 'G', 'idP', 'P', { desabilitada: true }),
    fk('FK_5', 'G', 'idF', 'F'),
  ];
  assert.deepEqual(montarGrafoExclusaoPorFk(['P', 'F', 'G'], fks), { P: [], F: ['P'], G: ['F'] });
  assert.deepEqual(montarGrafoExclusaoPorFk(['P', 'F', 'G'], fks, [fks[4]]), { P: [], F: ['P'], G: [] });
});

test('planejarExclusaoDaSelecao ordena filhas antes de pais e quebra ciclo pela coluna anulável', () => {
  const selecao = criarSelecaoExclusao();
  ['MC_CED_CEDENTE', 'MC_CED_OBSERVACAO', 'MC_CAD_PESSOA'].forEach((tabela) => adicionarIdsNaSelecao(selecao, tabela, [1]));
  const fks = [
    fk('FK_CED_OBSERVACAO_CED', 'MC_CED_OBSERVACAO', 'idCedente', 'MC_CED_CEDENTE'),
    fk('FK_CED_CEDENTE_OBS', 'MC_CED_CEDENTE', 'idCedenteObservacao', 'MC_CED_OBSERVACAO', { colunaFilhaNulavel: true }),
    fk('FK_CED_PESSOA', 'MC_CED_CEDENTE', 'idPessoa', 'MC_CAD_PESSOA'),
  ];
  const { ordem, fksAnuladas } = planejarExclusaoDaSelecao(selecao, fks);
  assert.deepEqual(fksAnuladas.map((item) => item.nome), ['FK_CED_CEDENTE_OBS']);
  assert.ok(ordem.indexOf('MC_CED_OBSERVACAO') < ordem.indexOf('MC_CED_CEDENTE'));
  assert.ok(ordem.indexOf('MC_CED_CEDENTE') < ordem.indexOf('MC_CAD_PESSOA'));
});

test('planejarExclusaoDaSelecao recusa ciclo sem coluna anulável e ignora tabela sem linhas', () => {
  const selecao = criarSelecaoExclusao();
  adicionarIdsNaSelecao(selecao, 'A', [1]);
  adicionarIdsNaSelecao(selecao, 'B', [1]);
  const fks = [fk('FK_AB', 'A', 'idB', 'B'), fk('FK_BA', 'B', 'idA', 'A')];
  assert.throws(() => planejarExclusaoDaSelecao(selecao, fks), /Ciclo de FKs sem coluna anulável.*FK_AB.*FK_BA|Ciclo de FKs sem coluna anulável.*FK_BA.*FK_AB/);

  selecao.B = { ids: new Set(), condicoes: new Map() };
  assert.deepEqual(planejarExclusaoDaSelecao(selecao, fks), { ordem: ['A'], fksAnuladas: [] });
});

test('montarAnulacoesDeCiclo anula a coluna só nas linhas selecionadas', () => {
  const selecao = adicionarIdsNaSelecao(criarSelecaoExclusao(), 'MC_CED_CEDENTE', [4576]);
  const anulada = fk('FK_CED_CEDENTE_OBS', 'MC_CED_CEDENTE', 'idCedenteObservacao', 'MC_CED_OBSERVACAO', { colunaFilhaNulavel: true });
  assert.deepEqual(montarAnulacoesDeCiclo([anulada], selecao), [
    {
      tabela: 'MC_CED_CEDENTE',
      sql: 'UPDATE MC_CED_CEDENTE SET idCedenteObservacao = NULL WHERE idCedenteObservacao IS NOT NULL AND (id IN (4576))',
    },
  ]);
});

test('tabelasComAutorreferencia identifica FK da tabela para ela mesma', () => {
  assert.deepEqual([...tabelasComAutorreferencia([fk('A', 'X', 'idX', 'X'), fk('B', 'Y', 'idX', 'X')])], ['X']);
});

test('montarDeletesDaSelecao sem lote gera o mesmo DELETE de montarDeleteEmLote (comportamento da clonagem)', () => {
  const selecao = selecaoAPartirDeIdsPorTabela({ MC_PRT_FILIAL: new Set([3, 4]), MC_PRT_PROSPECT: new Set([1]) });
  assert.deepEqual(montarDeletesDaSelecao(['MC_PRT_FILIAL', 'MC_PRT_LEAD', 'MC_PRT_PROSPECT'], selecao), [
    { tabela: 'MC_PRT_FILIAL', sql: montarDeleteEmLote('MC_PRT_FILIAL', [3, 4]) },
    { tabela: 'MC_PRT_PROSPECT', sql: montarDeleteEmLote('MC_PRT_PROSPECT', [1]) },
  ]);
});

test('montarDeletesDaSelecao divide em lotes, exceto tabela com autorreferência, e apaga tabela sem id por condição', () => {
  const selecao = adicionarIdsNaSelecao(criarSelecaoExclusao(), 'T', [1, 2, 3]);
  adicionarIdsNaSelecao(selecao, 'AUTO', [7, 8, 9]);
  selecao.SEM_ID = { ids: new Set(), condicoes: new Map([['idT', new Set([1, 2, 3])]]) };
  const deletes = montarDeletesDaSelecao(['SEM_ID', 'AUTO', 'T'], selecao, { tamanhoLote: 2, tabelasSemLote: new Set(['AUTO']) });
  assert.deepEqual(deletes.map((item) => item.sql), [
    'DELETE FROM SEM_ID WHERE idT IN (1, 2)',
    'DELETE FROM SEM_ID WHERE idT IN (3)',
    'DELETE FROM AUTO WHERE id IN (7, 8, 9)',
    'DELETE FROM T WHERE id IN (1, 2)',
    'DELETE FROM T WHERE id IN (3)',
  ]);
});

test('montarLoteTransacionalDeExclusao é atômico, anula antes de apagar e conta por tabela', () => {
  assert.equal(montarLoteTransacionalDeExclusao([]), null);
  const lote = montarLoteTransacionalDeExclusao(
    [{ tabela: 'T', sql: 'DELETE FROM T WHERE id IN (1)' }],
    [{ tabela: 'T', sql: 'UPDATE T SET idX = NULL WHERE id IN (1)' }],
  );
  assert.match(lote, /^SET XACT_ABORT ON;/);
  assert.ok(lote.indexOf('BEGIN TRANSACTION;') < lote.indexOf('UPDATE T SET idX'));
  assert.ok(lote.indexOf('UPDATE T SET idX') < lote.indexOf('DELETE FROM T'));
  assert.match(lote, /DELETE FROM T WHERE id IN \(1\);\nINSERT INTO @linhas \(tabela, n\) VALUES \('T', @@ROWCOUNT\);/);
  assert.ok(lote.indexOf('COMMIT TRANSACTION;') < lote.indexOf('SELECT tabela, SUM(n) AS linhasApagadas'));
});

test('montarContagensDaSelecao faz uma consulta exata quando cabe num lote e divide quando não cabe', () => {
  const pequena = adicionarIdsNaSelecao(criarSelecaoExclusao(), 'T', [1, 2]);
  assert.deepEqual(montarContagensDaSelecao(pequena), [{ tabela: 'T', sql: 'SELECT COUNT(*) AS n FROM T WHERE id IN (1, 2)' }]);
  const grande = adicionarIdsNaSelecao(criarSelecaoExclusao(), 'T', [1, 2, 3]);
  assert.deepEqual(montarContagensDaSelecao(grande, 2).map((item) => item.sql), [
    'SELECT COUNT(*) AS n FROM T WHERE id IN (1, 2)',
    'SELECT COUNT(*) AS n FROM T WHERE id IN (3)',
  ]);
});
