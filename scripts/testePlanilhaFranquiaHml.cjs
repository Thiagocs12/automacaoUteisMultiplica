/**
 * @description Teste de franquia de ponta a ponta de uma operação da Planilha Operacional em HML.
 * O dono da operação é o perfil de franquia do fundo (FRQ_A no fundo 1); a cada fase, os perfis de outra
 * franquia (FRQ_B, FRQ_C) tentam ler e agir sobre a operação, e MASTER/FRQ_AB conferem a visibilidade.
 *
 * As chamadas passam pelo proxy local do ciclo proxyPerfisFranquia (mc-raqa-tester), que injeta o token de
 * cada perfil: o roteiro nunca manipula credencial. Banco de HML só para leitura (dbClient do cypress-uteis).
 *
 * Uso: node --use-system-ca scripts/testePlanilhaFranquiaHml.cjs --saida "<pasta>" [--operacao <id>]
 *   --cedente 5135 --fundo 1 --fundoOutraFranquia 2 --valor 23417.86 --parcelas 4 --produto 19
 */
/* global __dirname, process, console, fetch, setTimeout */
const fs = require('fs')
const path = require('path')

const raiz = path.resolve(__dirname, '..')
require('dotenv').config({ path: path.join(raiz, '.env'), quiet: true })
const { executeQuery, hmlConfig, closeAllPools } = require(path.join(raiz, 'cypress/support/db/dbClient.cjs'))

const PROXY = 'http://127.0.0.1:9590'
const DONO = 'FRQ_A'
const VEEM = ['MASTER', 'FRQ_A', 'FRQ_AB']
const NAO_VEEM = ['FRQ_B', 'FRQ_C']
const INTRUSO = 'FRQ_B'
const PERFIS = [...VEEM, ...NAO_VEEM]
const ETAPAS_MAXIMAS = 30
const ETAPA_PAGAMENTO = /^Pagamento/i
const PARECER = 'TESTE FRANQUIA PLANILHA - CLAUDE CODE'

const argumentos = Object.fromEntries(process.argv.slice(2).reduce((pares, item, indice, lista) => {
  if (item.startsWith('--')) pares.push([item.slice(2), lista[indice + 1]])
  return pares
}, []))
const opcoes = {
  cedente: 5135, fundo: 1, fundoOutraFranquia: 2, valor: 23417.86, parcelas: 4, produto: 19,
  contaCedente: 2866, localCobranca: 5, ...argumentos
}
const pastaSaida = opcoes.saida
const pastaChamadas = path.join(pastaSaida, 'chamadas')
fs.mkdirSync(pastaChamadas, { recursive: true })
const arquivoResultados = path.join(pastaSaida, 'resultados.csv')
const arquivoLog = path.join(pastaSaida, 'execucao-roteiro.log')

const dormir = (ms) => new Promise((resolver) => setTimeout(resolver, ms))
const hora = () => new Date().toTimeString().slice(0, 8)
const log = (mensagem) => {
  const linha = `${hora()} ${mensagem}`
  console.log(linha)
  fs.appendFileSync(arquivoLog, `${linha}\n`)
}
const consultar = (sql) => executeQuery('hml', hmlConfig(), sql)
const arredondar = (valor) => Math.round((Number(valor) || 0) * 100) / 100
const formatarData = (dias) => {
  const data = new Date()
  data.setDate(data.getDate() + dias)
  return `${data.toISOString().slice(0, 10)}T00:00:00`
}
const dataPlanilha = (dias) => `${formatarData(dias).slice(0, 10)}T03:00:00`

let sequencia = 0
const chamar = async (perfil, metodo, caminho, rotulo, corpo) => {
  sequencia += 1
  let resposta
  for (let tentativa = 1; !resposta; tentativa++) {
    try {
      resposta = await fetch(`${PROXY}/${perfil}${caminho}`, {
        method: metodo,
        headers: { 'content-type': 'application/json' },
        body: corpo === undefined ? undefined : JSON.stringify(corpo)
      })
    } catch (erro) {
      if (tentativa >= 3) throw new Error(`proxy indisponível em ${metodo} ${caminho}: ${erro.message}`)
      await dormir(3000 * tentativa)
    }
  }
  const texto = await resposta.text()
  let json = null
  try { json = texto ? JSON.parse(texto) : null } catch { json = null }
  const nome = `${String(sequencia).padStart(3, '0')}-${perfil}-${rotulo}.txt`.replace(/[^A-Za-z0-9._-]/g, '_')
  fs.writeFileSync(path.join(pastaChamadas, nome), `${perfil} ${metodo} ${caminho}\nstatus ${resposta.status}\n\n${texto}`)
  if (resposta.status === 598 || resposta.status === 599) throw new Error(`proxy: ${texto}`)
  await dormir(200)
  return { status: resposta.status, texto, json, arquivo: nome }
}

const resultados = []
const csv = (valor) => `"${String(valor ?? '').replace(/"/g, "'").replace(/\r?\n/g, ' ').slice(0, 600)}"`
// Ao retomar (--operacao), os resultados anteriores são mantidos e a numeração continua.
const linhasAnteriores = opcoes.operacao && fs.existsSync(arquivoResultados) ? fs.readFileSync(arquivoResultados, 'utf8').split('\n').filter((l) => l.startsWith('"T')).length : 0
if (!linhasAnteriores) fs.writeFileSync(arquivoResultados, '﻿id;fase;teste;perfil;metodo;caminho;esperado;status;veredito;detalhe;evidencia\n')
if (linhasAnteriores) sequencia = fs.readdirSync(pastaChamadas).length
const registrar = (fase, teste, perfil, metodo, caminho, esperado, resposta, veredito, detalhe) => {
  const id = `T${String(linhasAnteriores + resultados.length + 1).padStart(3, '0')}`
  const linha = { id, fase, teste, perfil, metodo, caminho, esperado, status: resposta?.status ?? '', veredito, detalhe, evidencia: resposta?.arquivo ?? '' }
  resultados.push(linha)
  fs.appendFileSync(arquivoResultados, `${Object.values(linha).map(csv).join(';')}\n`)
  log(`${id} [${veredito}] ${fase} | ${teste} | ${perfil} ${metodo} ${caminho} -> ${linha.status} ${detalhe ? `| ${detalhe}` : ''}`)
  return linha
}

