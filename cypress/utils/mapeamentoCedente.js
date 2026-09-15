// arquivo: mapeamentoCedente.js
//
// Grafo de dependência das tabelas do domínio `cedente` (clonagem PROD -> HML),
// levantado via INFORMATION_SCHEMA.COLUMNS/sys.foreign_keys reais contra PROD (não
// hardcoded "de memória" — ver `docs/documentacao.md` do módulo para o script de
// investigação reaproveitável). Cada entrada declara, por tabela, de quais outras
// tabelas ela depende (`dependeDe`) e o tipo de dependência:
//
// - `estrutural`: a tabela-pai também faz parte do grafo de clonagem do cedente (é
//   uma tabela-âncora ou satélite listada em `clonagemCedente.js` como `entra: true`).
//   A ordem de inserção em HML (e a ordem inversa para o DELETE de "apaga e refaz",
//   regra 12 do AGENTE.md) precisa respeitar essas arestas — ver
//   `ordenarTabelasPorDependenciaEstrutural` em `clonagemCedente.js`.
// - `catalogo`: a tabela-pai é um catálogo/domínio compartilhado (`MC_CAD_*`
//   genérico, ou `MC_CAD_PESSOA` especificamente para a chave de match) resolvido
//   pelo mesmo padrão já usado em Produtos/Esteiras/Vínculos (busca por chave
//   natural em HML, cria se faltar) — não por cópia profunda, e não participa da
//   ordenação estrutural abaixo.
//
// IMPORTANTE (descoberta real, não presumida): apesar do prefixo `MC_PRT_` (que
// sugere "prospect") e de a tarefa listar `MC_PRT_PLEITO*` na seção "1. Prospect",
// a FK real é `MC_PRT_PLEITO(_BOLETO/_GARANTIA/_PRODUTO).idProposta ->
// MC_POC_PROPOSTA.id` — ou seja, essas tabelas só podem ser criadas em HML depois
// que a proposta (fase POC) correspondente já existir lá. A classificação por
// "fase" (`clonagemCedente.js`) define só ENTRA/FICA-DE-FORA (escopo), nunca a
// ordem de inserção/exclusão — a ordem real vem sempre do grafo de FK calculado
// aqui, nunca da agrupação por fase. Qualquer código que processar "uma fase de
// cada vez" precisa continuar respeitando esse grafo cruzado (ex.: só inserir
// MC_PRT_PLEITO depois que a MC_POC_PROPOSTA de origem já tiver sido criada em
// HML), não assumir que "fase prospect" termina antes de "fase poc" começar.
//
// Tabelas ainda fora deste arquivo (fases comitê/cedente) entram em ciclos futuros,
// seguindo o mesmo padrão de investigação real documentado abaixo.

