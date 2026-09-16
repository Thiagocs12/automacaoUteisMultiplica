import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FASE_PROSPECT,
  FASE_POC,
  FASE_COMITE,
  FASE_CEDENTE,
  FASE_CATALOGO,
  ESTRATEGIA_BLOQUEADO_SEM_ORIGEM,
  ESTRATEGIA_APAGAR_E_RECRIAR,
  ESTRATEGIA_CRIAR,
  classificarTabelaCedente,
  normalizarDocumento,
  documentosCoincidem,
  decidirEstrategiaClonagemCedente,
  construirGrafoEstrutural,
  ordenarTabelasPorDependenciaEstrutural,
  TABELAS_POR_FASE,
  TABELAS_FORA_DE_ESCOPO,
  NOME_ANALISTA_RESPONSAVEL_CLONAGEM_CEDENTE,
  TIPO_DEPENDENCIA_CASCATA,
  aplicarValoresFixos,
} from '../clonagemCedente.js';
import MAPEAMENTO_CEDENTE_PROSPECT, {
  MAPEAMENTO_CEDENTE_POC,
  MAPEAMENTO_CEDENTE_COMITE,
  MAPEAMENTO_CEDENTE_CEDENTE,
} from '../../../utils/mapeamentoCedente.js';

test('classificarTabelaCedente reconhece as tabelas-âncora de cada fase', () => {
  assert.deepEqual(classificarTabelaCedente('MC_PRT_PROSPECT'), { fase: FASE_PROSPECT, entra: true });
  assert.deepEqual(classificarTabelaCedente('MC_POC_PROPOSTA'), { fase: FASE_POC, entra: true });
  assert.deepEqual(classificarTabelaCedente('MC_CAD_COMITE'), { fase: FASE_COMITE, entra: true });
  assert.deepEqual(classificarTabelaCedente('MC_CED_CEDENTE'), { fase: FASE_CEDENTE, entra: true });
});

test('classificarTabelaCedente reconhece tabelas satélite dentro da mesma fase', () => {
  assert.deepEqual(classificarTabelaCedente('MC_PRT_LEAD'), { fase: FASE_PROSPECT, entra: true });
  assert.deepEqual(classificarTabelaCedente('MC_CAD_SACADO'), { fase: FASE_PROSPECT, entra: true });
  assert.deepEqual(classificarTabelaCedente('MC_POC_BALANCO'), { fase: FASE_POC, entra: true });
  assert.deepEqual(classificarTabelaCedente('MC_POC_COMITE_VOTACAO_PRODUTO'), { fase: FASE_COMITE, entra: true });
  assert.deepEqual(classificarTabelaCedente('MC_CED_GARANTIA_HIST'), { fase: FASE_CEDENTE, entra: true });
});

test('classificarTabelaCedente exclui o KYC do prospect, mesmo sendo prefixo MC_PRT_', () => {
  assert.deepEqual(classificarTabelaCedente('MC_PRT_KYC'), { fase: null, entra: false });
  assert.deepEqual(classificarTabelaCedente('MC_CAD_PERGUNTAS_KYC'), { fase: null, entra: false });
});

test('classificarTabelaCedente exclui documentação/formalização inteira, inclusive família Beyond', () => {
  assert.deepEqual(classificarTabelaCedente('MC_CED_CEDENTE_DOCUMENTO'), { fase: null, entra: false });
  assert.deepEqual(classificarTabelaCedente('MC_CED_CEDENTE_CONTRATO_HISTORICO'), { fase: null, entra: false });
  assert.deepEqual(classificarTabelaCedente('MC_CADASTRO_CEDENTE_ADMINISTRADOR'), { fase: null, entra: false });
  assert.deepEqual(classificarTabelaCedente('MC_CADASTRO_CEDENTE_ADMINISTRADOR_SOCIO'), { fase: null, entra: false });
  assert.deepEqual(classificarTabelaCedente('TB_BEYOND_FORMALIZACAO_CADASTRO_CEDENTE'), { fase: null, entra: false });
  assert.deepEqual(classificarTabelaCedente('TB_BEYOND_FORMALIZACAO_CADASTRO_CEDENTE_ITEM'), { fase: null, entra: false });
});

test('classificarTabelaCedente exclui o domínio inteiro de operação/liquidação/câmbio', () => {
  assert.deepEqual(classificarTabelaCedente('MC_MOP_OPERACAO'), { fase: null, entra: false });
  assert.deepEqual(classificarTabelaCedente('MC_LIQ_ORDEM_PAGAMENTO'), { fase: null, entra: false });
  assert.deepEqual(classificarTabelaCedente('MC_CED_BOLETO'), { fase: null, entra: false });
  assert.deepEqual(classificarTabelaCedente('MC_CED_TARIFA'), { fase: null, entra: false });
});

