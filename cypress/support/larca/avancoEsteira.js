import MAPEAMENTOS_APIS from '../../utils/mapeamentoProdutos';
import MAPEAMENTOS_ETAPAS from '../../utils/mapeamentoEtapas';
import tokens from '../../temp/tokens.json';

const multiflow = MAPEAMENTOS_APIS.MULTIFLOW
const etapas = MAPEAMENTOS_ETAPAS

Cypress.Commands.add('criarPocEAvancar', (cnpj) => {
  cy.executarRequest (
    'hml',
    'mc-poc-ms/api/v1/proposta',
    {
      cnpj,
      tipoProposta: {
        id: 1,
        descricao: 'NOVA'
      },
      prospect: {
        tipoProspect: {
          id: 13,
          descricao: 'NOVA - LARCA'
        },
        gerenteComercial: {
          id: 93
        }
      },
      tipoEmpresa: 'MATRIZ'
    },
    'POST',
    false
  ).then((resposta) => {
    if (!resposta || resposta.status !== 200) {
      return
    }

    cy.pegarIdEsteira('poc', resposta.body.id, 'hml').then(({idEtapa, idEsteira}) => {
      cy.avancarEtapaPadrao(multiflow, idEsteira, idEtapa, 'TESTE AUTOMACAO')
      cy.pegarIdEsteira('poc', resposta.body.id, 'hml').then(({idEtapa, idEsteira}) => {
        cy.avancarEtapaPadrao(multiflow, idEsteira, idEtapa, 'TESTE AUTOMACAO')
      })
    })
  })
})

Cypress.Commands.add('executarRequest2', (ambiente, api, body = '', method = 'GET', fail = true) => { 
  return cy.definirAmbiente(ambiente).then(({ baseUrl, token }) => {
    const tokenAutorizacao = `Bearer ${token}`;
    const urlCompleta = `${baseUrl}/${api}`;

    const curl = `
      curl -X ${method} '${urlCompleta}' \
      -H 'accept: application/json, text/plain, */*' \
      -H 'accept-language: pt-BR,pt;q=0.9,en;q=0.8,en-GB;q=0.7,en-US;q=0.6' \
      -H 'authorization: ${tokenAutorizacao}' \
      -H 'content-type: application/json' \
      ${body ? `-d '${JSON.stringify(body)}'` : ''}
    `;

    console.log('CURL REQUEST:\n', curl);
    //
    cy.pause()
    return cy.request({
      method,
      url: urlCompleta,
      headers: {
        accept: 'application/json, text/plain, */*',
        'accept-language': 'pt-BR,pt;q=0.9,en;q=0.8,en-GB;q=0.7,en-US;q=0.6',
        authorization: tokenAutorizacao,
        'content-type': 'application/json'
      },
      body,
      failOnStatusCode: fail
    }).then((resposta) => {
      return cy.wrap(resposta);
    });
  });
});

Cypress.Commands.add('avancarEtapa', (tipoEsteira, id, etapa, env, idComite, idAnalista, parecer) => {
  cy.pegarIdEsteira(tipoEsteira, id, env).then(({idEtapa, idEsteira}) => {
    if (etapa === 'Distribuição' && tipoEsteira === "poc") {
      cy.avancarDistribuicao(id, env, idEsteira, idEtapa, etapa, idComite, idAnalista) 
    } else if (etapa === 'Comitê de Crédito' && tipoEsteira === "poc") {
      cy.avancarComiteCredito(env, idEsteira, idEtapa, id)
    } else {
      cy.avancarEtapaPadrao(multiflow, idEsteira, idEtapa, parecer, etapa, id)
    }
  });
})

Cypress.Commands.add('avancarEtapaPadrao', (multiflow, idEsteira, idEtapa, parecerEsteira, etapa, id) => {
  const comite = etapas.COMITE
  if (etapa === 'Analise de Crédito'){
    cy.iniciarEtapaEsteira(env, idEsteira, idEtapa)
    cy.executarRequest(
      env,
      `${comite.copiaPleito}${id}`,
     ).then((resposta) => {
      expect(resposta.status).to.eq(200)
    })
    cy.executarRequest(
      env,
      `${comite.copiaPleitoProduto}${id}`,
     ).then((resposta) => {
      expect(resposta.status).to.eq(200)
    })
  }
  cy.executarRequest(
    env,
    `${multiflow.parecer}idEsteira=${idEsteira}&idEtapa=${idEtapa}`,
    `{"descricao":"${parecerEsteira}"}`,
    multiflow.method
  ).then((resposta) => {
    idParecer = resposta.body.id
    cy.executarRequest(
      env,
      multiflow.avancar,
      {
        idEsteira,
        idEtapa,
        idParecer,
        situacao: 'APROVADO',
        encaminharEtapaPendencia: false
      },
      multiflow.method
    )
  });
});

