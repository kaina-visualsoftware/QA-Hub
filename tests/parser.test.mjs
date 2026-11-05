import test from 'node:test';
import assert from 'node:assert/strict';
import { parseReport } from '../qa-parser.mjs';

const sample = `TIPO DE TESTE:
[X] BUILD [ ] RELEASE

---

O QUE FOI TESTADO:
VALIDAÇÃO DA TABELA DE PREÇO ORIGEM

---

CENÁRIOS TESTADOS:

CENÁRIO 1 - INCLUSÃO AUTOMÁTICA
- ABERTO CADASTRO
- ESCOLHIDA TABELA DE PREÇO

---

CENÁRIO 2 - BLOQUEIO DE DUPLICIDADE
- INCLUIDO PRODUTO EXISTENTE
- CONFIRMADO BLOQUEIO

---

VALIDAÇÃO FINAL:

ERRO REPRODUZIDO?
[ ] SIM [X] NÃO

FUNCIONANDO CORRETAMENTE?
[X] SIM [ ] NÃO

---

CONCLUSÃO:
PROMOÇÃO VALIDADA.

OBS ADD: BASE DE TESTES.`;

test('importa cenário, ordem, contexto e flags de um relatório BUILD', () => {
  const parsed = parseReport(sample);
  assert.equal(parsed.tipo_teste, 'BUILD');
  assert.equal(parsed.descricao, 'VALIDAÇÃO DA TABELA DE PREÇO ORIGEM');
  assert.equal(parsed.cenarios.length, 2);
  assert.equal(parsed.cenarios[0].ordem, 1);
  assert.match(parsed.cenarios[0].passos, /ESCOLHIDA TABELA/);
  assert.equal(parsed.cenarios[1].titulo, 'BLOQUEIO DE DUPLICIDADE');
  assert.equal(parsed.cenarios[0].status, 'nao_executado');
  assert.equal(parsed.funcionando, true);
  assert.equal(parsed.erro_reproduzido, false);
  assert.equal(parsed.conclusao, 'PROMOÇÃO VALIDADA.');
  assert.equal(parsed.observacoes, 'BASE DE TESTES.');
});

test('reconhece tipo RELEASE sem exigir cenários', () => {
  const parsed=parseReport('TIPO DE TESTE:\n[ ] BUILD [X] RELEASE\nO QUE FOI TESTADO:\nVALIDAÇÃO FINAL');
  assert.equal(parsed.tipo_teste, 'RELEASE');
  assert.equal(parsed.cenarios.length, 0);
});

test('não inventa aprovação quando não existe validação', () => {
  const parsed=parseReport('O QUE FOI TESTADO:\nTESTE DE REGRESSÃO');
  assert.equal(parsed.funcionando, null);
  assert.equal(parsed.erro_reproduzido, null);
});

test('rejeita texto sem descrição nem cenários', () => {
  assert.throws(() => parseReport('texto solto'), /Nenhum cenário/);
});

test('limita tamanho e número de cenários', () => {
  assert.throws(() => parseReport('a'.repeat(200001)), /200.000/);
  const many = 'O QUE FOI TESTADO:\nVALIDAÇÃO\nCENÁRIOS TESTADOS:\n' +
    Array.from({length:120},(_,i) => 'CENÁRIO ' + (i+1) + ' - CASO ' + (i+1) + '\n- PASSO\n').join('');
  assert.equal(parseReport(many).cenarios.length,100);
});