const ok2xx = (r) => r.status >= 200 && r.status < 300
const bloqueio = (r) => [400, 401, 403, 404, 409, 412, 422].includes(r.status)
const trecho = (r) => (r.texto || '').replace(/\s+/g, ' ').slice(0, 220)
const contemId = (texto, id) => new RegExp(`(?<![0-9])${id}(?![0-9])`).test(texto || '')
const vazio = (r) => {
  if (!r.texto || !r.texto.trim()) return true
  const j = r.json
  if (j === null || j === undefined) return false
  if (Array.isArray(j)) return j.length === 0
  if (typeof j === 'object') {
    const listas = ['content', 'esteiras', 'data', 'itens', 'items', 'lista'].map((chave) => j[chave]).filter(Array.isArray)
    if (listas.length) return listas.every((lista) => lista.length === 0)
    return Object.keys(j).length === 0
  }
  return false
}

// Leitura: quem deve ver precisa receber a operação; quem não deve ver precisa ser barrado ou receber vazio.
const statusMaster = new Map()
const masterEnxerga = new Map()
const testarLeitura = async (fase, teste, caminho, idOperacao, { porId = false, perfis = PERFIS } = {}) => {
  for (const perfil of perfis) {
    const r = await chamar(perfil, 'GET', caminho, `${fase}-${teste}`)
    if (perfil === 'MASTER') statusMaster.set(caminho, r.status)
    const masterOk = ok2xx({ status: statusMaster.get(caminho) ?? 200 })
    const enxerga = ok2xx(r) && (porId ? !vazio(r) : contemId(r.texto, idOperacao))
    if (perfil === 'MASTER') masterEnxerga.set(caminho, enxerga)
    if (VEEM.includes(perfil)) {
      if (enxerga) registrar(fase, teste, perfil, 'GET', caminho, 'ver a operação', r, 'OK', '')
      else if (perfil !== 'MASTER' && masterEnxerga.get(caminho) === false) registrar(fase, teste, perfil, 'GET', caminho, 'ver a operação', r, 'INCONCLUSIVO', `nem o MASTER vê a operação nesta rota (${r.status})`)
      else if (r.status >= 500) registrar(fase, teste, perfil, 'GET', caminho, 'ver a operação', r, perfil === 'MASTER' ? 'INCONCLUSIVO' : (masterOk ? 'FALHA' : 'INCONCLUSIVO'), `erro ${r.status}: ${trecho(r)}`)
      else registrar(fase, teste, perfil, 'GET', caminho, 'ver a operação', r, perfil === 'MASTER' ? 'INCONCLUSIVO' : 'FALHA', ok2xx(r) ? 'resposta sem a operação' : `negado: ${trecho(r)}`)
    } else {
      if (bloqueio(r) || (ok2xx(r) && !enxerga)) registrar(fase, teste, perfil, 'GET', caminho, 'não ver a operação', r, 'OK', ok2xx(r) ? 'resposta sem a operação' : '')
      else if (r.status >= 500) registrar(fase, teste, perfil, 'GET', caminho, 'não ver a operação', r, masterOk ? 'FALHA' : 'INCONCLUSIVO', `erro ${r.status} em vez de bloqueio: ${trecho(r)}`)
      else registrar(fase, teste, perfil, 'GET', caminho, 'não ver a operação', r, 'FALHA', `VAZAMENTO: operação de outra franquia devolvida: ${trecho(r)}`)
    }
  }
}

// Escrita de quem não é dono: tem de ser recusada; se passar, a alteração aconteceu de fato e é FALHA.
const tentarIntruso = async (fase, teste, perfil, metodo, caminho, corpo) => {
  const r = await chamar(perfil, metodo, caminho, `${fase}-${teste}`, corpo)
  if (bloqueio(r)) registrar(fase, teste, perfil, metodo, caminho, 'recusar', r, 'OK', trecho(r))
  else if (ok2xx(r)) registrar(fase, teste, perfil, metodo, caminho, 'recusar', r, 'FALHA', `ESCRITA ACEITA em operação de outra franquia: ${trecho(r)}`)
  else registrar(fase, teste, perfil, metodo, caminho, 'recusar', r, 'ALERTA', `recusada por erro ${r.status}, não por regra: ${trecho(r)}`)
  return r
}

// Escrita do dono: tem de passar; sem permissão de papel, repete como MASTER para o fluxo seguir.
const agirDono = async (fase, teste, metodo, caminho, corpo, { aceitarErro } = {}) => {
  const r = await chamar(DONO, metodo, caminho, `${fase}-${teste}`, corpo)
  if (ok2xx(r)) {
    registrar(fase, teste, DONO, metodo, caminho, 'aceitar', r, 'OK', '')
    return r
  }
  if (aceitarErro && aceitarErro(r)) return r
  registrar(fase, teste, DONO, metodo, caminho, 'aceitar', r, r.status === 403 ? 'FALHA' : 'ALERTA', `dono da franquia não conseguiu: ${trecho(r)} — repetindo como MASTER`)
  const m = await chamar('MASTER', metodo, caminho, `${fase}-${teste}-master`, corpo)
  registrar(fase, `${teste} (repetido)`, 'MASTER', metodo, caminho, 'aceitar', m, ok2xx(m) ? 'OK' : 'INCONCLUSIVO', ok2xx(m) ? '' : trecho(m))
  if (!ok2xx(m)) {
    const erro = new Error(`${metodo} ${caminho} falhou também como MASTER: ${m.status} ${trecho(m)}`)
    erro.resposta = m
    throw erro
  }
  return m
}

