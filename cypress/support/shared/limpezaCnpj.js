// arquivo: limpezaCnpj.js
//
// Lógica pura (sem dependência do global `Cypress`) da limpeza em HML de tudo
// o que existe sobre um CNPJ (pessoa, prospect, proposta/POC, comitê
// exclusivo, cedente e tudo o que os referencia), usada pelo script
// `scripts/limparCnpjHml.cjs`. A exclusão em si (grafo estrutural, cascata por
// FK, ordem e DELETEs) é o núcleo de `exclusaoEstrutural.js`.

import { normalizarDocumento, montarCondicaoDocumentoIgual } from './clonagemCedente.js';

export const AMBIENTE_LIMPEZA_CNPJ = 'hml';

export const TABELA_PESSOA = 'MC_CAD_PESSOA';
export const TABELA_PROSPECT = 'MC_PRT_PROSPECT';
export const TABELA_PROSPECT_PROPOSTA = 'MC_POC_PROSPECT';
export const TABELA_PROPOSTA = 'MC_POC_PROPOSTA';
export const TABELA_COMITE = 'MC_CAD_COMITE';
export const TABELA_CEDENTE = 'MC_CED_CEDENTE';

const PESOS_DV1_CNPJ = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
const PESOS_DV2_CNPJ = [6, ...PESOS_DV1_CNPJ];

const digitoVerificadorCnpj = (digitos, pesos) => {
  const soma = pesos.reduce((acumulado, peso, indice) => acumulado + Number(digitos[indice]) * peso, 0);
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
};

/**
 * @description Normaliza (só dígitos) e valida um CNPJ: 14 dígitos, não
 * todos iguais e dígitos verificadores corretos.
 * @param {string|null|undefined} valor - com ou sem máscara.
 * @returns {{ok: true, cnpj: string}|{ok: false, motivo: string}}
 */
export const validarCnpj = (valor) => {
  if (valor == null || String(valor).trim() === '') {
    return { ok: false, motivo: 'CNPJ não informado. Uso: node scripts/limparCnpjHml.cjs <cnpj> [--simular]' };
  }
  if (/[^\d./\-\s]/.test(String(valor))) {
    return { ok: false, motivo: `CNPJ inválido: "${valor}" contém caracteres que não são dígitos nem máscara.` };
  }
  const cnpj = normalizarDocumento(valor) ?? '';
  if (cnpj.length !== 14) return { ok: false, motivo: `CNPJ inválido: "${valor}" não tem 14 dígitos.` };
  if (/^(\d)\1{13}$/.test(cnpj)) return { ok: false, motivo: `CNPJ inválido: "${valor}" tem todos os dígitos iguais.` };

  const dv1 = digitoVerificadorCnpj(cnpj, PESOS_DV1_CNPJ);
  const dv2 = digitoVerificadorCnpj(cnpj, PESOS_DV2_CNPJ);
  if (Number(cnpj[12]) !== dv1 || Number(cnpj[13]) !== dv2) {
    return { ok: false, motivo: `CNPJ inválido: "${valor}" tem dígitos verificadores incorretos.` };
  }
  return { ok: true, cnpj };
};

/**
 * @description Lê os argumentos de linha de comando do script de limpeza:
 * o primeiro argumento posicional é o CNPJ; `--ambiente <nome>` (padrão
 * `hml`) e `--simular` (só descobre e conta, não altera nada) são opcionais.
 * @param {string[]} argumentos - `process.argv.slice(2)`.
 * @returns {{cnpj: string|undefined, ambiente: string, simular: boolean}}
 */
export const interpretarArgumentosLimpeza = (argumentos) => {
  const lista = [...(argumentos ?? [])];
  let ambiente = AMBIENTE_LIMPEZA_CNPJ;
  let simular = false;
  const posicionais = [];

  for (let indice = 0; indice < lista.length; indice += 1) {
    const argumento = lista[indice];
    if (argumento === '--simular') simular = true;
    else if (argumento === '--ambiente') {
      ambiente = lista[indice + 1] ?? '';
      indice += 1;
    } else if (argumento.startsWith('--ambiente=')) ambiente = argumento.slice('--ambiente='.length);
    else posicionais.push(argumento);
  }

  return { cnpj: posicionais[0], ambiente, simular };
};

const normalizarUrl = (url) => String(url ?? '').trim().replace(/\/+$/, '').toLowerCase();
const normalizarTexto = (texto) => String(texto ?? '').trim().toLowerCase();

