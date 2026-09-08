// arquivo: helpers.js
//
// Funções puras (sem dependência do global `Cypress`) reaproveitadas por
// múltiplos módulos de comando em cypress/support/commands/.

/**
 * Mescla profundamente dois objetos de log, combinando os arrays de cada entidade
 * sem sobrescrever entradas existentes — atualiza pelo id ou adiciona se novo.
 */
export function mesclarLog(logAtual, logNovo) {
  const resultado = { ...(logAtual ?? {}) };

  for (const chave in logNovo) {
    if (!resultado[chave]) {
      resultado[chave] = logNovo[chave];
      continue;
    }

    for (const entrada of logNovo[chave]) {
      const indice = resultado[chave].findIndex((r) => r.id === entrada.id);
      if (indice >= 0) {
        resultado[chave][indice] = entrada;
      } else {
        resultado[chave].push(entrada);
      }
    }
  }

  return resultado;
}

/**
 * Converte recursivamente objetos com chaves numéricas sequenciais em arrays.
 * Ex: { "0": {...}, "1": {...} } → [{...}, {...}]
 * Não altera arrays ou objetos com chaves mistas.
 */
export function normalizarObjetosNumericos(obj) {
  if (Array.isArray(obj)) return obj.map(normalizarObjetosNumericos);

  if (obj !== null && typeof obj === 'object') {
    const chaves = Object.keys(obj);
    const todasNumericas = chaves.length > 0 && chaves.every((c) => /^\d+$/.test(c));

    if (todasNumericas) {
      return chaves
        .sort((a, b) => Number(a) - Number(b))
        .map((c) => normalizarObjetosNumericos(obj[c]));
    }

    return Object.fromEntries(
      Object.entries(obj).map(([k, v]) => [k, normalizarObjetosNumericos(v)]),
    );
  }

  return obj;
}

/**
 * Força campos específicos a serem arrays, navegando via dot-notation.
 * Suporta objetos com índices numéricos durante a travessia.
 */
function forcarCampoComoArray(obj, partes) {
  if (!obj || !partes.length) return obj;

  if (Array.isArray(obj)) {
    return obj.map((item) => forcarCampoComoArray(item, partes));
  }

  if (typeof obj !== 'object') return obj;

  const [proxima, ...resto] = partes;

  if (!(proxima in obj)) return obj;

  if (resto.length === 0) {
    const valor = obj[proxima];
    const comoArray = Array.isArray(valor)
      ? valor
      : valor !== null && typeof valor === 'object'
        ? Object.values(valor)
        : [];
    return { ...obj, [proxima]: comoArray };
  }

  return {
    ...obj,
    [proxima]: forcarCampoComoArray(normalizarObjetosNumericos(obj[proxima]), resto),
  };
}

/**
 * Aplica `forcarCampoComoArray` para cada caminho em dot-notation de `camposLista`.
 * Retorna o objeto original se `camposLista` estiver vazio ou ausente.
 */
export function normalizarCamposLista(obj, camposLista) {
  if (!camposLista?.length) return obj;

  let resultado = obj;
  camposLista.forEach((caminho) => {
    resultado = forcarCampoComoArray(resultado, caminho.split('.'));
  });
  return resultado;
}

/**
 * Navega recursivamente pelo caminho em dot-notation e remove a chave final.
 * Normaliza objetos com índices numéricos durante a travessia.
 * Não muta o objeto original — retorna uma nova estrutura.
 */
function removerCaminhoAninhado(obj, partes) {
  if (!obj || !partes.length) return obj;

  const [proxima, ...resto] = partes;

  if (Array.isArray(obj)) {
    return obj.map((item) => removerCaminhoAninhado(item, partes));
  }

  if (typeof obj !== 'object' || !(proxima in obj)) return obj;

  if (resto.length === 0) {
    const { [proxima]: _, ...semChave } = obj;
    return semChave;
  }

  const valor = normalizarObjetosNumericos(obj[proxima]);
  const valorAtualizado = Array.isArray(valor)
    ? valor.map((item) => removerCaminhoAninhado(item, resto))
    : removerCaminhoAninhado(valor, resto);

  return { ...obj, [proxima]: valorAtualizado };
}

/**
 * Remove campos do objeto com base em `chavesIgnoradas`.
 * Suporta chaves simples e caminhos em dot-notation (ex: modeloEtapas.modeloEtapa.usuario).
 */
export function removerChavesIgnoradas(obj, chavesIgnoradas) {
  const chavesSimples = chavesIgnoradas.filter((c) => !c.includes('.'));
  const chavesAninhadas = chavesIgnoradas.filter((c) => c.includes('.'));

  let resultado = Object.fromEntries(
    Object.entries(obj).filter(([chave]) => !chavesSimples.includes(chave)),
  );

  chavesAninhadas.forEach((caminho) => {
    resultado = removerCaminhoAninhado(resultado, caminho.split('.'));
  });

  return resultado;
}

/**
 * Remove recursivamente todas as chaves que terminam com `.old` de um objeto.
 */
export function removerCamposOld(obj) {
  if (Array.isArray(obj)) return obj.map((item) => removerCamposOld(item));

  if (typeof obj !== 'object' || obj === null) return obj;

  return Object.fromEntries(
    Object.entries(obj)
      .filter(([chave]) => !chave.endsWith('.old'))
      .map(([chave, valor]) => [chave, removerCamposOld(valor)]),
  );
}

/**
 * Restaura recursivamente os campos `.old` para seus campos originais,
 * removendo as chaves `.old` após a restauração.
 */
export function restaurarCamposOld(obj) {
  if (typeof obj !== 'object' || obj === null) return obj;

  const resultado = {};

  for (const [chave, valor] of Object.entries(obj)) {
    if (chave.endsWith('.old')) continue;

    const chaveOld = `${chave}.old`;
    resultado[chave] = Object.prototype.hasOwnProperty.call(obj, chaveOld)
      ? obj[chaveOld]
      : restaurarCamposOld(valor);
  }

  return resultado;
}

/**
 * Mescla dois arrays evitando duplicatas com base em um campo chave.
 */
export function mesclarSemDuplicatas(base, novos, campoChave) {
  const chavesDaBase = new Set(base.map((item) => item[campoChave]));
  return [...base, ...novos.filter((item) => !chavesDaBase.has(item[campoChave]))];
}

/**
 * Extrai valores de um caminho que pode conter arrays em qualquer nível.
 * Funciona para: 'id', 'grupoProduto.id', 'modeloEtapas.modeloEtapa.id'
 */
export function extrairValoresDoCaminho(obj, caminho) {
  const percorrer = (atual, partes) => {
    if (!atual || partes.length === 0) return [atual];

    const [parte, ...resto] = partes;
    const proximo = Array.isArray(atual)
      ? atual.flatMap((item) => percorrer(item?.[parte], resto))
      : percorrer(atual[parte], resto);

    return [proximo].flat();
  };

  return percorrer(obj, caminho.split('.')).filter((v) => v != null);
}
