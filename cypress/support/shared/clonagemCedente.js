// arquivo: clonagemCedente.js
//
// Lógica pura (sem dependência do global `Cypress`) usada pela clonagem de cedente
// PROD -> HML, percorrendo o ciclo prospect -> POC (proposta) -> comitê -> cedente.
// Escopo completo (o que entra/fica de fora por fase, regra de match, "já existe em
// HML -> apaga e refaz") definido e confirmado pelo Thiago na tarefa
// `20260915130215-clonar-cedente-completo-prod-hml.md` — este arquivo é a fonte única
// de verdade da classificação, para não duplicar a lista em cada comando/feature que
// precisar saber se uma tabela entra ou não.

export const FASE_PROSPECT = 'prospect';
export const FASE_POC = 'poc';
export const FASE_COMITE = 'comite';
export const FASE_CEDENTE = 'cedente';
export const FASE_CATALOGO = 'catalogo';

// Tabela-âncora de cada fase do ciclo (a partir da qual as satélites são localizadas).
export const TABELA_ANCORA_POR_FASE = {
  [FASE_PROSPECT]: 'MC_PRT_PROSPECT',
  [FASE_POC]: 'MC_POC_PROPOSTA',
  [FASE_COMITE]: 'MC_CAD_COMITE',
  [FASE_CEDENTE]: 'MC_CED_CEDENTE',
};

