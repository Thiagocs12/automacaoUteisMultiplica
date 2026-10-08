import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AMBIENTE_LIMPEZA_CNPJ,
  validarCnpj,
  interpretarArgumentosLimpeza,
  validarAlvoHml,
  roteiroRaizesPorCnpj,
  montarSementesLimpezaCnpj,
  nadaAApagar,
  classificarEsteiraParaCancelamento,
  esteiraEncerrada,
  montarFiltrosEsteirasLigadas,
  formatarContagens,
  tokenContemGrupo,
  verificarPermissaoFinalizarEsteira,
  lerGruposDoToken,
  ACAO_ESTEIRA_CANCELAR,
  ACAO_ESTEIRA_JA_ENCERRADA,
  ACAO_ESTEIRA_BLOQUEADA,
} from '../limpezaCnpj.js';
import { montarCondicaoDocumentoIgual } from '../clonagemCedente.js';

const ENV_HML = {
  HOMOLOG_DB_HOST: 'sql-hml',
  HOMOLOG_DB_NAME: 'beyond',
  HOMOLOG_DB_PORT: '1433',
  HML_API_BASE_URL: 'https://beyond-hml.exemplo',
  HML_API_LOGIN_URL: 'https://login-hml.exemplo',
  HML_API_USERNAME: 'usuario',
  HML_API_PASSWORD: 'x',
  PROD_DB_HOST: 'sql-prod',
  PROD_DB_NAME: 'beyond',
  PROD_API_BASE_URL: 'https://beyond.exemplo',
};

const executarComRespostas = (roteiro, responder) => {
  const consultas = [];
  let passo = roteiro.next();
  while (!passo.done) {
    consultas.push(passo.value.sql);
    passo = roteiro.next(responder(passo.value.sql));
  }
  return { consultas, resultado: passo.value };
};

test('validarCnpj aceita CNPJ válido com ou sem máscara e devolve só os dígitos', () => {
  assert.deepEqual(validarCnpj('61.077.079/0001-43'), { ok: true, cnpj: '61077079000143' });
  assert.deepEqual(validarCnpj('61077079000143'), { ok: true, cnpj: '61077079000143' });
});

test('validarCnpj recusa ausente, tamanho errado, dígitos iguais, DV errado e texto livre', () => {
  assert.match(validarCnpj(undefined).motivo, /não informado/);
  assert.match(validarCnpj('  ').motivo, /não informado/);
  assert.match(validarCnpj('6107707900014').motivo, /14 dígitos/);
  assert.match(validarCnpj('11.111.111/1111-11').motivo, /dígitos iguais/);
  assert.match(validarCnpj('61.077.079/0001-44').motivo, /verificadores/);
  assert.match(validarCnpj("61077079000143' OR 1=1").motivo, /caracteres/);
});

test('interpretarArgumentosLimpeza lê CNPJ, ambiente (padrão hml) e simulação', () => {
  assert.deepEqual(interpretarArgumentosLimpeza(['61.077.079/0001-43']), {
    cnpj: '61.077.079/0001-43', ambiente: AMBIENTE_LIMPEZA_CNPJ, simular: false,
  });
  assert.deepEqual(interpretarArgumentosLimpeza(['--simular', '--ambiente', 'prod', '123']), {
    cnpj: '123', ambiente: 'prod', simular: true,
  });
  assert.deepEqual(interpretarArgumentosLimpeza(['--ambiente=hml']), { cnpj: undefined, ambiente: 'hml', simular: false });
});

test('validarAlvoHml aceita HML bem configurado', () => {
  assert.doesNotThrow(() => validarAlvoHml({ ambiente: 'hml', env: ENV_HML }));
  assert.doesNotThrow(() => validarAlvoHml({ ambiente: 'hml', env: { ...ENV_HML, PROD_DB_HOST: undefined, PROD_API_BASE_URL: '' } }));
});

test('validarAlvoHml recusa ambiente diferente de hml', () => {
  for (const ambiente of ['prod', 'keycloakProd', 'HML', '']) {
    assert.throws(() => validarAlvoHml({ ambiente, env: ENV_HML }), /só roda em hml/);
  }
});

test('validarAlvoHml recusa variáveis de HML ausentes sem expor valores', () => {
  assert.throws(
    () => validarAlvoHml({ ambiente: 'hml', env: { ...ENV_HML, HOMOLOG_DB_HOST: '', HML_API_PASSWORD: undefined } }),
    (erro) => /HOMOLOG_DB_HOST, HML_API_PASSWORD/.test(erro.message) && !erro.message.includes('usuario'),
  );
});

