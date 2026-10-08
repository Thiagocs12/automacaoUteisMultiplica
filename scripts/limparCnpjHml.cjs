/* global process, console, __dirname, fetch, URLSearchParams */
/*
 * Limpa em HML tudo o que existe sobre um CNPJ, deixando o estado "este CNPJ nunca foi cadastrado":
 * pessoa, prospect, proposta/POC, comitê exclusivo, cedente e toda linha que os referencia (FKs reais
 * de HML, em cascata). Antes do DELETE, cancela no Multiflow as esteiras em andamento ligadas às
 * propostas, prospects e cedentes que serão apagados.
 * Somente HML: usa HOMOLOG_DB_* e HML_API_* do .env (lido via dotenv, nunca aberto). Não importa nem
 * usa nenhuma configuração de PROD.
 *
 * Uso:
 *   node scripts/limparCnpjHml.cjs <cnpj> [--simular]
 *   --simular   só descobre e conta (nenhuma escrita em HML nem chamada não-GET)
 */
const fs = require('fs')
const path = require('path')
const { pathToFileURL } = require('url')
const raiz = path.resolve(__dirname, '..')
require('dotenv').config({ path: path.join(raiz, '.env'), quiet: true })
const { executeQuery, hmlConfig, closeAllPools } = require(path.join(raiz, 'cypress/support/db/dbClient.cjs'))

const POOL_LIMPEZA = 'hml-limpeza-cnpj'
const TEMPO_LIMITE_SQL_MS = 540000
const MULTIFLOW = '/mc-multiflow-ms/api/v1/esteira'

function gravarEvidencia(cnpj, conteudo) {
  const pasta = path.join(raiz, 'cypress/output/limpezaCnpjHml')
  fs.mkdirSync(pasta, { recursive: true })
  const carimbo = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)
  const arquivo = path.join(pasta, `${cnpj}-${carimbo}.json`)
  fs.writeFileSync(arquivo, JSON.stringify(conteudo, null, 1))
  console.log(`[limparCnpjHml] Evidência: ${arquivo}`)
}

const importar = (relativo) => import(pathToFileURL(path.join(raiz, relativo)).href)

async function carregarModulos() {
  const [limpeza, exclusao, clonagem, mapeamento] = await Promise.all([
    importar('cypress/support/shared/limpezaCnpj.js'),
    importar('cypress/support/shared/exclusaoEstrutural.js'),
    importar('cypress/support/shared/clonagemCedente.js'),
    importar('cypress/utils/mapeamentoCedente.js')
  ])
  return { ...limpeza, ...exclusao, ...clonagem, MAPEAMENTO_CEDENTE_UNIFICADO: mapeamento.MAPEAMENTO_CEDENTE_UNIFICADO }
}

const consultarHml = (sql) => executeQuery(POOL_LIMPEZA, { ...hmlConfig(), requestTimeout: TEMPO_LIMITE_SQL_MS }, sql)

