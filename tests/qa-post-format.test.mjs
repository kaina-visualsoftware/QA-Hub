import test from 'node:test';
import assert from 'node:assert/strict';
import {formatGeneratedPost,taskNumberFromText,validatePostStructure} from '../qa-post-format.mjs';
import {POST_SYSTEM,messagesForGenerator} from '../supabase/functions/qa-generators/prompts.mjs';

test('post generator prompt requires technical publication sections, in order',()=>{
  const required=['TÍTULO','PRIMEIRO PARÁGRAFO','PARÁGRAFO DE COMPARAÇÃO',
    'CAMINHO DE ACESSO','IMAGENS','Comportamento detalhado','7. "**TAREFA:**"','8. "**JUSTIFICATIVA:**"'];
  let previous=-1;
  for(const section of required){
    const index=POST_SYSTEM.indexOf(section);
    assert.ok(index>previous,section+' must appear after the previous section');
    previous=index;
  }
  assert.match(POST_SYSTEM,/Anteriormente/);
  assert.match(POST_SYSTEM,/ATIVADA/);
  assert.match(POST_SYSTEM,/DESATIVADA/);
  assert.match(POST_SYSTEM,/salvas por usuário/);
  assert.match(POST_SYSTEM,/Caminho a ser confirmado/);
  assert.equal(messagesForGenerator('post','TF 67866','RF-001')[0].content,POST_SYSTEM);
  assert.match(messagesForGenerator('teste','Tarefa 67866','')[0].content,/ROTEIRO DE TESTES/);
});

test('post format keeps documented detailed behavior, comparison, path and footer',()=>{
  const input=[
    '# VENDA PARCIAL A PARTIR DO ORÇAMENTO','---',
    'Foi implementada melhoria que permite gerar vendas parciais.',
    'Anteriormente, a rotina não permitia selecionar serviços. Agora, a seleção é individual.',
    '**Caminho de acesso:**','**Comercial >> Orçamentos >> Venda Parcial**',
    '[Imagem: tela-de-orcamento.png]',
    '**Comportamento detalhado**','---',
    '1. **Seleção de itens**','   O usuário seleciona os produtos necessários.',
    '2. **Pagamento**','   O sistema apresenta as formas de pagamento.',
    '[Imagem: tela-de-pagamento.png]',
    '---','**TAREFA:** 192191',
    '**JUSTIFICATIVA:** Reduzir retrabalho.'
  ].join('\n\n');
  const post=formatGeneratedPost(input,{taskText:'Código: 192191\nTítulo: Venda parcial'});
  assert.deepEqual(validatePostStructure(post),[]);
  const markers=['# VENDA PARCIAL','Foi implementada','Anteriormente','Agora,',
    '**Caminho de acesso:**','Comercial >> Orçamentos >> Venda Parcial',
    '[Imagem: tela-de-orcamento.png]','**Comportamento detalhado**',
    '1. **Seleção de itens**','2. **Pagamento**','[Imagem: tela-de-pagamento.png]',
    '**TAREFA:** 192191','**JUSTIFICATIVA:** Reduzir retrabalho.'];
  let last=-1;
  for(const marker of markers){
    const at=post.indexOf(marker);
    assert.ok(at>last,'Expected ordered section '+marker+'\n'+post);
    last=at;
  }
  assert.equal((post.match(/\*\*TAREFA:\*\*/g)||[]).length,1);
  assert.equal((post.match(/\*\*JUSTIFICATIVA:\*\*/g)||[]).length,1);
});

test('old incomplete AI post gets visible placeholders, not invented rules',()=>{
  const legacy='# MELHORIA NO PEDIDO\n\nFoi implementada uma melhoria no módulo **Vendas**.\n'+
    'Para acessar a funcionalidade, acesse:\n[CAMINHO DO MENU]\n\n[IMAGEM]\n'+
    '**TAREFA:** 123456\n**JUSTIFICATIVA:** Facilitar o uso.';
  const output=formatGeneratedPost(legacy,{taskText:'Tarefa #67866 — Pedido'});
  assert.deepEqual(validatePostStructure(output),[]);
  assert.match(output,/Anteriormente, \[Comportamento anterior a confirmar\]/);
  assert.match(output,/\[Caminho a ser confirmado\]/);
  assert.match(output,/\[Imagem: captura-da-funcionalidade\.png\]/);
  assert.match(output,/\[Detalhamento do comportamento a confirmar/);
  assert.match(output,/\*\*TAREFA:\*\* 67866/);
  assert.doesNotMatch(output,/\*\*TAREFA:\*\* 123456/);
  assert.ok(output.endsWith('**JUSTIFICATIVA:** Facilitar o uso.'));
});

test('missing task or justification are visibly indicated, never fabricated',()=>{
  const output=formatGeneratedPost('Implementação descrita de forma incompleta.');
  assert.deepEqual(validatePostStructure(output),[]);
  assert.match(output,/\*\*TAREFA:\*\* \[NÚMERO DA TAREFA A SER INSERIDO\]/);
  assert.ok(output.endsWith('**JUSTIFICATIVA:** [Justificativa a confirmar]'));
  assert.equal(taskNumberFromText('Versão 12.10.06.0000'), '');
  assert.equal(taskNumberFromText('Código: 67866'), '67866');
});

test('invalid edited post can be identified instead of silently passing validation',()=>{
  assert.ok(validatePostStructure('# TESTE\n**TAREFA:** 67866').length>=4);
  assert.match(POST_SYSTEM,/NÃO|N[aã]o/i);
});