export const MAPEAMENTO_CEDENTE_PROSPECT = {
  // Catálogo especial: não é copiado por este mapeamento (resolvido pela chave de
  // match CNPJ/CPF, ver `documentosCoincidem`/`decidirEstrategiaClonagemCedente`),
  // mas aparece como alvo de `dependeDe` de várias tabelas abaixo.
  MC_CAD_PESSOA: {
    dependeDe: [],
  },

  MC_PRT_PROSPECT: {
    // Tabela-âncora da fase. Sem dependência estrutural (é a raiz do grafo desta
    // fase) — só dependências de catálogo.
    dependeDe: [
      { campo: 'idPessoa', tabela: 'MC_CAD_PESSOA', tipo: 'catalogo' },
      { campo: 'idPessoaRelacionada', tabela: 'MC_CAD_PESSOA', tipo: 'catalogo' },
      { campo: 'idConsultoriaEspecializada', tabela: 'MC_CAD_CONSULTORIA_ESPECIALIZADA', tipo: 'catalogo' },
      { campo: 'idGerenteComercial', tabela: 'MC_CAD_GERENTE_COMERCIAL', tipo: 'catalogo' },
      { campo: 'idConsultoria', tabela: 'MC_CAD_CONSULTORIA', tipo: 'catalogo' },
      { campo: 'idConsultor', tabela: 'MC_CAD_CONSULTOR', tipo: 'catalogo' },
      { campo: 'idIndicador', tabela: 'MC_CAD_INDICADOR', tipo: 'catalogo' },
      { campo: 'idSituacao', tabela: 'MC_CAD_SITUACAO', tipo: 'catalogo' },
      { campo: 'idGrupoEconomico', tabela: 'MC_CAD_GRUPO_ECONOMICO', tipo: 'catalogo' },
      { campo: 'idTipoProspect', tabela: 'MC_CAD_TIPO_PROSPECT', tipo: 'catalogo' },
      { campo: 'idCanal', tabela: 'MC_CAD_CANAL', tipo: 'catalogo' },
      // idCedenteVinculado -> MC_CED_CEDENTE: aponta pra um cedente (fase posterior
      // no ciclo de vida). Fora de escopo desta etapa — avaliar junto da fase
      // `cedente` (mesmo tipo de pendência já registrada pra idProximaProposta em
      // docs/documentacao.md); até lá, coluna não resolvida/deixada como está.
    ],
  },

  MC_PRT_LEAD: {
    dependeDe: [
      { campo: 'idProspect', tabela: 'MC_PRT_PROSPECT', tipo: 'estrutural' },
      { campo: 'idPessoa', tabela: 'MC_CAD_PESSOA', tipo: 'catalogo' },
      { campo: 'idGerenteComercial', tabela: 'MC_CAD_GERENTE_COMERCIAL', tipo: 'catalogo' },
      { campo: 'idCanal', tabela: 'MC_CAD_CANAL', tipo: 'catalogo' },
      { campo: 'idConsultoriaEspecializada', tabela: 'MC_CAD_CONSULTORIA_ESPECIALIZADA', tipo: 'catalogo' },
      { campo: 'idSituacao', tabela: 'MC_CAD_SITUACAO', tipo: 'catalogo' },
    ],
  },

  MC_PRT_DADOS_MERCADO: {
    dependeDe: [
      { campo: 'idProspect', tabela: 'MC_PRT_PROSPECT', tipo: 'estrutural' },
      { campo: 'idConsultoriaEspecializada', tabela: 'MC_CAD_CONSULTORIA_ESPECIALIZADA', tipo: 'catalogo' },
    ],
  },

  MC_PRT_DADOS_OPERACIONAIS: {
    dependeDe: [
      { campo: 'idProspect', tabela: 'MC_PRT_PROSPECT', tipo: 'estrutural' },
      { campo: 'idPessoa', tabela: 'MC_CAD_PESSOA', tipo: 'catalogo' },
      { campo: 'idConsultoriaEspecializada', tabela: 'MC_CAD_CONSULTORIA_ESPECIALIZADA', tipo: 'catalogo' },
    ],
  },

  MC_PRT_DADOS_INSTALACAO: {
    dependeDe: [
      { campo: 'idProspect', tabela: 'MC_PRT_PROSPECT', tipo: 'estrutural' },
      { campo: 'idTipoInstalacao', tabela: 'MC_CAD_TIPO_INSTALACAO', tipo: 'catalogo' },
      { campo: 'idConsultoriaEspecializada', tabela: 'MC_CAD_CONSULTORIA_ESPECIALIZADA', tipo: 'catalogo' },
    ],
  },

  MC_PRT_CONCORRENTES: {
    dependeDe: [
      { campo: 'idProspect', tabela: 'MC_PRT_PROSPECT', tipo: 'estrutural' },
      { campo: 'idConsultoriaEspecializada', tabela: 'MC_CAD_CONSULTORIA_ESPECIALIZADA', tipo: 'catalogo' },
    ],
  },

  MC_PRT_CAPEX: {
    dependeDe: [
      { campo: 'idProspect', tabela: 'MC_PRT_PROSPECT', tipo: 'estrutural' },
      { campo: 'idTipoInvestimento', tabela: 'MC_CAD_TIPO_INVESTIMENTO', tipo: 'catalogo' },
      { campo: 'idConsultoriaEspecializada', tabela: 'MC_CAD_CONSULTORIA_ESPECIALIZADA', tipo: 'catalogo' },
    ],
  },

  MC_PRT_FILIAL: {
    dependeDe: [
      { campo: 'idProspect', tabela: 'MC_PRT_PROSPECT', tipo: 'estrutural' },
      { campo: 'idPessoa', tabela: 'MC_CAD_PESSOA', tipo: 'catalogo' },
      { campo: 'idConsultoriaEspecializada', tabela: 'MC_CAD_CONSULTORIA_ESPECIALIZADA', tipo: 'catalogo' },
    ],
  },

  MC_PRT_FORNECEDORES: {
    dependeDe: [
      { campo: 'idProspect', tabela: 'MC_PRT_PROSPECT', tipo: 'estrutural' },
      { campo: 'idConsultoriaEspecializada', tabela: 'MC_CAD_CONSULTORIA_ESPECIALIZADA', tipo: 'catalogo' },
    ],
  },

  MC_PRT_IMPORTACAO: {
    dependeDe: [
      { campo: 'idProspect', tabela: 'MC_PRT_PROSPECT', tipo: 'estrutural' },
      { campo: 'idConsultoriaEspecializada', tabela: 'MC_CAD_CONSULTORIA_ESPECIALIZADA', tipo: 'catalogo' },
    ],
  },

  MC_PRT_PRINCIPAIS_CLIENTES: {
    dependeDe: [
      { campo: 'idProspect', tabela: 'MC_PRT_PROSPECT', tipo: 'estrutural' },
      { campo: 'idConsultoriaEspecializada', tabela: 'MC_CAD_CONSULTORIA_ESPECIALIZADA', tipo: 'catalogo' },
    ],
  },

  MC_PRT_PRINCIPAIS_PAISES: {
    dependeDe: [
      { campo: 'idProspect', tabela: 'MC_PRT_PROSPECT', tipo: 'estrutural' },
      { campo: 'idConsultoriaEspecializada', tabela: 'MC_CAD_CONSULTORIA_ESPECIALIZADA', tipo: 'catalogo' },
    ],
  },

  MC_PRT_PRODUTO_GARANTIA: {
    dependeDe: [
      { campo: 'idPleitoProduto', tabela: 'MC_PRT_PLEITO_PRODUTO', tipo: 'estrutural' },
      { campo: 'idGarantiaCategoria', tabela: 'MC_CAD_GARANTIA_CATEGORIA', tipo: 'catalogo' },
      { campo: 'idConsultoriaEspecializada', tabela: 'MC_CAD_CONSULTORIA_ESPECIALIZADA', tipo: 'catalogo' },
    ],
  },

  MC_PRT_PROSPECT_REJEITADO: {
    dependeDe: [
      { campo: 'idProspect', tabela: 'MC_PRT_PROSPECT', tipo: 'estrutural' },
      { campo: 'idSituacao', tabela: 'MC_CAD_SITUACAO', tipo: 'catalogo' },
      { campo: 'idConsultoriaEspecializada', tabela: 'MC_CAD_CONSULTORIA_ESPECIALIZADA', tipo: 'catalogo' },
    ],
  },

  // --- Família MC_PRT_PLEITO*: apesar do prefixo, depende estruturalmente de
  // MC_POC_PROPOSTA (fase POC), não de MC_PRT_PROSPECT — ver nota no topo do
  // arquivo. MC_POC_PROPOSTA ainda não está mapeada neste arquivo (fica pra quando
  // a fase POC for investigada); a aresta abaixo já referencia o nome correto para
  // quando essa entrada existir, mas até lá `construirGrafoEstrutural` trata
  // qualquer tabela-pai ainda não presente como uma folha sem dependências
  // (comportamento coberto por teste em `__tests__/clonagemCedente.test.js`).
  MC_PRT_PLEITO: {
    dependeDe: [
      { campo: 'idProposta', tabela: 'MC_POC_PROPOSTA', tipo: 'estrutural' },
      { campo: 'idConsultoriaEspecializada', tabela: 'MC_CAD_CONSULTORIA_ESPECIALIZADA', tipo: 'catalogo' },
    ],
  },

  MC_PRT_PLEITO_BOLETO: {
    dependeDe: [
      { campo: 'idProposta', tabela: 'MC_POC_PROPOSTA', tipo: 'estrutural' },
      { campo: 'idConsultoriaEspecializada', tabela: 'MC_CAD_CONSULTORIA_ESPECIALIZADA', tipo: 'catalogo' },
    ],
  },

  MC_PRT_PLEITO_GARANTIA: {
    dependeDe: [
      { campo: 'idProposta', tabela: 'MC_POC_PROPOSTA', tipo: 'estrutural' },
      { campo: 'idGarantiaCategoria', tabela: 'MC_CAD_GARANTIA_CATEGORIA', tipo: 'catalogo' },
      { campo: 'idFormulario', tabela: 'MC_CAD_FORMULARIO', tipo: 'catalogo' },
      { campo: 'idFormularioCampo', tabela: 'MC_CAD_FORMULARIO_CAMPO', tipo: 'catalogo' },
      { campo: 'idConsultoriaEspecializada', tabela: 'MC_CAD_CONSULTORIA_ESPECIALIZADA', tipo: 'catalogo' },
    ],
  },

  MC_PRT_PLEITO_PRODUTO: {
    dependeDe: [
      { campo: 'idProposta', tabela: 'MC_POC_PROPOSTA', tipo: 'estrutural' },
      { campo: 'idProduto', tabela: 'MC_CAD_PRODUTO', tipo: 'catalogo' },
      { campo: 'idConsultoriaEspecializada', tabela: 'MC_CAD_CONSULTORIA_ESPECIALIZADA', tipo: 'catalogo' },
    ],
  },

  MC_PRT_PLEITO_PRODUTO_CONC: {
    dependeDe: [
      { campo: 'idPleitoProduto', tabela: 'MC_PRT_PLEITO_PRODUTO', tipo: 'estrutural' },
      { campo: 'idConsultoriaEspecializada', tabela: 'MC_CAD_CONSULTORIA_ESPECIALIZADA', tipo: 'catalogo' },
    ],
  },

  MC_PRT_PLEITO_PRODUTO_FLUXO: {
    dependeDe: [
      { campo: 'idPleitoProduto', tabela: 'MC_PRT_PLEITO_PRODUTO', tipo: 'estrutural' },
      { campo: 'idConsultoriaEspecializada', tabela: 'MC_CAD_CONSULTORIA_ESPECIALIZADA', tipo: 'catalogo' },
    ],
  },

  MC_PRT_PLEITO_PRODUTO_OPERACAO: {
    dependeDe: [
      { campo: 'idPleitoProduto', tabela: 'MC_PRT_PLEITO_PRODUTO', tipo: 'estrutural' },
      { campo: 'idFundo', tabela: 'MC_CAD_FUNDO', tipo: 'catalogo' },
      { campo: 'idConsultoriaEspecializada', tabela: 'MC_CAD_CONSULTORIA_ESPECIALIZADA', tipo: 'catalogo' },
    ],
  },

  MC_PRT_PRIORIZACAO_PROPOSTA: {
    dependeDe: [
      { campo: 'idProposta', tabela: 'MC_POC_PROPOSTA', tipo: 'estrutural' },
      { campo: 'idConsultoriaEspecializada', tabela: 'MC_CAD_CONSULTORIA_ESPECIALIZADA', tipo: 'catalogo' },
    ],
  },

  // --- Família MC_AGE_* (agenda/acompanhamento comercial do prospect) ---
  MC_AGE_ACOMPANHAMENTO: {
    dependeDe: [
      { campo: 'idProspect', tabela: 'MC_PRT_PROSPECT', tipo: 'estrutural' },
      { campo: 'idGerenteComercial', tabela: 'MC_CAD_GERENTE_COMERCIAL', tipo: 'catalogo' },
      { campo: 'idTipoContato', tabela: 'MC_CAD_TIPO_CONTATO', tipo: 'catalogo' },
      { campo: 'idConsultoriaEspecializada', tabela: 'MC_CAD_CONSULTORIA_ESPECIALIZADA', tipo: 'catalogo' },
      // idCedente/idSacado (colunas existem na tabela) NÃO têm constraint de FK
      // física no schema real (não apareceram em sys.foreign_keys) — referência
      // por convenção de nome, não verificável estruturalmente. Não resolvidas
      // aqui; se um valor vier preenchido em PROD, decidir tratamento quando a
      // fase que cobre a tabela referenciada (cedente/MC_CAD_SACADO) for
      // implementada — não presumir/format a coluna sozinho.
    ],
  },

  MC_AGE_AGENDA_VISITA: {
    dependeDe: [
      { campo: 'idProspect', tabela: 'MC_PRT_PROSPECT', tipo: 'estrutural' },
      { campo: 'idAcompanhamentoVisita', tabela: 'MC_AGE_ACOMPANHAMENTO', tipo: 'estrutural' },
      { campo: 'idGerenteComercialAgenda', tabela: 'MC_CAD_GERENTE_COMERCIAL', tipo: 'catalogo' },
      { campo: 'idGerenteComercialRealizado', tabela: 'MC_CAD_GERENTE_COMERCIAL', tipo: 'catalogo' },
      { campo: 'idConsultoriaEspecializada', tabela: 'MC_CAD_CONSULTORIA_ESPECIALIZADA', tipo: 'catalogo' },
    ],
  },

  MC_AGE_AGENDA_VISITA_RELATORIO: {
    dependeDe: [
      { campo: 'idProspect', tabela: 'MC_PRT_PROSPECT', tipo: 'estrutural' },
      { campo: 'idAgendaVisita', tabela: 'MC_AGE_AGENDA_VISITA', tipo: 'estrutural' },
      { campo: 'idConsultoriaEspecializada', tabela: 'MC_CAD_CONSULTORIA_ESPECIALIZADA', tipo: 'catalogo' },
      // idRelatorioVisitaAnexo -> MC_AGE_AGENDA_VISITA_ANEXO (coluna nullable):
      // tabela de anexo, fora do escopo desta automação pela mesma razão já
      // decidida na tarefa para `MC_CED_CEDENTE.idArquivoLogo` (referência a
      // arquivo/documento) — aplicado por precedente, não uma decisão nova; fica
      // sem resolver (null) na cópia, não uma dúvida bloqueante.
    ],
  },

  MC_CAD_SACADO: {
    dependeDe: [
      { campo: 'idProspect', tabela: 'MC_PRT_PROSPECT', tipo: 'estrutural' },
      { campo: 'idPessoa', tabela: 'MC_CAD_PESSOA', tipo: 'catalogo' },
      { campo: 'idBloqueio', tabela: 'MC_CAD_BLOQUEIO', tipo: 'catalogo' },
      { campo: 'idGrupoEconomico', tabela: 'MC_CAD_GRUPO_ECONOMICO', tipo: 'catalogo' },
      { campo: 'idConsultoriaEspecializada', tabela: 'MC_CAD_CONSULTORIA_ESPECIALIZADA', tipo: 'catalogo' },
    ],
  },
};