// Tabelas satélite por fase que ENTRAM na cópia (fonte: tarefa 20260915130215, seção
// "Escopo — o que ENTRA na cópia"). Prospect é o único caso com uma exclusão pontual
// (KYC) dentro do que seria "tudo" — tratada em `TABELAS_FORA_DE_ESCOPO`, não aqui.
export const TABELAS_POR_FASE = {
  [FASE_PROSPECT]: [
    'MC_PRT_PROSPECT',
    'MC_PRT_LEAD',
    'MC_PRT_DADOS_MERCADO',
    'MC_PRT_DADOS_OPERACIONAIS',
    'MC_PRT_DADOS_INSTALACAO',
    'MC_PRT_CONCORRENTES',
    'MC_PRT_CAPEX',
    'MC_PRT_FILIAL',
    'MC_PRT_FORNECEDORES',
    'MC_PRT_IMPORTACAO',
    'MC_PRT_PRINCIPAIS_CLIENTES',
    'MC_PRT_PRINCIPAIS_PAISES',
    'MC_PRT_PRODUTO_GARANTIA',
    'MC_PRT_PROSPECT_REJEITADO',
    'MC_PRT_PLEITO',
    'MC_PRT_PLEITO_BOLETO',
    'MC_PRT_PLEITO_GARANTIA',
    'MC_PRT_PLEITO_PRODUTO',
    'MC_PRT_PLEITO_PRODUTO_CONC',
    'MC_PRT_PLEITO_PRODUTO_FLUXO',
    'MC_PRT_PLEITO_PRODUTO_OPERACAO',
    'MC_PRT_PRIORIZACAO_PROPOSTA',
    'MC_AGE_ACOMPANHAMENTO',
    'MC_AGE_AGENDA_VISITA',
    'MC_AGE_AGENDA_VISITA_RELATORIO',
    'MC_CAD_SACADO',
  ],
  [FASE_POC]: [
    'MC_POC_PROPOSTA',
    'MC_POC_ALAVANCAGEM',
    'MC_POC_BACEN',
    'MC_POC_BALANCO',
    'MC_POC_BENS_SOCIOS',
    'MC_POC_COAF',
    'MC_POC_COMPLIANCE',
    'MC_POC_ENDIVIDAMENTO',
    'MC_POC_ENDIVIDAMENTO_LANCAMENTO',
    'MC_POC_FATURAMENTO',
    'MC_POC_FROTA',
    'MC_POC_FUNDO',
    'MC_POC_GARANTIA_REGRA',
    'MC_POC_GRUPO_FATURAMENTO',
    'MC_POC_GRUPO_FATURAMENTO_INTERCOMPANY',
    'MC_POC_LANDBANK',
    'MC_POC_MEIO_CIRCULANTE',
    'MC_POC_PARAMETRO_CLAIM',
    'MC_POC_PARAMETRO_SETOR',
    'MC_POC_PLEITO',
    'MC_POC_PLEITO_BOLETO',
    'MC_POC_PLEITO_GARANTIA',
    'MC_POC_PLEITO_PRODUTO',
    'MC_POC_PRODUTO_GARANTIA_REGRA',
    'MC_POC_PROSPECT',
    'MC_POC_PROSPECT_FATURAMENTO',
    'MC_POC_PROSPECT_FATURAMENTO_INTERCOMPANY',
    'MC_POC_RENOVACAO',
    'MC_POC_PROPOSTA_HIST',
  ],
  [FASE_COMITE]: [
    'MC_CAD_COMITE',
    'MC_CAD_COMITE_PROPOSTA',
    'MC_CAD_MODELO_ATA_COMITE',
    'MC_POC_COMITE',
    'MC_POC_COMITE_ATA',
    'MC_POC_COMITE_ATA_HIST',
    'MC_POC_COMITE_FUNDO',
    'MC_POC_COMITE_GARANTIA',
    'MC_POC_COMITE_LIMITE_BOLETO',
    'MC_POC_COMITE_LIMITE_GLOBAL',
    'MC_POC_COMITE_LIMITE_PRODUTO',
    'MC_POC_COMITE_PRODUTO_CONC',
    'MC_POC_COMITE_PRODUTO_FLUXO',
    'MC_POC_COMITE_PRODUTO_GARANTIA',
    'MC_POC_COMITE_PRODUTO_OPERACAO',
    'MC_POC_COMITE_VOTACAO',
    'MC_POC_COMITE_VOTACAO_PRODUTO',
    'MC_PORTAL_COMITE_VOTACAO',
  ],
  // NOTA (Ciclo 9, investigação real INFORMATION_SCHEMA.TABLES contra PROD): três
  // tabelas citadas na tarefa original não existem de fato no schema —
  // `MC_CED_GERENTE_FOCO_HIST`, `MC_CED_GERENTE_FOCO_LOG` e
  // `MC_CED_FIRMAS_PODERES_REGRA_VALIDADE` (a tarefa assumia que existiam como
  // satélites de `MC_CED_GERENTE_FOCO`/`MC_CED_FIRMAS_PODERES_REGRA`, mas
  // `INFORMATION_SCHEMA.TABLES` não retorna nenhuma delas). Não é uma decisão de
  // escopo — simplesmente não há nada para copiar, removidas da lista.
  [FASE_CEDENTE]: [
    'MC_CED_CEDENTE',
    'MC_CED_FILIAL',
    'MC_CED_FUNDO',
    'MC_CED_SEGMENTO',
    'MC_CED_SITUACAO',
    'MC_CED_PRODUTO',
    'MC_CED_CEDENTE_VINCULADO',
    'MC_CED_GERENTE_FOCO',
    'MC_CED_GARANTIA',
    'MC_CED_GARANTIA_HIST',
    'MC_CED_GARANTIA_REGRA',
    'MC_CED_FORMULARIO_GARANTIA',
    'MC_CED_PORTAL',
    'MC_CED_PORTAL_CONVENIO',
    'MC_CED_CEDENTE_CONVENIO',
    'MC_CAD_CONVENIO_PORTAL',
    'MC_CAD_CLASSIFICACAO_PORTAL',
    'MC_CED_FIRMAS_PODERES_REGRA',
    'MC_CED_PARAMETRO_OPERACAO',
    'MC_CED_SETUP',
    'MC_CED_SETUP_EXC',
    'MC_CED_COMPLIANCE',
    'MC_CED_OBSERVACAO',
    'MC_CED_LOCAL_COBRANCA_NN',
    // `MC_CED_ATA`/`MC_CED_ATA_VOTACAO`: exceção pontual confirmada pelo Thiago
    // (duvidas.md, tarefa 20260915130215, Resposta-8, 2026-09-16) à exclusão de
    // documentação/formalização do escopo original — só para viabilizar
    // `MC_CED_ATA_VOTACAO` (cujo único vínculo estrutural, `idCedenteAta` NOT NULL,
    // aponta para `MC_CED_ATA`). `MC_CED_ATA` não guarda um documento externo — o
    // conteúdo da ata vive inline na própria linha (`textoAtaComite`, texto/HTML,
    // pode conter imagem embutida em base64); copiado como está. `idArquivo`
    // (nullable, sem FK física) segue não resolvido/null, mesmo precedente de
    // `idArquivoLogo`. Não abre precedente para as demais tabelas de documentação/
    // formalização, que continuam fora de escopo.
    'MC_CED_ATA',
    'MC_CED_ATA_VOTACAO',
  ],
};

