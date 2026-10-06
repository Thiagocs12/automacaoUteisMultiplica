/*
 * Teste de arquivo de retorno (CNAB 400 Bradesco, ocorrência 06 - Liquidação Normal) em HML.
 * Somente HML: usa HML_API_* e HOMOLOG_DB_* do .env (lido via dotenv, nunca aberto).
 *
 * Uso:
 *   node --use-system-ca scripts/retornoCnabFranquiaHml.cjs --titulos 1914852,1914858,1914864 [--data 2026-10-02] [--soGerar]
 */
const fs = require('fs')
const path = require('path')
const raiz = path.resolve(__dirname, '..')
require('dotenv').config({ path: path.join(raiz, '.env'), quiet: true })
const { executeQuery, hmlConfig, closeAllPools } = require(path.join(raiz, 'cypress/support/db/dbClient.cjs'))

const argumentos = process.argv.slice(2)
const argumento = (nome) => {
  const indice = argumentos.indexOf(`--${nome}`)
  return indice >= 0 ? argumentos[indice + 1] : undefined
}
const idsTitulos = (argumento('titulos') || '').split(',').map(Number).filter(Boolean)
const dataOcorrencia = argumento('data') || new Date().toISOString().slice(0, 10)
const soGerar = argumentos.includes('--soGerar')
const pastaSaida = path.join(raiz, 'cypress/output/retornoCnabFranquia')

const consultar = (sql) => executeQuery('hml', hmlConfig(), sql)
const esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const ddmmaa = (iso) => `${iso.slice(8, 10)}${iso.slice(5, 7)}${iso.slice(2, 4)}`
const numero = (valor, tamanho) => String(valor).padStart(tamanho, '0').slice(-tamanho)
const centavos = (valor, tamanho) => numero(Math.round(Number(valor) * 100), tamanho)
const texto = (valor, tamanho) => String(valor ?? '').padEnd(tamanho, ' ').slice(0, tamanho)

function escreverCampo(linha, inicio, conteudo) {
  return linha.slice(0, inicio - 1) + conteudo + linha.slice(inicio - 1 + conteudo.length)
}

function montarHeader(sequencial) {
  let linha = ' '.repeat(400)
  linha = escreverCampo(linha, 1, '02RETORNO01COBRANCA       ')
  linha = escreverCampo(linha, 47, texto('QA FRANQUIA RETORNO', 30))
  linha = escreverCampo(linha, 77, '237BRADESCO       ')
  linha = escreverCampo(linha, 95, ddmmaa(dataOcorrencia))
  linha = escreverCampo(linha, 395, numero(sequencial, 6))
  return linha
}

function montarDetalhe(titulo, valorPago, sequencial) {
  let linha = ' '.repeat(400)
  linha = escreverCampo(linha, 1, '1')
  linha = escreverCampo(linha, 38, texto(titulo.identificadorTituloAdm, 25))
  linha = escreverCampo(linha, 71, texto(titulo.nossoNumero || '', 12))
  linha = escreverCampo(linha, 109, '06')
  linha = escreverCampo(linha, 111, ddmmaa(dataOcorrencia))
  linha = escreverCampo(linha, 147, ddmmaa(titulo.dataVencimento))
  linha = escreverCampo(linha, 153, centavos(titulo.valorDeFace, 13))
  linha = escreverCampo(linha, 166, '237')
  linha = escreverCampo(linha, 169, '00001')
  linha = escreverCampo(linha, 189, centavos(0, 13))
  linha = escreverCampo(linha, 228, centavos(0, 13))
  linha = escreverCampo(linha, 254, centavos(valorPago, 13))
  linha = escreverCampo(linha, 267, centavos(0, 13))
  linha = escreverCampo(linha, 296, ddmmaa(dataOcorrencia))
  linha = escreverCampo(linha, 319, '0000000000')
  linha = escreverCampo(linha, 395, numero(sequencial, 6))
  return linha
}

function montarTrailer(sequencial) {
  let linha = ' '.repeat(400)
  linha = escreverCampo(linha, 1, '9201237')
  linha = escreverCampo(linha, 395, numero(sequencial, 6))
  return linha
}

async function obterToken() {
  const urlToken = `${process.env.HML_API_LOGIN_URL}/auth/realms/multiplicacapital/protocol/openid-connect/token`
  const corpo = new URLSearchParams({
    grant_type: 'password',
    client_id: 'autenticacao',
    username: process.env.HML_API_USERNAME,
    password: process.env.HML_API_PASSWORD
  })
  const resposta = await fetch(urlToken, { method: 'POST', body: corpo })
  if (!resposta.ok) throw new Error(`Login em HML falhou com status ${resposta.status}`)
  return (await resposta.json()).access_token
}

const sqlTitulos = (ids) => `SELECT TOP 100 T.id, T.idOperacao, T.idFundo, ff.idFranquia, T.identificadorTituloAdm, T.nossoNumero,
  T.valorDeFace, T.valorSaldoAbertoTotal, T.valorSaldoAbertoPrincipal, T.dataVencimento, T.dataUltimoPagamento,
  P.valorCorrigido, P.valorDesconto, P.valorPresente
  FROM MC_MOP_TITULOS T
  LEFT JOIN MC_CAD_FUNDO_FRANQUIA ff ON ff.idFundo = T.idFundo
  LEFT JOIN MC_MOP_TITULOS_POSICAO P ON P.idTitulo = T.id AND P.dataPosicao = '${dataOcorrencia}'
  WHERE T.id IN (${ids.join(',')}) ORDER BY ff.idFranquia`

