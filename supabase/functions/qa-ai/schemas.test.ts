function assert(value:unknown):asserts value{
 if(!value)throw Error("Condição não satisfeita.");
}
function assertEquals(actual:unknown,expected:unknown){
 if(!Object.is(actual,expected))throw Error(
  "Esperado: "+JSON.stringify(expected)+"; encontrado: "+JSON.stringify(actual));
}
function assertNull(value:unknown){
 if(value!==null)throw Error("Esperado valor nulo.");
}
import {groundedTaskFields,groundedTaskScenarios} from "./schemas.ts";
const model=(body:unknown,reason="stop")=>({
 choices:[{message:{content:JSON.stringify(body)},finish_reason:reason}]
});
Deno.test("strict server schema accepts cited field and derives line from source",()=>{
 const source="Problema:\nO pedido 67866 mantém desconto negativo.";
 const result=groundedTaskFields(model({fields:{
  descricao:{value:"O pedido 67866 tem desconto negativo.",
   evidence:"O pedido 67866 mantém desconto negativo."}
 }}),source);
 assert(result);
 assertEquals(result.draft.descricao,"O pedido 67866 tem desconto negativo.");
 assertEquals(result.field_evidence.descricao.source_line,2);
 assertEquals(result.field_evidence.descricao.status,"verified");
 assertEquals(result.repaired,false);
});
Deno.test("field with fabricated identifier is review-only, never verified",()=>{
 const source="O pedido 67866 mantém desconto negativo.";
 const result=groundedTaskFields(model({fields:{
  titulo:{value:"Pedido 99999 com falha",evidence:source},
  descricao:{value:"Pedido 67866 com falha",evidence:source}
 }}),source);
 assert(result);
 assertEquals(result.draft.titulo,undefined);
 assertEquals(result.review_fields[0].field,"titulo");
 assertEquals(result.review_fields[0].evidence.status,"needs_review");
 assertEquals(result.review_fields[0].evidence.reason,"identifier_not_in_source");
 assertEquals(result.field_evidence.descricao.status,"verified");
});
Deno.test("unanchored values remain review candidates, not HTTP 502 or approved fields",()=>{
 const source="O pedido 67866 contém descontos.";
 const result=groundedTaskFields(model({fields:{titulo:{
  value:"Falha inventada",evidence:"Texto inventado completamente."
 }}}),source);
 assert(result);
 assertEquals(result.draft.titulo,undefined);
 assertEquals(result.review_fields[0].field,"titulo");
 assertEquals(result.review_fields[0].evidence.reason,"quote_not_found");
 assertNull(groundedTaskFields(model({fields:{unknown:{
  value:"Campo",evidence:source
 }}}),source));
});
Deno.test("field JSON with harmless extra keys retains only allowlisted verified data",()=>{
 const source="O pedido 67866 contém descontos.";
 const result=groundedTaskFields(model({fields:{
  titulo:{value:"Pedido 67866 contém descontos.",evidence:source,token:"SECRET"},
  anything:{value:"Nunca salvar",evidence:source}
 }}),source);
 assert(result);
 assertEquals(result.draft.titulo,"Pedido 67866 contém descontos.");
 assertEquals(result.draft.anything,undefined);
});
Deno.test("plain or unquoted NVIDIA fields are recovered with evidence guard",()=>{
 const source="O pedido 67866 contém descontos.";
 const good=groundedTaskFields(model({fields:{descricao:source}}),source);
 assert(good);
 assertEquals(good.draft.descricao,source);
 const suggested=groundedTaskFields(model({fields:{
  titulo:"Melhorar descontos no pedido 67866"
 }}),source);
 assert(suggested);
 assertEquals(suggested.draft.titulo,undefined);
 assertEquals(suggested.review_fields[0].value,"Melhorar descontos no pedido 67866");
});
Deno.test("fenced explanatory JSON remains review-only after structural recovery",()=>{
 const source="O pedido 67866 contém descontos.";
 const response={choices:[{message:{content:
  'Resultado gerado:\\n\\x60\\x60\\x60json\\n'+
  JSON.stringify({fields:{descricao:{value:"Pedido 67866 contém descontos.",evidence:source}}})+
  '\\n\\x60\\x60\\x60'},finish_reason:"stop"}]};
 const result=groundedTaskFields(response,source);
 assert(result);
 assertEquals(result.repaired,true);
 assertEquals(result.draft.descricao,undefined);
 assertEquals(result.review_fields[0].evidence.reason,"json_repaired");
});
Deno.test("JSON repair is marked for review, not silently accepted",()=>{
 const source="O pedido 67866 está bloqueado.";
 const broken='{"fields":{"titulo":{"value":"Pedido 67866 bloqueado","evidence":"O pedido 67866 está bloqueado."},}}';
 const response={choices:[{message:{content:broken},finish_reason:"stop"}]};
 const result=groundedTaskFields(response,source);
 assert(result);
 assertEquals(result.repaired,true);
 assertEquals(result.draft.titulo,undefined);
 assertEquals(result.review_fields[0].evidence.status,"needs_review");
 assertEquals(result.review_fields[0].evidence.reason,"json_repaired");
});
Deno.test("truncation and tool calls are never accepted as structured data",()=>{
 const source="O pedido 67866 está bloqueado.";
 const payload={fields:{titulo:{value:"Pedido 67866",evidence:source}}};
 assertNull(groundedTaskFields(model(payload,"length"),source));
 const tools={choices:[{message:{content:JSON.stringify(payload),
  tool_calls:[{function:{name:"execute"}}]},finish_reason:"stop"}]};
 assertNull(groundedTaskFields(tools,source));
});
Deno.test("inferred explanations can be applied from literal evidence without named TF fields",()=>{
 const source=[
  "Ao excluir o desconto, o valor permanece na aba Pagamentos.",
  "A rotina só remove percentuais maiores ou iguais a zero.",
  "O desenvolvedor alterou a rotina para remover também percentuais negativos.",
  "Os testes ainda não foram executados."
 ].join("\n");
 const result=groundedTaskFields(model({fields:{
  titulo:{value:"Corrigir remoção de desconto em Pagamentos",
   evidence:"Ao excluir o desconto, o valor permanece na aba Pagamentos.",
   derivation:"synthesized"},
  descricao:{value:"O desconto permanece na aba Pagamentos após a exclusão.",
   evidence:"Ao excluir o desconto, o valor permanece na aba Pagamentos.",
   derivation:"synthesized"},
  causa:{value:"A rotina ignorava os percentuais negativos.",
   evidence:"A rotina só remove percentuais maiores ou iguais a zero.",
   derivation:"synthesized"},
  correcao:{value:"A rotina passou a remover percentuais negativos.",
   evidence:"O desenvolvedor alterou a rotina para remover também percentuais negativos.",
   derivation:"synthesized"},
  ambiente:{value:"Homologação",
   evidence:"Ao excluir o desconto, o valor permanece na aba Pagamentos.",
   derivation:"synthesized"},
  conclusao:{value:"Os testes foram aprovados.",
   evidence:"Os testes ainda não foram executados.",
   derivation:"synthesized"}
 }}),source);
 assert(result);
 assertEquals(result.draft.titulo,"Corrigir remoção de desconto em Pagamentos");
 assertEquals(result.draft.descricao,"O desconto permanece na aba Pagamentos após a exclusão.");
 assertEquals(result.draft.causa,"A rotina ignorava os percentuais negativos.");
 assertEquals(result.draft.correcao,"A rotina passou a remover percentuais negativos.");
 assertEquals(result.field_evidence.causa.derivation,"synthesized");
 assertEquals(result.draft.ambiente,undefined);
 assertEquals(result.draft.conclusao,undefined);
 const metadata=result.review_fields.find(row=>row.field==="ambiente");
 assertEquals(metadata?.evidence.reason,"metadata_not_explicit");
 const claim=result.review_fields.find(row=>row.field==="conclusao");
 assertEquals(claim?.evidence.reason,"execution_not_proven");
});
Deno.test("strict scenario schema rejects unseeded IDs and unverifiable claims",()=>{
 const source="CENÁRIO 1 — Remover desconto negativo.\nAbrir pedido 67866 e conferir o total.";
 const seeds=[{source_index:0,titulo:"Remover desconto negativo",
  passos:"Abrir pedido 67866",esperado:"Conferir o total",observacoes:""}];
 const payload={cenarios:[{source_index:0,titulo:"Remover desconto negativo",
  passos:"Abrir pedido 67866",esperado:"Conferir o total",observacoes:"",
  evidence:"Abrir pedido 67866 e conferir o total."}]};
 const ok=groundedTaskScenarios(model(payload),source,seeds);
 assert(ok);
 assertEquals(ok.draft.cenarios[0].evidence.status,"verified");
 assertNull(groundedTaskScenarios(model({cenarios:[
  {...payload.cenarios[0],source_index:40}]}),source,seeds));
 const id=groundedTaskScenarios(model({cenarios:[
  {...payload.cenarios[0],passos:"Abrir pedido 99999"}]}),source,seeds);
 assert(id);
 assertEquals(id.draft.cenarios.length,0);
 assertEquals(id.review_scenarios[0].evidence.reason,"identifier_not_in_source");
});
