/**
 * @description Cria massa de operação em HML de ponta a ponta, direto pelas APIs (sem Cypress):
 * digitação da pré-operação, geração da operação, dados da esteira, conta de pagamento do cedente
 * e avanço de todas as etapas da esteira MOP (iniciar, parecer, finalizar), efetivando a operação
 * quando o validador da esteira exigir. Funciona para qualquer modelo de esteira, pois percorre as
 * etapas que a própria esteira devolve.
 *
 * Somente HML: usa exclusivamente HML_API_* e HOMOLOG_DB_* do .env — não há caminho para produção.
 *
 * Uso:
 *   node --use-system-ca scripts/massaOperacaoHml.cjs --cedente 5135 --lote 46:1:1:QF46A1,19:2:2:QF19A2
 *   (cada item do lote é produto:fundo:franquia:prefixoDocumento[:extras]; os títulos recebem prefixo + 01..NN;
 *   extras opcional: R = inclui recompra de títulos do mesmo fundo, P = inclui as pendências abertas do fundo, RP = ambos)
 *
 * Opções:
 *   --cedente <id>           cedente da operação (obrigatório)
 *   --lote <itens>           uma ou mais operações, separadas por vírgula (obrigatório)
 *   --titulos <arquivo>      fixture dos títulos (padrão: cypress/fixtures/massaOperacaoTitulos.json)
 *   --parecer <texto>        parecer gravado em cada etapa (padrão: "MASSA DE TESTE AUTOMATIZADA")
 *   --localCobranca <id>     local de cobrança quando a operação não tiver um (padrão: 5)
 *   --contaCedente <id>      conta de pagamento do cedente (padrão: conta principal ativa do cadastro)
 *   --qtdRecompra <n>        quantos títulos recomprar quando o item tiver extra R (padrão: 3)
 *   --recomprarDe <ids>      com extra R, recompra só títulos das operações informadas (separadas por vírgula)
 *   --corrigirPagamento <ids> reabre a etapa de pagamento de esteiras finalizadas sem pagamento e paga a operação
 *   --pagarPendencias <ids>  só grava o valor pago das pendências já vinculadas às operações informadas (sem lote)
 *   --operacao <id>          retoma uma operação já gerada, a partir dos dados da esteira (lote de um item)
 *   --repactuar <id>         cria uma operação de repactuação (Planilha Operacional, produto da NC de origem) que recompra
 *                            os títulos em aberto da NC informada, no mesmo fundo; aceita --valor (padrão: saldo em aberto
 *                            da NC) e --parcelas (padrão: 3); com --operacao, retoma uma repactuação já criada.
 *                            Só NC com data de emissão (criada pela Planilha Operacional) pode ser repactuada.
 *   --planilhaNc <fundo>     cria uma NC comum pela Planilha Operacional no fundo informado (exige --cedente; aceita
 *                            --valor, padrão 15000, --parcelas e --produto, padrão 19) e percorre a esteira até o pagamento
 *   --contaFundo <id>        conta do fundo nas operações da planilha (padrão: última usada no mesmo fundo)
 *
 * Evidências (resposta integral de cada chamada) em cypress/output/massaOperacao/ (gitignored).
 */
/* global __dirname, process, console, fetch, setTimeout, URLSearchParams */
const fs = require('fs')
const path = require('path')

const raiz = path.resolve(__dirname, '..')
require('dotenv').config({ path: path.join(raiz, '.env'), quiet: true })
const { executeQuery, hmlConfig, closeAllPools } = require(path.join(raiz, 'cypress/support/db/dbClient.cjs'))

const TAMANHO_MAXIMO_DOCUMENTO = 10
const ETAPAS_MAXIMAS = 30
const TENTATIVAS_REDE = 3
const LOCAL_COBRANCA_PADRAO = 5
const pastaEvidencias = path.join(raiz, 'cypress/output/massaOperacao')

const lerArgumentos = (argv) => {
  const argumentos = {}
  for (let i = 0; i < argv.length; i += 2) {
    if (!argv[i].startsWith('--')) throw new Error(`Argumento inesperado: ${argv[i]}`)
    argumentos[argv[i].slice(2)] = argv[i + 1]
  }
  return argumentos
}

const dormir = (ms) => new Promise((resolver) => setTimeout(resolver, ms))
const hora = () => new Date().toTimeString().slice(0, 8)
const formatarData = (dias) => {
  const data = new Date()
  data.setDate(data.getDate() + dias)
  return `${data.toISOString().slice(0, 10)}T00:00:00`
}
const consultar = (sql) => executeQuery('hml', hmlConfig(), sql)

const criarCliente = () => {
  const baseUrl = process.env.HML_API_BASE_URL.replace(/\/$/, '')
  const urlToken = `${process.env.HML_API_LOGIN_URL}/auth/realms/multiplicacapital/protocol/openid-connect/token`
  let token = null
  let expiraEm = 0

  const obterToken = async () => {
    if (token && Date.now() < expiraEm - 30000) return token
    const corpo = new URLSearchParams({
      grant_type: 'password',
      client_id: 'autenticacao',
      username: process.env.HML_API_USERNAME,
      password: process.env.HML_API_PASSWORD
    })
    const resposta = await fetch(urlToken, { method: 'POST', body: corpo })
    if (!resposta.ok) throw new Error(`Login em HML falhou com status ${resposta.status}`)
    const dados = await resposta.json()
    token = dados.access_token
    expiraEm = Date.now() + dados.expires_in * 1000
    return token
  }

  return async (metodo, caminho, rotulo, corpo) => {
    const headers = { authorization: `Bearer ${await obterToken()}`, 'content-type': 'application/json' }
    const enviar = () => fetch(`${baseUrl}${caminho}`, {
      method: metodo,
      headers,
      body: corpo === undefined ? undefined : JSON.stringify(corpo)
    })
    let resposta
    // Falha de rede (sem resposta do servidor) é repetida; erro HTTP nunca é repetido aqui.
    for (let tentativa = 1; !resposta; tentativa++) {
      try {
        resposta = await enviar()
      } catch (erro) {
        if (tentativa >= TENTATIVAS_REDE) throw new Error(`${metodo} ${caminho}: ${erro.message} (${erro.cause?.code || erro.cause?.message || 'sem detalhe'})`, { cause: erro })
        await dormir(2000 * tentativa)
      }
    }
    const texto = await resposta.text()
    const carimbo = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15)
    fs.writeFileSync(path.join(pastaEvidencias, `${carimbo}-${rotulo}.json`), `${metodo} ${caminho}\nstatus ${resposta.status}\n\n${texto}`)
    if (resposta.status >= 300) {
      const erro = new Error(`${metodo} ${caminho} -> ${resposta.status}: ${texto.slice(0, 400)}`)
      erro.corpoResposta = texto
      throw erro
    }
    return texto ? JSON.parse(texto) : null
  }
}