const corpoPlanilha = async ({ fundo, valor, parcelas: quantidade, codigoContrato }) => {
  const [pessoa] = await consultar(`SELECT TOP 1 p.cnpjCpf, COALESCE(p.razaoSocial, p.nome) nome, p.email, e.cep, e.endereco, e.endereco_num,
      e.cidade, e.UF uf, e.bairro FROM MC_CED_CEDENTE c WITH (NOLOCK) JOIN MC_CAD_PESSOA p WITH (NOLOCK) ON p.id = c.idPessoa
    LEFT JOIN MC_CAD_PESSOA_ENDERECO e WITH (NOLOCK) ON e.idPessoa = p.id AND e.ativo = 1 WHERE c.id = ${opcoes.cedente} ORDER BY e.enderecoPrincipal DESC`)
  const sacado = {
    pessoaFisica: false, documento: pessoa.cnpjCpf, nome: pessoa.nome, cep: pessoa.cep, logradouro: pessoa.endereco,
    numero: pessoa.endereco_num, cidade: pessoa.cidade, uf: pessoa.uf, bairro: pessoa.bairro, pais: 'Brasil', email: pessoa.email
  }
  const taxa = 2.37
  const amortizacao = arredondar(valor / quantidade)
  let saldo = valor
  const parcelas = Array.from({ length: quantidade }, (_, indice) => {
    const principal = indice === quantidade - 1 ? arredondar(saldo) : amortizacao
    const juros = arredondar(saldo * (taxa / 100))
    const parcela = {
      sacado, numeroDocumento: `${codigoContrato}-${indice + 1}`, vencimento: `${formatarData(30 * (indice + 1)).slice(0, 10)}T00:00:00`,
      valor: arredondar(principal + juros), prazo: 30, prazoDmais: 0, juros, valorJuros: juros, valorDesagio: juros,
      valorAmortizacao: principal, saldoDevedor: arredondar(saldo), saldoPrincipal: arredondar(saldo), saldoRemanescente: arredondar(saldo),
      amortizacaoAcumulada: arredondar(valor - saldo), valorIOF: 0, valorIofVariavel: 0, valorIofFixo: 0, valorJurosIncCarencia: 0
    }
    saldo -= principal
    return parcela
  })
  return {
    idSegmentoCedente: null, codigoContrato, periodoTaxa: 30, taxa, taxaJurosRemuneratorio: taxa, percJurosRemuneratorio: taxa,
    codigoPropostaADM: '', valorLiquido: valor, valorSolicitado: valor, idFundo: fundo, qtdCarencia: 0, custos: [],
    valorTotalDesagio: arredondar(parcelas.reduce((soma, p) => soma + p.juros, 0)), dataOperacao: dataPlanilha(0),
    idCedente: opcoes.cedente, fluxoIrregular: '[]', idCedenteSacado: opcoes.cedente, produto: { id: Number(opcoes.produto) },
    flutuador: 0, parcelas, qtdCotasAquisicao: 0, tipoCalculoPMT: 'SAC', valorPU: 0, desagioFatorAno: 32.47,
    indDesconsideraDiaOperacao: false, indCoobrigado: true, indRepactuacao: false, indIOFTitulo: false, indIOFEmissao: false,
    indCalculoAutomatico: 0, indVencimentoAutomatico: 0, qtdCarenciaOperacao: null, dataBaseCarencia: null, valorJurosCarencia: 0,
    valorIOFEmissao: 0, dataEmissao: dataPlanilha(0), data1Vencimento: parcelas[0].vencimento.slice(0, 10), indIncorporaJuros: false,
    periodicidadeParcela: 1, percBullet: 0, indTarifaFinanciada: true, indTipoVencimento: 'COM', indIOFFinanciado: 'ISENTO',
    indTipoTaxa: 'CAPITALIZADA'
  }
}

const operacoesIndevidas = []
let aceitesIntruso = Number(opcoes.intrusoComprovado || 0)
const alcadasVotadas = new Set()
let efetivacoes = Number(opcoes.efetivacoes || 0)