test('validarAlvoHml recusa .env com HML apontando para o banco ou a API de PROD', () => {
  assert.throws(
    () => validarAlvoHml({ ambiente: 'hml', env: { ...ENV_HML, HOMOLOG_DB_HOST: 'SQL-PROD' } }),
    /mesmo banco de PROD/,
  );
  assert.throws(
    () => validarAlvoHml({ ambiente: 'hml', env: { ...ENV_HML, HML_API_BASE_URL: 'https://beyond.exemplo/' } }),
    /mesma API de PROD/,
  );
});

test('montarCondicaoDocumentoIgual ignora máscara na coluna e recusa documento que não seja só dígitos', () => {
  assert.equal(
    montarCondicaoDocumentoIgual('p.cnpjCpf', '61077079000143'),
    "REPLACE(REPLACE(REPLACE(p.cnpjCpf, '.', ''), '-', ''), '/', '') = '61077079000143'",
  );
  assert.throws(() => montarCondicaoDocumentoIgual('cnpjCpf', "1' OR '1'='1"), /só dígitos/);
});

test('roteiroRaizesPorCnpj para na primeira consulta quando não há pessoa', () => {
  const { consultas, resultado } = executarComRespostas(roteiroRaizesPorCnpj('61077079000143'), () => []);
  assert.equal(consultas.length, 1);
  assert.match(consultas[0], /^SELECT id FROM MC_CAD_PESSOA WHERE REPLACE/);
  assert.deepEqual(resultado, { pessoas: [], prospects: [], propostas: [], cedentes: [] });
  assert.equal(nadaAApagar(resultado), true);
});

test('roteiroRaizesPorCnpj junta propostas dos prospects e a proposta apontada pelo cedente', () => {
  const responder = (sql) => {
    if (sql.startsWith('SELECT id FROM MC_CAD_PESSOA')) return [{ id: '41672' }];
    if (sql === 'SELECT id FROM MC_PRT_PROSPECT WHERE idPessoa IN (41672)') return [{ id: '4021' }];
    if (sql === 'SELECT id, idProposta FROM MC_CED_CEDENTE WHERE idPessoa IN (41672)') return [{ id: '4576', idProposta: 9999 }];
    if (sql === 'SELECT DISTINCT idProposta FROM MC_POC_PROSPECT WHERE idProspect IN (4021)') return [{ idProposta: 2738 }, { idProposta: 3443 }];
    if (sql === 'SELECT id FROM MC_POC_PROPOSTA WHERE id IN (2738, 3443, 9999)') return [{ id: '2738' }, { id: '3443' }, { id: '9999' }];
    throw new Error(`consulta inesperada: ${sql}`);
  };
  const { resultado } = executarComRespostas(roteiroRaizesPorCnpj('61077079000143'), responder);
  assert.deepEqual(resultado, { pessoas: [41672], prospects: [4021], propostas: [2738, 3443, 9999], cedentes: [4576] });
  assert.equal(nadaAApagar(resultado), false);
});

test('montarSementesLimpezaCnpj semeia cedente, prospect e propostas, nunca comitê', () => {
  assert.deepEqual(montarSementesLimpezaCnpj({ prospects: [1], propostas: [2, 3], cedentes: [] }), {
    MC_PRT_PROSPECT: [{ id: 1 }],
    MC_POC_PROPOSTA: [{ id: 2 }, { id: 3 }],
  });
});

test('classificarEsteiraParaCancelamento: encerrada, em andamento ou bloqueada', () => {
  assert.equal(classificarEsteiraParaCancelamento({ status: 'FINALIZADO', etapas: [{ status: 'CANCELADO' }] }), ACAO_ESTEIRA_JA_ENCERRADA);
  assert.equal(classificarEsteiraParaCancelamento({ status: 'CANCELADO' }), ACAO_ESTEIRA_JA_ENCERRADA);
  assert.equal(classificarEsteiraParaCancelamento({ status: 'EXECUTANDO', etapas: [{ status: 'EXECUTANDO' }] }), ACAO_ESTEIRA_CANCELAR);
  assert.equal(classificarEsteiraParaCancelamento({ status: 'CRIADO', etapas: [{ status: 'FINALIZADO' }, { status: 'CRIADO' }] }), ACAO_ESTEIRA_CANCELAR);
  assert.equal(
    classificarEsteiraParaCancelamento({ status: 'AGUARDANDO_RETORNO_ETAPA_CENTRAL', etapas: [{ status: 'AGUARDANDO_RETORNO_ETAPA_CENTRAL' }] }),
    ACAO_ESTEIRA_BLOQUEADA,
  );
  assert.equal(classificarEsteiraParaCancelamento({ status: 'EXECUTANDO', etapas: [] }), ACAO_ESTEIRA_BLOQUEADA);
});