/**
 * @description Garante que a limpeza só roda contra HML: o ambiente pedido
 * tem de ser `hml`, as variáveis de HML usadas pelo script precisam existir e
 * não podem apontar para os mesmos destinos das variáveis de PROD (proteção
 * contra um `.env` trocado). Não lê nem devolve nenhum valor de credencial.
 * @param {{ambiente: string, env: Object<string, string|undefined>}} contexto
 * @returns {void}
 * @throws {Error} descritivo, antes de qualquer conexão.
 */
export const validarAlvoHml = ({ ambiente, env }) => {
  if (ambiente !== AMBIENTE_LIMPEZA_CNPJ) {
    throw new Error(
      `Ambiente "${ambiente}" recusado: a limpeza de CNPJ só roda em ${AMBIENTE_LIMPEZA_CNPJ}. Nada foi alterado.`,
    );
  }

  const obrigatorias = [
    'HOMOLOG_DB_HOST',
    'HOMOLOG_DB_NAME',
    'HOMOLOG_DB_PORT',
    'HML_API_BASE_URL',
    'HML_API_LOGIN_URL',
    'HML_API_USERNAME',
    'HML_API_PASSWORD',
  ];
  const ausentes = obrigatorias.filter((nome) => !String(env?.[nome] ?? '').trim());
  if (ausentes.length) {
    throw new Error(`Variáveis de HML ausentes no .env: ${ausentes.join(', ')}. Nada foi alterado.`);
  }

  const mesmoBanco =
    normalizarTexto(env.PROD_DB_HOST) &&
    normalizarTexto(env.HOMOLOG_DB_HOST) === normalizarTexto(env.PROD_DB_HOST) &&
    normalizarTexto(env.HOMOLOG_DB_NAME) === normalizarTexto(env.PROD_DB_NAME);
  if (mesmoBanco) {
    throw new Error('HOMOLOG_DB_HOST/HOMOLOG_DB_NAME apontam para o mesmo banco de PROD_DB_*. Nada foi alterado.');
  }

  const mesmaApi = normalizarUrl(env.PROD_API_BASE_URL) && normalizarUrl(env.HML_API_BASE_URL) === normalizarUrl(env.PROD_API_BASE_URL);
  if (mesmaApi) {
    throw new Error('HML_API_BASE_URL aponta para a mesma API de PROD_API_BASE_URL. Nada foi alterado.');
  }
};

const ids = (linhas, coluna = 'id') => [
  ...new Set((linhas ?? []).map((linha) => linha[coluna]).filter((valor) => valor != null).map(Number)),
];

/**
 * @description Roteiro (só leitura) que localiza as raízes de um CNPJ em HML:
 * pessoa(s) com o CNPJ (ignorando máscara), prospects e cedentes dessas
 * pessoas, e as propostas ligadas aos prospects (`MC_POC_PROSPECT`) ou
 * apontadas pelo próprio cedente (`idProposta`).
 * @param {string} cnpj - já validado (só dígitos).
 * @returns {Generator<{sql: string}, {pessoas: number[], prospects: number[], propostas: number[], cedentes: number[]}, Object[]>}
 */
export function* roteiroRaizesPorCnpj(cnpj) {
  const pessoas = ids(
    yield { sql: `SELECT id FROM ${TABELA_PESSOA} WHERE ${montarCondicaoDocumentoIgual('cnpjCpf', cnpj)}` },
  );
  if (!pessoas.length) return { pessoas: [], prospects: [], propostas: [], cedentes: [] };

  const prospects = ids(yield { sql: `SELECT id FROM ${TABELA_PROSPECT} WHERE idPessoa IN (${pessoas.join(', ')})` });
  const linhasCedente = yield {
    sql: `SELECT id, idProposta FROM ${TABELA_CEDENTE} WHERE idPessoa IN (${pessoas.join(', ')})`,
  };
  const cedentes = ids(linhasCedente);

  const propostasDosProspects = prospects.length
    ? ids(
        yield {
          sql: `SELECT DISTINCT idProposta FROM ${TABELA_PROSPECT_PROPOSTA} WHERE idProspect IN (${prospects.join(', ')})`,
        },
        'idProposta',
      )
    : [];
  const candidatas = [...new Set([...propostasDosProspects, ...ids(linhasCedente, 'idProposta')])];
  const propostas = candidatas.length
    ? ids(yield { sql: `SELECT id FROM ${TABELA_PROPOSTA} WHERE id IN (${candidatas.join(', ')})` })
    : [];

  return { pessoas, prospects, propostas, cedentes };
}