test('classificarTabelaCedente exclui log/auditoria técnica e CPL_CEDENTE_* (bureau externo)', () => {
  assert.deepEqual(classificarTabelaCedente('LOG_ATUALIZA_CEDENTE_COMITE'), { fase: null, entra: false });
  assert.deepEqual(classificarTabelaCedente('CPL_CEDENTE_RESTRITIVO'), { fase: null, entra: false });
});

test('classificarTabelaCedente exclui qualquer tabela com BKP no nome, com ou sem underscore', () => {
  assert.deepEqual(classificarTabelaCedente('MC_CED_CEDENTE_CONVENIO_BKP20231020'), { fase: null, entra: false });
  assert.deepEqual(classificarTabelaCedente('MC_PRT_PROSPECTBKP1504'), { fase: null, entra: false });
});

test('classificarTabelaCedente reconhece as famílias POC citadas só por prefixo na tarefa', () => {
  assert.deepEqual(classificarTabelaCedente('MC_POC_INCORP_SOCIO'), { fase: FASE_POC, entra: true });
  assert.deepEqual(classificarTabelaCedente('MC_POC_RATING_HISTORICO'), { fase: FASE_POC, entra: true });
  assert.deepEqual(classificarTabelaCedente('MC_POC_RESTRITIVO_CVM'), { fase: FASE_POC, entra: true });
});

test('classificarTabelaCedente trata MC_CAD_* não listado como catálogo genérico (resolução por dependência, não cópia)', () => {
  assert.deepEqual(classificarTabelaCedente('MC_CAD_FUNDO'), { fase: FASE_CATALOGO, entra: true });
  assert.deepEqual(classificarTabelaCedente('MC_CAD_PESSOA'), { fase: FASE_CATALOGO, entra: true });
});

test('classificarTabelaCedente exclui MC_CAD_ARQUIVO mesmo sendo prefixo MC_CAD_ (só referenciado por documento, fora de escopo)', () => {
  assert.deepEqual(classificarTabelaCedente('MC_CAD_ARQUIVO'), { fase: null, entra: false });
});

test('classificarTabelaCedente trata MC_RAT_RATING_INDICADOR(_ITEM) como catálogo, fora do padrão MC_CAD_ (confirmado pelo Thiago)', () => {
  assert.deepEqual(classificarTabelaCedente('MC_RAT_RATING_INDICADOR'), { fase: FASE_CATALOGO, entra: true });
  assert.deepEqual(classificarTabelaCedente('MC_RAT_RATING_INDICADOR_ITEM'), { fase: FASE_CATALOGO, entra: true });
});

test('classificarTabelaCedente não trata qualquer MC_RAT_* como catálogo (só as duas tabelas confirmadas)', () => {
  assert.deepEqual(classificarTabelaCedente('MC_RAT_OUTRA_TABELA_NAO_CONFIRMADA'), { fase: null, entra: false });
});

test('classificarTabelaCedente devolve não classificado para tabela desconhecida/fora do mapeamento', () => {
  assert.deepEqual(classificarTabelaCedente('MC_TABELA_INEXISTENTE_QUALQUER'), { fase: null, entra: false });
});

test('classificarTabelaCedente trata entrada vazia/ausente sem lançar erro', () => {
  assert.deepEqual(classificarTabelaCedente(''), { fase: null, entra: false });
  assert.deepEqual(classificarTabelaCedente(undefined), { fase: null, entra: false });
  assert.deepEqual(classificarTabelaCedente(null), { fase: null, entra: false });
});

test('normalizarDocumento remove máscara e mantém só dígitos', () => {
  assert.equal(normalizarDocumento('12.345.678/0001-90'), '12345678000190');
  assert.equal(normalizarDocumento('123.456.789-00'), '12345678900');
  assert.equal(normalizarDocumento('12345678000190'), '12345678000190');
});

test('normalizarDocumento devolve null para entrada vazia/ausente', () => {
  assert.equal(normalizarDocumento(''), null);
  assert.equal(normalizarDocumento(undefined), null);
  assert.equal(normalizarDocumento(null), null);
});

test('documentosCoincidem ignora máscara diferente entre os dois lados', () => {
  assert.equal(documentosCoincidem('12.345.678/0001-90', '12345678000190'), true);
});

test('documentosCoincidem devolve false para documentos diferentes', () => {
  assert.equal(documentosCoincidem('12345678000190', '98765432000110'), false);
});