// --- Fase POC (proposta) --- grafo de FK real investigado contra PROD em 2026-09-15
// (as 28 tabelas explícitas da tarefa + as 22 tabelas reais das 3 famílias citadas só
// por prefixo — `MC_POC_INCORP_*`, `MC_POC_RATING_*`, `MC_POC_RESTRIT*` — enumeradas
// via INFORMATION_SCHEMA.TABLES, ver docs/documentacao.md para a lista fechada e o
// script de investigação reaproveitável).
export const MAPEAMENTO_CEDENTE_POC = {
  MC_POC_PROPOSTA: {
    // Tabela-âncora da fase.
    dependeDe: [
      { campo: 'idConsultoriaEspecializada', tabela: 'MC_CAD_CONSULTORIA_ESPECIALIZADA', tipo: 'catalogo' },
      { campo: 'idTipoProposta', tabela: 'MC_CAD_TIPO_PROPOSTA', tipo: 'catalogo' },
      // idComite -> MC_CAD_COMITE (nullable): dependência estrutural cruzando pra
      // fase comitê (ainda não mapeada neste arquivo) — mesmo padrão já registrado
      // pra MC_PRT_PLEITO*.idProposta -> MC_POC_PROPOSTA: a ordem real vem do grafo
      // de FK, nunca da suposição "fase termina antes da próxima começar".
      { campo: 'idComite', tabela: 'MC_CAD_COMITE', tipo: 'estrutural' },
      // idArquivo -> MC_CAD_ARQUIVO (nullable): referência a arquivo/documento, fora
      // de escopo pela mesma razão já decidida pra MC_CED_CEDENTE.idArquivoLogo e
      // MC_AGE_AGENDA_VISITA_RELATORIO.idRelatorioVisitaAnexo — não resolvida/fica
      // null na cópia (aplicação de precedente, não decisão nova). Isso também
      // corrige o comentário de MC_CAD_ARQUIVO em `TABELAS_FORA_DE_ESCOPO`
      // (`clonagemCedente.js`), que dizia ser referenciado só por tabelas de
      // documento — MC_POC_PROPOSTA (dentro do escopo) também referencia.
      // idAtaReferencial (nullable): coluna existe mas sem constraint de FK física
      // no schema real (não aparece em sys.foreign_keys) — mesmo tratamento não
      // resolvido já aplicado a MC_AGE_ACOMPANHAMENTO.idCedente/idSacado.
    ],
  },

  MC_POC_ALAVANCAGEM: {
    dependeDe: [
      { campo: 'idConsultoriaEspecializada', tabela: 'MC_CAD_CONSULTORIA_ESPECIALIZADA', tipo: 'catalogo' },
      { campo: 'idGrupoEconomico', tabela: 'MC_CAD_GRUPO_ECONOMICO', tipo: 'catalogo' },
      { campo: 'idSetor', tabela: 'MC_CAD_SETOR', tipo: 'catalogo' },
      { campo: 'idProposta', tabela: 'MC_POC_PROPOSTA', tipo: 'estrutural' },
      { campo: 'idProspect', tabela: 'MC_PRT_PROSPECT', tipo: 'estrutural' },
    ],
  },

  MC_POC_BACEN: {
    dependeDe: [
      { campo: 'idConsultoriaEspecializada', tabela: 'MC_CAD_CONSULTORIA_ESPECIALIZADA', tipo: 'catalogo' },
      { campo: 'idProposta', tabela: 'MC_POC_PROPOSTA', tipo: 'estrutural' },
    ],
  },

  MC_POC_BALANCO: {
    dependeDe: [
      { campo: 'idConsultoriaEspecializada', tabela: 'MC_CAD_CONSULTORIA_ESPECIALIZADA', tipo: 'catalogo' },
      { campo: 'idProposta', tabela: 'MC_POC_PROPOSTA', tipo: 'estrutural' },
      { campo: 'idProspect', tabela: 'MC_PRT_PROSPECT', tipo: 'estrutural' },
    ],
  },

  MC_POC_BENS_SOCIOS: {
    dependeDe: [
      { campo: 'idConsultoriaEspecializada', tabela: 'MC_CAD_CONSULTORIA_ESPECIALIZADA', tipo: 'catalogo' },
      { campo: 'idProposta', tabela: 'MC_POC_PROPOSTA', tipo: 'estrutural' },
      { campo: 'idSocio', tabela: 'MC_CAD_SOCIO', tipo: 'catalogo' },
    ],
  },

  MC_POC_COAF: {
    dependeDe: [
      { campo: 'idConsultoriaEspecializada', tabela: 'MC_CAD_CONSULTORIA_ESPECIALIZADA', tipo: 'catalogo' },
      { campo: 'idProposta', tabela: 'MC_POC_PROPOSTA', tipo: 'estrutural' },
      { campo: 'idSocio', tabela: 'MC_CAD_PESSOA_SOCIO', tipo: 'catalogo' },
    ],
  },

  MC_POC_COMPLIANCE: {
    dependeDe: [
      { campo: 'idAnalista', tabela: 'MC_CAD_ANALISTA', tipo: 'catalogo' },
      { campo: 'idConsultoriaEspecializada', tabela: 'MC_CAD_CONSULTORIA_ESPECIALIZADA', tipo: 'catalogo' },
      { campo: 'idProposta', tabela: 'MC_POC_PROPOSTA', tipo: 'estrutural' },
      { campo: 'idSituacao', tabela: 'MC_CAD_SITUACAO', tipo: 'catalogo' },
    ],
  },

  MC_POC_ENDIVIDAMENTO: {
    dependeDe: [
      { campo: 'idConsultoriaEspecializada', tabela: 'MC_CAD_CONSULTORIA_ESPECIALIZADA', tipo: 'catalogo' },
      { campo: 'idProposta', tabela: 'MC_POC_PROPOSTA', tipo: 'estrutural' },
    ],
  },

  MC_POC_ENDIVIDAMENTO_LANCAMENTO: {
    dependeDe: [
      { campo: 'idConsultoriaEspecializada', tabela: 'MC_CAD_CONSULTORIA_ESPECIALIZADA', tipo: 'catalogo' },
      { campo: 'idEndividamento', tabela: 'MC_POC_ENDIVIDAMENTO', tipo: 'estrutural' },
      { campo: 'idInstituicao', tabela: 'MC_CAD_INSTITUICAO', tipo: 'catalogo' },
      { campo: 'idModalidade', tabela: 'MC_CAD_MODALIDADE', tipo: 'catalogo' },
      { campo: 'idProspect', tabela: 'MC_PRT_PROSPECT', tipo: 'estrutural' },
    ],
  },

  MC_POC_FATURAMENTO: {
    dependeDe: [
      { campo: 'idConsultoriaEspecializada', tabela: 'MC_CAD_CONSULTORIA_ESPECIALIZADA', tipo: 'catalogo' },
      { campo: 'idProposta', tabela: 'MC_POC_PROPOSTA', tipo: 'estrutural' },
    ],
  },

  MC_POC_FROTA: {
    dependeDe: [
      { campo: 'idConsultoriaEspecializada', tabela: 'MC_CAD_CONSULTORIA_ESPECIALIZADA', tipo: 'catalogo' },
      { campo: 'idProposta', tabela: 'MC_POC_PROPOSTA', tipo: 'estrutural' },
    ],
  },

  MC_POC_FUNDO: {
    dependeDe: [
      { campo: 'idConsultoriaEspecializada', tabela: 'MC_CAD_CONSULTORIA_ESPECIALIZADA', tipo: 'catalogo' },
      { campo: 'idFundo', tabela: 'MC_CAD_FUNDO', tipo: 'catalogo' },
      { campo: 'IdPorteEmpresaAdm', tabela: 'MC_CAD_CLASSIFICACAO_EMPRESA', tipo: 'catalogo' },
      { campo: 'idProposta', tabela: 'MC_POC_PROPOSTA', tipo: 'estrutural' },
    ],
  },

  MC_POC_GARANTIA_REGRA: {
    dependeDe: [
      { campo: 'idConsultoriaEspecializada', tabela: 'MC_CAD_CONSULTORIA_ESPECIALIZADA', tipo: 'catalogo' },
      { campo: 'idFocoNegocio', tabela: 'MC_CAD_FOCO_NEGOCIO', tipo: 'catalogo' },
      { campo: 'idFundo', tabela: 'MC_CAD_FUNDO', tipo: 'catalogo' },
      { campo: 'idGarantiaCategoria', tabela: 'MC_CAD_GARANTIA_CATEGORIA', tipo: 'catalogo' },
      { campo: 'idGrupoProduto', tabela: 'MC_CAD_GRUPO_PRODUTO', tipo: 'catalogo' },
      // idPocComite -> MC_POC_COMITE (nullable): cruza pra fase comitê, mesmo padrão
      // do idComite de MC_POC_PROPOSTA acima.
      { campo: 'idPocComite', tabela: 'MC_POC_COMITE', tipo: 'estrutural' },
      // idProposta (nullable) e idComiteProdutoOperacao (nullable) existem como
      // colunas mas não têm constraint de FK física no schema real — mesmo
      // tratamento não resolvido já aplicado a MC_AGE_ACOMPANHAMENTO.idCedente.
    ],
  },

  MC_POC_GRUPO_FATURAMENTO: {
    dependeDe: [
      { campo: 'idConsultoriaEspecializada', tabela: 'MC_CAD_CONSULTORIA_ESPECIALIZADA', tipo: 'catalogo' },
      { campo: 'idGrupoEconomico', tabela: 'MC_CAD_GRUPO_ECONOMICO', tipo: 'catalogo' },
      { campo: 'idProposta', tabela: 'MC_POC_PROPOSTA', tipo: 'estrutural' },
    ],
  },

  MC_POC_GRUPO_FATURAMENTO_INTERCOMPANY: {
    dependeDe: [
      { campo: 'idConsultoriaEspecializada', tabela: 'MC_CAD_CONSULTORIA_ESPECIALIZADA', tipo: 'catalogo' },
      { campo: 'idGrupoEconomico', tabela: 'MC_CAD_GRUPO_ECONOMICO', tipo: 'catalogo' },
      { campo: 'idProposta', tabela: 'MC_POC_PROPOSTA', tipo: 'estrutural' },
    ],
  },

  // --- Família MC_POC_INCORP_* ---
  MC_POC_INCORP_OBRA_ANDAMENTO: {
    dependeDe: [
      { campo: 'idConsultoriaEspecializada', tabela: 'MC_CAD_CONSULTORIA_ESPECIALIZADA', tipo: 'catalogo' },
      { campo: 'idProposta', tabela: 'MC_POC_PROPOSTA', tipo: 'estrutural' },
    ],
  },

  MC_POC_INCORP_OBRA_CONCLUIDA: {
    dependeDe: [
      { campo: 'idConsultoriaEspecializada', tabela: 'MC_CAD_CONSULTORIA_ESPECIALIZADA', tipo: 'catalogo' },
      { campo: 'idProposta', tabela: 'MC_POC_PROPOSTA', tipo: 'estrutural' },
    ],
  },

  MC_POC_INCORP_RESUMO: {
    // Peculiaridade: não tem idProposta (nem qualquer FK além de catálogo) — só
    // `descricao`/`descricaoGrupo`, mais próxima de uma lista compartilhada do que
    // de um dado "pertencente" a uma proposta específica (quem liga à proposta é
    // MC_POC_INCORP_RESUMO_RESULTADO, abaixo). Registrado em docs/documentacao.md
    // como ponto de atenção pra quem implementar o INSERT de verdade desta tabela
    // (cópia ingênua por cedente pode duplicar linhas que deveriam ser
    // compartilhadas) — não é uma dúvida bloqueante da etapa de mapeamento.
    dependeDe: [
      { campo: 'idConsultoriaEspecializada', tabela: 'MC_CAD_CONSULTORIA_ESPECIALIZADA', tipo: 'catalogo' },
    ],
  },

  MC_POC_INCORP_RESUMO_RESULTADO: {
    dependeDe: [
      { campo: 'idConsultoriaEspecializada', tabela: 'MC_CAD_CONSULTORIA_ESPECIALIZADA', tipo: 'catalogo' },
      { campo: 'idIncorpResumo', tabela: 'MC_POC_INCORP_RESUMO', tipo: 'estrutural' },
      { campo: 'idProposta', tabela: 'MC_POC_PROPOSTA', tipo: 'estrutural' },
    ],
  },

  MC_POC_LANDBANK: {
    dependeDe: [
      { campo: 'idConsultoriaEspecializada', tabela: 'MC_CAD_CONSULTORIA_ESPECIALIZADA', tipo: 'catalogo' },
      { campo: 'idProposta', tabela: 'MC_POC_PROPOSTA', tipo: 'estrutural' },
    ],
  },

  MC_POC_MEIO_CIRCULANTE: {
    dependeDe: [
      { campo: 'idConsultoriaEspecializada', tabela: 'MC_CAD_CONSULTORIA_ESPECIALIZADA', tipo: 'catalogo' },
      { campo: 'idGrupoEconomico', tabela: 'MC_CAD_GRUPO_ECONOMICO', tipo: 'catalogo' },
      { campo: 'idSetor', tabela: 'MC_CAD_SETOR', tipo: 'catalogo' },
      { campo: 'idProposta', tabela: 'MC_POC_PROPOSTA', tipo: 'estrutural' },
      { campo: 'idProspect', tabela: 'MC_PRT_PROSPECT', tipo: 'estrutural' },
    ],
  },

  MC_POC_PARAMETRO_CLAIM: {
    dependeDe: [
      { campo: 'idConsultoriaEspecializada', tabela: 'MC_CAD_CONSULTORIA_ESPECIALIZADA', tipo: 'catalogo' },
      { campo: 'idProposta', tabela: 'MC_POC_PROPOSTA', tipo: 'estrutural' },
      { campo: 'idPropostaAdvogado', tabela: 'MC_POC_PROPOSTA', tipo: 'estrutural' },
    ],
  },

  MC_POC_PARAMETRO_SETOR: {
    dependeDe: [
      { campo: 'idConsultoriaEspecializada', tabela: 'MC_CAD_CONSULTORIA_ESPECIALIZADA', tipo: 'catalogo' },
      { campo: 'idProposta', tabela: 'MC_POC_PROPOSTA', tipo: 'estrutural' },
      { campo: 'idRamoAtividade', tabela: 'MC_CAD_RAMO_ATIVIDADE', tipo: 'catalogo' },
      { campo: 'idSetor', tabela: 'MC_CAD_SETOR', tipo: 'catalogo' },
    ],
  },

  MC_POC_PLEITO: {
    dependeDe: [
      { campo: 'idConsultoriaEspecializada', tabela: 'MC_CAD_CONSULTORIA_ESPECIALIZADA', tipo: 'catalogo' },
      { campo: 'idProposta', tabela: 'MC_POC_PROPOSTA', tipo: 'estrutural' },
    ],
  },

  MC_POC_PLEITO_BOLETO: {
    dependeDe: [
      { campo: 'idConsultoriaEspecializada', tabela: 'MC_CAD_CONSULTORIA_ESPECIALIZADA', tipo: 'catalogo' },
      { campo: 'idProposta', tabela: 'MC_POC_PROPOSTA', tipo: 'estrutural' },
    ],
  },

  MC_POC_PLEITO_GARANTIA: {
    dependeDe: [
      { campo: 'idConsultoriaEspecializada', tabela: 'MC_CAD_CONSULTORIA_ESPECIALIZADA', tipo: 'catalogo' },
      { campo: 'idFormulario', tabela: 'MC_CAD_FORMULARIO', tipo: 'catalogo' },
      { campo: 'idFormularioCampo', tabela: 'MC_CAD_FORMULARIO_CAMPO', tipo: 'catalogo' },
      { campo: 'idGarantiaCategoria', tabela: 'MC_CAD_GARANTIA_CATEGORIA', tipo: 'catalogo' },
      { campo: 'idProposta', tabela: 'MC_POC_PROPOSTA', tipo: 'estrutural' },
    ],
  },

  MC_POC_PLEITO_PRODUTO: {
    dependeDe: [
      { campo: 'idConsultoriaEspecializada', tabela: 'MC_CAD_CONSULTORIA_ESPECIALIZADA', tipo: 'catalogo' },
      { campo: 'idProduto', tabela: 'MC_CAD_PRODUTO', tipo: 'catalogo' },
      { campo: 'idProposta', tabela: 'MC_POC_PROPOSTA', tipo: 'estrutural' },
    ],
  },

  MC_POC_PRODUTO_GARANTIA_REGRA: {
    dependeDe: [
      { campo: 'idConsultoriaEspecializada', tabela: 'MC_CAD_CONSULTORIA_ESPECIALIZADA', tipo: 'catalogo' },
      // idComiteLimiteProduto -> MC_POC_COMITE_LIMITE_PRODUTO (NOT NULL): cruza pra
      // fase comitê, mesmo padrão do idComite/idPocComite acima.
      { campo: 'idComiteLimiteProduto', tabela: 'MC_POC_COMITE_LIMITE_PRODUTO', tipo: 'estrutural' },
      { campo: 'idFundo', tabela: 'MC_CAD_FUNDO', tipo: 'catalogo' },
      { campo: 'idGarantiaCategoria', tabela: 'MC_CAD_GARANTIA_CATEGORIA', tipo: 'catalogo' },
    ],
  },

  MC_POC_PROPOSTA_HIST: {
    dependeDe: [
      { campo: 'idConsultoriaEspecializada', tabela: 'MC_CAD_CONSULTORIA_ESPECIALIZADA', tipo: 'catalogo' },
      { campo: 'idPropostaAnterior', tabela: 'MC_POC_PROPOSTA', tipo: 'estrutural' },
      { campo: 'idPropostaNova', tabela: 'MC_POC_PROPOSTA', tipo: 'estrutural' },
    ],
  },

  MC_POC_PROSPECT: {
    dependeDe: [
      { campo: 'idConsultoriaEspecializada', tabela: 'MC_CAD_CONSULTORIA_ESPECIALIZADA', tipo: 'catalogo' },
      { campo: 'idProposta', tabela: 'MC_POC_PROPOSTA', tipo: 'estrutural' },
      { campo: 'idProspect', tabela: 'MC_PRT_PROSPECT', tipo: 'estrutural' },
    ],
  },

  MC_POC_PROSPECT_FATURAMENTO: {
    dependeDe: [
      { campo: 'idConsultoriaEspecializada', tabela: 'MC_CAD_CONSULTORIA_ESPECIALIZADA', tipo: 'catalogo' },
      { campo: 'idProposta', tabela: 'MC_POC_PROPOSTA', tipo: 'estrutural' },
      { campo: 'idProspect', tabela: 'MC_PRT_PROSPECT', tipo: 'estrutural' },
    ],
  },

  MC_POC_PROSPECT_FATURAMENTO_INTERCOMPANY: {
    dependeDe: [
      { campo: 'idConsultoriaEspecializada', tabela: 'MC_CAD_CONSULTORIA_ESPECIALIZADA', tipo: 'catalogo' },
      { campo: 'idProposta', tabela: 'MC_POC_PROPOSTA', tipo: 'estrutural' },
      { campo: 'idProspect', tabela: 'MC_PRT_PROSPECT', tipo: 'estrutural' },
    ],
  },

  // --- Família MC_POC_RATING_* --- ATENÇÃO: idRatingIndicador (NOT NULL) e
  // idRatingIndicadorItem (nullable) de MC_POC_RATING_INDICADOR_RESULTADO apontam
  // pra MC_RAT_RATING_INDICADOR(_ITEM) — tabelas de catálogo aparentes, mas com
  // prefixo `MC_RAT_`, fora do padrão `MC_CAD_*` que `classificarTabelaCedente`
  // sabe resolver como catálogo. Como NENHUMA das duas apareceu em lugar nenhum da
  // tarefa original, classificar essas duas tabelas é uma decisão nova de escopo —
  // registrada como dúvida bloqueante em duvidas.md (regra 8 do AGENTE.md), não
  // decidida sozinho aqui. Por isso as arestas pra essas duas tabelas ficam DE FORA
  // deste mapeamento por enquanto (não resolvidas), e a tabela toda fica sem poder
  // ser inserida em HML até a resposta chegar (idRatingIndicador é NOT NULL).
  MC_POC_RATING_INDICADOR_RESULTADO: {
    dependeDe: [
      { campo: 'idConsultoriaEspecializada', tabela: 'MC_CAD_CONSULTORIA_ESPECIALIZADA', tipo: 'catalogo' },
      { campo: 'idProposta', tabela: 'MC_POC_PROPOSTA', tipo: 'estrutural' },
      // idRatingIndicador / idRatingIndicadorItem -> MC_RAT_RATING_INDICADOR(_ITEM):
      // pendente, ver duvidas.md.
    ],
  },

  MC_POC_RATING_RESULTADO: {
    dependeDe: [
      { campo: 'idClassificacaoEmpresa', tabela: 'MC_CAD_CLASSIFICACAO_EMPRESA', tipo: 'catalogo' },
      { campo: 'idConsultoriaEspecializada', tabela: 'MC_CAD_CONSULTORIA_ESPECIALIZADA', tipo: 'catalogo' },
      { campo: 'idProposta', tabela: 'MC_POC_PROPOSTA', tipo: 'estrutural' },
    ],
  },

  MC_POC_RENOVACAO: {
    dependeDe: [
      { campo: 'idConsultoriaEspecializada', tabela: 'MC_CAD_CONSULTORIA_ESPECIALIZADA', tipo: 'catalogo' },
      { campo: 'idProposta', tabela: 'MC_POC_PROPOSTA', tipo: 'estrutural' },
    ],
  },

  // --- Família MC_POC_RESTRIT* / MC_POC_RESTRITIVO_* --- MC_POC_RESTRIT (a tabela
  // com esse nome exato, sem sufixo) é a âncora da sub-família RESTRIT_*; as
  // RESTRITIVO_* dependem só de MC_POC_PROPOSTA diretamente (não de MC_POC_RESTRIT).
  MC_POC_RESTRIT: {
    dependeDe: [
      { campo: 'idConsultaExterna', tabela: 'MC_CAD_CONSULTA_EXTERNA', tipo: 'catalogo' },
      { campo: 'idConsultoriaEspecializada', tabela: 'MC_CAD_CONSULTORIA_ESPECIALIZADA', tipo: 'catalogo' },
      { campo: 'idProposta', tabela: 'MC_POC_PROPOSTA', tipo: 'estrutural' },
      { campo: 'idProspect', tabela: 'MC_PRT_PROSPECT', tipo: 'estrutural' },
    ],
  },

  MC_POC_RESTRIT_ACAO_JUDICIAL: {
    dependeDe: [
      { campo: 'idConsultoriaEspecializada', tabela: 'MC_CAD_CONSULTORIA_ESPECIALIZADA', tipo: 'catalogo' },
      { campo: 'idPropostaRestritivo', tabela: 'MC_POC_RESTRIT', tipo: 'estrutural' },
    ],
  },

  MC_POC_RESTRIT_DIV_VENCIDA: {
    dependeDe: [
      { campo: 'idConsultoriaEspecializada', tabela: 'MC_CAD_CONSULTORIA_ESPECIALIZADA', tipo: 'catalogo' },
      { campo: 'idPropostaRestritivo', tabela: 'MC_POC_RESTRIT', tipo: 'estrutural' },
    ],
  },

  MC_POC_RESTRIT_FALENCIA: {
    dependeDe: [
      { campo: 'idConsultoriaEspecializada', tabela: 'MC_CAD_CONSULTORIA_ESPECIALIZADA', tipo: 'catalogo' },
      { campo: 'idPropostaRestritivo', tabela: 'MC_POC_RESTRIT', tipo: 'estrutural' },
    ],
  },

  MC_POC_RESTRIT_PEFIN: {
    dependeDe: [
      { campo: 'idConsultoriaEspecializada', tabela: 'MC_CAD_CONSULTORIA_ESPECIALIZADA', tipo: 'catalogo' },
      { campo: 'idPropostaRestritivo', tabela: 'MC_POC_RESTRIT', tipo: 'estrutural' },
    ],
  },

  MC_POC_RESTRIT_PROTESTO: {
    dependeDe: [
      { campo: 'idConsultoriaEspecializada', tabela: 'MC_CAD_CONSULTORIA_ESPECIALIZADA', tipo: 'catalogo' },
      { campo: 'idPropostaRestritivo', tabela: 'MC_POC_RESTRIT', tipo: 'estrutural' },
    ],
  },

  MC_POC_RESTRIT_RECHEQUE: {
    dependeDe: [
      { campo: 'idConsultoriaEspecializada', tabela: 'MC_CAD_CONSULTORIA_ESPECIALIZADA', tipo: 'catalogo' },
      { campo: 'idPropostaRestritivo', tabela: 'MC_POC_RESTRIT', tipo: 'estrutural' },
    ],
  },

  MC_POC_RESTRIT_REFIN: {
    dependeDe: [
      { campo: 'idConsultoriaEspecializada', tabela: 'MC_CAD_CONSULTORIA_ESPECIALIZADA', tipo: 'catalogo' },
      { campo: 'idPropostaRestritivo', tabela: 'MC_POC_RESTRIT', tipo: 'estrutural' },
    ],
  },

  MC_POC_RESTRIT_TRIBUTO_DIVIDA: {
    dependeDe: [
      { campo: 'idConsultoriaEspecializada', tabela: 'MC_CAD_CONSULTORIA_ESPECIALIZADA', tipo: 'catalogo' },
      { campo: 'idPropostaRestritivo', tabela: 'MC_POC_RESTRIT', tipo: 'estrutural' },
    ],
  },

  MC_POC_RESTRIT_ULTIMAS_CONSULTAS: {
    dependeDe: [
      { campo: 'idConsultoriaEspecializada', tabela: 'MC_CAD_CONSULTORIA_ESPECIALIZADA', tipo: 'catalogo' },
      { campo: 'idPropostaRestritivo', tabela: 'MC_POC_RESTRIT', tipo: 'estrutural' },
    ],
  },

  MC_POC_RESTRITIVO_EVOL_PROTESTO_ANO: {
    dependeDe: [
      { campo: 'idConsultaExterna', tabela: 'MC_CAD_CONSULTA_EXTERNA', tipo: 'catalogo' },
      { campo: 'idConsultoriaEspecializada', tabela: 'MC_CAD_CONSULTORIA_ESPECIALIZADA', tipo: 'catalogo' },
      { campo: 'idProposta', tabela: 'MC_POC_PROPOSTA', tipo: 'estrutural' },
    ],
  },

  MC_POC_RESTRITIVO_EVOL_PROTESTO_MES: {
    dependeDe: [
      { campo: 'idConsultaExterna', tabela: 'MC_CAD_CONSULTA_EXTERNA', tipo: 'catalogo' },
      { campo: 'idConsultoriaEspecializada', tabela: 'MC_CAD_CONSULTORIA_ESPECIALIZADA', tipo: 'catalogo' },
      { campo: 'idProposta', tabela: 'MC_POC_PROPOSTA', tipo: 'estrutural' },
    ],
  },

  MC_POC_RESTRITIVO_PROTESTO: {
    dependeDe: [
      { campo: 'idConsultaExterna', tabela: 'MC_CAD_CONSULTA_EXTERNA', tipo: 'catalogo' },
      { campo: 'idConsultoriaEspecializada', tabela: 'MC_CAD_CONSULTORIA_ESPECIALIZADA', tipo: 'catalogo' },
      { campo: 'idProposta', tabela: 'MC_POC_PROPOSTA', tipo: 'estrutural' },
    ],
  },

  MC_POC_RESTRITIVO_PROTESTO_ESTADO: {
    dependeDe: [
      { campo: 'idConsultaExterna', tabela: 'MC_CAD_CONSULTA_EXTERNA', tipo: 'catalogo' },
      { campo: 'idConsultoriaEspecializada', tabela: 'MC_CAD_CONSULTORIA_ESPECIALIZADA', tipo: 'catalogo' },
      { campo: 'idProposta', tabela: 'MC_POC_PROPOSTA', tipo: 'estrutural' },
    ],
  },

  MC_POC_RESTRITIVO_TRAB_ESCRAVO: {
    dependeDe: [
      { campo: 'idConsultaExterna', tabela: 'MC_CAD_CONSULTA_EXTERNA', tipo: 'catalogo' },
      { campo: 'idConsultoriaEspecializada', tabela: 'MC_CAD_CONSULTORIA_ESPECIALIZADA', tipo: 'catalogo' },
      { campo: 'idProposta', tabela: 'MC_POC_PROPOSTA', tipo: 'estrutural' },
    ],
  },

  MC_POC_RESTRITIVO_TRIBUTO_DIVIDA: {
    dependeDe: [
      { campo: 'idConsultaExterna', tabela: 'MC_CAD_CONSULTA_EXTERNA', tipo: 'catalogo' },
      { campo: 'idConsultoriaEspecializada', tabela: 'MC_CAD_CONSULTORIA_ESPECIALIZADA', tipo: 'catalogo' },
      { campo: 'idProposta', tabela: 'MC_POC_PROPOSTA', tipo: 'estrutural' },
    ],
  },
};

export default MAPEAMENTO_CEDENTE_PROSPECT;