const buscarContaPrincipalCedente = async (idCedente) => {
  const contas = await consultar(`SELECT TOP 1 cb.id FROM MC_CED_CEDENTE c
    JOIN MC_CAD_PESSOA_CONTA_BANCARIA cb ON cb.idPessoa = c.idPessoa
    WHERE c.id = ${Number(idCedente)} AND cb.ativo = 1 ORDER BY cb.contaPrincipal DESC, cb.id`)
  if (!contas.length) throw new Error(`Cedente ${idCedente} não tem conta bancária ativa`)
  return Number(contas[0].id)
}

const montarTitulos = (arquivo, prefixo) => {
  const modelos = JSON.parse(fs.readFileSync(arquivo, 'utf8'))
  return modelos.map((modelo, indice) => {
    const numeroDocumento = `${prefixo}${String(indice + 1).padStart(2, '0')}`
    if (numeroDocumento.length > TAMANHO_MAXIMO_DOCUMENTO) {
      throw new Error(`Número de documento ${numeroDocumento} passa de ${TAMANHO_MAXIMO_DOCUMENTO} caracteres`)
    }
    return { numeroDocumento, vencimento: formatarData(modelo.diasVencimento), valor: modelo.valor, sacado: modelo.sacado }
  })
}

const aguardarValidacaoPreOperacao = async (idPreOperacao) => {
  let situacao
  for (let tentativa = 0; tentativa < 30; tentativa++) {
    situacao = (await consultar(`SELECT TOP 1 situacao FROM MC_MOP_PRE_OPERACAO WHERE id = ${idPreOperacao}`))[0].situacao
    if (!['CRIADO', 'PROCESSANDO'].includes(situacao)) break
    await dormir(5000)
  }
  if (situacao !== 'VALIDADO') throw new Error(`Pré-operação ${idPreOperacao} não validou (situação ${situacao})`)
}

const ETAPA_PAGAMENTO = /^Pagamento/i

const efetivarEAguardar = async (chamar, log, prefixo, idOperacao) => {
  const [estado] = await consultar(`SELECT TOP 1 indEfetivada FROM MC_MOP_OPERACAO WHERE id = ${idOperacao}`)
  if (!estado.indEfetivada) {
    await chamar('PUT', `/mc-operacao-backoffice-ms/api/v1/operacoes/${idOperacao}/efetivar`, `${prefixo}-efetivar`)
  }
  // A efetivação é processada por fila (gera termos/documentos) e só depois marca indEfetivada.
  for (let tentativa = 0; tentativa < 40; tentativa++) {
    const [atual] = await consultar(`SELECT TOP 1 indEfetivada, indGeraDocumento FROM MC_MOP_OPERACAO WHERE id = ${idOperacao}`)
    if (atual.indEfetivada && !atual.indGeraDocumento) return
    await dormir(3000)
  }
  throw new Error(`Operação ${idOperacao} não ficou efetivada após 2 minutos`)
}

// A etapa de pagamento não é finalizada direto: o pagamento da operação (gera os títulos, liquida pendências
// e recompra) é quem avança a esteira, e ele exige a operação efetivada.
const pagarOperacao = async (chamar, log, prefixo, idEsteira, idEtapa, idOperacao) => {
  await efetivarEAguardar(chamar, log, prefixo, idOperacao)
  await chamar('POST', `/mc-operacao-backoffice-ms/api/v1/operacoes/${idOperacao}/pagarOperacao?idEsteira=${idEsteira}&idEtapa=${idEtapa}`,
    `${prefixo}-pagar`)
  const [paga] = await consultar(`SELECT TOP 1 o.indPaga, (SELECT COUNT(*) FROM MC_MOP_TITULOS t WHERE t.idOperacao = o.id) titulos
    FROM MC_MOP_OPERACAO o WHERE o.id = ${idOperacao}`)
  log(`operação ${idOperacao} paga: indPaga=${paga.indPaga}, títulos gerados=${paga.titulos}`)
}