async function principal() {
  if (!idsTitulos.length) throw new Error('Informe --titulos id1,id2,...')
  fs.mkdirSync(pastaSaida, { recursive: true })
  const carimbo = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)

  const antes = await consultar(sqlTitulos(idsTitulos))
  if (antes.length !== idsTitulos.length) throw new Error('Algum título não foi encontrado')
  antes.forEach((titulo) => {
    if (titulo.valorCorrigido == null) throw new Error(`Título ${titulo.id} sem posição em ${dataOcorrencia}`)
  })

  const linhas = [montarHeader(1)]
  antes.forEach((titulo, indice) => {
    const valorPago = Number(titulo.valorCorrigido) - Number(titulo.valorDesconto || 0)
    linhas.push(montarDetalhe(titulo, valorPago, indice + 2))
  })
  linhas.push(montarTrailer(linhas.length + 1))
  const nomeArquivo = `RET_QA_FRANQUIA_${carimbo}.RET`
  const caminhoArquivo = path.join(pastaSaida, nomeArquivo)
  fs.writeFileSync(caminhoArquivo, linhas.join('\r\n') + '\r\n', 'latin1')
  console.log(`Arquivo gerado: ${caminhoArquivo}`)
  if (soGerar) return

  const token = await obterToken()
  const formulario = new FormData()
  formulario.append('file', new Blob([fs.readFileSync(caminhoArquivo)], { type: 'application/octet-stream' }), nomeArquivo)
  const baseUrl = process.env.HML_API_BASE_URL.replace(/\/$/, '')
  const resposta = await fetch(`${baseUrl}/mc-liquidacao-api-ms/v1/liquidacao/titulos-retorno/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formulario
  })
  const corpoUpload = await resposta.text()
  console.log(`Upload: HTTP ${resposta.status} ${corpoUpload}`)
  if (!resposta.ok) throw new Error('Upload falhou')
  const idArquivo = JSON.parse(corpoUpload).idArquivo

  let retorno = null
  let itens = []
  for (let tentativa = 0; tentativa < 40; tentativa++) {
    await esperar(6000)
    retorno = (await consultar(`SELECT TOP 1 * FROM MC_LIQ_TITULOS_RETORNO WHERE idArquivo = ${idArquivo}`))[0]
    if (retorno) {
      itens = await consultar(`SELECT TOP 100 * FROM MC_LIQ_TITULOS_RETORNO_ITEM WHERE idTituloRetorno = ${retorno.id} ORDER BY id`)
      const pendentes = itens.filter((item) => item.situacaoProcessamento === 'PENDENTE')
      console.log(`Aguardando: retorno ${retorno.id} ${retorno.situacaoProcessamento}, itens ${itens.length}, pendentes ${pendentes.length}`)
      if (retorno.situacaoProcessamento !== 'PENDENTE' && itens.length === idsTitulos.length && !pendentes.length) break
    }
  }
  await esperar(15000)

  const depois = await consultar(sqlTitulos(idsTitulos))
  const pagamentos = await consultar(`SELECT TOP 100 * FROM MC_MOP_TITULOS_PAGAMENTO WHERE idTitulo IN (${idsTitulos.join(',')}) ORDER BY id`)
  const movimentos = await consultar(`SELECT TOP 100 * FROM MC_MOP_TITULOS_MOVIMENTO WHERE idTitulo IN (${idsTitulos.join(',')}) ORDER BY id`)
  const pendencias = await consultar(`SELECT TOP 100 * FROM MC_MOP_PENDENCIA WHERE idTitulo IN (${idsTitulos.join(',')}) ORDER BY id`).catch((erro) => [{ erro: erro.message }])
  const retornoFinal = retorno ? (await consultar(`SELECT TOP 1 * FROM MC_LIQ_TITULOS_RETORNO WHERE id = ${retorno.id}`))[0] : null
  const itensFinais = retorno ? await consultar(`SELECT TOP 100 * FROM MC_LIQ_TITULOS_RETORNO_ITEM WHERE idTituloRetorno = ${retorno.id} ORDER BY id`) : []

  const evidencia = { dataOcorrencia, nomeArquivo, idArquivo, antes, retorno: retornoFinal, itens: itensFinais, depois, pagamentos, movimentos, pendencias }
  const caminhoEvidencia = path.join(pastaSaida, `evidencia-${carimbo}.json`)
  fs.writeFileSync(caminhoEvidencia, JSON.stringify(evidencia, null, 1))
  console.log(`Evidência: ${caminhoEvidencia}`)
  console.log(JSON.stringify({ retorno: retornoFinal, itens: itensFinais.map((i) => ({ id: i.id, idTitulo: i.idTitulo, situacao: i.situacaoProcessamento, erro: i.descricaoErro, valorPago: i.valorPago })), depois }, null, 1))
}

principal()
  .catch((erro) => { console.error(erro.message); process.exitCode = 1 })
  .finally(closeAllPools)