test('documentosCoincidem nunca trata dois documentos ausentes como coincidência', () => {
  assert.equal(documentosCoincidem(null, undefined), false);
  assert.equal(documentosCoincidem('', ''), false);
});

test('decidirEstrategiaClonagemCedente bloqueia sem pessoa de origem em PROD', () => {
  const resultado = decidirEstrategiaClonagemCedente({
    pessoaOrigemEncontrada: false,
    prospectOrigemEncontrado: true,
    cedenteHmlExistente: false,
  });

  assert.equal(resultado.estrategia, ESTRATEGIA_BLOQUEADO_SEM_ORIGEM);
  assert.match(resultado.motivo, /pessoa/);
});

test('decidirEstrategiaClonagemCedente bloqueia sem prospect de origem em PROD', () => {
  const resultado = decidirEstrategiaClonagemCedente({
    pessoaOrigemEncontrada: true,
    prospectOrigemEncontrado: false,
    cedenteHmlExistente: false,
  });

  assert.equal(resultado.estrategia, ESTRATEGIA_BLOQUEADO_SEM_ORIGEM);
  assert.match(resultado.motivo, /prospect/);
});

test('decidirEstrategiaClonagemCedente bloqueia mesmo se o cedente já existir em HML, quando falta origem em PROD', () => {
  const resultado = decidirEstrategiaClonagemCedente({
    pessoaOrigemEncontrada: false,
    prospectOrigemEncontrado: false,
    cedenteHmlExistente: true,
  });

  assert.equal(resultado.estrategia, ESTRATEGIA_BLOQUEADO_SEM_ORIGEM);
});

test('decidirEstrategiaClonagemCedente decide apagar e recriar quando já existe em HML', () => {
  const resultado = decidirEstrategiaClonagemCedente({
    pessoaOrigemEncontrada: true,
    prospectOrigemEncontrado: true,
    cedenteHmlExistente: true,
  });

  assert.deepEqual(resultado, { estrategia: ESTRATEGIA_APAGAR_E_RECRIAR });
});

test('decidirEstrategiaClonagemCedente decide criar quando não existe em HML ainda', () => {
  const resultado = decidirEstrategiaClonagemCedente({
    pessoaOrigemEncontrada: true,
    prospectOrigemEncontrado: true,
    cedenteHmlExistente: false,
  });

  assert.deepEqual(resultado, { estrategia: ESTRATEGIA_CRIAR });
});

test('construirGrafoEstrutural mantém só arestas tipo "estrutural", ignorando "catalogo"', () => {
  const grafo = construirGrafoEstrutural({
    PAI: { dependeDe: [] },
    FILHO: {
      dependeDe: [
        { campo: 'idPai', tabela: 'PAI', tipo: 'estrutural' },
        { campo: 'idCatalogo', tabela: 'ALGUM_CAD', tipo: 'catalogo' },
      ],
    },
  });

  assert.deepEqual(grafo, { PAI: [], FILHO: ['PAI'] });
});

test('construirGrafoEstrutural também ignora arestas tipo "participante-fixo" (idParticipante não é dependência estrutural)', () => {
  const grafo = construirGrafoEstrutural({
    MC_POC_COMITE: { dependeDe: [] },
    MC_POC_COMITE_VOTACAO: {
      dependeDe: [
        { campo: 'idComiteProposta', tabela: 'MC_POC_COMITE', tipo: 'estrutural' },
        { campo: 'idParticipante', tabela: 'MC_CAD_ANALISTA', tipo: 'participante-fixo' },
      ],
    },
  });

  assert.deepEqual(grafo, { MC_POC_COMITE: [], MC_POC_COMITE_VOTACAO: ['MC_POC_COMITE'] });
});

test('construirGrafoEstrutural deduplica tabela-pai referenciada por mais de uma coluna', () => {
  const grafo = construirGrafoEstrutural({
    PAI: { dependeDe: [] },
    FILHO: {
      dependeDe: [
        { campo: 'idPaiA', tabela: 'PAI', tipo: 'estrutural' },
        { campo: 'idPaiB', tabela: 'PAI', tipo: 'estrutural' },
      ],
    },
  });

  assert.deepEqual(grafo.FILHO, ['PAI']);
});

test('ordenarTabelasPorDependenciaEstrutural coloca pai antes do filho numa cadeia simples', () => {
  const ordem = ordenarTabelasPorDependenciaEstrutural({ A: [], B: ['A'], C: ['B'] });

  assert.deepEqual(ordem, ['A', 'B', 'C']);
});