const avancarEsteira = async (chamar, log, rotulo, idEsteira, idOperacao, parecer) => {
  for (let rodada = 0; rodada < ETAPAS_MAXIMAS; rodada++) {
    const esteira = await chamar('GET', `/mc-multiflow-ms/api/v1/esteira/pesquisarporid/${idEsteira}`, `${rotulo}-leitura`)
    const etapa = esteira.etapas
      .filter((item) => ['CRIADO', 'EXECUTANDO'].includes(item.status))
      .sort((a, b) => a.ordemExecucao - b.ordemExecucao)[0]
    if (!etapa) return esteira.status

    const prefixoEtapa = `${rotulo}-e${etapa.ordemExecucao}`
    log(`etapa ${etapa.ordemExecucao} ${etapa.nome}`)
    if (etapa.status === 'CRIADO') {
      await chamar('POST', `/mc-multiflow-ms/api/v1/esteira/iniciarEtapa?idEsteira=${idEsteira}&idEtapa=${etapa.id}`, `${prefixoEtapa}-iniciar`)
    }
    const ocorrencia = await chamar('POST', `/mc-multiflow-ms/api/v1/ocorrencia/parecer?idEsteira=${idEsteira}&idEtapa=${etapa.id}`,
      `${prefixoEtapa}-parecer`, { descricao: parecer })
    if (ETAPA_PAGAMENTO.test(etapa.nome)) {
      await pagarOperacao(chamar, log, prefixoEtapa, idEsteira, etapa.id, idOperacao)
      continue
    }
    const finalizar = () => chamar('PUT', `/mc-operacao-backoffice-ms/api/v1/esteiramop/finalizarEtapaOperacao?idEsteira=${idEsteira}` +
      `&idEtapaAtual=${etapa.id}&idOperacao=${idOperacao}&idParecer=${ocorrencia.id}`, `${prefixoEtapa}-finalizar`)
    try {
      await finalizar()
    } catch (erro) {
      // Cada finalização de etapa desfaz a efetivação; as etapas de tesouraria exigem a operação efetivada.
      if (!/O EFETIVADA/.test(erro.corpoResposta || '')) throw erro
      await efetivarEAguardar(chamar, log, prefixoEtapa, idOperacao)
      await finalizar()
    }
  }
  throw new Error(`Esteira ${idEsteira} não terminou em ${ETAPAS_MAXIMAS} etapas`)
}

// Para operações cuja esteira foi finalizada sem o pagamento: reabre a etapa de pagamento e paga a operação.
const corrigirPagamento = async (chamar, idOperacao) => {
  const rotulo = `corrigir-${idOperacao}`
  const log = (mensagem) => console.log(`${hora()} [${idOperacao}] ${mensagem}`)
  const [operacao] = await consultar(`SELECT TOP 1 indPaga, (SELECT COUNT(*) FROM MC_MOP_TITULOS t WHERE t.idOperacao = o.id) titulos
    FROM MC_MOP_OPERACAO o WHERE o.id = ${idOperacao}`)
  if (operacao.indPaga) {
    log(`já está paga (${operacao.titulos} títulos) — nada a fazer`)
    return { idOperacao, resultado: 'JA_PAGA', titulos: operacao.titulos }
  }
  let busca = await chamar('GET', `/mc-multiflow-ms/api/v1/esteira/pesquisar?nome=MOP_${idOperacao}&status=FINALIZADO`, `${rotulo}-busca`)
  let resumo = (busca.esteiras || []).find((item) => item.identificacao?.nome === `MOP_${idOperacao}`)
  if (!resumo) {
    busca = await chamar('GET', `/mc-multiflow-ms/api/v1/esteira/pesquisar?nome=MOP_${idOperacao}&status=EXECUTANDO`, `${rotulo}-busca-aberta`)
    resumo = (busca.esteiras || []).find((item) => item.identificacao?.nome === `MOP_${idOperacao}`)
  }
  if (!resumo) throw new Error(`Esteira MOP_${idOperacao} não encontrada`)
  const esteira = await chamar('GET', `/mc-multiflow-ms/api/v1/esteira/pesquisarporid/${resumo.id}`, `${rotulo}-esteira`)
  const etapa = esteira.etapas.filter((item) => ETAPA_PAGAMENTO.test(item.nome)).sort((a, b) => b.ordemExecucao - a.ordemExecucao)[0]
  if (!etapa) throw new Error(`Esteira ${resumo.id} não tem etapa de pagamento`)
  if (etapa.status !== 'EXECUTANDO') {
    await chamar('PUT', `/mc-multiflow-ms/api/v2/esteira/statusEtapa?idEsteira=${resumo.id}&idEtapa=${etapa.id}&status=EXECUTANDO`, `${rotulo}-reabrir`)
    log(`etapa ${etapa.ordemExecucao} ${etapa.nome} reaberta`)
  }
  await pagarOperacao(chamar, log, rotulo, resumo.id, etapa.id, idOperacao)
  const [final] = await consultar(`SELECT TOP 1 indPaga, indEfetivada, (SELECT COUNT(*) FROM MC_MOP_TITULOS t WHERE t.idOperacao = o.id) titulos
    FROM MC_MOP_OPERACAO o WHERE o.id = ${idOperacao}`)
  const depois = await chamar('GET', `/mc-multiflow-ms/api/v1/esteira/pesquisarporid/${resumo.id}`, `${rotulo}-esteira-final`)
  return { idOperacao, resultado: final.indPaga ? 'PAGA' : 'NAO_PAGA', titulos: final.titulos, indEfetivada: final.indEfetivada, esteira: depois.status }
}


const arredondar = (valor) => Math.round((Number(valor) || 0) * 100) / 100
const diasDesde = (dataIso) => {
  const hoje = new Date()
  const utcHoje = Date.UTC(hoje.getFullYear(), hoje.getMonth(), hoje.getDate())
  const [ano, mes, dia] = dataIso.slice(0, 10).split('-').map(Number)
  return Math.round((utcHoje - Date.UTC(ano, mes - 1, dia)) / 86400000)
}