const faseTelaPlanilha = async () => {
  const fase = 'F1-tela-planilha'
  const c = opcoes.cedente
  const fundosPorFranquia = await consultar(`SELECT TOP 100 idFundo, idFranquia FROM MC_CAD_FUNDO_FRANQUIA WITH (NOLOCK)`)
  const franquiaDoFundo = new Map(fundosPorFranquia.map((l) => [Number(l.idFundo), Number(l.idFranquia)]))
  const franquiasDoPerfil = {}
  for (const perfil of PERFIS) {
    const r = await fetch(`${PROXY}/__franquias/${perfil}`).then((x) => x.text())
    franquiasDoPerfil[perfil] = (r.match(/\d+/g) || []).map(Number)
  }
  log(`franquias por perfil: ${JSON.stringify(franquiasDoPerfil)}`)

  // Combo de fundos da planilha: cada perfil só pode listar fundos das próprias franquias.
  const caminhoFundos = `/mc-cedente-ms/api/v1/fundoCedente/${c}?indHabilitadoAdministradora=true`
  for (const perfil of PERFIS) {
    const r = await chamar(perfil, 'GET', caminhoFundos, `${fase}-fundos`)
    if (!ok2xx(r)) {
      registrar(fase, 'combo de fundos do cedente', perfil, 'GET', caminhoFundos, 'só fundos das próprias franquias', r, r.status >= 500 ? 'FALHA' : 'ALERTA', trecho(r))
      continue
    }
    const lista = Array.isArray(r.json) ? r.json : (r.json?.content || [])
    const fundos = [...new Set(lista.map((item) => Number(item.idFundo ?? item.fundo?.id ?? item.id)).filter(Boolean))]
    const permitidas = franquiasDoPerfil[perfil]
    const fora = permitidas.length ? fundos.filter((f) => !permitidas.includes(franquiaDoFundo.get(f))) : []
    registrar(fase, 'combo de fundos do cedente', perfil, 'GET', caminhoFundos, 'só fundos das próprias franquias', r,
      fora.length ? 'FALHA' : (fundos.length ? 'OK' : 'ALERTA'),
      `fundos=[${fundos.join(',')}]${fora.length ? ` VAZAMENTO fundos de outra franquia=[${fora.join(',')}]` : ''}${fundos.length ? '' : ' (lista vazia)'}`)
  }
  for (const [perfil, idFranquia] of [['FRQ_A', 1], ['FRQ_B', 2]]) {
    const proprio = `${caminhoFundos}&idFranquia=${idFranquia}`
    const r = await chamar(perfil, 'GET', proprio, `${fase}-fundos-franquia-propria`)
    registrar(fase, 'combo de fundos com a própria franquia na query', perfil, 'GET', proprio, '2xx', r, ok2xx(r) ? 'OK' : 'FALHA', ok2xx(r) ? '' : trecho(r))
    const outra = `${caminhoFundos}&idFranquia=${idFranquia === 1 ? 2 : 1}`
    const a = await chamar(perfil, 'GET', outra, `${fase}-fundos-franquia-adulterada`)
    registrar(fase, 'combo de fundos com idFranquia de outra franquia', perfil, 'GET', outra, '403', a,
      a.status === 403 ? 'OK' : (ok2xx(a) ? 'FALHA' : 'ALERTA'), trecho(a))
  }

  // Produtos do cedente: grupos exclusivos por franquia (45 só f1, 44 só f2, 19 só f3).
  const caminhoProdutos = `/mc-cedente-ms/api/v1/produtoCedente/listAll/${c}`
  for (const perfil of PERFIS) {
    const r = await chamar(perfil, 'GET', caminhoProdutos, `${fase}-produtos`)
    if (!ok2xx(r)) {
      registrar(fase, 'combo de produtos do cedente', perfil, 'GET', caminhoProdutos, 'só produtos das próprias franquias', r, r.status >= 500 ? 'FALHA' : 'ALERTA', trecho(r))
      continue
    }
    const lista = Array.isArray(r.json) ? r.json : []
    const franquias = [...new Set(lista.map((item) => item.idFranquia).filter((v) => v !== undefined && v !== null).map(Number))]
    const permitidas = franquiasDoPerfil[perfil]
    const fora = permitidas.length ? franquias.filter((f) => !permitidas.includes(f)) : []
    registrar(fase, 'combo de produtos do cedente', perfil, 'GET', caminhoProdutos, 'só produtos das próprias franquias', r,
      fora.length ? 'FALHA' : 'OK', `${lista.length} produtos, franquias=[${franquias.join(',')}]${fora.length ? ` VAZAMENTO=[${fora.join(',')}]` : ''}`)
  }

  // Demais listas da tela (dados globais): só não podem quebrar para perfil de franquia.
  const globais = [
    [`/mc-cedente-ms/api/v1/cedSegmento/listAllByCedente?idCedente=${c}`, 'segmentos do cedente'],
    ['/mc-cadastro-ms/api/v1/configuracaoParametroOperacao/search/0', 'parâmetros de operação'],
    ['/mc-cadastro-ms/api/v1/parametro/search/0', 'parâmetros globais'],
    ['/mc-cadastro-ms/api/v1/indicadorEconomico/listAll', 'indexadores'],
    [`/mc-cadastro-ms/api/v1/produtoTarifa/findAllProdutoTarifaByProdutoId/${opcoes.produto}`, 'tarifas do produto']
  ]
  for (const [caminho, nome] of globais) {
    const contagens = {}
    for (const perfil of PERFIS) {
      const r = await chamar(perfil, 'GET', caminho, `${fase}-global`)
      contagens[perfil] = r.status
      const quebra = r.status >= 500 && perfil !== 'MASTER' && ok2xx({ status: contagens.MASTER })
      registrar(fase, `lista da tela: ${nome}`, perfil, 'GET', caminho, '2xx (dado global)', r, ok2xx(r) ? 'OK' : (quebra ? 'FALHA' : 'ALERTA'), ok2xx(r) ? '' : trecho(r))
    }
  }
}

const faseCriacao = async () => {
  const fase = 'F2-criacao'
  const caminho = '/mc-operacao-api-ms/v1/pre-operacoes/operacaoPlanilha'
  const sufixo = String(Date.now()).slice(-5)
  const valorBase = Number(opcoes.valor)

  // Perfis de outra franquia tentando criar operação no fundo do dono (e o dono no fundo de outra franquia).
  const tentativas = [
    ['FRQ_B', opcoes.fundo, `NFB${sufixo}`, 'franquia 2 cria no fundo da franquia 1'],
    ['FRQ_C', opcoes.fundo, `NFC${sufixo}`, 'franquia 3 cria no fundo da franquia 1'],
    [DONO, opcoes.fundoOutraFranquia, `NFX${sufixo}`, 'franquia 1 cria no fundo da franquia 2']
  ]
  for (const [perfil, fundo, contrato, teste] of tentativas) {
    const corpo = await corpoPlanilha({ fundo: Number(fundo), valor: arredondar(valorBase / 3), parcelas: 2, codigoContrato: contrato })
    const r = await tentarIntruso(fase, teste, perfil, 'POST', caminho, corpo)
    if (ok2xx(r)) operacoesIndevidas.push({ perfil, fundo, id: r.json?.id, contrato })
  }
  const corpoAdulterado = await corpoPlanilha({ fundo: Number(opcoes.fundo), valor: arredondar(valorBase / 3), parcelas: 2, codigoContrato: `NFQ${sufixo}` })
  const r = await tentarIntruso(fase, 'franquia 2 cria no fundo 1 com ?idFranquia=1 na query', 'FRQ_B', 'POST', `${caminho}?idFranquia=1`, corpoAdulterado)
  if (ok2xx(r)) operacoesIndevidas.push({ perfil: 'FRQ_B', fundo: opcoes.fundo, id: r.json?.id, contrato: `NFQ${sufixo}` })

  const corpo = await corpoPlanilha({ fundo: Number(opcoes.fundo), valor: valorBase, parcelas: Number(opcoes.parcelas), codigoContrato: `NFA${sufixo}` })
  const criada = await agirDono(fase, 'dono (franquia 1) cria a operação no fundo 1', 'POST', caminho, corpo)
  const idOperacao = Number(criada.json?.id)
  if (!idOperacao) throw new Error(`criação não devolveu id: ${trecho(criada)}`)
  log(`OPERAÇÃO DO TESTE: ${idOperacao} (contrato NFA${sufixo})`)
  await dormir(4000)
  return idOperacao
}

