/* GET só leitura em HML com o usuário de automação: node --use-system-ca scripts/_getHml.cjs "/mc-.../caminho" */
const path = require('path')
const raiz = path.resolve(__dirname, '..')
require('dotenv').config({ path: path.join(raiz, '.env'), quiet: true })

;(async () => {
  const corpo = new URLSearchParams({
    grant_type: 'password',
    client_id: 'autenticacao',
    username: process.env.HML_API_USERNAME,
    password: process.env.HML_API_PASSWORD
  })
  const token = await fetch(`${process.env.HML_API_LOGIN_URL}/auth/realms/multiplicacapital/protocol/openid-connect/token`, { method: 'POST', body: corpo })
    .then((resposta) => resposta.json())
  const resposta = await fetch(`${process.env.HML_API_BASE_URL.replace(/\/$/, '')}${process.argv[2]}`, {
    headers: { authorization: `Bearer ${token.access_token}` }
  })
  console.log(resposta.status)
  console.log(await resposta.text())
})().catch((erro) => console.error(erro.message))