// Famílias de tabela do domínio POC citadas na tarefa só por prefixo (`MC_POC_INCORP_*`,
// `MC_POC_RATING_*`, `MC_POC_RESTRIT*`/`MC_POC_RESTRITIVO_*`) — o nome exato de cada
// tabela da família ainda não foi enumerado contra o schema real (ver
// `docs/documentacao.md`, próximos passos), então a classificação usa prefixo em vez de
// lista fechada, para não arriscar excluir por engano uma tabela da família ainda não
// enumerada.
const PREFIXOS_POC = [/^MC_POC_INCORP_/, /^MC_POC_RATING_/, /^MC_POC_RESTRIT/];

// Tabelas/famílias explicitamente FORA de escopo (fonte: tarefa 20260915130215, seção
// "Escopo — o que FICA DE FORA"). Checada antes de qualquer regra de "entra", inclusive
// antes do fallback de catálogo — uma tabela aqui nunca entra, mesmo que o nome sugira
// pertencer a uma fase acima ou ao padrão `MC_CAD_*`.
export const TABELAS_FORA_DE_ESCOPO = [
  // Documentação / formalização (inteira, inclusive Beyond)
  'MC_CED_CEDENTE_DOCUMENTO',
  'MC_CED_CEDENTE_DOCUMENTO_HIST',
  'MC_CED_CEDENTE_DOCUMENTO_SECAO',
  'MC_CED_CEDENTE_DOCUMENTO_SECAO_HIST',
  'MC_CED_ANEXO',
  // MC_CED_ATA: removida daqui (Resposta-8, 2026-09-16) — exceção pontual, ver
  // TABELAS_POR_FASE[FASE_CEDENTE] acima. As demais tabelas de documentação/
  // formalização continuam fora de escopo.
  'MC_ENT_DOCUMENTO_KIT',
  'MC_CED_CEDENTE_CONTRATO',
  'MC_CED_CEDENTE_CONTRATO_HISTORICO',
  'MC_CADASTRO_CEDENTE_FORMALIZACAO',
  'MC_CED_FORMALIZACAO_IA',
  'MC_CED_FORMALIZACAO_IA_DOCS',
  // MC_CED_LOGIN: decidido pelo Thiago (Resposta-7/duvidas.md, item 3, 2026-09-15)
  // — dado sensível/credencial (login do cedente no portal, idLogin -> MC_LOGIN).
  // Excluída inteira, não só a coluna sem resolução.
  'MC_CED_LOGIN',
  // KYC do prospect
  'MC_PRT_KYC',
  'MC_CAD_PERGUNTAS_KYC',
  // Log/auditoria técnica
  'LOG_ATUALIZA_CEDENTE_COMITE',
  'LOG_ATUALIZA_PLEITO_COMITE',
  'LOG_COPIA_PLEITO_CREDITO_COMITE',
  // Domínio de operação/liquidação/câmbio (inteiro, inclusive boleto/tarifa)
  'MC_MOP_OPERACAO',
  'MC_MOP_PRE_OPERACAO',
  'MC_MOP_PRE_OPERACAO_BATCH',
  'MC_MOP_PRE_OPERACAO_EXC',
  'MC_MOP_PRE_OPERACAO_TITULO_EXC',
  'MC_MOP_SIMULACAO',
  'MC_MOP_TITULOS',
  'MC_MOP_NOTA_XML',
  'MC_MOP_ENTIDADE_ARQUIVO',
  'MC_LIQ_INSTRUCAO',
  'MC_LIQ_INSTRUCAO_LOTE',
  'MC_LIQ_INSTRUCAO_LOTE_ARQUIVO_ITEM',
  'MC_LIQ_ORDEM_PAGAMENTO',
  'MC_CAMBIO_ORDEM_PAGAMENTO',
  'MC_CAMBIO_ORDEM_PAGAMENTO_PRE',
  'MC_CED_BOLETO',
  'MC_CED_TARIFA',
  'MC_CED_EVENTO_TARIFA',
  'MC_PENDENCIA',
  'MC_RECIBO_PENDENCIA',
  'MC_RECOMPRA',
  'MC_PROV_OPERACAO',
  'MC_CHECAGEM_DIARIA',
  'MC_CHECAGEM_DIARIA_HISTORICO',
  'MC_BEYOND_INSTRUCAO_BAIXA_LOG',
  'MC_BEYOND_PROTESTO_PROCESSO',
  'MC_PORTAL_FORNECEDOR_ARQUIVO',
  'MC_PORTAL_FORNECEDOR_ARQUIVO_RETORNO',
  'MC_PORTAL_FORNECEDOR_ARQUIVO_PRE_CADASTRO',
  // MC_CAD_ARQUIVO: referenciado por tabelas de documento (já fora) e também por
  // MC_POC_PROPOSTA.idArquivo (dentro do escopo, descoberto ao mapear a fase POC em
  // 2026-09-15) — mesmo assim fica fora do mapeamento: é sempre referência a
  // arquivo/documento, tratada como não resolvida/null onde aparecer (mesmo
  // critério de MC_CED_CEDENTE.idArquivoLogo), nunca uma tabela copiada.
  'MC_CAD_ARQUIVO',
];