// Mesmo cálculo da tela de recompra (mc-mf-mop, Repurchase/utils.ts → buildRecompraRow, e handleSave em
// Repurchase/index.tsx), sem devolução: o valor pago é o principal em aberto, juros e multa só para título vencido.
const montarTituloRecompra = (titulo, taxaJuros, taxaMulta) => {
  const prazo = diasDesde(titulo.dataVencimento)
  const vencido = prazo > 0
  const principal = Number(titulo.valorSaldoAbertoTotal) || 0
  const juros = vencido && taxaJuros ? arredondar(principal * (taxaJuros / 100) * (prazo / 30)) : 0
  const multa = vencido ? (taxaMulta ? arredondar(principal * (taxaMulta / 100)) : Number(titulo.valorMulta) || 0) : 0
  const desconto = Math.abs(Number(titulo.valorDesconto) || 0)
  const abatimento = Math.abs(Number(titulo.valorAbatimento) || 0)
  const jurosPre = Number(titulo.valorJurosPre) || 0
  const jurosRemuneratorio = Number(titulo.valorJurosRemuneratorio) || 0
  const corrigido = arredondar(principal + jurosPre + jurosRemuneratorio + juros + multa - abatimento - desconto)
  return {
    id: null,
    idTitulo: titulo.id,
    idProduto: titulo.idProduto,
    nossoNum: titulo.nossoNumero,
    numDoc: titulo.documento,
    nomeSacado: titulo.nomeSacado,
    vencimento: titulo.dataVencimento,
    dataVencimento: titulo.dataVencimento,
    taxaJuros,
    taxaMulta,
    taxaDevolucaoVencer: 0,
    valorDeFace: titulo.valorDeFace || 0,
    valorPrincipalPago: principal,
    valorSaldoAbertoTotal: principal,
    valorDeFacePago: principal,
    valorDeFaceCorrigido: corrigido,
    valorJuros: juros,
    valorMulta: multa,
    valorDesconto: desconto,
    valorAbatimento: abatimento,
    valorJurosPre: jurosPre,
    valorCorrecaoIndice: 0,
    valorJurosRemuneratorio: jurosRemuneratorio,
    valorDevolucao: 0,
    valorDiferenca: 0,
    valorRecompra: corrigido,
    valorTotal: corrigido,
    valorTotalRecompraTitulo: corrigido,
    indPendenciaDiferenca: false,
    indCalcDevolucao: false
  }
}

const incluirRecompra = async (chamar, log, rotulo, opcoes, idOperacao, fundo) => {
  // Como a tela, parte da recompra padrão da operação (evento de recompra, local de cobrança e taxas padrão).
  const padrao = await chamar('GET', `/mc-operacao-backoffice-ms/api/v1/recompra/findByOperacao/${idOperacao}/${opcoes.cedente}`,
    `${rotulo}-recompra-padrao`)
  const taxaJuros = Number(padrao.taxaJuros || padrao.valorPadraoTaxaJuros) || 0
  const taxaMulta = Number(padrao.taxaMulta || padrao.valorPadraoTaxaMulta) || 0
  const pagina = await chamar('GET', `/mc-operacao-backoffice-ms/api/v1/recompra/findTituloAllByCedente/${opcoes.cedente}/0` +
    `?numeroRegistros=50&idFundo=${fundo}&indVencidos=0&idOperacaoOrigem=${idOperacao}&notRecompra=true`, `${rotulo}-titulos-recompra`)
  const origens = opcoes.recomprarDe ? opcoes.recomprarDe.split(',').map(Number) : null
  const titulos = (pagina.content || [])
    .filter((titulo) => titulo.idOperacao !== idOperacao && (!origens || origens.includes(Number(titulo.idOperacao))))
    .slice(0, Number(opcoes.qtdRecompra))
  if (!titulos.length) throw new Error(`Nenhum título disponível para recompra no fundo ${fundo}`)
  const recompra = await chamar('POST', '/mc-operacao-backoffice-ms/api/v1/recompra/registerRecompra', `${rotulo}-recompra`, {
    ...padrao,
    idOperacao,
    idCedente: Number(opcoes.cedente),
    codigoEvento: padrao.codigoEvento,
    indManterEmCobranca: false,
    idProdutoCobranca: null,
    indCalcDevolucao: false,
    observacao: opcoes.parecer,
    indQuemPaga: 'C',
    taxaDevolucao: 0,
    taxaDevolucaoVencer: 0,
    taxaJuros,
    taxaMulta,
    recompraTitulos: titulos.map((titulo) => montarTituloRecompra(titulo, taxaJuros, taxaMulta)),
    dataReembolso: new Date().toISOString().replace('Z', '')
  })
  if (recompra.errosRecompra?.length) throw new Error(`Recompra recusou títulos: ${recompra.errosRecompra.join(' | ')}`)
  log(`recompra ${recompra.id} com ${titulos.length} títulos (${titulos.map((titulo) => titulo.documento).join(', ')})`)
  return recompra.id
}

const incluirPendencias = async (chamar, log, rotulo, opcoes, idOperacao, fundo, idLocalCobranca) => {
  const parametros = new URLSearchParams({ isLote: 'true', idCedente: opcoes.cedente, idFundo: fundo })
  const recibo = await chamar('POST', `/mc-operacao-backoffice-ms/api/v1/pendenciaRecibo/registerPendenciaRecibo?${parametros}`,
    `${rotulo}-pendencias`, {
      observacao: opcoes.parecer,
      taxaJuros: 1,
      calcValorCorrigido: false,
      pendencias: [],
      idOperacao,
      idCedente: Number(opcoes.cedente),
      idLocalCobranca,
      indQuemPaga: 'C'
    })
  log(`recibo de pendências ${recibo.id} com ${recibo.qtdPendencias ?? recibo.pendencias?.length} pendências`)
  await pagarPendencias(chamar, log, rotulo, idOperacao)
  return recibo.id
}

// O lote só vincula as pendências ao recibo; o valor pago de cada uma (o que a operação desconta) é gravado
// num segundo salvamento, como a tela faz ao editar a coluna de valor pago.
const pagarPendencias = async (chamar, log, rotulo, idOperacao) => {
  const recibo = await chamar('GET', `/mc-operacao-backoffice-ms/api/v1/pendenciaRecibo/findPendenciaReciboByOperacao/${idOperacao}?size=100&page=0`,
    `${rotulo}-recibo-pendencias`)
  const pendencias = (recibo.paginacaoPendencias?.content || []).map((pendencia) => ({
    ...pendencia,
    idLocalPagamento: pendencia.idLocalCobranca,
    valorLiquidado: pendencia.valorCorrigido
  }))
  if (!pendencias.length) throw new Error(`Recibo de pendências da operação ${idOperacao} está vazio`)
  const atualizado = await chamar('POST', '/mc-operacao-backoffice-ms/api/v1/pendenciaRecibo/registerPendenciaRecibo',
    `${rotulo}-pagar-pendencias`, { ...recibo, paginacaoPendencias: null, qtdPendencias: pendencias.length, pendencias, idOperacao, indQuemPaga: 'C' })
  log(`recibo ${atualizado.id}: valor pago ${atualizado.valorTotalPago} de ${pendencias.length} pendências`)
}