test('ordenarTabelasPorDependenciaEstrutural resolve dependência em diamante sem duplicar tabela', () => {
  const ordem = ordenarTabelasPorDependenciaEstrutural({
    RAIZ: [],
    RAMO_A: ['RAIZ'],
    RAMO_B: ['RAIZ'],
    FOLHA: ['RAMO_A', 'RAMO_B'],
  });

  assert.equal(ordem.indexOf('RAIZ') < ordem.indexOf('RAMO_A'), true);
  assert.equal(ordem.indexOf('RAIZ') < ordem.indexOf('RAMO_B'), true);
  assert.equal(ordem.indexOf('RAMO_A') < ordem.indexOf('FOLHA'), true);
  assert.equal(ordem.indexOf('RAMO_B') < ordem.indexOf('FOLHA'), true);
  assert.equal(new Set(ordem).size, ordem.length);
});

test('ordenarTabelasPorDependenciaEstrutural trata tabela-pai ainda não mapeada como folha (não quebra)', () => {
  const ordem = ordenarTabelasPorDependenciaEstrutural({
    FILHO: ['PAI_AINDA_NAO_MAPEADO'],
  });

  assert.deepEqual(ordem, ['PAI_AINDA_NAO_MAPEADO', 'FILHO']);
});

test('ordenarTabelasPorDependenciaEstrutural lança erro descritivo diante de um ciclo', () => {
  assert.throws(
    () => ordenarTabelasPorDependenciaEstrutural({ A: ['B'], B: ['A'] }),
    /Ciclo de dependência detectado/,
  );
});

test('grafo estrutural real da fase prospect (mapeamentoCedente.js) não tem ciclo e respeita a ordem pai->filho', () => {
  const grafo = construirGrafoEstrutural(MAPEAMENTO_CEDENTE_PROSPECT);
  const ordem = ordenarTabelasPorDependenciaEstrutural(grafo);

  // Autoteste de consistência dos dados transcritos à mão em mapeamentoCedente.js:
  // se qualquer aresta estiver errada a ponto de formar um ciclo, o teste acima já
  // falharia (ordenarTabelasPorDependenciaEstrutural lança erro). Aqui confirmamos
  // casos específicos que motivaram a descoberta registrada em
  // docs/documentacao.md: MC_PRT_PLEITO* depende de MC_POC_PROPOSTA (cross-fase),
  // não de MC_PRT_PROSPECT diretamente.
  assert.equal(ordem.includes('MC_PRT_PROSPECT'), true);
  assert.equal(ordem.includes('MC_POC_PROPOSTA'), true);
  assert.equal(
    ordem.indexOf('MC_POC_PROPOSTA') < ordem.indexOf('MC_PRT_PLEITO'),
    true,
    'MC_POC_PROPOSTA (tabela-pai real) deve vir antes de MC_PRT_PLEITO na ordem de inserção',
  );
  assert.equal(ordem.indexOf('MC_PRT_PROSPECT') < ordem.indexOf('MC_PRT_LEAD'), true);
  assert.equal(ordem.indexOf('MC_PRT_PROSPECT') < ordem.indexOf('MC_AGE_ACOMPANHAMENTO'), true);
  assert.equal(ordem.indexOf('MC_AGE_ACOMPANHAMENTO') < ordem.indexOf('MC_AGE_AGENDA_VISITA'), true);
  assert.equal(ordem.indexOf('MC_AGE_AGENDA_VISITA') < ordem.indexOf('MC_AGE_AGENDA_VISITA_RELATORIO'), true);
  assert.equal(ordem.indexOf('MC_PRT_PLEITO_PRODUTO') < ordem.indexOf('MC_PRT_PRODUTO_GARANTIA'), true);
  assert.equal(ordem.indexOf('MC_PRT_PLEITO_PRODUTO') < ordem.indexOf('MC_PRT_PLEITO_PRODUTO_CONC'), true);
  assert.equal(new Set(ordem).size, ordem.length, 'nenhuma tabela duplicada na ordem final');
});