test('esteiraEncerrada exige status final e nenhuma etapa em andamento', () => {
  assert.equal(esteiraEncerrada({ status: 'FINALIZADO', etapas: [{ status: 'FINALIZADO' }, { status: 'CANCELADO' }] }), true);
  assert.equal(esteiraEncerrada({ status: 'FINALIZADO', etapas: [{ status: 'EXECUTANDO' }] }), false);
  assert.equal(esteiraEncerrada({ status: 'EXECUTANDO', etapas: [{ status: 'CANCELADO' }] }), false);
});

test('montarFiltrosEsteirasLigadas busca por idProposta, idProspect e idCedente em lotes, como texto', () => {
  assert.deepEqual(montarFiltrosEsteirasLigadas({ propostas: [1, 2, 3], prospects: [4], cedentes: [] }, 2), [
    { execAtributos: { idProposta: ['1', '2'] } },
    { execAtributos: { idProposta: ['3'] } },
    { execAtributos: { idProspect: ['4'] } },
  ]);
});

test('tokenContemGrupo compara como o Multiflow: sem acento, sem a barra inicial, sem caixa e sem espaços', () => {
  const grupos = ['/Analista de Crédito', '/Superintendente Crédito', '/Comercial/Agente Comercial'];
  assert.equal(tokenContemGrupo(grupos, 'Superintendente Credito'), true);
  assert.equal(tokenContemGrupo(grupos, 'superintendente crédito'), true);
  assert.equal(tokenContemGrupo(grupos, 'Agente Comercial'), true);
  assert.equal(tokenContemGrupo(['/AgenteComercial'], 'Agente Comercial'), true);
  assert.equal(tokenContemGrupo(grupos, 'Gerente de Plataforma'), false);
  assert.equal(tokenContemGrupo(grupos, ''), false);
  assert.equal(tokenContemGrupo(['/Grupo (A)'], 'Grupo (A)'), true);
});

test('verificarPermissaoFinalizarEsteira aceita gestor do modelo ou operador da subetapa atual', () => {
  const esteira = {
    modeloEsteira: { gestores: [{ grupo: 'Agente Comercial' }, { grupo: 'Superintendente Crédito' }] },
    etapas: [
      { origem: { modeloSubEtapa: { operadores: [{ grupo: 'Outro' }] } } },
      { origem: { modeloSubEtapa: { operadores: [{ grupo: 'Gerente de Plataforma' }] } } },
    ],
  };
  assert.deepEqual(verificarPermissaoFinalizarEsteira(['/Analista TI', '/Middle'], esteira), {
    permitido: false,
    gestores: ['Agente Comercial', 'Superintendente Crédito'],
    operadores: ['Gerente de Plataforma'],
  });
  assert.equal(verificarPermissaoFinalizarEsteira(['/Superintendente Credito'], esteira).permitido, true);
  assert.equal(verificarPermissaoFinalizarEsteira(['/Gerente de Plataforma'], esteira).permitido, true);
  assert.equal(verificarPermissaoFinalizarEsteira(['/Outro'], esteira).permitido, false);
});

test('lerGruposDoToken lê a claim groups e devolve lista vazia para token malformado', () => {
  const carga = Buffer.from(JSON.stringify({ groups: ['/A', '/B'] })).toString('base64url');
  assert.deepEqual(lerGruposDoToken(`cabecalho.${carga}.assinatura`), ['/A', '/B']);
  assert.deepEqual(lerGruposDoToken('nao-e-jwt'), []);
});

test('formatarContagens lista por tabela em ordem alfabética com total', () => {
  assert.deepEqual(formatarContagens({ B: 2, A: 1 }), ['  A: 1', '  B: 2', '  TOTAL: 3 linha(s) em 2 tabela(s)']);
});