// Famílias fora de escopo identificadas só por prefixo/padrão no nome (a tarefa cita a
// família inteira, não uma lista fechada): `MC_CADASTRO_CEDENTE_ADMINISTRADOR*`,
// `TB_BEYOND_FORMALIZACAO_CADASTRO_CEDENTE*` (integração com a plataforma externa
// "Beyond"), `CPL_CEDENTE_*` (compliance por CNPJ via bureau externo, casado por
// cnpj/codigoGrupo, sem FK pro cedente) e qualquer tabela com `BKP` no nome (backup
// pontual — o padrão observado no schema real não é sempre um sufixo com underscore,
// ex. `MC_PRT_PROSPECTBKP1504`, por isso o regex não exige `_` antes de `BKP`).
const PADROES_FORA_DE_ESCOPO = [
  /^MC_CADASTRO_CEDENTE_ADMINISTRADOR/,
  /^TB_BEYOND_FORMALIZACAO_CADASTRO_CEDENTE/,
  /^CPL_CEDENTE_/,
  /BKP/i,
];

// Tabelas de catálogo fora do padrão `MC_CAD_*` (confirmado pelo Thiago em duvidas.md,
// tarefa 20260915130215): referenciadas por `MC_POC_RATING_INDICADOR_RESULTADO`
// (indicador/item de rating, dado compartilhado entre propostas, não pertencente a uma
// proposta específica), mas com prefixo `MC_RAT_`. Resolvidas pelo mesmo padrão de
// dependência de catálogo das `MC_CAD_*` (busca por chave natural em HML, cria se
// faltar) — só listadas explicitamente aqui porque `MC_RAT_` não é, em si, um prefixo
// genérico de catálogo (decisão vale só para estas duas tabelas confirmadas).
export const TABELAS_CATALOGO_FORA_DO_PADRAO_MC_CAD = [
  'MC_RAT_RATING_INDICADOR',
  'MC_RAT_RATING_INDICADOR_ITEM',
];

// `idParticipante` (votante do comitê) em `MC_POC_COMITE_VOTACAO`/`MC_PORTAL_COMITE_VOTACAO`
// (e futuramente `MC_CED_ATA_VOTACAO`, fase cedente) não tem FK física e, confirmado
// pelo Thiago em duvidas.md (tarefa 20260915130215, Resposta-4), nunca deve copiar o
// votante real de PROD — toda linha de votação clonada usa este participante fixo,
// localizado por nome (chave natural) em `MC_CAD_ANALISTA` de HML, mesmo padrão de
// busca das dependências de catálogo (ver `mapeamentoCedente.js`, tipo
// `participante-fixo`). Confirmado contra HML (2026-09-15): existe exatamente um
// registro ativo com este nome em `MC_CAD_ANALISTA` (id 29 no momento da checagem —
// não hardcoded aqui, resolvido em tempo de execução pela busca por nome).
export const NOME_ANALISTA_RESPONSAVEL_CLONAGEM_CEDENTE = 'THIAGO DA COSTA SANTOS';