const conferirBanco = async (fase, idOperacao) => {
  const [op] = await consultar(`SELECT TOP 1 o.id, o.idFundo, o.idCedente, o.idProduto, o.situacao, o.indEfetivada, o.indPaga,
      o.idContaBancariaFundo, o.idLocalCobranca, po.idFranquia idFranquiaPreOperacao, po.situacao situacaoPreOperacao,
      ff.idFranquia idFranquiaDoFundo, (SELECT COUNT(*) FROM MC_MOP_TITULOS t WITH (NOLOCK) WHERE t.idOperacao = o.id) titulos
    FROM MC_MOP_OPERACAO o WITH (NOLOCK) LEFT JOIN MC_MOP_PRE_OPERACAO po WITH (NOLOCK) ON po.id = o.id
    LEFT JOIN MC_CAD_FUNDO_FRANQUIA ff WITH (NOLOCK) ON ff.idFundo = o.idFundo WHERE o.id = ${idOperacao}`)
  log(`banco (${fase}): ${JSON.stringify(op)}`)
  const resposta = { status: 'banco', arquivo: '' }
  if (!op) {
    registrar(fase, 'operação gravada', 'banco', 'SQL', 'MC_MOP_OPERACAO', 'existe', resposta, 'FALHA', 'operação não encontrada')
    return op
  }
  registrar(fase, 'fundo da operação pertence à franquia do dono', 'banco', 'SQL', 'MC_MOP_OPERACAO/MC_CAD_FUNDO_FRANQUIA', 'franquia 1',
    resposta, Number(op.idFranquiaDoFundo) === 1 ? 'OK' : 'FALHA', `idFundo=${op.idFundo} franquiaDoFundo=${op.idFranquiaDoFundo}`)
  registrar(fase, 'pré-operação gravada com a franquia do fundo', 'banco', 'SQL', 'MC_MOP_PRE_OPERACAO.idFranquia', 'franquia 1',
    resposta, Number(op.idFranquiaPreOperacao) === 1 ? 'OK' : (op.idFranquiaPreOperacao === null ? 'ALERTA' : 'FALHA'), `idFranquia=${op.idFranquiaPreOperacao}`)
  return op
}

const faseVisibilidade = async (fase, idOperacao, cnpj, { posPagamento = false } = {}) => {
  const hoje = new Date().toISOString().slice(0, 10)
  const inicio = new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10)
  await testarLeitura(fase, 'planilha da operação (findOperacaoPlanilha)', `/mc-operacao-api-ms/v1/pre-operacoes/findOperacaoPlanilha?idOperacao=${idOperacao}`, idOperacao, { porId: true })
  await testarLeitura(fase, 'extrato/dados da operação (esteiramop/consultar)', `/mc-operacao-backoffice-ms/api/v1/esteiramop/consultar/${idOperacao}`, idOperacao, { porId: true })
  await testarLeitura(fase, 'resumo de créditos (esteiramop/creditos)', `/mc-operacao-backoffice-ms/api/v1/esteiramop/creditos/${idOperacao}`, idOperacao, { porId: true })
  await testarLeitura(fase, 'operações do cedente (consultaOperacoes)', `/mc-operacao-api-ms/v1/operacoes/consultaOperacoes?idCedente=${opcoes.cedente}`, idOperacao)
  await testarLeitura(fase, 'Monitor Diário (pre-operacoes/painel)', `/mc-operacao-api-ms/v1/pre-operacoes/painel?dataInicial=${inicio}&dataFinal=${hoje}`, idOperacao)
  await testarLeitura(fase, 'busca da esteira MOP', `/mc-multiflow-ms/api/v1/esteira/pesquisar?nome=MOP_${idOperacao}&status=${posPagamento ? 'FINALIZADO' : 'EXECUTANDO'}`, idOperacao)
  await testarLeitura(fase, 'títulos da operação', `/mc-operacao-api-ms/v1/operacoes/${idOperacao}/titulos`, idOperacao, { porId: true })
  await testarLeitura(fase, 'perfil de operação do cedente', `/mc-operacao-backoffice-ms/api/v1/esteiramop/perfilOperacao/${cnpj}`, idOperacao, { porId: true, perfis: ['MASTER', 'FRQ_A', 'FRQ_B'] })
  for (const [perfil, idFranquia] of [['FRQ_B', 1], ['FRQ_C', 1]]) {
    const caminho = `/mc-operacao-api-ms/v1/pre-operacoes/findOperacaoPlanilha?idOperacao=${idOperacao}&idFranquia=${idFranquia}`
    const r = await chamar(perfil, 'GET', caminho, `${fase}-adulterada`)
    registrar(fase, 'planilha com idFranquia do dono na query (adulterado)', perfil, 'GET', caminho, '403', r,
      r.status === 403 ? 'OK' : (ok2xx(r) && !vazio(r) ? 'FALHA' : 'ALERTA'), trecho(r))
  }
  if (posPagamento) {
    await testarLeitura(fase, 'Raio-X carteira da operação', `/mc-raiox-ms/v1/raio-x/carteira?idOperacao=${idOperacao}`, idOperacao, { porId: true })
    await testarLeitura(fase, 'Raio-X totalizadores da operação', `/mc-raiox-ms/v1/raio-x/carteira/totalizadores?idOperacao=${idOperacao}`, idOperacao, { porId: true })
    await testarLeitura(fase, 'arquivo/extrato da operação (consultar-arquivo)', `/mc-operacao-backoffice-ms/api/v1/esteiramop/consultar-arquivo/${idOperacao}`, idOperacao, { porId: true })
  }
}

