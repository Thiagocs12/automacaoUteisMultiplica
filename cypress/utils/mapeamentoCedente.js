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
// Tabelas ainda fora deste arquivo (fases poc/comitê/cedente) entram em ciclos
// futuros, seguindo o mesmo padrão de investigação real documentado abaixo.

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

export default MAPEAMENTO_CEDENTE_PROSPECT;
