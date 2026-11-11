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
 assertEquals(result.field_evidence.titulo.status,"needs_review");
 assertEquals(result.field_evidence.titulo.reason,"identifier_not_in_source");
 assertEquals(result.field_evidence.descricao.status,"verified");
});
Deno.test("unanchored field or unknown output keys cannot claim success",()=>{
 const source="O pedido 67866 contém descontos.";
 assertNull(groundedTaskFields(model({fields:{titulo:{
  value:"Falha inventada",evidence:"Texto inventado completamente."
 }}}),source));
 assertNull(groundedTaskFields(model({fields:{titulo:{
  value:"Falha no pedido 67866",evidence:source,token:"SECRET"
 }}}),source));
 assertNull(groundedTaskFields(model({fields:{unknown:{
  value:"Campo",evidence:source
 }}}),source));
});
Deno.test("JSON repair is marked for review, not silently accepted",()=>{
 const source="O pedido 67866 está bloqueado.";
 const broken='{"fields":{"titulo":{"value":"Pedido 67866 bloqueado","evidence":"O pedido 67866 está bloqueado."},}}';
 const response={choices:[{message:{content:broken},finish_reason:"stop"}]};
 const result=groundedTaskFields(response,source);
 assert(result);
 assertEquals(result.repaired,true);
 assertEquals(result.field_evidence.titulo.status,"needs_review");
 assertEquals(result.field_evidence.titulo.reason,"json_repaired");
});
Deno.test("truncation and tool calls are never accepted as structured data",()=>{
 const source="O pedido 67866 está bloqueado.";
 const payload={fields:{titulo:{value:"Pedido 67866",evidence:source}}};
 assertNull(groundedTaskFields(model(payload,"length"),source));
 const tools={choices:[{message:{content:JSON.stringify(payload),
  tool_calls:[{function:{name:"execute"}}]},finish_reason:"stop"}]};
 assertNull(groundedTaskFields(tools,source));
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
 assertEquals(id.draft.cenarios[0].evidence.reason,"identifier_not_in_source");
});