/**
 * @description Sementes do grafo estrutural mapeado (mesmo formato usado por
 * `roteiroDescobertaGrafoEstrutural`) a partir das raízes de um CNPJ.
 * Comitê nunca é semente: pode ser compartilhado por propostas de outros
 * CNPJs e só entra na exclusão se for exclusivo (ver
 * `roteiroIdsSemReferenciaExterna`).
 * @param {{prospects: number[], propostas: number[], cedentes: number[]}} raizes
 * @returns {Object<string, Array<{id: number}>>}
 */
export const montarSementesLimpezaCnpj = ({ prospects, propostas, cedentes }) => {
  const linhas = (lista) => lista.map((id) => ({ id }));
  return {
    ...(cedentes?.length ? { [TABELA_CEDENTE]: linhas(cedentes) } : {}),
    ...(prospects?.length ? { [TABELA_PROSPECT]: linhas(prospects) } : {}),
    ...(propostas?.length ? { [TABELA_PROPOSTA]: linhas(propostas) } : {}),
  };
};

/**
 * @description `true` quando as raízes não encontraram nada para o CNPJ.
 * @param {{pessoas: number[]}} raizes
 * @returns {boolean}
 */
export const nadaAApagar = (raizes) => !raizes?.pessoas?.length;

export const STATUS_ESTEIRA_ENCERRADA = ['FINALIZADO', 'CANCELADO', 'REMOVIDO'];
const STATUS_ETAPA_EM_ANDAMENTO = /^(CRIADO|EXECUTANDO)$/i;

export const ACAO_ESTEIRA_CANCELAR = 'cancelar';
export const ACAO_ESTEIRA_JA_ENCERRADA = 'ja-encerrada';
export const ACAO_ESTEIRA_BLOQUEADA = 'bloqueada';

/**
 * @description Decide o que fazer com uma esteira do Multiflow ligada ao CNPJ
 * (resposta do `etapa/anyFiltro`, que traz só a última etapa): já encerrada
 * (status final) não precisa de nada; com a última etapa em andamento
 * (`CRIADO`/`EXECUTANDO`) é cancelada por `finalizaEsteira` (esteira
 * `FINALIZADO`, etapa `CANCELADO`); qualquer outro estado (ex.: aguardando
 * retorno de etapa central) é bloqueio — finalizar nesse estado faria o
 * Multiflow abrir a esteira vinculada do modelo, então a limpeza para.
 * @param {{status?: string, etapas?: Array<{status?: string}>}} esteira
 * @returns {string} um dos valores `ACAO_ESTEIRA_*`.
 */
export const classificarEsteiraParaCancelamento = (esteira) => {
  const status = String(esteira?.status ?? '').toUpperCase();
  if (STATUS_ESTEIRA_ENCERRADA.includes(status)) return ACAO_ESTEIRA_JA_ENCERRADA;
  const etapas = esteira?.etapas ?? [];
  const ultimaEtapa = etapas[etapas.length - 1];
  if (ultimaEtapa && STATUS_ETAPA_EM_ANDAMENTO.test(String(ultimaEtapa.status ?? ''))) return ACAO_ESTEIRA_CANCELAR;
  return ACAO_ESTEIRA_BLOQUEADA;
};

/**
 * @description `true` quando a esteira (resposta do `pesquisarporid`) não
 * está mais em andamento: status final e nenhuma etapa `CRIADO`/`EXECUTANDO`.
 * @param {{status?: string, etapas?: Array<{status?: string}>}} esteira
 * @returns {boolean}
 */
export const esteiraEncerrada = (esteira) =>
  STATUS_ESTEIRA_ENCERRADA.includes(String(esteira?.status ?? '').toUpperCase()) &&
  !(esteira?.etapas ?? []).some((etapa) => STATUS_ETAPA_EM_ANDAMENTO.test(String(etapa.status ?? '')));

