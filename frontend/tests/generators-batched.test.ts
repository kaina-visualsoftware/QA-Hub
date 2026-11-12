import {describe,expect,it,vi} from "vitest";
import {assembleGeneratorSections,generateBatchedWithNvidia,
 mergeContinuation,newGeneratorCheckpoint,matchesGeneratorCheckpoint,
 unfinishedGeneratorStages} from "../src/features/generators/batched-stream";
import type {GeneratorBatchRequest,GeneratorMode} from "../src/features/generators/stream";
const mock=(handler:(batch:GeneratorBatchRequest)=>{text:string;truncated:boolean}|Promise<{text:string;truncated:boolean}>)=>
 vi.fn(async(mode:GeneratorMode,task:string,requirements:string,
  onChunk:(text:string)=>void,_signal?:AbortSignal,_wait?:unknown,batch?:GeneratorBatchRequest)=>{
  const result=await handler(batch!);
  onChunk(result.text);
  return result;
 });
describe("F6 — resumable batched SSE generation",()=>{
 it("keeps ordered 3-section posts, never resends completed stages",async()=>{
  const requests:GeneratorBatchRequest[]=[];
  const request=mock(b=>{
   requests.push(b);
   const content=["# DESCONTO CORRIGIDO\nAnteriormente, ocorria falha.",
    "**Comportamento detalhado**\n1. Remoção corrigida.",
    "**TAREFA:** 67866\n**JUSTIFICATIVA:** Evitar divergência."][b.index];
   return {text:content,truncated:false};
  });
  const saved:unknown[]=[];
  const answer=await generateBatchedWithNvidia("post","TF 67866","RF 42",
   {request,onCheckpoint:cp=>saved.push(cp)});
  expect(requests.map(b=>b.stage)).toEqual(["overview","details","closing"]);
  expect(answer.text).toMatch(/JUSTIFICATIVA:[\s\S]*$/);
  expect(answer.text.match(/TAREFA:/g)).toHaveLength(1);
  expect(answer.checkpoint.currentStage).toBe(3);
  expect(saved.length).toBeGreaterThan(3);
 });
 it("continues after output length, with tail, without duplicating overlap",async()=>{
  const calls:GeneratorBatchRequest[]=[];
  const request=mock(b=>{
   calls.push(b);
   if(b.index===0&&b.continuation===0)
    return {text:"# POST\nAnteriormente, o processo mostrava desconto negativo. ",
     truncated:true};
   if(b.index===0&&b.continuation===1)
    return {text:"o processo mostrava desconto negativo. Agora, o valor é correto.",
     truncated:false};
   return {text:b.index===1?"**Comportamento detalhado**\n1. Corrigido.":
    "**TAREFA:** 67866\n**JUSTIFICATIVA:** Conferir valores.",truncated:false};
  });
  const out=await generateBatchedWithNvidia("post","TF 67866","",
   {request});
  expect(calls).toHaveLength(4);
  expect(calls[1].continuation).toBe(1);
  expect(calls[1].previousTail).toContain("desconto negativo");
  expect(out.text.match(/desconto negativo/g)).toHaveLength(1);
 });
 it("keeps a checkpoint after a failed section and resumes only pending requests",async()=>{
  let fail=true;
  let checkpoint=newGeneratorCheckpoint("post","TF","REQ");
  const seen:GeneratorBatchRequest[]=[];
  const request=mock(b=>{
   seen.push(b);
   if(b.index===1&&fail)throw Error("Interrupção simulada");
   return {text:["# POST\nComparação documentada.",
    "**Comportamento detalhado**\n1. Regra",
    "**TAREFA:** 67866\n**JUSTIFICATIVA:** Evitar erro."][b.index],truncated:false};
  });
  await expect(generateBatchedWithNvidia("post","TF","REQ",{
   request,onCheckpoint:cp=>{checkpoint=cp;}
  })).rejects.toThrow("Interrupção simulada");
  expect(checkpoint.currentStage).toBe(1);
  expect(checkpoint.sections).toHaveLength(1);
  expect(unfinishedGeneratorStages(checkpoint)).toBe(2);
  fail=false;
  const out=await generateBatchedWithNvidia("post","TF","REQ",{
   checkpoint,request,onCheckpoint:cp=>{checkpoint=cp;}});
  expect(out.text).toContain("# POST");
  expect(seen.map(b=>b.index)).toEqual([0,1,1,2]);
 });
 it("does not discard streamed partial output when a connection closes",async()=>{
  let cp=newGeneratorCheckpoint("post","TF","REQ");
  const indices:GeneratorBatchRequest[]=[];
  const request=vi.fn(async(_mode:GeneratorMode,_task:string,_req:string,
   onChunk:(text:string)=>void,_signal?:AbortSignal,_wait?:unknown,batch?:GeneratorBatchRequest)=>{
   indices.push(batch!);
   if(batch!.index===0&&batch!.continuation===0){
    onChunk("# POST\nConteúdo parcial referente à tarefa.");
    throw Error("SSE interrompido");
   }
   const text=batch!.index===0?" Continuação sem repetição.":
    batch!.index===1?"**Comportamento detalhado**\n1. Regra documentada.":
    "**TAREFA:** 67866\n**JUSTIFICATIVA:** Corrigir problema.";
   onChunk(text);return {text,truncated:false};
  });
  const out=await generateBatchedWithNvidia("post","TF","REQ",{
   request,onCheckpoint:c=>{cp=c;}});
  expect(indices[1].continuation).toBe(1);
  expect(cp.currentStage).toBe(3);
  expect(out.text).toContain("Conteúdo parcial referente à tarefa.");
  expect(out.text).toContain("Continuação sem repetição.");
 });
 it("rejects repeated truncation after at most two continuations and never marks done",async()=>{
  const seen:GeneratorBatchRequest[]=[];
  let cp=newGeneratorCheckpoint("post","TF","REQ");
  const request=mock(b=>{seen.push(b);return {text:"Trecho suficientemente longo "+b.continuation+" completo.",
   truncated:true};});
  await expect(generateBatchedWithNvidia("post","TF","REQ",{request,
   onCheckpoint:c=>{cp=c;}})).rejects.toThrow(/duas continuidades/);
  expect(seen.map(b=>b.continuation)).toEqual([0,1,2]);
  expect(cp.currentStage).toBe(0);
 });
 it("never changes task contexts during resume and preserves cancellation",async()=>{
  const cp=newGeneratorCheckpoint("teste","TF antiga","REQ antiga");
  expect(matchesGeneratorCheckpoint(cp,"teste","TF nova","REQ antiga")).toBe(false);
  const ac=new AbortController();ac.abort();
  const request=mock(()=>({text:"Nunca executar",truncated:false}));
  await expect(generateBatchedWithNvidia("teste","TF antiga","REQ antiga",
   {signal:ac.signal,request})).rejects.toMatchObject({name:"AbortError"});
  expect(request).not.toHaveBeenCalled();
 });
 it("assembles test sections with globally unique scenario numbers",()=>{
  const result=assembleGeneratorSections("teste",[
   "# ROTEIRO DE TESTES\n## Objetivo\nValidar.",
   "## Cenário 01 — Venda\n### Passos\n1. Abrir.",
   "## Cenário 01 — Limite\n### Passos\n1. Checar.",
   "[Sem cenários de regressão adicionais documentados]",
   "## ✅ Critérios de aceite\n- [ ] OK\n## 📝 Resultado dos testes\n**Cenários executados:** ___ / 10"
  ]);
  expect(result).toContain("## Cenário 01 — Venda");
  expect(result).toContain("## Cenário 02 — Limite");
  expect(result).toContain("**Cenários executados:** ___ / 2");
  expect(result).not.toContain("[Sem cenários");
 });
 it("overlap-safe continuation does not silently remove unrelated prose",()=>{
  const a="Parágrafo original sobre condição.";
  expect(mergeContinuation(a,"Outro assunto.")).toBe(a+"Outro assunto.");
  expect(mergeContinuation(a,"sobre condição. Agora há mais detalhes."))
   .toBe("Parágrafo original sobre condição. Agora há mais detalhes.");
 });
});
