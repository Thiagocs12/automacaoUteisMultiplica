/**
 * @description Resumo da esteira "MOP MultiComex" de uma pré-operação de comex em HML (só leitura): etapas, status e situação.
 * Uso: node --use-system-ca scripts/_comexEsteira.cjs <idPreOperacao>
 */
/* global __dirname, process, console, fetch, URLSearchParams */
const path = require('path')
require('dotenv').config({ path: path.join(path.resolve(__dirname, '..'), '.env'), quiet: true })

const executar = async () => {
  const id = process.argv[2]
  const urlToken = `${process.env.HML_API_LOGIN_URL}/auth/realms/multiplicacapital/protocol/openid-connect/token`
  const login = await fetch(urlToken, {
    method: 'POST',
    body: new URLSearchParams({ grant_type: 'password', client_id: 'autenticacao', username: process.env.HML_API_USERNAME, password: process.env.HML_API_PASSWORD })
  })
  const { access_token: token } = await login.json()
  const base = process.env.HML_API_BASE_URL.replace(/\/$/, '')
  for (const status of ['CRIADO', 'EXECUTANDO', 'FINALIZADO', 'CANCELADO']) {
    const r = await fetch(`${base}/mc-multiflow-ms/api/v1/esteira/pesquisar?nome=MOP_PRE_${id}&status=${status}`, { headers: { authorization: `Bearer ${token}` } })
    const dados = await r.json()
    for (const esteira of dados.esteiras || []) {
      const completa = await (await fetch(`${base}/mc-multiflow-ms/api/v1/esteira/pesquisarporid/${esteira.id}`, { headers: { authorization: `Bearer ${token}` } })).json()
      console.log(`esteira ${esteira.id} ${esteira.nome} status=${completa.status}`)
      for (const etapa of completa.etapas || []) {
        const sub = etapa.origem?.modeloEtapa?.modeloSubEtapaModel?.[0]?.modeloSubEtapa
        console.log(`  ${etapa.ordemExecucao} ${etapa.id} [${etapa.status}] ${etapa.nome} | situacao=${etapa.situacao} | parecer=${sub?.requerParecer} grupos=${(sub?.operadores || []).map((o) => o.grupo).join(',')}`)
      }
      const modelo = completa.modelo || completa.modeloEsteira
      if (modelo?.etapas) console.log('  modelo: ' + modelo.etapas.map((e) => e.nome || e.modeloEtapa?.nome).join(' > '))
    }
  }
}

executar().catch((erro) => { console.error(erro.message); process.exit(1) })
