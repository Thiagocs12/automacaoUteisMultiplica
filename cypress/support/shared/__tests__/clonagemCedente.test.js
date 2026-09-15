import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FASE_PROSPECT,
  FASE_POC,
  FASE_COMITE,
  FASE_CEDENTE,
  FASE_CATALOGO,
  ESTRATEGIA_BLOQUEADO_SEM_ORIGEM,
  ESTRATEGIA_APAGAR_E_RECRIAR,
  ESTRATEGIA_CRIAR,
  classificarTabelaCedente,
  normalizarDocumento,
  documentosCoincidem,
  decidirEstrategiaClonagemCedente,
} from '../clonagemCedente.js';

test('classificarTabelaCedente reconhece as tabelas-âncora de cada fase', () => {
  assert.deepEqual(classificarTabelaCedente('MC_PRT_PROSPECT'), { fase: FASE_PROSPECT, entra: true });
  assert.deepEqual(classificarTabelaCedente('MC_POC_PROPOSTA'), { fase: FASE_POC, entra: true });
  assert.deepEqual(classificarTabelaCedente('MC_CAD_COMITE'), { fase: FASE_COMITE, entra: true });
  assert.deepEqual(classificarTabelaCedente('MC_CED_CEDENTE'), { fase: FASE_CEDENTE, entra: true });
});

test('classificarTabelaCedente reconhece tabelas satélite dentro da mesma fase', () => {
  assert.deepEqual(classificarTabelaCedente('MC_PRT_LEAD'), { fase: FASE_PROSPECT, entra: true });
  assert.deepEqual(classificarTabelaCedente('MC_CAD_SACADO'), { fase: FASE_PROSPECT, entra: true });
  assert.deepEqual(classificarTabelaCedente('MC_POC_BALANCO'), { fase: FASE_POC, entra: true });
  assert.deepEqual(classificarTabelaCedente('MC_POC_COMITE_VOTACAO_PRODUTO'), { fase: FASE_COMITE, entra: true });
  assert.deepEqual(classificarTabelaCedente('MC_CED_GARANTIA_HIST'), { fase: FASE_CEDENTE, entra: true });
});

test('classificarTabelaCedente exclui o KYC do prospect, mesmo sendo prefixo MC_PRT_', () => {
  assert.deepEqual(classificarTabelaCedente('MC_PRT_KYC'), { fase: null, entra: false });
  assert.deepEqual(classificarTabelaCedente('MC_CAD_PERGUNTAS_KYC'), { fase: null, entra: false });
});

test('classificarTabelaCedente exclui documentação/formalização inteira, inclusive família Beyond', () => {
  assert.deepEqual(classificarTabelaCedente('MC_CED_CEDENTE_DOCUMENTO'), { fase: null, entra: false });
  assert.deepEqual(classificarTabelaCedente('MC_CED_CEDENTE_CONTRATO_HISTORICO'), { fase: null, entra: false });
  assert.deepEqual(classificarTabelaCedente('MC_CADASTRO_CEDENTE_ADMINISTRADOR'), { fase: null, entra: false });
  assert.deepEqual(classificarTabelaCedente('MC_CADASTRO_CEDENTE_ADMINISTRADOR_SOCIO'), { fase: null, entra: false });
  assert.deepEqual(classificarTabelaCedente('TB_BEYOND_FORMALIZACAO_CADASTRO_CEDENTE'), { fase: null, entra: false });
  assert.deepEqual(classificarTabelaCedente('TB_BEYOND_FORMALIZACAO_CADASTRO_CEDENTE_ITEM'), { fase: null, entra: false });
});

test('classificarTabelaCedente exclui o domínio inteiro de operação/liquidação/câmbio', () => {
  assert.deepEqual(classificarTabelaCedente('MC_MOP_OPERACAO'), { fase: null, entra: false });
  assert.deepEqual(classificarTabelaCedente('MC_LIQ_ORDEM_PAGAMENTO'), { fase: null, entra: false });
  assert.deepEqual(classificarTabelaCedente('MC_CED_BOLETO'), { fase: null, entra: false });
  assert.deepEqual(classificarTabelaCedente('MC_CED_TARIFA'), { fase: null, entra: false });
});

test('classificarTabelaCedente exclui log/auditoria técnica e CPL_CEDENTE_* (bureau externo)', () => {
  assert.deepEqual(classificarTabelaCedente('LOG_ATUALIZA_CEDENTE_COMITE'), { fase: null, entra: false });
  assert.deepEqual(classificarTabelaCedente('CPL_CEDENTE_RESTRITIVO'), { fase: null, entra: false });
});

test('classificarTabelaCedente exclui qualquer tabela com BKP no nome, com ou sem underscore', () => {
  assert.deepEqual(classificarTabelaCedente('MC_CED_CEDENTE_CONVENIO_BKP20231020'), { fase: null, entra: false });
  assert.deepEqual(classificarTabelaCedente('MC_PRT_PROSPECTBKP1504'), { fase: null, entra: false });
});