test('classificarTabelaCedente reconhece as tabelas reais das famílias POC por prefixo (INCORP/RATING/RESTRIT)', () => {
  const tabelasDeFamilia = [
    'MC_POC_INCORP_OBRA_ANDAMENTO',
    'MC_POC_INCORP_OBRA_CONCLUIDA',
    'MC_POC_INCORP_RESUMO',
    'MC_POC_INCORP_RESUMO_RESULTADO',
    'MC_POC_RATING_INDICADOR_RESULTADO',
    'MC_POC_RATING_RESULTADO',
    'MC_POC_RESTRIT',
    'MC_POC_RESTRIT_ACAO_JUDICIAL',
    'MC_POC_RESTRIT_DIV_VENCIDA',
    'MC_POC_RESTRIT_FALENCIA',
    'MC_POC_RESTRIT_PEFIN',
    'MC_POC_RESTRIT_PROTESTO',
    'MC_POC_RESTRIT_RECHEQUE',
    'MC_POC_RESTRIT_REFIN',
    'MC_POC_RESTRIT_TRIBUTO_DIVIDA',
    'MC_POC_RESTRIT_ULTIMAS_CONSULTAS',
    'MC_POC_RESTRITIVO_EVOL_PROTESTO_ANO',
    'MC_POC_RESTRITIVO_EVOL_PROTESTO_MES',
    'MC_POC_RESTRITIVO_PROTESTO',
    'MC_POC_RESTRITIVO_PROTESTO_ESTADO',
    'MC_POC_RESTRITIVO_TRAB_ESCRAVO',
    'MC_POC_RESTRITIVO_TRIBUTO_DIVIDA',
  ];

  tabelasDeFamilia.forEach((tabela) => {
    assert.deepEqual(classificarTabelaCedente(tabela), { fase: FASE_POC, entra: true }, tabela);
  });

  // Todas as tabelas reais da família também precisam ter entrada no mapeamento de
  // dependências (mapeamentoCedente.js) — senão ficariam classificadas como "entra"
  // mas sem grafo de FK pra ordenar o INSERT/DELETE.
  tabelasDeFamilia.forEach((tabela) => {
    assert.ok(MAPEAMENTO_CEDENTE_POC[tabela], `${tabela} deveria ter entrada em MAPEAMENTO_CEDENTE_POC`);
  });
});

test('grafo estrutural real da fase POC (mapeamentoCedente.js) não tem ciclo e respeita a ordem pai->filho', () => {
  const grafo = construirGrafoEstrutural(MAPEAMENTO_CEDENTE_POC);
  const ordem = ordenarTabelasPorDependenciaEstrutural(grafo);

  assert.equal(new Set(ordem).size, ordem.length, 'nenhuma tabela duplicada na ordem final');
  assert.equal(ordem.indexOf('MC_POC_PROPOSTA') < ordem.indexOf('MC_POC_ALAVANCAGEM'), true);
  assert.equal(ordem.indexOf('MC_POC_ENDIVIDAMENTO') < ordem.indexOf('MC_POC_ENDIVIDAMENTO_LANCAMENTO'), true);
  assert.equal(ordem.indexOf('MC_POC_INCORP_RESUMO') < ordem.indexOf('MC_POC_INCORP_RESUMO_RESULTADO'), true);
  assert.equal(ordem.indexOf('MC_POC_RESTRIT') < ordem.indexOf('MC_POC_RESTRIT_PROTESTO'), true);
  assert.equal(
    ordem.indexOf('MC_POC_PROPOSTA') < ordem.indexOf('MC_POC_PROPOSTA_HIST'),
    true,
    'MC_POC_PROPOSTA_HIST referencia a própria MC_POC_PROPOSTA duas vezes (anterior/nova) sem formar ciclo',
  );
  // MC_CAD_COMITE/MC_POC_COMITE/MC_POC_COMITE_LIMITE_PRODUTO (fase comitê) ainda não
  // mapeados neste arquivo: construirGrafoEstrutural trata como folha, não quebra.
  assert.equal(ordem.includes('MC_CAD_COMITE'), true);
  assert.equal(ordem.includes('MC_POC_COMITE'), true);
  assert.equal(ordem.includes('MC_POC_COMITE_LIMITE_PRODUTO'), true);
});

test('grafo estrutural combinado (prospect + POC) resolve o cruzamento MC_PRT_PLEITO* -> MC_POC_PROPOSTA sem ciclo', () => {
  const grafo = construirGrafoEstrutural({ ...MAPEAMENTO_CEDENTE_PROSPECT, ...MAPEAMENTO_CEDENTE_POC });
  const ordem = ordenarTabelasPorDependenciaEstrutural(grafo);

  assert.equal(new Set(ordem).size, ordem.length, 'nenhuma tabela duplicada na ordem final');
  assert.equal(ordem.indexOf('MC_POC_PROPOSTA') < ordem.indexOf('MC_PRT_PLEITO'), true);
  assert.equal(ordem.indexOf('MC_PRT_PROSPECT') < ordem.indexOf('MC_POC_ALAVANCAGEM'), true);
});

