// Somente leitura, somente HML: repete as rotas do Raio-X que deram 500, com os parâmetros que a tela (mc-mf-mop) envia.
const path = require('path')
const fs = require('fs')
const raiz = path.resolve(__dirname, '..')
require('dotenv').config({ path: path.join(raiz, '.env'), quiet: true })

const baseUrl = process.env.HML_API_BASE_URL.replace(/\/$/, '')
const urlToken = `${process.env.HML_API_LOGIN_URL}/auth/realms/multiplicacapital/protocol/openid-connect/token`
const saida = process.argv[2]
const casos = JSON.parse(fs.readFileSync(process.argv[3], 'utf8').replace(/^﻿/, ''))

const obterToken = async () => {
  const corpo = new URLSearchParams({
    grant_type: 'password',
    client_id: 'autenticacao',
    username: process.env.HML_API_USERNAME,
    password: process.env.HML_API_PASSWORD
  })
  const resposta = await fetch(urlToken, { method: 'POST', body: corpo })
  if (!resposta.ok) throw new Error(`login ${resposta.status}`)
  return (await resposta.json()).access_token
}

const montarQuery = (params) => {
  const partes = []
  for (const [chave, valor] of Object.entries(params || {})) {
    if (valor === undefined || valor === null) continue
    const lista = Array.isArray(valor) ? valor : [valor]
    for (const item of lista) partes.push(`${encodeURIComponent(chave)}=${encodeURIComponent(item)}`)
  }
  return partes.length ? `?${partes.join('&')}` : ''
}

;(async () => {
  const token = await obterToken()
  fs.mkdirSync(saida, { recursive: true })
  const linhas = ['caso;metodo;rota;query;corpo;status;tamanho;trecho']
  for (const caso of casos) {
    const url = `${baseUrl}/mc-raiox-ms/v1/raio-x${caso.rota}${montarQuery(caso.query)}`
    const opcoes = { method: caso.metodo, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
    if (caso.corpo !== undefined) opcoes.body = JSON.stringify(caso.corpo)
    let status = 0
    let texto = ''
    try {
      const resposta = await fetch(url, opcoes)
      status = resposta.status
      const tipo = resposta.headers.get('content-type') || ''
      if (tipo.includes('json') || tipo.includes('text')) texto = await resposta.text()
      else texto = `[binario ${tipo} ${(await resposta.arrayBuffer()).byteLength} bytes]`
    } catch (erro) {
      texto = `ERRO ${erro.message}`
    }
    fs.writeFileSync(path.join(saida, `${caso.id}.txt`), `${caso.metodo} ${url}\n${opcoes.body || ''}\n\n${status}\n${texto}`)
    const trecho = texto.replace(/[\r\n;]+/g, ' ').slice(0, 220)
    linhas.push([caso.id, caso.metodo, caso.rota, montarQuery(caso.query), opcoes.body || '', status, texto.length, trecho].join(';'))
    console.log(`${caso.id} ${caso.metodo} ${caso.rota} -> ${status} ${trecho.slice(0, 140)}`)
  }
  fs.writeFileSync(path.join(saida, 'resultado.csv'), linhas.join('\n'))
})().catch((erro) => { console.error(erro.message); process.exit(1) })