const criarOperacao = async (chamar, opcoes, item) => {
  const [produto, fundo, franquia, prefixo, extras = ''] = item.split(':')
  const rotulo = `${produto}-f${franquia}-fundo${fundo}-${prefixo}`
  const log = (mensagem) => console.log(`${hora()} [${rotulo}] ${mensagem}`)

  let idOperacao = opcoes.operacao ? Number(opcoes.operacao) : null
  if (!idOperacao) {
    const titulos = montarTitulos(opcoes.titulos, prefixo)
    const preOperacao = await chamar('POST', `/mc-operacao-api-ms/v1/pre-operacoes/digitacao?codigoProduto=${produto}` +
      `&idCedente=${opcoes.cedente}&idFundo=${fundo}&idFranquia=${franquia}`, `${rotulo}-digitacao`, titulos)
    idOperacao = preOperacao.id
    log(`pré-operação ${idOperacao} digitada`)
    await aguardarValidacaoPreOperacao(idOperacao)
    await chamar('POST', `/mc-operacao-api-ms/v1/pre-operacoes/${idOperacao}/gerar`, `${rotulo}-gerar`)
    log(`operação ${idOperacao} gerada`)
    await dormir(3000)
  }

  // O PUT dos dados da esteira apaga as tarifas não enviadas — por isso reenvia as que a consulta devolve.
  const dados = await chamar('GET', `/mc-operacao-backoffice-ms/api/v1/esteiramop/consultar/${idOperacao}`, `${rotulo}-consultar`)
  await chamar('PUT', `/mc-operacao-backoffice-ms/api/v1/esteiramop/${idOperacao}`, `${rotulo}-dados-esteira`, {
    codigoOperacao: idOperacao,
    codigoPreOperacao: dados.codigoPreOperacao,
    codigoProduto: dados.codigoProduto,
    codigoFundo: dados.codigoFundo,
    codigoLocalCobranca: opcoes.localCobranca ? Number(opcoes.localCobranca) : (dados.codigoLocalCobranca || LOCAL_COBRANCA_PADRAO),
    dataOperacao: dados.dataOperacao,
    valorTaxa: dados.valorTaxa || 3,
    calculoDesagio: dados.calculoDesagio || 'Misto_HP',
    valorFloat: dados.valorFloat ?? 2,
    tarifaCobranca: dados.tarifaCobranca ?? 5,
    quantidadeTitulos: dados.quantidadeTitulos,
    indCoobrigado: dados.indCoobrigado ?? true,
    indRemonte: false,
    tarifas: (dados.tarifas || []).map((tarifa) => ({ ...tarifa, codigoOperacao: idOperacao, indAlteradoManual: false }))
  })
  await chamar('PUT', `/mc-operacao-backoffice-ms/api/v1/contabancaria/associar?codigoPessoaContaBancaria=${opcoes.contaCedente}` +
    `&codigoOperacao=${idOperacao}`, `${rotulo}-conta-cedente`)

  let idRecompra = null
  let idReciboPendencia = null
  if (extras.includes('R')) {
    idRecompra = await incluirRecompra(chamar, log, rotulo, opcoes, idOperacao, fundo)
    await dormir(5000) // a recompra dispara o recálculo da operação de forma assíncrona
  }
  if (extras.includes('P')) {
    const localCobranca = opcoes.localCobranca ? Number(opcoes.localCobranca) : (dados.codigoLocalCobranca || LOCAL_COBRANCA_PADRAO)
    idReciboPendencia = await incluirPendencias(chamar, log, rotulo, opcoes, idOperacao, fundo, localCobranca)
  }

  const busca = await chamar('GET', `/mc-multiflow-ms/api/v1/esteira/pesquisar?nome=MOP_${idOperacao}&status=EXECUTANDO`, `${rotulo}-busca-esteira`)
  const esteira = (busca.esteiras || []).find((item) => item.identificacao?.nome === `MOP_${idOperacao}`)
  if (!esteira) throw new Error(`Esteira MOP_${idOperacao} não encontrada em execução`)
  const statusEsteira = await avancarEsteira(chamar, log, rotulo, esteira.id, idOperacao, opcoes.parecer)

  const carteira = await consultar(`SELECT TOP 100 numDocumento FROM VW_RAIOX_CARTEIRA_TIT WHERE idOperacao = ${idOperacao}`)
  log(`FIM operação ${idOperacao} esteira ${esteira.id} ${statusEsteira} | títulos no Raio-X: ${carteira.length}`)
  return { idOperacao, produto, fundo, franquia, idRecompra, idReciboPendencia, idEsteira: esteira.id, statusEsteira, titulosRaioX: carteira.length }
}

const dataPlanilha = (dias) => `${formatarData(dias).slice(0, 10)}T03:00:00`

// Parcelas SAC mensais, no formato que a Planilha Operacional envia (sacado = o próprio cedente, emitente da NC).
const montarParcelasRepactuacao = (valor, quantidade, taxaMensal, sacado, prefixo) => {
  const amortizacao = arredondar(valor / quantidade)
  let saldo = valor
  return Array.from({ length: quantidade }, (_, indice) => {
    const principalParcela = indice === quantidade - 1 ? arredondar(saldo) : amortizacao
    const juros = arredondar(saldo * (taxaMensal / 100))
    const parcela = {
      sacado,
      numeroDocumento: `${prefixo}-${indice + 1}`,
      vencimento: `${formatarData(30 * (indice + 1)).slice(0, 10)}T00:00:00`,
      valor: arredondar(principalParcela + juros),
      prazo: 30,
      prazoDmais: 0,
      juros,
      valorJuros: juros,
      valorDesagio: juros,
      valorAmortizacao: principalParcela,
      saldoDevedor: arredondar(saldo),
      saldoPrincipal: arredondar(saldo),
      saldoRemanescente: arredondar(saldo),
      amortizacaoAcumulada: arredondar(valor - saldo),
      valorIOF: 0,
      valorIofVariavel: 0,
      valorIofFixo: 0,
      valorJurosIncCarencia: 0
    }
    saldo -= principalParcela
    return parcela
  })
}