test('todas as 18 tabelas da fase comitê estão classificadas e têm entrada em MAPEAMENTO_CEDENTE_COMITE', () => {
  TABELAS_POR_FASE[FASE_COMITE].forEach((tabela) => {
    assert.deepEqual(classificarTabelaCedente(tabela), { fase: FASE_COMITE, entra: true }, tabela);
    assert.ok(MAPEAMENTO_CEDENTE_COMITE[tabela], `${tabela} deveria ter entrada em MAPEAMENTO_CEDENTE_COMITE`);
  });
});

test('grafo estrutural real da fase comitê (mapeamentoCedente.js) não tem ciclo e respeita a ordem pai->filho', () => {
  const grafo = construirGrafoEstrutural(MAPEAMENTO_CEDENTE_COMITE);
  const ordem = ordenarTabelasPorDependenciaEstrutural(grafo);

  assert.equal(new Set(ordem).size, ordem.length, 'nenhuma tabela duplicada na ordem final');
  assert.equal(ordem.indexOf('MC_CAD_COMITE') < ordem.indexOf('MC_CAD_COMITE_PROPOSTA'), true);
  assert.equal(ordem.indexOf('MC_POC_COMITE') < ordem.indexOf('MC_POC_COMITE_ATA'), true);
  assert.equal(ordem.indexOf('MC_POC_COMITE') < ordem.indexOf('MC_POC_COMITE_LIMITE_PRODUTO'), true);
  assert.equal(ordem.indexOf('MC_POC_COMITE_LIMITE_PRODUTO') < ordem.indexOf('MC_POC_COMITE_PRODUTO_CONC'), true);
  assert.equal(ordem.indexOf('MC_POC_COMITE_VOTACAO') < ordem.indexOf('MC_POC_COMITE_VOTACAO_PRODUTO'), true);
  // MC_POC_PROPOSTA (fase POC) ainda não está neste grafo isolado: tratada como
  // folha, não quebra — o cruzamento real só é resolvido no grafo combinado abaixo.
  assert.equal(ordem.includes('MC_POC_PROPOSTA'), true);
  // MC_CED_PORTAL_CONVENIO (fase cedente, ainda não mapeada) idem.
  assert.equal(ordem.includes('MC_CED_PORTAL_CONVENIO'), true);
});

test('MC_POC_COMITE_VOTACAO/MC_PORTAL_COMITE_VOTACAO resolvem idParticipante como participante-fixo (Resposta-4, não votante real de PROD)', () => {
  ['MC_POC_COMITE_VOTACAO', 'MC_PORTAL_COMITE_VOTACAO'].forEach((tabela) => {
    const dependencia = MAPEAMENTO_CEDENTE_COMITE[tabela].dependeDe.find((d) => d.campo === 'idParticipante');
    assert.deepEqual(dependencia, { campo: 'idParticipante', tabela: 'MC_CAD_ANALISTA', tipo: 'participante-fixo' }, tabela);
  });

  assert.equal(typeof NOME_ANALISTA_RESPONSAVEL_CLONAGEM_CEDENTE, 'string');
  assert.ok(NOME_ANALISTA_RESPONSAVEL_CLONAGEM_CEDENTE.length > 0);
});

test('grafo estrutural combinado (POC + comitê) resolve o cruzamento MC_POC_PROPOSTA <-> MC_CAD_COMITE/MC_POC_COMITE sem ciclo', () => {
  const grafo = construirGrafoEstrutural({ ...MAPEAMENTO_CEDENTE_POC, ...MAPEAMENTO_CEDENTE_COMITE });
  const ordem = ordenarTabelasPorDependenciaEstrutural(grafo);

  assert.equal(new Set(ordem).size, ordem.length, 'nenhuma tabela duplicada na ordem final');
  assert.equal(ordem.indexOf('MC_CAD_COMITE') < ordem.indexOf('MC_POC_PROPOSTA'), true);
  assert.equal(ordem.indexOf('MC_POC_PROPOSTA') < ordem.indexOf('MC_POC_COMITE'), true);
  assert.equal(ordem.indexOf('MC_POC_COMITE_LIMITE_PRODUTO') < ordem.indexOf('MC_POC_PRODUTO_GARANTIA_REGRA'), true);
});

