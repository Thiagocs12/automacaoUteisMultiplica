// arquivo: urls.js

import { normalizarObjetosNumericos } from '../shared/helpers';

/** Entidades que contêm URLs de ambiente que devem ser substituídas */
const ENTIDADES_COM_URL = ['SUB_ETAPAS', 'ESTEIRAS', 'ESTEIRA_VINCULADA'];

/** Mapeamento de substituição de URLs de produção para HML */
const SUBSTITUICOES_URL = [
  {
    de: 'https://beyond.grupomultiplica.com.br',
    para: 'https://beyond-hml.grupomultiplica.com.br',
  },
  {
    de: 'https://beyond-us.grupomultiplica.com.br',
    para: 'https://beyond-hml.grupomultiplica.com.br',
  },
];

/**
 * @description Substitui URLs de produção por URLs de HML em todos os campos string
 * das entidades listadas em ENTIDADES_COM_URL.
 * Percorre recursivamente toda a estrutura do arquivo, substituindo qualquer
 * ocorrência dos domínios mapeados em SUBSTITUICOES_URL.
 * @param {number} nivel - Nível de dependência das entidades a serem processadas.
 * @param {Object} mapeamentoEntidade - Mapeamento de entidades com suas configurações.
 * @returns {Cypress.Chainable<void>}
 */
Cypress.Commands.add('substituirUrlsDeAmbiente', (nivel, mapeamentoEntidade) => {
  for (const chaveEntidade in mapeamentoEntidade) {
    if (!Object.prototype.hasOwnProperty.call(mapeamentoEntidade, chaveEntidade)) continue;
    if (!ENTIDADES_COM_URL.includes(chaveEntidade)) continue;

    const entidade = mapeamentoEntidade[chaveEntidade];

    if (entidade.nivelDependencia !== nivel) continue;

    cy.readFile(`cypress/output/${entidade.nomeArquivo}`).then((itensRaw) => {
      const itens = normalizarObjetosNumericos(itensRaw);

      const substituirUrls = (obj) => {
        if (!obj || typeof obj !== 'object') return;

        if (Array.isArray(obj)) {
          obj.forEach((item) => substituirUrls(item));
          return;
        }

        for (const chave in obj) {
          if (!Object.prototype.hasOwnProperty.call(obj, chave)) continue;

          const valor = obj[chave];

          if (typeof valor === 'string') {
            SUBSTITUICOES_URL.forEach(({ de, para }) => {
              if (obj[chave].includes(de)) obj[chave] = obj[chave].replaceAll(de, para);
            });
          } else {
            substituirUrls(valor);
          }
        }
      };

      itens.forEach((item) => substituirUrls(item));

      cy.writeFile(`cypress/output/${entidade.nomeArquivo}`, itens);
    });
  }
});
