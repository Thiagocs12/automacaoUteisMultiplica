// Chamadas avulsas ao HML como usuario automacao (GET por padrao; METODO=PUT|POST para acoes sem corpo).
// Uso: node --use-system-ca scripts/_exploraOrdemPagamento.cjs <caminho> [<caminho> ...]
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') })

const baseUrl = process.env.HML_API_BASE_URL.replace(/\/$/, '')
const urlToken = `${process.env.HML_API_LOGIN_URL}/auth/realms/multiplicacapital/protocol/openid-connect/token`

const principal = async () => {
  const corpo = new URLSearchParams({ grant_type: 'password', client_id: 'autenticacao', username: process.env.HML_API_USERNAME, password: process.env.HML_API_PASSWORD })
  const login = await fetch(urlToken, { method: 'POST', body: corpo })
  if (!login.ok) throw new Error(`login ${login.status}`)
  const { access_token: token } = await login.json()
  for (const caminho of process.argv.slice(2)) {
    const metodo = process.env.METODO || 'GET'
    const resposta = await fetch(`${baseUrl}${caminho}`, { method: metodo, headers: { authorization: `Bearer ${token}` } })
    const texto = await resposta.text()
    console.log(`=== ${metodo} ${caminho} -> ${resposta.status} (${texto.length} bytes)`)
    console.log(texto.slice(0, Number(process.env.MAX || 3000)))
  }
}
principal().catch((e) => { console.error(e.message); process.exit(1) })
