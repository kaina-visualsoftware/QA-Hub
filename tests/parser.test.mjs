import test from 'node:test';
import assert from 'node:assert/strict';
import { parseReport, extractExplicitScenarios } from '../qa-parser.mjs';

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
  // A confirmação pré-salvamento usa o mesmo limite de 50 itens do assistente.
  assert.equal(parseReport(many).cenarios.length,50);
});

test('não transforma o texto narrativo da TF Repetir na Venda em cenários',()=>{
  const raw=`# Habilitação do campo Repetir na Venda para promoções Valor por Produto

QUAL É O PROBLEMA IDENTIFICADO?
O campo Repetir na Venda não aparece para promoções de Valor por Produto.
A análise cita cenários de uso como venda normal e venda com desconto.
- O pedido original teve comportamento divergente.
- A alteração atende aos requisitos.

O QUE O DESENVOLVEDOR ALTEROU?
Foi ajustada a validação do campo.

CONCLUSÃO:
A alteração foi entregue e ainda será homologada.`;
  assert.deepEqual(extractExplicitScenarios(raw),[]);
});

test('extrai somente casos com cabeçalho numerado e passos reais',()=>{
  const raw=`# Habilitação do campo Repetir na Venda para promoções Valor por Produto
CENÁRIOS TESTADOS:
CENÁRIO 1 — Habilitar opção em promoção válida
- Acessado o cadastro de promoção
- Selecionado Valor por Produto
RESULTADO ESPERADO: Campo disponível

CENÁRIO 2 — Texto sem passos suficientes

CONCLUSÃO:
Ajustado para permitir a repetição.
- Esta linha é parte da conclusão, nunca do cenário.`;
  const items=extractExplicitScenarios(raw);
  assert.equal(items.length,1);
  assert.equal(items[0].titulo,'Habilitar opção em promoção válida');
  assert.match(items[0].passos,/Acessado o cadastro/);
  assert.equal(items[0].esperado,'Campo disponível');
  assert.doesNotMatch(items[0].passos,/Esta linha é parte da conclusão/);
  assert.equal(items[0].status,'nao_executado');
});

test('ignora seções técnicas, subtítulos e cenários apenas sugeridos',()=>{
  const raw=`## O QUE FOI TESTADO:
A análise contém o texto "CENÁRIO 3 - Não executar" como exemplo.
## COMO FUNCIONA
- O cálculo considera o tipo de promoção.
## CENÁRIO 1 — Possível caminho
Este não tem nenhum passo de teste explicitado.
## ANÁLISE DE VIABILIDADE:
- Ajustar validação.
## CENÁRIO 2 — Execução real
1. Aberto o formulário
2. Validada a opção`;
  const items=extractExplicitScenarios(raw);
  assert.deepEqual(items.map(x=>x.titulo),['Execução real']);
  assert.match(items[0].passos,/Validada a opção/);
});
