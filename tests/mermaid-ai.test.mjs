import test from 'node:test';
import assert from 'node:assert/strict';
import {collectTaskContext,cleanMermaid,fallbackFlowchart,horizontalFlowchart,requestAiDiagram} from '../qa-mermaid-ai.mjs';
import {diagramMessages,extractDiagramFromNvidia} from '../supabase/functions/qa-ai/diagram.mjs';

test('assemble TF and scenarios without omitting critical process details',()=>{
  const result=collectTaskContext({titulo:'Pedido',descricao:'Abrir pedido',causa:'Validação incorreta',
    correcao:'Reavaliar desconto',conclusao:'Aprovado'},[
    {titulo:'Validar desconto',passos:'Abrir pedido; inserir itens',esperado:'Desconto correto'}]);
  assert.match(result,/Validação incorreta/);
  assert.match(result,/Reavaliar desconto/);
  assert.match(result,/Cenário 1/);
  assert.match(result,/Desconto correto/);
});

test('AI diagram prompt demands clear readable flow and avoids inventing steps',()=>{
  const messages=diagramMessages('O usuário abre pedido e verifica estoque.');
  assert.equal(messages[0].role,'system');
  assert.match(messages[0].content,/qualquer leitor/);
  assert.match(messages[0].content,/Não invente/);
  assert.match(messages[0].content,/flowchart LR/);
  assert.match(messages[0].content,/esquerda para a direita/);
});

test('parse Mermaid fenced response and reject dynamic commands',()=>{
  const example={choices:[{message:{content:'Diagrama:\n```mermaid\nflowchart TD\n  A["Início"] --> B{"Está válido?"}\n  B -->|Sim| C["Concluir"]\n```'}}]};
  const extracted=extractDiagramFromNvidia(example);
  assert.match(extracted,/flowchart LR/);
  assert.match(cleanMermaid(extracted),/-->\|Sim\|/);
  assert.equal(extractDiagramFromNvidia({choices:[{message:{content:'flowchart TD\n click A callback'}}]}),null);
  assert.throws(()=>cleanMermaid('flowchart TD\n A --> B\n click A malicious'),/não permitidos/);
  assert.throws(()=>cleanMermaid('flowchart TD\n A'),/não contém conexões/);
});

test('generated backup flow can be rendered when free models are unavailable',()=>{
  const fallback=fallbackFlowchart('Abrir pedido\nVerificar desconto\nConfirmar valores');
  assert.match(cleanMermaid(fallback),/A\["Abrir pedido"\]/);
  assert.match(fallback,/A --> B/);
});

test('diagram API uses original report and returns normalized Mermaid',async()=>{
  const stub={functions:{async invoke(name,{body}){
    assert.equal(name,'qa-ai');assert.equal(body.mode,'diagram');
    assert.match(body.text,/pedido/);
    return {data:{mermaid:'flowchart TD\n  A["Abrir pedido"] --> B["Confirmar"]'},error:null};
  }}};
  const d=await requestAiDiagram({db:stub,text:'Abrir pedido e confirmar'});
  assert.equal(d.fallback,false);
  assert.match(d.code,/^flowchart LR/);
});

test('incomplete model output falls back to safe deterministic graph',async()=>{
  const stub={functions:{async invoke(){return {data:{mermaid:null,fallback:true},error:null};}}};
  const d=await requestAiDiagram({db:stub,text:'Abrir pedido\nVerificar valores'});
  assert.equal(d.fallback,true);
  assert.match(cleanMermaid(d.code),/^flowchart LR/);
});

test('converts all supported flowchart directions to LR without changing non-flowcharts',()=>{
  for(const head of ['TD','TB','BT','RL','LR']){
    assert.match(cleanMermaid('graph '+head+'\n A --> B'),/^flowchart LR/);
    assert.match(horizontalFlowchart('flowchart '+head+'\n A --> B'),/^flowchart LR/);
  }
  const nested='flowchart TD\n subgraph S\n  direction TB\n  A --> B\n end';
  const formatted=cleanMermaid(nested);
  assert.match(formatted,/^flowchart LR/);
  assert.match(formatted,/direction LR/);
  assert.equal(horizontalFlowchart('sequenceDiagram\n A->>B: Olá'),'sequenceDiagram\n A->>B: Olá');
});

test('NVIDIA response stays horizontal even with vertical instructions',()=>{
  const result=extractDiagramFromNvidia({choices:[{message:{content:
    'Fluxo:\n'+'\x60'.repeat(3)+'mermaid\nflowchart TB\n A --> B\n subgraph S\n direction TD\n B --> C\n end\n'+'\x60'.repeat(3)
  }}]});
  assert.match(result,/^flowchart LR/);
  assert.match(result,/direction LR/);
});
