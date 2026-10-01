/* Teste só leitura: o client admin HML do cypress-uteis enxerga o realm do Banking? */
const path = require('path')
const raiz = path.resolve(__dirname, '..')
require('dotenv').config({ path: path.join(raiz, '.env'), quiet: true })

const base = process.env.HML_KEYCLOAK_BASE_URL.replace(/\/$/, '')
const realmBanking = process.argv[2] || 'beyondbanking-hml'

;(async () => {
  const corpo = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: process.env.HML_KEYCLOAK_CLIENT_ID,
    client_secret: process.env.HML_KEYCLOAK_CLIENT_SECRET
  })
  const respostaToken = await fetch(`${base}/auth/realms/multiplicacapital/protocol/openid-connect/token`, { method: 'POST', body: corpo })
  console.log('token multiplicacapital:', respostaToken.status)
  const { access_token: token } = await respostaToken.json()
  const cabecalho = { authorization: `Bearer ${token}` }
  for (const caminho of [
    `/auth/admin/realms/multiplicacapital/users?max=1`,
    `/auth/admin/realms/${realmBanking}/users?max=1`,
    `/auth/admin/realms/${realmBanking}/groups?max=50`,
    `/auth/admin/realms`
  ]) {
    const resposta = await fetch(`${base}${caminho}`, { headers: cabecalho })
    const texto = await resposta.text()
    console.log(caminho, '->', resposta.status, resposta.ok && caminho.endsWith('realms') ? texto.match(/"realm":"[^"]+"/g)?.join(' ') : '')
  }
})().catch((erro) => console.error(erro.message))