const removerAcentos = (texto) => String(texto ?? '').normalize('NFD').replace(/[^\p{ASCII}]/gu, '');
const escaparRegex = (texto) => texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * @description Mesma comparação de grupo que o Multiflow faz com o token
 * (`AccessTokenDTO.contemGroup`): sem acentos, sem a primeira `/` do caminho
 * do grupo no Keycloak, sem diferenciar maiúsculas, aceitando o nome no fim
 * do caminho e a variante sem espaços.
 * @param {string[]} gruposToken - claim `groups` do token.
 * @param {string} nomeGrupo - grupo configurado no modelo da esteira.
 * @returns {boolean}
 */
export const tokenContemGrupo = (gruposToken, nomeGrupo) => {
  const nome = removerAcentos(nomeGrupo);
  if (!nome.trim()) return false;
  const regex = new RegExp(
    `(^/${escaparRegex(nome)}$)|(${escaparRegex(nome)}$)|(${escaparRegex(nome.replace(/ /g, ''))}$)`,
    'i',
  );
  return (gruposToken ?? [])
    .map((grupo) => removerAcentos(grupo).replace('/', ''))
    .some((grupo) => regex.test(grupo) || regex.test(grupo.replace(/ /g, '').trim()));
};

/**
 * @description Diz se o usuário do token pode finalizar a esteira pela regra
 * do Multiflow (`AcessoComponent.verificaPermissaoModifyEsteiraAndEtapa`):
 * ser gestor do modelo da esteira ou operador da subetapa da última etapa.
 * @param {string[]} gruposToken
 * @param {Object} esteira - resposta do `pesquisarporid`.
 * @returns {{permitido: boolean, gestores: string[], operadores: string[]}}
 */
export const verificarPermissaoFinalizarEsteira = (gruposToken, esteira) => {
  const gestores = (esteira?.modeloEsteira?.gestores ?? []).map((item) => item.grupo).filter(Boolean);
  const etapas = esteira?.etapas ?? [];
  const operadores = (etapas[etapas.length - 1]?.origem?.modeloSubEtapa?.operadores ?? [])
    .map((item) => item.grupo)
    .filter(Boolean);
  const permitido = [...gestores, ...operadores].some((grupo) => tokenContemGrupo(gruposToken, grupo));
  return { permitido, gestores, operadores };
};

/**
 * @description Lê a claim `groups` de um token JWT (sem validar assinatura:
 * só para antecipar a checagem de permissão que o próprio serviço fará).
 * @param {string} token
 * @returns {string[]}
 */
export const lerGruposDoToken = (token) => {
  try {
    const carga = JSON.parse(Buffer.from(String(token).split('.')[1] ?? '', 'base64url').toString('utf8'));
    return Array.isArray(carga.groups) ? carga.groups : [];
  } catch {
    return [];
  }
};

/**
 * @description Corpos de busca do `POST /api/v1/esteira/etapa/anyFiltro` do
 * Multiflow que localizam as esteiras ligadas às linhas que serão apagadas,
 * pelo atributo de execução que as amarra (`idProposta`, `idProspect`,
 * `idCedente`), em lotes.
 * @param {{propostas?: number[], prospects?: number[], cedentes?: number[]}} idsPorEntidade
 * @param {number} [tamanhoLote]
 * @returns {Array<{execAtributos: Object<string, string[]>}>}
 */
export const montarFiltrosEsteirasLigadas = ({ propostas = [], prospects = [], cedentes = [] }, tamanhoLote = 50) => {
  const filtros = [];
  [
    ['idProposta', propostas],
    ['idProspect', prospects],
    ['idCedente', cedentes],
  ].forEach(([atributo, lista]) => {
    const valores = [...new Set(lista.map(String))];
    for (let inicio = 0; inicio < valores.length; inicio += tamanhoLote) {
      filtros.push({ execAtributos: { [atributo]: valores.slice(inicio, inicio + tamanhoLote) } });
    }
  });
  return filtros;
};

/**
 * @description Formata a contagem de linhas por tabela (antes ou depois) como
 * linhas de texto ordenadas por tabela, com total.
 * @param {Object<string, number>} contagens
 * @returns {string[]}
 */
export const formatarContagens = (contagens) => {
  const entradas = Object.entries(contagens ?? {}).sort(([a], [b]) => a.localeCompare(b));
  const total = entradas.reduce((soma, [, n]) => soma + Number(n), 0);
  return [...entradas.map(([tabela, n]) => `  ${tabela}: ${n}`), `  TOTAL: ${total} linha(s) em ${entradas.length} tabela(s)`];
};