// indProcessamento não serve de sinal (o registro interno já grava false); o fim do processamento em fila é
// quando os títulos aparecem vinculados. A esteira só pode avançar depois disso: com a operação já efetivada ou
// paga, o processamento falha em silêncio e a recompra fica vazia.
const aguardarRecompraRepactuacao = async (idOperacao) => {
  for (let tentativa = 0; tentativa < 40; tentativa++) {
    const [recompra] = await consultar(`SELECT TOP 1 r.id, r.qtdTitulos, r.valorTotal, r.valorTotalPago,
        (SELECT COUNT(*) FROM MC_RECOMPRA_TITULO rt WHERE rt.idRecompra = r.id) vinculados FROM MC_RECOMPRA r WHERE r.idOperacao = ${idOperacao}`)
    if (!recompra && tentativa > 3) throw new Error(`Recompra de repactuação da operação ${idOperacao} sumiu (o processamento apaga quando falha)`)
    if (recompra && recompra.vinculados > 0) return recompra
    await dormir(3000)
  }
  throw new Error(`Recompra de repactuação da operação ${idOperacao} ficou sem títulos após 2 minutos — esteira não avançada`)
}

// Grava a operação pela Planilha Operacional (operação estruturada), como a tela SheetOperations envia.
const criarOperacaoPlanilha = async (chamar, rotulo, { idCedente, fundo, produto, valor, parcelas: quantidade, indRepactuacao, codigoContrato }) => {
  const [pessoa] = await consultar(`SELECT TOP 1 p.cnpjCpf, COALESCE(p.razaoSocial, p.nome) nome, p.email, e.cep, e.endereco, e.endereco_num,
      e.cidade, e.UF uf, e.bairro FROM MC_CED_CEDENTE c JOIN MC_CAD_PESSOA p ON p.id = c.idPessoa
    LEFT JOIN MC_CAD_PESSOA_ENDERECO e ON e.idPessoa = p.id AND e.ativo = 1 WHERE c.id = ${idCedente} ORDER BY e.enderecoPrincipal DESC`)
  const sacado = {
    pessoaFisica: false,
    documento: pessoa.cnpjCpf,
    nome: pessoa.nome,
    cep: pessoa.cep,
    logradouro: pessoa.endereco,
    numero: pessoa.endereco_num,
    cidade: pessoa.cidade,
    uf: pessoa.uf,
    bairro: pessoa.bairro,
    pais: 'Brasil',
    email: pessoa.email
  }
  const taxa = 2
  const parcelas = montarParcelasRepactuacao(valor, quantidade, taxa, sacado, codigoContrato)
  const juros = arredondar(parcelas.reduce((soma, parcela) => soma + parcela.juros, 0))
  const preOperacao = await chamar('POST', '/mc-operacao-api-ms/v1/pre-operacoes/operacaoPlanilha', `${rotulo}-planilha`, {
      idSegmentoCedente: null,
      codigoContrato,
      periodoTaxa: 30,
      taxa,
      taxaJurosRemuneratorio: taxa,
      percJurosRemuneratorio: taxa,
      codigoPropostaADM: '',
      valorLiquido: valor,
      valorSolicitado: valor,
      idFundo: fundo,
      qtdCarencia: 0,
      custos: [],
      valorTotalDesagio: juros,
      dataOperacao: dataPlanilha(0),
      idCedente,
      fluxoIrregular: '[]',
      idCedenteSacado: idCedente,
      produto: { id: Number(produto) },
      flutuador: 0,
      parcelas,
      qtdCotasAquisicao: 0,
      tipoCalculoPMT: 'SAC',
      valorPU: 0,
      desagioFatorAno: 26.82417946,
      indDesconsideraDiaOperacao: false,
      indCoobrigado: true,
      indRepactuacao,
      indIOFTitulo: false,
      indIOFEmissao: false,
      indCalculoAutomatico: 0,
      indVencimentoAutomatico: 0,
      qtdCarenciaOperacao: null,
      dataBaseCarencia: null,
      valorJurosCarencia: 0,
      valorIOFEmissao: 0,
      dataEmissao: dataPlanilha(0),
      data1Vencimento: parcelas[0].vencimento.slice(0, 10),
      indIncorporaJuros: false,
      periodicidadeParcela: 1,
      percBullet: 0,
      indTarifaFinanciada: true,
      indTipoVencimento: 'COM',
      indIOFFinanciado: 'ISENTO',
      indTipoTaxa: 'CAPITALIZADA'
  })
  await dormir(3000)
  return preOperacao.id
}

// Operação da planilha nasce sem conta de pagamento, conta do fundo e local de cobrança; a tela de Pagamentos grava os três.
// A conta do fundo padrão é a última usada por uma operação do mesmo fundo.
const prepararPagamentoPlanilha = async (chamar, rotulo, opcoes, idOperacao) => {
  await chamar('PUT', `/mc-operacao-backoffice-ms/api/v1/contabancaria/associar?codigoPessoaContaBancaria=${opcoes.contaCedente}` +
    `&codigoOperacao=${idOperacao}`, `${rotulo}-conta-cedente`)
  let contaFundo = opcoes.contaFundo ? Number(opcoes.contaFundo) : null
  if (!contaFundo) {
    const [ultima] = await consultar(`SELECT TOP 1 idContaBancariaFundo FROM MC_MOP_OPERACAO WHERE idContaBancariaFundo IS NOT NULL
      AND idFundo = (SELECT idFundo FROM MC_MOP_OPERACAO WHERE id = ${idOperacao}) ORDER BY id DESC`)
    if (!ultima) throw new Error(`Nenhuma conta de fundo conhecida para o fundo da operação ${idOperacao} — informe --contaFundo`)
    contaFundo = Number(ultima.idContaBancariaFundo)
  }
  await chamar('PUT', `/mc-operacao-backoffice-ms/api/v1/contabancaria/updateContaBancariaFundo?codigoContaBancaria=${contaFundo}` +
    `&codigoOperacao=${idOperacao}`, `${rotulo}-conta-fundo`)
  await chamar('PUT', `/mc-operacao-backoffice-ms/api/v1/contabancaria/updateLocalCobranca?codigoOperacao=${idOperacao}` +
    `&codigoLocalCobranca=${Number(opcoes.localCobranca || LOCAL_COBRANCA_PADRAO)}`, `${rotulo}-local-cobranca`)
}

