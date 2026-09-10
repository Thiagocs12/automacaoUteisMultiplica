// arquivo: keycloakHelpers.js
//
// Lógica pura (sem dependência do global `Cypress`) usada pela sincronização de
// Grupos e Permissões do Keycloak (`commands/gruposPermissoes.js`), para poder
// ser coberta por node:test puro em `__tests__/`.

/** Normaliza um nome para comparação (trim + minúsculas). */
const normalizarNome = (valor) => String(valor ?? '').trim().toLowerCase();

/**
 * @description Localiza, em uma lista de grupos/roles retornada por uma busca
 * (`?search=`, que faz correspondência parcial), o item cujo `name` é
 * exatamente igual ao procurado (ignorando maiúsculas/minúsculas e espaços).
 * @param {Array<{name: string}>} itens - Itens retornados pela busca.
 * @param {string} nome - Nome procurado.
 * @returns {object|null}
 */
export const encontrarPorNomeExato = (itens, nome) =>
  (itens ?? []).find((item) => normalizarNome(item?.name) === normalizarNome(nome)) ?? null;

/**
 * @description Calcula quais nomes (roles atribuídas a um grupo em produção,
 * ex.: `GroupRepresentation.realmRoles`) ainda não constam na lista
 * equivalente de HML.
 * @param {Array<string>} nomesProducao - Nomes atribuídos ao grupo em produção.
 * @param {Array<string>} nomesHml - Nomes já atribuídos ao grupo em HML.
 * @returns {Array<string>} Nomes de produção ainda ausentes em HML.
 */
export const calcularNomesFaltantes = (nomesProducao, nomesHml) => {
  const nomesEmHml = new Set((nomesHml ?? []).map(normalizarNome));
  return (nomesProducao ?? []).filter((nome) => !nomesEmHml.has(normalizarNome(nome)));
};
