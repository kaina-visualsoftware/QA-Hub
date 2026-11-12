import {describe,it,expect} from "vitest";
import {composeFullTaskContext,fetchTaskSupport,sanitizeAiContext} from
 "../src/lib/legacy/qa-test-context.mjs";
import type {SupabaseClient} from "@supabase/supabase-js";

const owner="11111111-1111-4111-8111-111111111111";
const foreign="22222222-2222-4222-8222-222222222222";
const taskA={id:"33333333-3333-4333-8333-333333333333",user_id:owner,
 titulo:"Desconto do pedido A",sistema:"Vendas",descricao:"Corrigir regra do pedido A.",
 correcao:"Aplicar nova fórmula A.",codigo:"TF-A"};
const taskB={id:"44444444-4444-4444-8444-444444444444",user_id:owner,
 titulo:"Estorno da venda B",sistema:"Financeiro",descricao:"Corrigir estorno B.",
 correcao:"Corrigir cálculo da devolução B.",codigo:"TF-B"};
const mixed={
 scenarios:[
  {tarefa_id:taskA.id,titulo:"Regra exclusiva A",passos:"Abrir venda A",
   esperado:"R$ 11,30 em A",status:"nao_executado"},
  {tarefa_id:taskB.id,titulo:"Regra exclusiva B",passos:"Abrir venda B",
   esperado:"R$ 92,10 em B",status:"reprovado"}
 ],
 documents:[
  {tarefa_id:taskA.id,titulo:"Documento exclusivo A",conteudo:"Causa fiscal A"},
  {tarefa_id:taskB.id,titulo:"Documento exclusivo B",conteudo:"Causa financeira B"}
 ],
 evidence:[
  {tarefa_id:taskA.id,tipo:"registro",resumo:"Evidência A"},
  {tarefa_id:taskB.id,tipo:"registro",resumo:"Evidência B"}
 ],
 events:[
  {tarefa_id:taskA.id,acao:"Alteração registrada A"},
  {tarefa_id:taskB.id,acao:"Alteração registrada B"}
 ]
};

describe("#31 — isolamento de contexto por TF e segurança da geração",()=>{
 it("não cruza cenários, documentos, eventos ou evidências entre duas TFs",()=>{
  const a=composeFullTaskContext(taskA,mixed);
  const b=composeFullTaskContext(taskB,mixed);
  expect(a.sourceCounts).toEqual({scenarios:1,documents:1,evidence:1,events:1});
  expect(b.sourceCounts).toEqual({scenarios:1,documents:1,evidence:1,events:1});
  for(const marker of ["Regra exclusiva B","R$ 92,10","Documento exclusivo B",
   "Causa financeira B","Evidência B","Alteração registrada B"]){
   expect(a.text).not.toContain(marker);
  }
  for(const marker of ["Regra exclusiva A","R$ 11,30","Documento exclusivo A",
   "Causa fiscal A","Evidência A","Alteração registrada A"]){
   expect(b.text).not.toContain(marker);
  }
  expect(a.text).toContain("R$ 11,30");
  expect(b.text).toContain("R$ 92,10");
 });
 it("omite credenciais e não presume leitura do conteúdo de links externos",()=>{
  const text=composeFullTaskContext(taskA,{
   evidence:[{tarefa_id:taskA.id,tipo:"link",resumo:"Anexo referenciado",
    referencia:"https://example.invalid/evidencia"}]
  },{manual:"Contato: ana@example.invalid; senha=SuperSecreta123; CPF 123.456.789-09"}).text;
  expect(text).toContain("[E-MAIL OMITIDO]");
  expect(text).toContain("[CREDENCIAL OMITIDA]");
  expect(text).toContain("[CPF OMITIDO]");
  expect(text).not.toContain("SuperSecreta123");
  expect(text).toContain("Link declarado (conteúdo da URL não consultado)");
  expect(sanitizeAiContext("token=abc12345678")).not.toContain("abc12345678");
 });
 it("isolamento do banco rejeita conta alheia e filtra linhas inesperadas",async()=>{
  const reads:string[]=[];
  const db={from:(table:string)=>({
   select:(_fields:string)=>({
    eq:(_col:string,value:string)=>({
     order:(_key:string,_options:unknown)=>({
      limit:async(_n:number)=>{
       reads.push(table+":"+value);
       return {data:[{tarefa_id:taskA.id,id:"own"},
         {tarefa_id:taskB.id,id:"other"}],error:null};
      }
     })
    })
   })
  })} as unknown as SupabaseClient;
  await expect(fetchTaskSupport(db,taskA,foreign)).rejects.toThrow(/sem permissão/);
  expect(reads).toHaveLength(0);
  const result=await fetchTaskSupport(db,taskA,owner);
  expect(reads).toHaveLength(4);
  expect(Object.values(result).flat()
   .filter((row):row is Record<string,unknown>=>typeof row==="object"&&row!==null)
   .every(row=>row.tarefa_id===taskA.id)).toBe(true);
  expect(result.failures).toEqual([]);
 });
});