const avancarEsteiraOperacao = async (chamar, log, rotulo, idOperacao, parecer) => {
  const busca = await chamar('GET', `/mc-multiflow-ms/api/v1/esteira/pesquisar?nome=MOP_${idOperacao}&status=EXECUTANDO`, `${rotulo}-busca-esteira`)
  const esteira = (busca.esteiras || []).find((item) => item.identificacao?.nome === `MOP_${idOperacao}`)
  if (!esteira) throw new Error(`Esteira MOP_${idOperacao} não encontrada em execução`)
  return { idEsteira: esteira.id, statusEsteira: await avancarEsteira(chamar, log, rotulo, esteira.id, idOperacao, parecer) }
}

// NC comum (sem repactuação) pela Planilha Operacional: só uma NC com data de emissão pode ser repactuada depois.
const criarNcPlanilha = async (chamar, opcoes) => {
  const idCedente = Number(opcoes.cedente)
  const fundo = Number(opcoes.planilhaNc)
  const rotulo = `nc-planilha-${idCedente}-fundo${fundo}`
  const log = (mensagem) => console.log(`${hora()} [${rotulo}] ${mensagem}`)
  let idOperacao = opcoes.operacao ? Number(opcoes.operacao) : null
  if (!idOperacao) {
    const valor = arredondar(opcoes.valor || 15000)
    idOperacao = await criarOperacaoPlanilha(chamar, rotulo, {
      idCedente, fundo, produto: opcoes.produto || 19, valor, parcelas: Number(opcoes.parcelas || 3), indRepactuacao: false,
      codigoContrato: `NCF${fundo}${String(Date.now()).slice(-5)}`
    })
    log(`NC ${idOperacao} criada pela planilha (valor ${valor}, fundo ${fundo})`)
  }
  await prepararPagamentoPlanilha(chamar, rotulo, opcoes, idOperacao)
  const { idEsteira, statusEsteira } = await avancarEsteiraOperacao(chamar, log, rotulo, idOperacao, opcoes.parecer)
  const [final] = await consultar(`SELECT TOP 1 o.indPaga, o.indEfetivada, CONVERT(varchar(10), o.dataEmissao, 120) dataEmissao,
      (SELECT COUNT(*) FROM MC_MOP_TITULOS t WHERE t.idOperacao = o.id) titulos FROM MC_MOP_OPERACAO o WHERE o.id = ${idOperacao}`)
  log(`FIM NC ${idOperacao} esteira ${idEsteira} ${statusEsteira} | paga=${final.indPaga} títulos=${final.titulos}`)
  return { idOperacao, fundo, idEsteira, statusEsteira, ...final }
}

