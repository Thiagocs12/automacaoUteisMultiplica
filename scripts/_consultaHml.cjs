/* Consulta só leitura em HML: node --use-system-ca scripts/_consultaHml.cjs "SELECT TOP 10 ..." */
const path = require('path')
const raiz = path.resolve(__dirname, '..')
require('dotenv').config({ path: path.join(raiz, '.env'), quiet: true })
const { executeQuery, hmlConfig, closeAllPools } = require(path.join(raiz, 'cypress/support/db/dbClient.cjs'))

const sql = process.argv[2]
if (!/^\s*SELECT\s+TOP\s+(\d+)\b/i.test(sql) || Number(sql.match(/TOP\s+(\d+)/i)[1]) > 100) {
  console.error('Só SELECT TOP n (n <= 100)')
  process.exit(1)
}
executeQuery('hml', hmlConfig(), sql)
  .then((linhas) => console.log(JSON.stringify(linhas, null, 1)))
  .catch((erro) => console.error(erro.message))
  .finally(closeAllPools)