// `MC_CED_CEDENTE_VINCULADO.idCedenteVinculado` (NOT NULL) aponta pra OUTRO
// MC_CED_CEDENTE (cedente relacionado, não o que está sendo clonado). Decidido
// pelo Thiago (duvidas.md, tarefa 20260915130215, Resposta-7, item 2, 2026-09-15):
// clonar em cascata — se o cedente vinculado não existir em HML, acionar a
// clonagem dele também (mesmo fluxo desta tarefa, recursivamente), ciente do risco
// de efeito cascata. Tipo de dependência novo, `cascata`, distinto de `estrutural`
// (não é uma FK dentro do grafo de tabelas *deste* cedente — aponta pra um cedente
// *diferente*, cuja própria clonagem é uma execução separada, não uma ordem de
// INSERT dentro da mesma árvore) e de `catalogo` (não é dado de referência
// compartilhado, é uma entidade completa do mesmo tipo). `construirGrafoEstrutural`
// ignora esta aresta (só considera `tipo: 'estrutural'`), mesmo comportamento já
// coberto por teste para `participante-fixo`. A lógica de execução da cascata
// (buscar o vinculado em HML por CNPJ/CPF, disparar a clonagem recursiva se
// ausente, detectar ciclo A-vinculado-a-B-vinculado-a-A) ainda não foi
// implementada — só a declaração no grafo, mesmo estágio dos demais ciclos de
// mapeamento; a implementação real acontece quando os comandos de leitura/INSERT
// forem escritos.
export const TIPO_DEPENDENCIA_CASCATA = 'cascata';

/**
 * @description Aplica os valores fixos declarados para uma tabela em
 * `mapeamentoCedente.js` (chave `valoresFixos`, ex.: `MC_POC_COMITE.situacaoVotacao`)
 * sobre uma linha vinda de PROD, sobrescrevendo o valor original pelo valor confirmado
 * pelo Thiago (ex.: marcar todo comitê/voto clonado como votado e aprovado — ver
 * duvidas.md, tarefa 20260915130215, Resposta-5) — em vez de copiar o valor real de
 * PROD. Só sobrescreve as colunas listadas em `valoresFixos`; qualquer outra coluna da
 * linha original passa intacta. Uma tabela sem `valoresFixos` declarado devolve a
 * linha original sem alteração. Nunca muta `linha` (retorna um novo objeto).
 * @param {string} nomeTabela
 * @param {Object} linha - linha de origem (PROD), já lida via SELECT/INFORMATION_SCHEMA.
 * @param {Object} mapeamento - mesmo formato de `MAPEAMENTO_CEDENTE_COMITE` etc.
 * @returns {Object}
 */
export const aplicarValoresFixos = (nomeTabela, linha, mapeamento) => ({
  ...linha,
  ...(mapeamento?.[nomeTabela]?.valoresFixos ?? {}),
});

const estaExplicitamenteForaDeEscopo = (nomeTabela) =>
  TABELAS_FORA_DE_ESCOPO.includes(nomeTabela) || PADROES_FORA_DE_ESCOPO.some((padrao) => padrao.test(nomeTabela));