const criarRepactuacao = async (chamar, opcoes) => {
  const idOrigem = Number(opcoes.repactuar)
  const [origem] = await consultar(`SELECT TOP 1 o.idCedente, o.idFundo, o.idProduto, o.dataEmissao, po.idFranquia,
      (SELECT SUM(t.valorSaldoAbertoTotal) FROM MC_MOP_TITULOS t WHERE t.idOperacao = o.id AND t.dataLiquidacao IS NULL) saldoAberto
    FROM MC_MOP_OPERACAO o LEFT JOIN MC_MOP_PRE_OPERACAO po ON po.id = o.id WHERE o.id = ${idOrigem}`)
  if (!origem) throw new Error(`Operação de origem ${idOrigem} não encontrada`)
  if (!Number(origem.saldoAberto)) throw new Error(`Operação de origem ${idOrigem} não tem títulos em aberto para repactuar`)
  // A recompra de repactuação lê a data de emissão da NC recomprada (sem ela o backend devolve 500).
  if (!origem.dataEmissao) throw new Error(`Operação de origem ${idOrigem} não tem data de emissão — só NC da Planilha Operacional pode ser repactuada`)
  const idCedente = Number(opcoes.cedente || origem.idCedente)
  const fundo = Number(origem.idFundo)
  const rotulo = `repactuacao-${idOrigem}`
  const log = (mensagem) => console.log(`${hora()} [${rotulo}] ${mensagem}`)

  let idOperacao = opcoes.operacao ? Number(opcoes.operacao) : null
  if (!idOperacao) {
    const valor = arredondar(opcoes.valor || origem.saldoAberto)
    idOperacao = await criarOperacaoPlanilha(chamar, rotulo, {
      idCedente, fundo, produto: origem.idProduto, valor, parcelas: Number(opcoes.parcelas || 3), indRepactuacao: true,
      codigoContrato: `REP${idOrigem}`
    })
    log(`operação de repactuação ${idOperacao} criada pela planilha (valor ${valor}, fundo ${fundo})`)
  }

  await prepararPagamentoPlanilha(chamar, rotulo, opcoes, idOperacao)

  const [existente] = await consultar(`SELECT TOP 1 id FROM MC_RECOMPRA WHERE idOperacao = ${idOperacao}`)
  if (!existente) {
    // Mesmo corpo da tela de recompra de operação estruturada (RepurchaseStructured → handleSaveRecompraRepactuacao):
    // a origem é a operação nova e o destino é a NC recomprada; os títulos são carregados pelo processamento em fila.
    const padrao = await chamar('GET', `/mc-operacao-backoffice-ms/api/v1/recompra/findByOperacao/${idOperacao}/${idCedente}`,
      `${rotulo}-recompra-padrao`)
    const [operacao] = await consultar(`SELECT TOP 1 CONVERT(varchar(10), dataEmissao, 120) dataEmissao FROM MC_MOP_OPERACAO WHERE id = ${idOperacao}`)
    const parametros = new URLSearchParams({ idOperacaoOrigem: idOperacao, idOperacaoDestino: idOrigem, idCedente, idFundo: fundo, indVencidos: 0 })
    await chamar('POST', `/mc-operacao-backoffice-ms/api/v1/recompra/registerRecompraRepactuacao?${parametros}`, `${rotulo}-recompra`, {
      ...padrao,
      id: null,
      observacao: opcoes.parecer,
      indQuemPaga: 'C',
      indManterEmCobranca: false,
      dataReembolso: `${operacao.dataEmissao}T03:00:00.000`,
      idOperacao,
      idCedente,
      taxaJuros: padrao.taxaJuros || padrao.valorPadraoTaxaJuros || null,
      taxaMulta: padrao.taxaMulta || padrao.valorPadraoTaxaMulta || null,
      recompraTitulos: []
    })
  }
  const recompra = await aguardarRecompraRepactuacao(idOperacao)
  log(`recompra de repactuação ${recompra.id}: ${recompra.qtdTitulos} títulos da operação ${idOrigem}, valor total ${recompra.valorTotal}`)

  const { idEsteira, statusEsteira } = await avancarEsteiraOperacao(chamar, log, rotulo, idOperacao, opcoes.parecer)

  const [final] = await consultar(`SELECT TOP 1 o.indPaga, o.indEfetivada, o.indRepactuacao,
      (SELECT COUNT(*) FROM MC_MOP_TITULOS t WHERE t.idOperacao = o.id) titulos,
      (SELECT COUNT(*) FROM MC_MOP_TITULOS t WHERE t.idOperacao = ${idOrigem} AND t.dataLiquidacao IS NULL) abertosOrigem
    FROM MC_MOP_OPERACAO o WHERE o.id = ${idOperacao}`)
  log(`FIM operação ${idOperacao} esteira ${idEsteira} ${statusEsteira} | paga=${final.indPaga} títulos=${final.titulos} | ` +
    `títulos ainda em aberto na origem ${idOrigem}: ${final.abertosOrigem}`)
  return { idOperacao, idOrigem, fundo, franquia: origem.idFranquia, idRecompra: recompra.id, idEsteira, statusEsteira, ...final }
}

const principal = async () => {
  const opcoes = {
    titulos: path.join(raiz, 'cypress/fixtures/massaOperacaoTitulos.json'),
    parecer: 'MASSA DE TESTE AUTOMATIZADA',
    qtdRecompra: 3,
    ...lerArgumentos(process.argv.slice(2))
  }
  if (opcoes.corrigirPagamento) {
    fs.mkdirSync(pastaEvidencias, { recursive: true })
    const chamar = criarCliente()
    const resultados = []
    for (const idOperacao of opcoes.corrigirPagamento.split(',').map(Number)) {
      try {
        resultados.push(await corrigirPagamento(chamar, idOperacao))
      } catch (erro) {
        console.error(`${hora()} [${idOperacao}] ERRO: ${erro.message}`)
        resultados.push({ idOperacao, resultado: 'ERRO', erro: erro.message.slice(0, 120) })
      }
    }
    console.table(resultados)
    return
  }
  if (opcoes.pagarPendencias) {
    fs.mkdirSync(pastaEvidencias, { recursive: true })
    const chamar = criarCliente()
    for (const idOperacao of opcoes.pagarPendencias.split(',')) {
      await pagarPendencias(chamar, (mensagem) => console.log(`${hora()} [${idOperacao}] ${mensagem}`), `pagar-${idOperacao}`, Number(idOperacao))
    }
    return
  }
  if (opcoes.repactuar) {
    fs.mkdirSync(pastaEvidencias, { recursive: true })
    const [origem] = await consultar(`SELECT TOP 1 idCedente FROM MC_MOP_OPERACAO WHERE id = ${Number(opcoes.repactuar)}`)
    opcoes.contaCedente = opcoes.contaCedente ? Number(opcoes.contaCedente) : await buscarContaPrincipalCedente(opcoes.cedente || origem.idCedente)
    console.table([await criarRepactuacao(criarCliente(), opcoes)])
    return
  }
  if (opcoes.planilhaNc) {
    if (!opcoes.cedente) throw new Error('Informe --cedente com --planilhaNc')
    fs.mkdirSync(pastaEvidencias, { recursive: true })
    opcoes.contaCedente = opcoes.contaCedente ? Number(opcoes.contaCedente) : await buscarContaPrincipalCedente(opcoes.cedente)
    console.table([await criarNcPlanilha(criarCliente(), opcoes)])
    return
  }
  if (!opcoes.cedente || !opcoes.lote) throw new Error('Informe --cedente e --lote (ver cabeçalho do script)')
  const itens = opcoes.lote.split(',')
  if (opcoes.operacao && itens.length > 1) throw new Error('--operacao só pode ser usado com um único item no lote')

  fs.mkdirSync(pastaEvidencias, { recursive: true })
  opcoes.contaCedente = opcoes.contaCedente ? Number(opcoes.contaCedente) : await buscarContaPrincipalCedente(opcoes.cedente)
  const chamar = criarCliente()
  const resultados = []
  for (const item of itens) {
    resultados.push(await criarOperacao(chamar, opcoes, item))
  }
  console.table(resultados)
}

principal()
  .catch((erro) => {
    console.error(`ERRO: ${erro.message}`)
    process.exitCode = 1
  })
  .finally(closeAllPools)