test('MC_POC_COMITE/MC_POC_COMITE_VOTACAO/MC_PORTAL_COMITE_VOTACAO declaram os valoresFixos de "votado e aprovado" (Resposta-5)', () => {
  assert.deepEqual(MAPEAMENTO_CEDENTE_COMITE.MC_POC_COMITE.valoresFixos, { situacaoVotacao: 'FINALIZADA' });
  // resultadoVotacao propositalmente ausente: sem precedente de uso real em PROD
  // (null em toda a amostra investigada), o Thiago decidiu não inventar um valor.
  assert.equal('resultadoVotacao' in MAPEAMENTO_CEDENTE_COMITE.MC_POC_COMITE.valoresFixos, false);

  ['MC_POC_COMITE_VOTACAO', 'MC_PORTAL_COMITE_VOTACAO'].forEach((tabela) => {
    assert.deepEqual(
      MAPEAMENTO_CEDENTE_COMITE[tabela].valoresFixos,
      { situacaoVoto: 'CONCLUIDO', voto: 'FAVORAVEL' },
      tabela,
    );
  });
});

test('aplicarValoresFixos sobrescreve só as colunas declaradas, sem mutar a linha original', () => {
  const linhaOrigem = { id: 1, situacaoVotacao: 'NAO_INICIADA', resultadoVotacao: null, idProposta: 42 };
  const linhaClonada = aplicarValoresFixos('MC_POC_COMITE', linhaOrigem, MAPEAMENTO_CEDENTE_COMITE);

  assert.deepEqual(linhaClonada, { id: 1, situacaoVotacao: 'FINALIZADA', resultadoVotacao: null, idProposta: 42 });
  assert.equal(linhaOrigem.situacaoVotacao, 'NAO_INICIADA', 'linha original não deve ser mutada');
});

test('aplicarValoresFixos devolve a linha original intacta para uma tabela sem valoresFixos declarado', () => {
  const linhaOrigem = { id: 7, idProposta: 42 };
  const linhaClonada = aplicarValoresFixos('MC_CAD_COMITE', linhaOrigem, MAPEAMENTO_CEDENTE_COMITE);

  assert.deepEqual(linhaClonada, linhaOrigem);
  assert.notEqual(linhaClonada, linhaOrigem, 'deve retornar um novo objeto, mesmo sem alteração');
});

test('todas as tabelas da fase cedente (TABELAS_POR_FASE) estão classificadas e têm entrada em MAPEAMENTO_CEDENTE_CEDENTE', () => {
  TABELAS_POR_FASE[FASE_CEDENTE].forEach((tabela) => {
    assert.deepEqual(classificarTabelaCedente(tabela), { fase: FASE_CEDENTE, entra: true }, tabela);
    assert.ok(MAPEAMENTO_CEDENTE_CEDENTE[tabela], `${tabela} deveria ter entrada em MAPEAMENTO_CEDENTE_CEDENTE`);
  });
});

test('MC_CED_ATA/MC_CED_ATA_VOTACAO entram na fase cedente como exceção pontual à exclusão de documentação (Resposta-8)', () => {
  assert.deepEqual(classificarTabelaCedente('MC_CED_ATA'), { fase: FASE_CEDENTE, entra: true });
  assert.deepEqual(classificarTabelaCedente('MC_CED_ATA_VOTACAO'), { fase: FASE_CEDENTE, entra: true });
  assert.equal(TABELAS_FORA_DE_ESCOPO.includes('MC_CED_ATA'), false);

  const dependenciaIdCedenteAta = MAPEAMENTO_CEDENTE_CEDENTE.MC_CED_ATA_VOTACAO.dependeDe.find(
    (d) => d.campo === 'idCedenteAta',
  );
  assert.ok(dependenciaIdCedenteAta, 'idCedenteAta deveria ter uma dependência declarada');
  assert.equal(dependenciaIdCedenteAta.tabela, 'MC_CED_ATA');
  assert.equal(dependenciaIdCedenteAta.tipo, 'estrutural');

  const dependenciaIdParticipante = MAPEAMENTO_CEDENTE_CEDENTE.MC_CED_ATA_VOTACAO.dependeDe.find(
    (d) => d.campo === 'idParticipante',
  );
  assert.ok(dependenciaIdParticipante, 'idParticipante deveria ter uma dependência declarada');
  assert.equal(dependenciaIdParticipante.tabela, 'MC_CAD_ANALISTA');
  assert.equal(dependenciaIdParticipante.tipo, 'participante-fixo');
});

test('MC_CED_ATA/MC_CED_ATA_VOTACAO declaram os mesmos valoresFixos de "votado e aprovado" já usados na fase comitê (Resposta-8)', () => {
  assert.deepEqual(MAPEAMENTO_CEDENTE_CEDENTE.MC_CED_ATA.valoresFixos, { situacaoVotacao: 'FINALIZADA' });
  assert.deepEqual(
    MAPEAMENTO_CEDENTE_CEDENTE.MC_CED_ATA_VOTACAO.valoresFixos,
    { situacaoVoto: 'CONCLUIDO', voto: 'FAVORAVEL' },
  );
});