const faseEdicaoPlanilha = async (idOperacao) => {
  const fase = 'F4-edicao-planilha'
  const leitura = await chamar(DONO, 'GET', `/mc-operacao-api-ms/v1/pre-operacoes/findOperacaoPlanilha?idOperacao=${idOperacao}`, `${fase}-leitura`)
  if (!ok2xx(leitura) || !leitura.json) {
    registrar(fase, 'ler a planilha para regravar', DONO, 'GET', 'findOperacaoPlanilha', '2xx', leitura, 'INCONCLUSIVO', `sem corpo para regravar: ${trecho(leitura)}`)
    return
  }
  const caminho = '/mc-operacao-api-ms/v1/pre-operacoes/updateOperacaoPlanilha'
  await tentarIntruso(fase, 'franquia 2 regrava a planilha da operação da franquia 1 (sem mudança)', INTRUSO, 'PUT', caminho, leitura.json)
  const r = await chamar(DONO, 'PUT', caminho, `${fase}-dono`, leitura.json)
  registrar(fase, 'dono regrava a planilha (sem mudança)', DONO, 'PUT', caminho, '2xx', r, ok2xx(r) ? 'OK' : (r.status === 403 ? 'FALHA' : 'INCONCLUSIVO'), ok2xx(r) ? '' : trecho(r))
}

const fasePagamentos = async (idOperacao) => {
  const fase = 'F5-pagamentos'
  const base = '/mc-operacao-backoffice-ms/api/v1/contabancaria'
  const [contaFundoDono] = await consultar(`SELECT TOP 1 idContaBancariaFundo FROM MC_MOP_OPERACAO WITH (NOLOCK) WHERE idContaBancariaFundo IS NOT NULL AND idFundo = ${opcoes.fundo} ORDER BY id DESC`)
  const [contaFundoOutra] = await consultar(`SELECT TOP 1 idContaBancariaFundo FROM MC_MOP_OPERACAO WITH (NOLOCK) WHERE idContaBancariaFundo IS NOT NULL AND idFundo = ${opcoes.fundoOutraFranquia} ORDER BY id DESC`)
  const contaDono = Number(contaFundoDono.idContaBancariaFundo)
  const contaOutra = Number(contaFundoOutra.idContaBancariaFundo)
  const associar = `${base}/associar?codigoPessoaContaBancaria=${opcoes.contaCedente}&codigoOperacao=${idOperacao}`
  const contaFundo = (conta) => `${base}/updateContaBancariaFundo?codigoContaBancaria=${conta}&codigoOperacao=${idOperacao}`
  const local = `${base}/updateLocalCobranca?codigoOperacao=${idOperacao}&codigoLocalCobranca=${opcoes.localCobranca}`

  await tentarIntruso(fase, 'franquia 2 associa conta do cedente na operação da franquia 1', INTRUSO, 'PUT', associar)
  await tentarIntruso(fase, 'franquia 2 grava conta do fundo na operação da franquia 1', INTRUSO, 'PUT', contaFundo(contaDono))
  await tentarIntruso(fase, 'franquia 2 grava local de cobrança na operação da franquia 1', INTRUSO, 'PUT', local)
  await agirDono(fase, 'dono associa conta de pagamento do cedente', 'PUT', associar)
  const cruzada = await chamar(DONO, 'PUT', contaFundo(contaOutra), `${fase}-conta-fundo-outra-franquia`)
  registrar(fase, `dono grava conta do fundo ${opcoes.fundoOutraFranquia} (outra franquia, conta ${contaOutra}) na operação do fundo ${opcoes.fundo}`, DONO, 'PUT',
    contaFundo(contaOutra), 'recusar', cruzada, bloqueio(cruzada) ? 'OK' : (ok2xx(cruzada) ? 'FALHA' : 'ALERTA'),
    ok2xx(cruzada) ? 'conta bancária de fundo de outra franquia aceita (será restaurada)' : trecho(cruzada))
  await agirDono(fase, `dono grava conta do fundo correta (${contaDono})`, 'PUT', contaFundo(contaDono))
  await agirDono(fase, 'dono grava local de cobrança', 'PUT', local)
}

const efetivarEAguardar = async (fase, idOperacao) => {
  const [estado] = await consultar(`SELECT TOP 1 indEfetivada FROM MC_MOP_OPERACAO WITH (NOLOCK) WHERE id = ${idOperacao}`)
  const caminho = `/mc-operacao-backoffice-ms/api/v1/operacoes/${idOperacao}/efetivar`
  if (!estado.indEfetivada) {
    // A franquia 2 só tenta na primeira efetivação; se ela passar, a efetivação já está na fila e o dono só aguarda.
    const r = efetivacoes++ === 0 ? await tentarIntruso(fase, 'franquia 2 efetiva a operação da franquia 1', INTRUSO, 'PUT', caminho) : { status: 0 }
    if (!ok2xx(r)) await agirDono(fase, 'dono efetiva a operação', 'PUT', caminho, undefined, { aceitarErro: (x) => /em processamento/.test(x.texto || '') })
  }
  for (let tentativa = 0; tentativa < 40; tentativa++) {
    const [atual] = await consultar(`SELECT TOP 1 indEfetivada, indGeraDocumento FROM MC_MOP_OPERACAO WITH (NOLOCK) WHERE id = ${idOperacao}`)
    if (atual.indEfetivada && !atual.indGeraDocumento) return
    await dormir(3000)
  }
  throw new Error(`operação ${idOperacao} não ficou efetivada após 2 minutos`)
}

