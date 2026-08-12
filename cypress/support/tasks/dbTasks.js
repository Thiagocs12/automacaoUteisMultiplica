const { executeQuery, prodConfig, hmlConfig, closeAllPools } = require('../db/dbClient')

const dbTasks = {
  queryProd: ({ sqlQuery, params = {} }) =>
    executeQuery('prod', prodConfig(), sqlQuery, params),

  queryHml: ({ sqlQuery, params = {} }) =>
    executeQuery('hml', hmlConfig(), sqlQuery, params),

  closeDbConnections: () => closeAllPools().then(() => null), // ✅ retorna null, não undefined
}

module.exports = { dbTasks }