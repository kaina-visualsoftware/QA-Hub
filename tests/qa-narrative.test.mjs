import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeNarrative,normalizeNarrativeFields,TASK_NARRATIVE_FIELDS} from '../qa-narrative.mjs';
test('issue 30: uppercase phrases are sentence-cased with accents and punctuation',()=>{
 assert.equal(normalizeNarrative('GERADO UMA VENDA TAL'),'Gerado uma venda tal');
 assert.equal(normalizeNarrative('REALIZADO TESTE DE DEVOLUÇÃO.'),'Realizado teste de devolução.');
 assert.equal(normalizeNarrative('CONSULTA DE CPF VIA API'),'Consulta de CPF via API');
 assert.equal(normalizeNarrative('ERRO NA NF. CONSULTAR SQL!'),'Erro na NF. Consultar SQL!');
 assert.equal(normalizeNarrative('VALOR R$ 49,50.\r\nPERÍODO 2026-11-06!'),'Valor r$ 49,50.\r\nPeríodo 2026-11-06!');
});
test('issue 30: mixed case, URLs, emails, code and paths are not corrupted',()=>{
 const input='Gerado uma VENDA usando API do SIA.';
 assert.equal(normalizeNarrative(input),input);
 assert.equal(normalizeNarrative('CONSULTA VIA HTTPS://EXEMPLO.COM/ABC'), 'Consulta via HTTPS://EXEMPLO.COM/ABC');
 assert.equal(normalizeNarrative('ENVIADO PARA QA@EXAMPLE.COM'),'Enviado para QA@EXAMPLE.COM');
 assert.equal(normalizeNarrative('ABRIR C:\\TEMP\\QA\\LOG.TXT'),'Abrir C:\\TEMP\\QA\\LOG.TXT');
 assert.equal(normalizeNarrative('CONSULTAR \u0060PedidoID\u0060'), 'Consultar \u0060PedidoID\u0060');
 assert.equal(normalizeNarrative('\u0060\u0060\u0060\nSELECT * FROM PEDIDO;\n\u0060\u0060\u0060'),'\u0060\u0060\u0060\nSELECT * FROM PEDIDO;\n\u0060\u0060\u0060');
});
test('issue 30: preserved line breaks, only narrative fields change',()=>{
 const out=normalizeNarrativeFields({
  titulo:'VENDA PARCIAL',codigo:'ABC-123',descricao:'GERADO UMA VENDA TAL\nREVISÃO DA API',
  observacoes:'Observação já escrita.'
 },TASK_NARRATIVE_FIELDS);
 assert.equal(out.titulo,'VENDA PARCIAL');
 assert.equal(out.codigo,'ABC-123');
 assert.equal(out.descricao,'Gerado uma venda tal\nRevisão da API');
 assert.equal(out.observacoes,'Observação já escrita.');
});
