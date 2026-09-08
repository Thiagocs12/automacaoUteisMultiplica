const { executeQuery, prodConfig, hmlConfig, closeAllPools } = require('../db/dbClient.cjs')

// ✅ Produção é somente leitura: nenhuma query de escrita pode ser executada contra o banco de PROD.
const COMANDO_DE_ESCRITA = /\b(insert|update|delete|drop|alter|truncate|merge|exec(ute)?|grant|revoke)\b/i

const dbTasks = {
  queryProd: ({ sqlQuery, params = {} }) => {
    if (COMANDO_DE_ESCRITA.test(sqlQuery)) {
      return Promise.reject(
        new Error(`[queryProd] Bloqueado: produção é somente leitura. Query recebida: ${sqlQuery}`)
      )
    }
    return executeQuery('prod', prodConfig(), sqlQuery, params)
  },

  queryHml: ({ sqlQuery, params = {} }) =>
    executeQuery('hml', hmlConfig(), sqlQuery, params),

  closeDbConnections: () => closeAllPools().then(() => null), // ✅ retorna null, não undefined
}

module.exports = { dbTasks }