/**
 * @description Chamada avulsa à API de HML com o usuário de automação (só HML). Imprime status e corpo.
 * Uso: node --use-system-ca scripts/_comexHml.cjs <METODO> <caminho> [corpoJson]
 */
/* global __dirname, process, console, fetch, URLSearchParams */
const path = require('path')
require('dotenv').config({ path: path.join(path.resolve(__dirname, '..'), '.env'), quiet: true })

const executar = async () => {
  const [metodo, caminho, corpo] = process.argv.slice(2)
  const urlToken = `${process.env.HML_API_LOGIN_URL}/auth/realms/multiplicacapital/protocol/openid-connect/token`
  const login = await fetch(urlToken, {
    method: 'POST',
    body: new URLSearchParams({ grant_type: 'password', client_id: 'autenticacao', username: process.env.HML_API_USERNAME, password: process.env.HML_API_PASSWORD })
  })
  if (!login.ok) throw new Error(`login ${login.status}`)
  const { access_token: token } = await login.json()
  const resposta = await fetch(`${process.env.HML_API_BASE_URL.replace(/\/$/, '')}${caminho}`, {
    method: metodo,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: corpo
  })
  console.log(`status ${resposta.status}`)
  console.log((await resposta.text()).slice(0, Number(process.env.LIMITE || 6000)))
}

executar().catch((erro) => { console.error(erro.message); process.exit(1) })
