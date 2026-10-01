/**
 * @description Leva pré-operações de comex (Multicomex) de HML pela esteira "MOP MultiComex" com o usuário de automação,
 * etapa a etapa (iniciar, parecer, finalizar), executando a ação que cada etapa exige: fundo na análise de crédito,
 * fechamento/trava de câmbio, efetivação e pagamento. Só HML (HML_API_* do .env).
 *
 * Uso:
 *   node --use-system-ca scripts/massaComexHml.cjs --preOperacoes 88829:1,88833:3 [--parecer "..."] [--passos 1]
 *   (cada item é idPreOperacao:idFundo; --passos limita quantas etapas avançar por pré-operação nesta execução)
 *
 * Evidências (resposta integral de cada chamada) em cypress/output/massaComex/ (gitignored).
 */
/* global __dirname, process, console, fetch, setTimeout, URLSearchParams */
const fs = require('fs')
const path = require('path')

const raiz = path.resolve(__dirname, '..')
require('dotenv').config({ path: path.join(raiz, '.env'), quiet: true })

const pastaEvidencias = path.join(raiz, 'cypress/output/massaComex')
const BO = '/mc-backoffice-multicomex-ms/api/v1'
const MF = '/mc-multiflow-ms/api/v1'

const lerArgumentos = (argv) => {
  const argumentos = {}
  for (let i = 0; i < argv.length; i += 2) argumentos[argv[i].slice(2)] = argv[i + 1]
  return argumentos
}
const dormir = (ms) => new Promise((resolver) => setTimeout(resolver, ms))
const hora = () => new Date().toTimeString().slice(0, 8)

const criarCliente = () => {
  const baseUrl = process.env.HML_API_BASE_URL.replace(/\/$/, '')
  const urlToken = `${process.env.HML_API_LOGIN_URL}/auth/realms/multiplicacapital/protocol/openid-connect/token`
  let token = null
  let expiraEm = 0
  const obterToken = async () => {
    if (token && Date.now() < expiraEm - 30000) return token
    const resposta = await fetch(urlToken, {
      method: 'POST',
      body: new URLSearchParams({ grant_type: 'password', client_id: 'autenticacao', username: process.env.HML_API_USERNAME, password: process.env.HML_API_PASSWORD })
    })
    if (!resposta.ok) throw new Error(`Login em HML falhou com status ${resposta.status}`)
    const dados = await resposta.json()
    token = dados.access_token
    expiraEm = Date.now() + dados.expires_in * 1000
    return token
  }
  return async (metodo, caminho, rotulo, corpo) => {
    const resposta = await fetch(`${baseUrl}${caminho}`, {
      method: metodo,
      headers: { authorization: `Bearer ${await obterToken()}`, 'content-type': 'application/json' },
      body: corpo === undefined ? undefined : JSON.stringify(corpo)
    })
    const texto = await resposta.text()
    const carimbo = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15)
    fs.writeFileSync(path.join(pastaEvidencias, `${carimbo}-${rotulo}.json`), `${metodo} ${caminho}\n${corpo === undefined ? '' : JSON.stringify(corpo)}\nstatus ${resposta.status}\n\n${texto}`)
    if (resposta.status >= 300) {
      const erro = new Error(`${metodo} ${caminho} -> ${resposta.status}: ${texto.slice(0, 500)}`)
      erro.status = resposta.status
      throw erro
    }
    try { return texto ? JSON.parse(texto) : null } catch { return texto }
  }
}

const buscarEsteira = async (api, idPre) => {
  for (const status of ['EXECUTANDO', 'CRIADO', 'FINALIZADO']) {
    const r = await api('GET', `${MF}/esteira/pesquisar?nome=MOP_PRE_${idPre}&status=${status}`, `esteira-${idPre}`)
    if (r.esteiras?.length) return api('GET', `${MF}/esteira/pesquisarporid/${r.esteiras[0].id}`, `esteira-${idPre}-completa`)
  }
  throw new Error(`esteira MOP_PRE_${idPre} não encontrada`)
}