const faseEsteira = async (idOperacao) => {
  const fase = 'F6-esteira'
  let busca = await chamar(DONO, 'GET', `/mc-multiflow-ms/api/v1/esteira/pesquisar?nome=MOP_${idOperacao}&status=EXECUTANDO`, `${fase}-busca`)
  let resumo = (busca.json?.esteiras || []).find((item) => item.identificacao?.nome === `MOP_${idOperacao}`)
  let leitor = DONO
  if (!resumo) {
    registrar(fase, 'dono encontra a esteira da própria operação', DONO, 'GET', 'esteira/pesquisar', 'ver', busca, 'FALHA', `esteira não encontrada pelo dono: ${trecho(busca)}`)
    busca = await chamar('MASTER', 'GET', `/mc-multiflow-ms/api/v1/esteira/pesquisar?nome=MOP_${idOperacao}&status=EXECUTANDO`, `${fase}-busca-master`)
    resumo = (busca.json?.esteiras || []).find((item) => item.identificacao?.nome === `MOP_${idOperacao}`)
    leitor = 'MASTER'
    if (!resumo) throw new Error(`esteira MOP_${idOperacao} não encontrada nem pelo MASTER`)
  }
  const idEsteira = resumo.id
  log(`esteira ${idEsteira}`)
  const etapasVistas = []
  for (let rodada = 0; rodada < ETAPAS_MAXIMAS; rodada++) {
    const leitura = await chamar(leitor, 'GET', `/mc-multiflow-ms/api/v1/esteira/pesquisarporid/${idEsteira}`, `${fase}-leitura`)
    const etapa = (leitura.json?.etapas || []).filter((item) => ['CRIADO', 'EXECUTANDO'].includes(item.status))
      .sort((a, b) => a.ordemExecucao - b.ordemExecucao)[0]
    if (!etapa) return { idEsteira, status: leitura.json?.status, etapas: etapasVistas }
    const nomeEtapa = `etapa ${etapa.ordemExecucao} ${etapa.nome}`
    const sub = `${fase} ${etapa.ordemExecucao}-${etapa.nome}`
    etapasVistas.push(etapa.nome)
    log(`--- ${nomeEtapa} (${etapa.status})`)

    const intrusoLe = await chamar(INTRUSO, 'GET', `/mc-multiflow-ms/api/v1/esteira/pesquisarporid/${idEsteira}`, `${fase}-intruso-le`)
    registrar(sub, 'franquia 2 lê a esteira da operação da franquia 1', INTRUSO, 'GET', `esteira/pesquisarporid/${idEsteira}`, 'não ver', intrusoLe,
      bloqueio(intrusoLe) || (ok2xx(intrusoLe) && vazio(intrusoLe)) ? 'OK' : (ok2xx(intrusoLe) ? 'FALHA' : 'ALERTA'),
      ok2xx(intrusoLe) && !vazio(intrusoLe) ? 'VAZAMENTO: esteira de outra franquia devolvida' : trecho(intrusoLe))

    // Depois de comprovado (aceito em 2 etapas), a franquia 2 não tenta mais iniciar/finalizar: o dono conduz o restante.
    const intrusoConduz = aceitesIntruso < 2
    const iniciar = `/mc-multiflow-ms/api/v1/esteira/iniciarEtapa?idEsteira=${idEsteira}&idEtapa=${etapa.id}`
    if (etapa.status === 'CRIADO') {
      const r = intrusoConduz ? await tentarIntruso(sub, 'franquia 2 inicia a etapa', INTRUSO, 'POST', iniciar) : { status: 0 }
      if (!ok2xx(r)) await agirDono(sub, 'dono inicia a etapa', 'POST', iniciar)
    }
    const caminhoParecer = `/mc-multiflow-ms/api/v1/ocorrencia/parecer?idEsteira=${idEsteira}&idEtapa=${etapa.id}`
    await tentarIntruso(sub, 'franquia 2 grava parecer na etapa', INTRUSO, 'POST', caminhoParecer, { descricao: `${PARECER} (tentativa franquia 2)` })
    const ocorrencia = await agirDono(sub, 'dono grava parecer', 'POST', caminhoParecer, { descricao: PARECER })
    const idParecer = ocorrencia.json?.id

    if (ETAPA_PAGAMENTO.test(etapa.nome)) {
      await efetivarEAguardar(sub, idOperacao)
      const pagar = `/mc-operacao-backoffice-ms/api/v1/operacoes/${idOperacao}/pagarOperacao?idEsteira=${idEsteira}&idEtapa=${etapa.id}`
      const r = await tentarIntruso(sub, 'franquia 2 paga a operação da franquia 1', INTRUSO, 'POST', pagar)
      if (!ok2xx(r)) await agirDono(sub, 'dono paga a operação', 'POST', pagar)
      continue
    }
    // Etapa de alçada: a votação é feita como no Monitor Diário (PUT aprovar-alcada com o telefone do token do votante).
    const tipoAlcada = etapa.origem?.modeloSubEtapa?.tipoAlcada
    if (/Al[cç]ada/i.test(etapa.nome) && tipoAlcada && !alcadasVotadas.has(etapa.id)) {
      alcadasVotadas.add(etapa.id)
      const votar = `/mc-whatsapp-ms/v1/operacao/aprovar-alcada?idOperacao=${idOperacao}&tipoAlcada=${tipoAlcada}&phone=__TELEFONE__`
      const r = await tentarIntruso(sub, `franquia 2 aprova a alçada ${tipoAlcada}`, INTRUSO, 'PUT', votar)
      if (!ok2xx(r)) await agirDono(sub, `dono aprova a alçada ${tipoAlcada}`, 'PUT', votar)
      await dormir(6000)
      continue
    }
    const finalizar = `/mc-operacao-backoffice-ms/api/v1/esteiramop/finalizarEtapaOperacao?idEsteira=${idEsteira}&idEtapaAtual=${etapa.id}&idOperacao=${idOperacao}&idParecer=${idParecer}`
    if (intrusoConduz) {
      const intruso = await tentarIntruso(sub, 'franquia 2 finaliza a etapa', INTRUSO, 'PUT', finalizar)
      if (ok2xx(intruso)) {
        aceitesIntruso += 1
        continue
      }
    }
    const r = await chamar(DONO, 'PUT', finalizar, `${sub}-dono-finaliza`)
    if (ok2xx(r)) {
      registrar(sub, 'dono finaliza a etapa', DONO, 'PUT', finalizar, 'aceitar', r, 'OK', '')
      continue
    }
    if (/O EFETIVADA/.test(r.texto || '')) {
      registrar(sub, 'dono finaliza a etapa (exige operação efetivada)', DONO, 'PUT', finalizar, 'aceitar', r, 'OK', 'regra da esteira: efetivar antes')
      await efetivarEAguardar(sub, idOperacao)
      await agirDono(sub, 'dono finaliza a etapa após efetivar', 'PUT', finalizar)
      continue
    }
    registrar(sub, 'dono finaliza a etapa', DONO, 'PUT', finalizar, 'aceitar', r, r.status === 403 ? 'FALHA' : 'ALERTA', `${trecho(r)} — repetindo como MASTER`)
    const m = await chamar('MASTER', 'PUT', finalizar, `${sub}-master-finaliza`)
    registrar(sub, 'finaliza a etapa (repetido)', 'MASTER', 'PUT', finalizar, 'aceitar', m, ok2xx(m) ? 'OK' : 'INCONCLUSIVO', ok2xx(m) ? '' : trecho(m))
    if (!ok2xx(m)) throw new Error(`etapa ${nomeEtapa} travada: ${trecho(m)}`)
  }
  throw new Error(`esteira ${idEsteira} não terminou em ${ETAPAS_MAXIMAS} etapas`)
}