/**
 * @description Classifica uma tabela do schema de cedente em uma fase do ciclo
 * prospect -> POC -> comitê -> cedente, em catálogo/domínio compartilhado (`MC_CAD_*`
 * genérico, resolvido pelo padrão de dependência já existente no repo — ver
 * `commands/dependencias.js`/`estoque.js` — em vez de cópia profunda por tabela), ou
 * como não pertencente ao escopo desta automação. Ordem de decisão: (1) exclusão
 * explícita sempre vence, mesmo sobre um nome que sugira pertencer a uma fase ou ser
 * catálogo; (2) lista fechada por fase; (3) família POC citada só por prefixo na
 * tarefa; (4) fallback de catálogo genérico `MC_CAD_*`; (5) catálogo fora do padrão
 * `MC_CAD_*`, confirmado caso a caso com o Thiago (`TABELAS_CATALOGO_FORA_DO_PADRAO_MC_CAD`);
 * (6) não classificado.
 * @param {string} nomeTabela - Nome da tabela no schema (ex.: `MC_PRT_PROSPECT`).
 * @returns {{fase: string|null, entra: boolean}} `entra: false` com `fase: null`
 * cobre tanto exclusão explícita quanto tabela desconhecida (fora do escopo mapeado) —
 * o chamador não deve tentar copiar/apagar uma tabela cuja classificação devolveu
 * `entra: false`, e uma tabela nova/não mapeada deve virar dúvida bloqueante (regra 8
 * do `AGENTE.md`), nunca uma decisão automática de incluir ou ignorar.
 */
export const classificarTabelaCedente = (nomeTabela) => {
  if (!nomeTabela) return { fase: null, entra: false };
  if (estaExplicitamenteForaDeEscopo(nomeTabela)) return { fase: null, entra: false };

  for (const fase of [FASE_PROSPECT, FASE_POC, FASE_COMITE, FASE_CEDENTE]) {
    if (TABELAS_POR_FASE[fase].includes(nomeTabela)) return { fase, entra: true };
  }

  if (PREFIXOS_POC.some((padrao) => padrao.test(nomeTabela))) return { fase: FASE_POC, entra: true };

  if (nomeTabela.startsWith('MC_CAD_')) return { fase: FASE_CATALOGO, entra: true };

  if (TABELAS_CATALOGO_FORA_DO_PADRAO_MC_CAD.includes(nomeTabela)) return { fase: FASE_CATALOGO, entra: true };

  return { fase: null, entra: false };
};

/**
 * @description Normaliza um CNPJ/CPF para comparação, removendo tudo que não for
 * dígito. Usado porque a mesma pessoa pode ter o documento formatado de formas
 * diferentes (com/sem máscara) entre o registro de origem (PROD) e o de destino (HML).
 * @param {string|null|undefined} valor
 * @returns {string|null} `null` para entrada vazia/ausente — nunca uma string vazia,
 * para que `documentosCoincidem` nunca trate "ambos ausentes" como coincidência.
 */
export const normalizarDocumento = (valor) => {
  const digitos = String(valor ?? '').replace(/\D/g, '');
  return digitos.length ? digitos : null;
};

/**
 * @description Compara dois CNPJ/CPF já normalizando ambos. Dois documentos ausentes
 * (ambos normalizam para `null`) nunca são considerados coincidentes — a chave de
 * match do cedente exige um CNPJ/CPF real dos dois lados.
 * @param {string|null|undefined} documentoA
 * @param {string|null|undefined} documentoB
 * @returns {boolean}
 */
export const documentosCoincidem = (documentoA, documentoB) => {
  const normalizadoA = normalizarDocumento(documentoA);
  const normalizadoB = normalizarDocumento(documentoB);
  return normalizadoA !== null && normalizadoA === normalizadoB;
};

export const ESTRATEGIA_BLOQUEADO_SEM_ORIGEM = 'bloqueado-sem-origem';
export const ESTRATEGIA_APAGAR_E_RECRIAR = 'apagar-e-recriar';
export const ESTRATEGIA_CRIAR = 'criar';

/**
 * @description Decide a estratégia de clonagem de um cedente, a partir do que foi
 * encontrado em PROD/HML para o CNPJ/CPF informado. Nunca decide sozinho criar um
 * cedente "solto": pessoa e prospect de origem em PROD são obrigatórios (confirmado
 * pelo Thiago na tarefa) — sem os dois, a estratégia é sempre bloqueio, mesmo que o
 * cedente já exista em HML. Quando o cedente já existe em HML, a estratégia é sempre
 * apagar o cadastro completo (escopo "ENTRA") e recriar a partir de PROD — nunca um
 * update registro a registro (decisão explícita da tarefa).
 * @param {{pessoaOrigemEncontrada: boolean, prospectOrigemEncontrado: boolean, cedenteHmlExistente: boolean}} contexto
 * @returns {{estrategia: string, motivo?: string}}
 */