test('grafo estrutural real da fase cedente (mapeamentoCedente.js) não tem ciclo e respeita a ordem pai->filho', () => {
  const grafo = construirGrafoEstrutural(MAPEAMENTO_CEDENTE_CEDENTE);
  const ordem = ordenarTabelasPorDependenciaEstrutural(grafo);

  assert.equal(new Set(ordem).size, ordem.length, 'nenhuma tabela duplicada na ordem final');
  assert.equal(ordem.indexOf('MC_CED_CEDENTE') < ordem.indexOf('MC_CED_FILIAL'), true);
  assert.equal(ordem.indexOf('MC_CAD_CONVENIO_PORTAL') < ordem.indexOf('MC_CED_PORTAL_CONVENIO'), true);
  assert.equal(ordem.indexOf('MC_CED_PORTAL_CONVENIO') < ordem.indexOf('MC_CED_CEDENTE_CONVENIO'), true);
  assert.equal(ordem.indexOf('MC_CAD_CONVENIO_PORTAL') < ordem.indexOf('MC_CED_CEDENTE_CONVENIO'), true);
  assert.equal(ordem.indexOf('MC_CED_GARANTIA') < ordem.indexOf('MC_CED_GARANTIA_HIST'), true);
  assert.equal(ordem.indexOf('MC_CED_CEDENTE') < ordem.indexOf('MC_CED_ATA'), true);
  assert.equal(ordem.indexOf('MC_CED_ATA') < ordem.indexOf('MC_CED_ATA_VOTACAO'), true);
  // MC_PRT_PROSPECT/MC_POC_PROPOSTA (fases anteriores, já mapeadas em outros
  // arquivos deste módulo) ainda não estão neste grafo isolado: tratadas como
  // folha, não quebra — o cruzamento real só é resolvido no grafo combinado.
  assert.equal(ordem.includes('MC_PRT_PROSPECT'), true);
  assert.equal(ordem.includes('MC_POC_PROPOSTA'), true);
});

test('grafo estrutural combinado (todas as 4 fases) resolve os cruzamentos MC_CED_CEDENTE <-> MC_PRT_PROSPECT/MC_POC_PROPOSTA sem ciclo', () => {
  const grafo = construirGrafoEstrutural({
    ...MAPEAMENTO_CEDENTE_PROSPECT,
    ...MAPEAMENTO_CEDENTE_POC,
    ...MAPEAMENTO_CEDENTE_COMITE,
    ...MAPEAMENTO_CEDENTE_CEDENTE,
  });
  const ordem = ordenarTabelasPorDependenciaEstrutural(grafo);

  assert.equal(new Set(ordem).size, ordem.length, 'nenhuma tabela duplicada na ordem final');
  assert.equal(ordem.indexOf('MC_PRT_PROSPECT') < ordem.indexOf('MC_CED_CEDENTE'), true);
  assert.equal(ordem.indexOf('MC_POC_PROPOSTA') < ordem.indexOf('MC_CED_CEDENTE'), true);
  assert.equal(ordem.indexOf('MC_POC_PROPOSTA') < ordem.indexOf('MC_CED_SETUP'), true);
  assert.equal(ordem.indexOf('MC_PORTAL_COMITE_VOTACAO') < ordem.length, true);
});

test('MC_CED_CEDENTE_VINCULADO.idCedenteVinculado resolvido como dependência tipo cascata (Resposta-7, item 2)', () => {
  const dependencia = MAPEAMENTO_CEDENTE_CEDENTE.MC_CED_CEDENTE_VINCULADO.dependeDe.find(
    (d) => d.campo === 'idCedenteVinculado',
  );

  assert.ok(dependencia, 'idCedenteVinculado deveria ter uma dependência declarada');
  assert.equal(dependencia.tabela, 'MC_CED_CEDENTE');
  assert.equal(dependencia.tipo, TIPO_DEPENDENCIA_CASCATA);
});

test('MC_CED_LOGIN excluída inteira do escopo (Resposta-7, item 3 — dado sensível/credencial)', () => {
  assert.deepEqual(classificarTabelaCedente('MC_CED_LOGIN'), { fase: null, entra: false });
  assert.equal(MAPEAMENTO_CEDENTE_CEDENTE.MC_CED_LOGIN, undefined);
  assert.equal(TABELAS_FORA_DE_ESCOPO.includes('MC_CED_LOGIN'), true);
});