test('classificarTabelaCedente reconhece as famílias POC citadas só por prefixo na tarefa', () => {
  assert.deepEqual(classificarTabelaCedente('MC_POC_INCORP_SOCIO'), { fase: FASE_POC, entra: true });
  assert.deepEqual(classificarTabelaCedente('MC_POC_RATING_HISTORICO'), { fase: FASE_POC, entra: true });
  assert.deepEqual(classificarTabelaCedente('MC_POC_RESTRITIVO_CVM'), { fase: FASE_POC, entra: true });
});

test('classificarTabelaCedente trata MC_CAD_* não listado como catálogo genérico (resolução por dependência, não cópia)', () => {
  assert.deepEqual(classificarTabelaCedente('MC_CAD_FUNDO'), { fase: FASE_CATALOGO, entra: true });
  assert.deepEqual(classificarTabelaCedente('MC_CAD_PESSOA'), { fase: FASE_CATALOGO, entra: true });
});

test('classificarTabelaCedente exclui MC_CAD_ARQUIVO mesmo sendo prefixo MC_CAD_ (só referenciado por documento, fora de escopo)', () => {
  assert.deepEqual(classificarTabelaCedente('MC_CAD_ARQUIVO'), { fase: null, entra: false });
});

test('classificarTabelaCedente devolve não classificado para tabela desconhecida/fora do mapeamento', () => {
  assert.deepEqual(classificarTabelaCedente('MC_TABELA_INEXISTENTE_QUALQUER'), { fase: null, entra: false });
});

test('classificarTabelaCedente trata entrada vazia/ausente sem lançar erro', () => {
  assert.deepEqual(classificarTabelaCedente(''), { fase: null, entra: false });
  assert.deepEqual(classificarTabelaCedente(undefined), { fase: null, entra: false });
  assert.deepEqual(classificarTabelaCedente(null), { fase: null, entra: false });
});

test('normalizarDocumento remove máscara e mantém só dígitos', () => {
  assert.equal(normalizarDocumento('12.345.678/0001-90'), '12345678000190');
  assert.equal(normalizarDocumento('123.456.789-00'), '12345678900');
  assert.equal(normalizarDocumento('12345678000190'), '12345678000190');
});

test('normalizarDocumento devolve null para entrada vazia/ausente', () => {
  assert.equal(normalizarDocumento(''), null);
  assert.equal(normalizarDocumento(undefined), null);
  assert.equal(normalizarDocumento(null), null);
});

test('documentosCoincidem ignora máscara diferente entre os dois lados', () => {
  assert.equal(documentosCoincidem('12.345.678/0001-90', '12345678000190'), true);
});

test('documentosCoincidem devolve false para documentos diferentes', () => {
  assert.equal(documentosCoincidem('12345678000190', '98765432000110'), false);
});

test('documentosCoincidem nunca trata dois documentos ausentes como coincidência', () => {
  assert.equal(documentosCoincidem(null, undefined), false);
  assert.equal(documentosCoincidem('', ''), false);
});

test('decidirEstrategiaClonagemCedente bloqueia sem pessoa de origem em PROD', () => {
  const resultado = decidirEstrategiaClonagemCedente({
    pessoaOrigemEncontrada: false,
    prospectOrigemEncontrado: true,
    cedenteHmlExistente: false,
  });

  assert.equal(resultado.estrategia, ESTRATEGIA_BLOQUEADO_SEM_ORIGEM);
  assert.match(resultado.motivo, /pessoa/);
});

test('decidirEstrategiaClonagemCedente bloqueia sem prospect de origem em PROD', () => {
  const resultado = decidirEstrategiaClonagemCedente({
    pessoaOrigemEncontrada: true,
    prospectOrigemEncontrado: false,
    cedenteHmlExistente: false,
  });

  assert.equal(resultado.estrategia, ESTRATEGIA_BLOQUEADO_SEM_ORIGEM);
  assert.match(resultado.motivo, /prospect/);
});

test('decidirEstrategiaClonagemCedente bloqueia mesmo se o cedente já existir em HML, quando falta origem em PROD', () => {
  const resultado = decidirEstrategiaClonagemCedente({
    pessoaOrigemEncontrada: false,
    prospectOrigemEncontrado: false,
    cedenteHmlExistente: true,
  });

  assert.equal(resultado.estrategia, ESTRATEGIA_BLOQUEADO_SEM_ORIGEM);
});

test('decidirEstrategiaClonagemCedente decide apagar e recriar quando já existe em HML', () => {
  const resultado = decidirEstrategiaClonagemCedente({
    pessoaOrigemEncontrada: true,
    prospectOrigemEncontrado: true,
    cedenteHmlExistente: true,
  });

  assert.deepEqual(resultado, { estrategia: ESTRATEGIA_APAGAR_E_RECRIAR });
});

test('decidirEstrategiaClonagemCedente decide criar quando não existe em HML ainda', () => {
  const resultado = decidirEstrategiaClonagemCedente({
    pessoaOrigemEncontrada: true,
    prospectOrigemEncontrado: true,
    cedenteHmlExistente: false,
  });

  assert.deepEqual(resultado, { estrategia: ESTRATEGIA_CRIAR });
});