export const decidirEstrategiaClonagemCedente = ({
  pessoaOrigemEncontrada,
  prospectOrigemEncontrado,
  cedenteHmlExistente,
}) => {
  if (!pessoaOrigemEncontrada || !prospectOrigemEncontrado) {
    const faltando = [
      !pessoaOrigemEncontrada && 'pessoa',
      !prospectOrigemEncontrado && 'prospect',
    ].filter(Boolean).join(' e ');

    return {
      estrategia: ESTRATEGIA_BLOQUEADO_SEM_ORIGEM,
      motivo: `Não encontrado em PROD para o CNPJ/CPF informado: ${faltando}. Pessoa e prospect de origem são obrigatórios para a criação.`,
    };
  }

  return { estrategia: cedenteHmlExistente ? ESTRATEGIA_APAGAR_E_RECRIAR : ESTRATEGIA_CRIAR };
};

/**
 * @description Constrói o grafo de dependência ESTRUTURAL (tabela -> tabelas-pai
 * dentro do próprio grafo de clonagem do cedente) a partir de um mapeamento no
 * formato de `cypress/utils/mapeamentoCedente.js` (`{ [tabela]: { dependeDe: [{
 * campo, tabela, tipo }] } }`). Só considera arestas `tipo: 'estrutural'` —
 * dependências de catálogo (`tipo: 'catalogo'`) são resolvidas à parte, pelo
 * padrão já existente em `commands/dependencias.js`/`estoque.js`, e nunca
 * participam da ordem de inserção/exclusão entre as tabelas do próprio cedente.
 * Uma tabela-pai referenciada mas ainda não presente como chave do mapeamento
 * (ex.: uma tabela de outra fase ainda não investigada) é tratada como uma folha
 * sem dependências — não é erro, permite montar o mapeamento fase por fase ao
 * longo de vários ciclos sem quebrar a ordenação do que já existe.
 * @param {Object} mapeamento
 * @returns {Object<string, string[]>} grafo pronto para `ordenarTabelasPorDependenciaEstrutural`.
 */
export const construirGrafoEstrutural = (mapeamento) => {
  const grafo = {};

  for (const [tabela, config] of Object.entries(mapeamento)) {
    const paisEstruturais = (config?.dependeDe ?? [])
      .filter((dependencia) => dependencia.tipo === 'estrutural')
      .map((dependencia) => dependencia.tabela);

    grafo[tabela] = [...new Set(paisEstruturais)];
  }

  return grafo;
};

/**
 * @description Ordena topologicamente as tabelas de um grafo de dependência
 * estrutural (ver `construirGrafoEstrutural`), garantindo que toda tabela-pai
 * apareça antes de suas tabelas-filhas no resultado — a ordem correta para
 * INSERT em HML na clonagem do cedente. Para a ordem de DELETE (regra 12 do
 * `AGENTE.md`: filhas antes de pais), basta inverter o array retornado.
 * @param {Object<string, string[]>} grafo - `{ [tabela]: tabelasDasQuaisDepende[] }`.
 * @returns {string[]} tabelas em ordem de inserção (pais antes de filhas).
 * @throws {Error} se o grafo tiver um ciclo de dependência estrutural.
 */
export const ordenarTabelasPorDependenciaEstrutural = (grafo) => {
  const estadoPorTabela = new Map();
  const ordem = [];

  const visitar = (tabela, caminho) => {
    const estado = estadoPorTabela.get(tabela);
    if (estado === 'concluido') return;
    if (estado === 'visitando') {
      throw new Error(
        `[ordenarTabelasPorDependenciaEstrutural] Ciclo de dependência detectado envolvendo "${tabela}": ${[...caminho, tabela].join(' -> ')}`,
      );
    }

    estadoPorTabela.set(tabela, 'visitando');
    (grafo[tabela] ?? []).forEach((tabelaPai) => visitar(tabelaPai, [...caminho, tabela]));
    estadoPorTabela.set(tabela, 'concluido');
    ordem.push(tabela);
  };

  Object.keys(grafo).forEach((tabela) => visitar(tabela, []));

  return ordem;
};