const acoesDaEtapa = async (api, nome, idPre, idFundo, log) => {
  if (/^Middle Comex/i.test(nome)) {
    const taxaDesagio = Number((1.2 + Math.random() * 1.6).toFixed(2))
    const floatDias = 3 + Math.floor(Math.random() * 5)
    await api('POST', `${BO}/preOperacao/saveComercial`, `comercial-${idPre}`, { idPreOperacao: Number(idPre), taxaDesagio, floatDias, idFundo: Number(idFundo), idProduto: 32 })
    log(`comercial gravado (fundo ${idFundo}, deságio ${taxaDesagio}, float ${floatDias})`)
    const titulos = await api('GET', `${BO}/preOperacaoTitulo/search?idPreOperacao=${idPre}`, `titulos-${idPre}`)
    for (const t of titulos || []) {
      const valor = t.valorTotalMoeda
      await api('PUT', `${BO}/preOperacaoTitulo/aprovar`, `aprovar-titulo-${idPre}`, { idPreOperacao: Number(idPre), idPreOperacaoTitulo: t.id, valorInvoice: valor, valorAntecipado: 0, valorSaldo: valor })
    }
    log(`${(titulos || []).length} título(s) aprovado(s)`)
  }
  if (/^Câmbio OPE Comex/i.test(nome)) {
    const c = await api('GET', `${BO}/preOperacao/searchCambio/${idPre}`, `cambio-${idPre}`)
    const cotacao = c.cotacaoSpot || c.cotacao
    const venc = new Date(`${c.dataVencimento.slice(0, 10)}T12:00:00Z`)
    while (venc.getUTCDay() === 0 || venc.getUTCDay() === 6) venc.setUTCDate(venc.getUTCDate() + 1)
    const vencimento = venc.toISOString().slice(0, 10)
    await api('POST', `${BO}/preOperacao/travar`, `travar-${idPre}`, {
      idPreOperacao: Number(idPre), cotacaoSpot: cotacao, cotacaoCliente: cotacao, cotacaoGestora: cotacao, vencimentoOperacao: vencimento
    })
    c.dataVencimento = `${vencimento}T00:00:00`
    c.dataVencimentoNdf = `${vencimento}T00:00:00`
    const bruto = Number((c.valorTotalBruto * cotacao).toFixed(2))
    const dias = (c.prazoNDF || 60) + (c.floatDias || 0)
    const valorDesagio = Number((bruto * (c.taxaDesagio / 100) * dias / 30).toFixed(2))
    await api('POST', `${BO}/preOperacao/fecharCambio`, `fechar-cambio-${idPre}`, {
      idPreOperacao: Number(idPre), dataOperacao: c.dataOperacao.slice(0, 19), dataVencimento: c.dataVencimento, dataVencimentoNdf: c.dataVencimentoNdf,
      cotacaoSpot: cotacao, cotacaoCliente: cotacao, cotacaoGestora: cotacao, valorTotalBruto: bruto, valorTotalLiquido: Number((bruto - valorDesagio).toFixed(2)),
      valorDesagio, precSpread: 0, taxaEfetiva: c.taxaDesagio, roa: c.taxaDesagio, desconsiderarDiaOperacao: false
    })
    log(`câmbio travado (${cotacao}) e fechado: bruto R$ ${bruto}, deságio R$ ${valorDesagio}`)
  }
  if (/^Pagamento OPE Comex/i.test(nome)) {
    await api('POST', `${BO}/preOperacao/efetivarOperacao?idPreOperacao=${idPre}`, `efetivar-${idPre}`)
    log('operação efetivada')
    await dormir(5000)
    await api('POST', `${BO}/preOperacao/pagarOperacao?idPreOperacao=${idPre}`, `pagar-${idPre}`)
    log('pagamento enviado para a fila')
    await dormir(15000)
  }
  if (/^Análise MOP Comex/i.test(nome)) {
    await api('PUT', `${BO}/preOperacao/atualizarFundo?idPreOperacao=${idPre}&idFundo=${idFundo}`, `fundo-${idPre}`)
    log(`fundo ${idFundo} gravado`)
  }
}

const avancar = async (api, idPre, idFundo, parecer, passos) => {
  const log = (texto) => console.log(`[${hora()}] ${idPre}: ${texto}`)
  for (let passo = 0; passo < passos; passo++) {
    const esteira = await buscarEsteira(api, idPre)
    if (esteira.status === 'FINALIZADO') return log('esteira FINALIZADA')
    const etapa = (esteira.etapas || []).find((e) => e.status === 'EXECUTANDO' || e.status === 'CRIADO')
    if (!etapa) return log(`sem etapa aberta (esteira ${esteira.status})`)
    log(`etapa ${etapa.ordemExecucao} "${etapa.nome}" [${etapa.status}]`)
    if (etapa.status === 'CRIADO') await api('POST', `${MF}/esteira/iniciarEtapa?idEsteira=${esteira.id}&idEtapa=${etapa.id}`, `iniciar-${idPre}`)
    await acoesDaEtapa(api, etapa.nome, idPre, idFundo, log)
    const sub = etapa.origem?.modeloEtapa?.modeloSubEtapaModel?.[0]?.modeloSubEtapa
    let idParecer
    if (sub?.requerParecer) {
      const p = await api('POST', `${MF}/ocorrencia/parecer?idEsteira=${esteira.id}&idEtapa=${etapa.id}`, `parecer-${idPre}`, { descricao: parecer })
      idParecer = p?.id
    }
    await api('POST', `${MF}/esteira/finalizarEtapa`, `finalizar-${idPre}`, { idEsteira: esteira.id, idEtapa: etapa.id, ...(idParecer && { idParecer }) })
    log('etapa finalizada')
    await dormir(3000)
  }
}

const executar = async () => {
  const args = lerArgumentos(process.argv.slice(2))
  fs.mkdirSync(pastaEvidencias, { recursive: true })
  const api = criarCliente()
  const parecer = args.parecer || 'MASSA DE TESTE AUTOMATIZADA - COMEX FRANQUIA'
  const passos = Number(args.passos || 20)
  for (const item of args.preOperacoes.split(',')) {
    const [idPre, idFundo] = item.split(':')
    try {
      await avancar(api, idPre, idFundo, parecer, passos)
    } catch (erro) {
      console.log(`[${hora()}] ${idPre}: ERRO ${erro.message}`)
    }
  }
}

executar().catch((erro) => { console.error(erro.message); process.exit(1) })