Cypress.Commands.add('avancarComiteCredito', (env, codigoEsteira, idEtapa, idProposta) => {
  const comite = etapas.COMITE
  cy.iniciarEtapaEsteira(env, codigoEsteira, idEtapa)
  cy.executarRequest(
    env,
    `${comite.copiaPoc}${idProposta}`,
   ).then((resposta) => {
    expect(resposta.status).to.eq(200)
  })
  cy.executarRequest(
    env,
    `${comite.criar}`,
    {
      codigoEsteira,
      idProposta,
      codigoEtapaModelo: null
    },
    comite.method
  )
  cy.executarRequest(
    env,
    `${comite.encontrarComite}${idProposta}`,
  ).then((resposta) => {
    const dataEmissaoAta = new Date().toISOString()

    const prazo = new Date()
    prazo.setDate(prazo.getDate() + 80)

    const prazoVigencia = prazo.toISOString()

    cy.executarRequest(
      env,
      `${comite.copiaLimiteGlobal}${resposta.body.pocComite.id}`
    )

    cy.executarRequest(
      env,
      `${comite.copiaPleitoBoleto}${resposta.body.pocComite.id}`
    )

    cy.executarRequest(
      env,
      `${comite.copiaPocProduto}${resposta.body.pocComite.id}`
    )

    cy.executarRequest(
      env,
      `${comite.salvarComite}`,
      {
        idComiteProposta: resposta.body.pocComite.id,
        dataEmissaoAta,
        prazoVigencia,
        diasVigencia: 80,
        diasPrazoLimite: 90
      },
      'PUT'
    )

    cy.executarRequest(
      env,
      `${comite.consultaVotos}${resposta.body.pocComite.id}&indVota=true`
    ).then((resposta2) => {
        const votantes = env === 'hml'
          ? comite.votantesHml
          : comite.votantesProd
      
        const telefones = env === 'hml'
          ? comite.telefonesHml
          : comite.telefonesProd
      
        const participantesSelecionados = resposta2.body
          .filter(({ nomeParticipante }) =>
            votantes.some(
              ({ nome }) => nome === nomeParticipante
            )
          )
          .map(({ idVotacao, nomeParticipante }) => {
            const votante = votantes.find(
              ({ nome }) => nome === nomeParticipante
            )
          
          return {
            nome: votante.nome,
            telefone: votante.telefone,
            vota: true,
            id: idVotacao
          }
        })
      
        cy.executarRequest(
          env,
          comite.votacao,
        {
          idComiteProposta: resposta.body.pocComite.id,
            idProposta,
            participantes: participantesSelecionados
          },
          comite.method
        )
        cy.executarRequest(
          env,
          `${comite.iniciarVotacao}${resposta.body.pocComite.id}`,
          '',
          comite.method
        ).then((resposta3) => {
          expect(resposta3.status).to.eq(200)
        })
        participantesSelecionados.forEach(participante => {
          cy.executarRequest(
            env,
            comite.copiaLinkVotacao,
            {
              idComiteProposta: resposta.body.pocComite.id,
              idProposta,
              participantes: [participante]
            },
            comite.method
          ).then((body) => {
            const c = body.body.split('c=')[1]
            cy.executarRequest(
              env,
              `${comite.aprovarVoto}${resposta.body.pocComite.id}&idVotacao=${participante.id}&status=APROVADO&c=${c}`,
              '',
        'PUT'
      )
          })
        })
      })
    });
});

Cypress.Commands.add('iniciarEtapaEsteira', (env, idEsteira, idEtapa) => {
  cy.executarRequest(env, `${multiflow.iniciarEsteira}idEsteira=${idEsteira}&idEtapa=${idEtapa}`, '', multiflow.method, false)
});

Cypress.Commands.add('avancarDistribuicao', (id, env, idEsteira, idEtapa, etapa, idComite, idAnalista, ) => {
  cy.iniciarEtapaEsteira(env, idEsteira, idEtapa)
  const distribuicao = etapas.DISTRIBUICAO
  const body = {
    idComite: idComite,
    propostas: [
      {
        id: id,
        idAnalista: idAnalista
      }
    ]
  }
  
  return cy.verificarEtapaEsteira(env, idEsteira, etapa).then(() => {
    return cy.wrap(distribuicao.etapasParaAvanco).each((requisicao) => {
      const url = `${distribuicao.baseUrl}/${requisicao}`
      return cy.executarRequest(env, url, body,distribuicao.method).then((response) => {
        expect(response.status).to.eq(200)
      })
    })
  })
});

Cypress.Commands.add('verificarEtapaEsteira', (env, idEsteira, etapa) => {
  cy.executarRequest(env, `mc-multiflow-ms/api/v1/esteira/pesquisarporid/${idEsteira}`).then((response) => {
    i = response.body['etapas'].length - 1
    expect(response.body['etapas'][i]['origem']['modeloEtapa']['nome']).to.eq(etapa) 
  });
});

Cypress.Commands.add('pegarIdEsteira', (tipoEsteira, id, env) => {
  if (tipoEsteira === 'poc') {
    cy.executarRequest(env, `mc-poc-ms/api/v1/proposta/findProposta/${id}`).then((response) => {
      return {
        idEtapa: response.body.idEtapa,
        idEsteira: response.body.idEsteira
      }
    })
  } 
});