const conferirBancoFinal = async (idOperacao) => {
  const fase = 'F8-banco-final'
  const op = await conferirBanco(fase, idOperacao)
  const resposta = { status: 'banco', arquivo: '' }
  registrar(fase, 'operação paga e efetivada', 'banco', 'SQL', 'MC_MOP_OPERACAO', 'indPaga=1, indEfetivada=1', resposta,
    op.indPaga && op.indEfetivada ? 'OK' : 'ALERTA', `indPaga=${op.indPaga} indEfetivada=${op.indEfetivada} situacao=${op.situacao} titulos=${op.titulos}`)
  const titulos = await consultar(`SELECT TOP 100 t.id, t.idFundo FROM MC_MOP_TITULOS t WITH (NOLOCK) WHERE t.idOperacao = ${idOperacao}`)
  const fundos = [...new Set(titulos.map((t) => t.idFundo))]
  registrar(fase, 'títulos gerados no fundo da franquia do dono', 'banco', 'SQL', 'MC_MOP_TITULOS', `fundo ${opcoes.fundo}`, resposta,
    titulos.length && fundos.every((f) => Number(f) === Number(opcoes.fundo)) ? 'OK' : (titulos.length ? 'FALHA' : 'ALERTA'), `${titulos.length} títulos, fundos=[${fundos.join(',')}]`)
  const raiox = await consultar(`SELECT TOP 100 idFranquia, COUNT(*) qtd FROM VW_RAIOX_CARTEIRA_TIT WITH (NOLOCK) WHERE idOperacao = ${idOperacao} GROUP BY idFranquia`)
  registrar(fase, 'títulos no Raio-X com a franquia do fundo', 'banco', 'SQL', 'VW_RAIOX_CARTEIRA_TIT', 'idFranquia 1', resposta,
    raiox.length && raiox.every((l) => Number(l.idFranquia) === 1) ? 'OK' : (raiox.length ? 'FALHA' : 'ALERTA'), JSON.stringify(raiox))
}

const principal = async () => {
  log(`INÍCIO teste planilha operacional x franquia — cedente ${opcoes.cedente}, fundo ${opcoes.fundo}, dono ${DONO}`)
  const [cedente] = await consultar(`SELECT TOP 1 p.cnpjCpf FROM MC_CED_CEDENTE c WITH (NOLOCK) JOIN MC_CAD_PESSOA p WITH (NOLOCK) ON p.id = c.idPessoa WHERE c.id = ${opcoes.cedente}`)
  let idOperacao = opcoes.operacao ? Number(opcoes.operacao) : null
  if (!idOperacao) {
    await faseTelaPlanilha()
    idOperacao = await faseCriacao()
    await conferirBanco('F3-banco-criacao', idOperacao)
    await faseVisibilidade('F3-visibilidade-criada', idOperacao, cedente.cnpjCpf)
    await faseEdicaoPlanilha(idOperacao)
    await fasePagamentos(idOperacao)
  }
  const esteira = await faseEsteira(idOperacao)
  log(`esteira ${esteira.idEsteira} terminou com status ${esteira.status}; etapas: ${esteira.etapas.join(' > ')}`)
  await faseVisibilidade('F7-visibilidade-paga', idOperacao, cedente.cnpjCpf, { posPagamento: true })
  await conferirBancoFinal(idOperacao)
  const totais = resultados.reduce((soma, l) => ({ ...soma, [l.veredito]: (soma[l.veredito] || 0) + 1 }), {})
  const resumo = { idOperacao, idEsteira: esteira.idEsteira, statusEsteira: esteira.status, etapas: esteira.etapas, operacoesIndevidas, totais }
  fs.writeFileSync(path.join(pastaSaida, 'resumo.json'), JSON.stringify(resumo, null, 2))
  log(`FIM ${JSON.stringify(resumo)}`)
}

principal()
  .catch((erro) => {
    log(`ERRO: ${erro.stack || erro.message}`)
    fs.writeFileSync(path.join(pastaSaida, 'resumo-parcial.json'), JSON.stringify({ erro: erro.message, operacoesIndevidas, resultados: resultados.length }, null, 2))
    process.exitCode = 1
  })
  .finally(closeAllPools)
