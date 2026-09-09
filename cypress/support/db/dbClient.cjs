const sql = require('mssql/msnodesqlv8')

const pools = {}

const buildConfig = ({ host, database, port }) => ({
  server: host,
  database,
  port: Number(port),
  // Nome do driver ODBC instalado na máquina (`Get-OdbcDriver` no Windows).
  // Sem isso, mssql/msnodesqlv8 cai no default "SQL Server Native Client 11.0",
  // descontinuado e ausente na maioria das instalações atuais — resultando em
  // "[ODBC Driver Manager] Nome da fonte de dados não encontrado...".
  driver: 'SQL Server',
  pool: {
    max: 5,
    min: 0,
    idleTimeoutMillis: 30000
  },
  options: {
    trustedConnection: true,      // ✅ usa autenticação do Windows do usuário logado no processo Node
    encrypt: false,                // ✅ desativa TLS para IP interno
    trustServerCertificate: true,
  }
})

const getPool = async (name, config) => {
  if (!pools[name]) {
    pools[name] = await new sql.ConnectionPool(config).connect()
  }
  return pools[name]
}

const executeQuery = async (poolName, config, sqlQuery, params = {}) => {
  if (!sqlQuery) throw new Error(`[executeQuery] sqlQuery não informado para o pool: ${poolName}`)

  const pool = await getPool(poolName, config)
  const request = pool.request()

  Object.entries(params).forEach(([key, { type, value }]) => {
    request.input(key, type, value)
  })

  const result = await request.query(sqlQuery)
  return result.recordset ?? null  // ✅ nunca retorna undefined
}

const prodConfig = () => buildConfig({
  host:     process.env.PROD_DB_HOST,
  database: process.env.PROD_DB_NAME,
  port:     process.env.PROD_DB_PORT
})

const hmlConfig = () => buildConfig({
  host:     process.env.HOMOLOG_DB_HOST,
  database: process.env.HOMOLOG_DB_NAME,
  port:     process.env.HOMOLOG_DB_PORT
})

const closeAllPools = async () => {
  await Promise.all(Object.values(pools).map((pool) => pool.close()))
  Object.keys(pools).forEach((key) => delete pools[key])
}

module.exports = { executeQuery, prodConfig, hmlConfig, closeAllPools, sql }