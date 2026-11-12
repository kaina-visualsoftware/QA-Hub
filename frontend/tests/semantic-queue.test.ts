import {describe,expect,it,vi} from "vitest";
import {runSemanticQueue,SEMANTIC_CONCURRENCY} from
 "../src/features/generators/semantic-queue";
import {AiRequestError} from "../src/lib/ai-retry";

function deferred(){
 let resolve!:()=>void;
 let reject!:(reason:unknown)=>void;
 const promise=new Promise<void>((ok,fail)=>{resolve=ok;reject=fail;});
 return {promise,resolve,reject};
}

describe("Análise de TF longa em até dois blocos NVIDIA simultâneos",()=>{
 it("respeita dois trabalhos ativos e registra resultados fora de ordem sem perder nenhum",async()=>{
  const items=["TF-001","TF-002","TF-003","TF-004","TF-005"];
  const gates=items.map(()=>deferred());
  const started:string[]=[],finished:string[]=[];
  let active=0,maxActive=0;
  const result=runSemanticQueue({items,signal:new AbortController().signal,
   process:async id=>{
    started.push(id);active++;maxActive=Math.max(maxActive,active);
    try{await gates[items.indexOf(id)].promise;finished.push(id);}
    finally{active--;}
   }});
  expect(started).toEqual(["TF-001","TF-002"]);
  gates[1].resolve();
  await vi.waitFor(()=>expect(started).toEqual(["TF-001","TF-002","TF-003"]));
  gates[2].resolve();
  await vi.waitFor(()=>expect(started).toEqual(["TF-001","TF-002","TF-003","TF-004"]));
  gates[0].resolve();
  await vi.waitFor(()=>expect(started).toHaveLength(5));
  gates[4].resolve();gates[3].resolve();
  expect(await result).toEqual({completed:5,failures:[],cancelled:false});
  expect(maxActive).toBe(SEMANTIC_CONCURRENCY);
  expect(new Set(finished)).toEqual(new Set(items));
  expect(finished[0]).toBe("TF-002");
 });
 it("ao ocorrer 504 interrompe o agendamento, mas preserva a outra resposta em andamento",async()=>{
  const items=["TF-001","TF-002","TF-003","TF-004"];
  const second=deferred();
  const started:string[]=[],verified:string[]=[];
  const pending=runSemanticQueue({items,signal:new AbortController().signal,
   process:async id=>{
    started.push(id);
    if(id==="TF-001")throw new AiRequestError(504,{code:"provider_timeout"});
    if(id==="TF-002"){await second.promise;verified.push(id);return;}
    throw Error("Bloco posterior não pode ser iniciado após falha.");
   }});
  await vi.waitFor(()=>expect(started).toEqual(["TF-001","TF-002"]));
  second.resolve();
  const result=await pending;
  expect(result.completed).toBe(1);
  expect(result.failures).toHaveLength(1);
  expect(result.failures[0].item).toBe("TF-001");
  expect(verified).toEqual(["TF-002"]);
  expect(started).toEqual(["TF-001","TF-002"]);
 });
 it("não repete blocos já concluídos: usa somente a lista pendente da retomada",async()=>{
  const items=["TF-017","TF-018","TF-019"];
  const started:string[]=[];
  const result=await runSemanticQueue({items,signal:new AbortController().signal,
   process:async item=>{started.push(item);}});
  expect(result.completed).toBe(3);
  expect(started).toEqual(items);
  expect(started).not.toContain("TF-016");
 });
 it("cancelamento encerra os dois trabalhos sem iniciar outros ou marcar erros falsos",async()=>{
  const controller=new AbortController();
  const started:string[]=[];
  const result=runSemanticQueue({items:["TF-001","TF-002","TF-003"],
   signal:controller.signal,process:async item=>{
    started.push(item);
    await new Promise<void>((_resolve,reject)=>{
     controller.signal.addEventListener("abort",
      ()=>reject(new DOMException("Cancelado","AbortError")),{once:true});
    });
   }});
  expect(started).toEqual(["TF-001","TF-002"]);
  controller.abort();
  expect(await result).toEqual({completed:0,failures:[],cancelled:true});
  expect(started).toHaveLength(2);
 });
 it("reprocessar individualmente inicia apenas o bloco escolhido",async()=>{
  const started:string[]=[];
  const result=await runSemanticQueue({items:["TF-005"],
   signal:new AbortController().signal,process:async item=>{started.push(item);}});
  expect(result.completed).toBe(1);
  expect(started).toEqual(["TF-005"]);
 });
});