async function obterTokenHml() {
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

function criarClienteMultiflowHml(token) {
  const baseUrl = process.env.HML_API_BASE_URL.replace(/\/$/, '')
  return async (metodo, caminho, corpo) => {
    const resposta = await fetch(`${baseUrl}${MULTIFLOW}${caminho}`, {
      method: metodo,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: corpo === undefined ? undefined : JSON.stringify(corpo)
    })
    const texto = await resposta.text()
    if (!resposta.ok) throw new Error(`Multiflow ${metodo} ${caminho} respondeu HTTP ${resposta.status}: ${texto.slice(0, 500)}`)
    return texto ? JSON.parse(texto) : null
  }
}

async function contarSelecao(m, selecao) {
  const contagens = {}
  for (const { tabela, sql } of m.montarContagensDaSelecao(selecao)) {
    contagens[tabela] = (contagens[tabela] ?? 0) + Number((await consultarHml(sql))[0]?.n ?? 0)
  }
  return contagens
}

async function buscarEsteirasLigadas(m, multiflow, idsPorEntidade) {
  const porId = new Map()
  for (const filtro of m.montarFiltrosEsteirasLigadas(idsPorEntidade)) {
    const esteiras = await multiflow('POST', '/etapa/anyFiltro', filtro)
    if (!Array.isArray(esteiras)) throw new Error(`Resposta inesperada do anyFiltro para ${JSON.stringify(filtro)}`)
    esteiras.forEach((esteira) => porId.set(esteira.id, esteira))
  }
  return [...porId.values()]
}

async function principal() {
  const m = await carregarModulos()
  const argumentos = m.interpretarArgumentosLimpeza(process.argv.slice(2))
  const validacao = m.validarCnpj(argumentos.cnpj)
  if (!validacao.ok) throw new Error(`${validacao.motivo} Nada foi alterado.`)
  m.validarAlvoHml({ ambiente: argumentos.ambiente, env: process.env })
  const { cnpj } = validacao
  console.log(`[limparCnpjHml] CNPJ ${cnpj} em HML${argumentos.simular ? ' (simulação: nada será alterado)' : ''}`)

  const raizes = await m.executarRoteiroSql(m.roteiroRaizesPorCnpj(cnpj), consultarHml)
  if (m.nadaAApagar(raizes)) {
    console.log(`[limparCnpjHml] Nada a apagar: não existe pessoa com o CNPJ ${cnpj} em HML.`)
    return
  }
  console.log(`[limparCnpjHml] Raízes: pessoas ${raizes.pessoas}; prospects ${raizes.prospects}; propostas ${raizes.propostas}; cedentes ${raizes.cedentes}`)

  const ordemInsercao = m.ordenarTabelasPorDependenciaEstrutural(m.construirGrafoEstrutural(m.MAPEAMENTO_CEDENTE_UNIFICADO))
  const idsEstruturais = await m.executarRoteiroSql(
    m.roteiroDescobertaGrafoEstrutural(ordemInsercao, m.montarSementesLimpezaCnpj(raizes), m.MAPEAMENTO_CEDENTE_UNIFICADO),
    consultarHml
  )
  const selecaoInicial = m.adicionarIdsNaSelecao(m.selecaoAPartirDeIdsPorTabela(idsEstruturais), m.TABELA_PESSOA, raizes.pessoas)
  const { selecao, fks } = await m.executarRoteiroSql(m.roteiroExpansaoPorFk(selecaoInicial), consultarHml)

  const idsPropostas = [...(selecao[m.TABELA_PROPOSTA]?.ids ?? [])]
  const comitesCandidatos = idsPropostas.length
    ? (await consultarHml(`SELECT DISTINCT idComite FROM ${m.TABELA_PROPOSTA} WHERE idComite IS NOT NULL AND id IN (${idsPropostas.join(', ')})`)).map((linha) => Number(linha.idComite))
    : []
  const comites = await m.executarRoteiroSql(m.roteiroIdsSemReferenciaExterna(m.TABELA_COMITE, comitesCandidatos, selecao, fks), consultarHml)
  if (comites.exclusivos.length) m.adicionarIdsNaSelecao(selecao, m.TABELA_COMITE, comites.exclusivos)
  if (comites.compartilhados.length) {
    console.log(`[limparCnpjHml] Comitês mantidos (compartilhados com propostas de outros cadastros): ${comites.compartilhados.join(', ')}`)
  }

  const contagensAntes = await contarSelecao(m, selecao)
  console.log('[limparCnpjHml] Linhas encontradas em HML para este CNPJ (antes):')
  m.formatarContagens(contagensAntes).forEach((linha) => console.log(linha))
  const { ordem: ordemExclusao, fksAnuladas } = m.planejarExclusaoDaSelecao(selecao, fks)
  if (fksAnuladas.length) {
    console.log(`[limparCnpjHml] Ciclos de FK quebrados anulando, nas próprias linhas a apagar: ${fksAnuladas.map((fk) => `${fk.tabelaFilha}.${fk.colunaFilha} (${fk.nome})`).join(', ')}`)
  }

  const token = await obterTokenHml()
  const multiflow = criarClienteMultiflowHml(token)
  const idsPorEntidade = {
    propostas: idsPropostas,
    prospects: [...(selecao[m.TABELA_PROSPECT]?.ids ?? [])],
    cedentes: [...(selecao[m.TABELA_CEDENTE]?.ids ?? [])]
  }
  const esteiras = await buscarEsteirasLigadas(m, multiflow, idsPorEntidade)
  const porAcao = { [m.ACAO_ESTEIRA_CANCELAR]: [], [m.ACAO_ESTEIRA_JA_ENCERRADA]: [], [m.ACAO_ESTEIRA_BLOQUEADA]: [] }
  esteiras.forEach((esteira) => porAcao[m.classificarEsteiraParaCancelamento(esteira)].push(esteira))
  console.log(`[limparCnpjHml] Esteiras ligadas no Multiflow: ${esteiras.length} (a cancelar: ${porAcao[m.ACAO_ESTEIRA_CANCELAR].map((e) => e.id).join(', ') || 'nenhuma'}; já encerradas: ${porAcao[m.ACAO_ESTEIRA_JA_ENCERRADA].length})`)
  if (porAcao[m.ACAO_ESTEIRA_BLOQUEADA].length) {
    const detalhe = porAcao[m.ACAO_ESTEIRA_BLOQUEADA].map((e) => `${e.id} (status ${e.status}, última etapa ${e.etapas?.at(-1)?.status})`).join('; ')
    throw new Error(`Esteira(s) em estado que não permite cancelamento automático: ${detalhe}. Nada foi alterado.`)
  }
  const gruposToken = m.lerGruposDoToken(token)
  const semPermissao = []
  for (const esteira of porAcao[m.ACAO_ESTEIRA_CANCELAR]) {
    const completa = await multiflow('GET', `/pesquisarporid/${esteira.id}`)
    const { permitido, gestores, operadores } = m.verificarPermissaoFinalizarEsteira(gruposToken, completa)
    if (!permitido) {
      const subetapa = completa?.etapas?.at(-1)?.origem?.modeloSubEtapa?.nome
      semPermissao.push(`${esteira.id} (modelo "${completa?.modeloEsteira?.nome}": gestores [${gestores.join(', ')}]; operadores da subetapa atual "${subetapa}" [${operadores.join(', ')}])`)
    }
  }
  if (semPermissao.length) {
    throw new Error(`O usuário de HML_API_USERNAME não tem grupo de gestor do modelo nem de operador da etapa atual para cancelar: ${semPermissao.join('; ')}. Nada foi alterado.`)
  }

  const evidencia = {
    cnpj,
    raizes,
    comites,
    fksAnuladas: fksAnuladas.map((fk) => fk.nome),
    contagensAntes,
    selecao: Object.fromEntries(
      Object.entries(selecao).map(([tabela, entrada]) => [
        tabela,
        { ids: [...entrada.ids], condicoes: Object.fromEntries([...entrada.condicoes].map(([coluna, valores]) => [coluna, [...valores]])) }
      ])
    ),
    esteiras: esteiras.map((e) => ({ id: e.id, nome: e.nome, status: e.status, ultimaEtapa: e.etapas?.at(-1)?.status, acao: m.classificarEsteiraParaCancelamento(e) }))
  }
  if (argumentos.simular) {
    gravarEvidencia(cnpj, { modo: 'simulacao', ...evidencia })
    console.log('[limparCnpjHml] Simulação concluída: nenhuma esteira cancelada, nenhuma linha apagada.')
    return
  }

  const canceladas = []
  for (const esteira of porAcao[m.ACAO_ESTEIRA_CANCELAR]) {
    await multiflow('POST', '/finalizaEsteira', { idEsteira: esteira.id })
    const conferida = await multiflow('GET', `/pesquisarporid/${esteira.id}`)
    if (!m.esteiraEncerrada(conferida)) {
      throw new Error(`Esteira ${esteira.id} continua em andamento após finalizaEsteira (status ${conferida?.status}). Nenhuma linha foi apagada.`)
    }
    canceladas.push({ id: esteira.id, nome: esteira.nome, status: conferida.status, etapa: conferida.etapas?.at(-1)?.status })
  }
  console.log(`[limparCnpjHml] Esteiras canceladas: ${canceladas.length ? canceladas.map((e) => `${e.id} (${e.nome}: esteira ${e.status}, última etapa ${e.etapa})`).join('; ') : 'nenhuma'}`)

  const deletes = m.montarDeletesDaSelecao(ordemExclusao, selecao, { tamanhoLote: 1000, tabelasSemLote: m.tabelasComAutorreferencia(fks) })
  const resultado = await consultarHml(m.montarLoteTransacionalDeExclusao(deletes, m.montarAnulacoesDeCiclo(fksAnuladas, selecao)))
  const apagadas = Object.fromEntries((resultado ?? []).map((linha) => [linha.tabela, Number(linha.linhasApagadas)]))
  console.log('[limparCnpjHml] Linhas apagadas por tabela (uma transação):')
  m.formatarContagens(apagadas).forEach((linha) => console.log(linha))

  const restantes = await m.executarRoteiroSql(m.roteiroRaizesPorCnpj(cnpj), consultarHml)
  const contagensDepois = await contarSelecao(m, selecao)
  const sobrou = Object.entries(contagensDepois).filter(([, n]) => n > 0)
  gravarEvidencia(cnpj, { modo: 'limpeza', ...evidencia, canceladas, apagadas, contagensDepois, raizesDepois: restantes })
  if (!m.nadaAApagar(restantes) || sobrou.length) {
    throw new Error(`Após a exclusão ainda há linhas para o CNPJ ${cnpj}: ${JSON.stringify({ raizes: restantes, sobrou })}`)
  }
  console.log(`[limparCnpjHml] Conferência: nenhuma linha restante para o CNPJ ${cnpj} nas ${Object.keys(contagensDepois).length} tabelas afetadas.`)
}

principal()
  .catch((erro) => { console.error(`[limparCnpjHml] ERRO: ${erro.message}`); process.exitCode = 1 })
  .finally(closeAllPools)
