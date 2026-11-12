import {describe,expect,it,vi} from "vitest";
import {assembleGeneratorSections,generateBatchedWithNvidia,
 mergeContinuation,newGeneratorCheckpoint,matchesGeneratorCheckpoint,
 unfinishedGeneratorStages,restartInterruptedGeneratorStage} from "../src/features/generators/batched-stream";
import {recoverCompletedCases} from "../src/features/generators/recover-cases";
import type {GeneratorBatchRequest,GeneratorMode} from "../src/features/generators/stream";
const mock=(handler:(batch:GeneratorBatchRequest)=>{text:string;truncated:boolean}|Promise<{text:string;truncated:boolean}>)=>
 vi.fn(async(_mode:GeneratorMode,_task:string,_requirements:string,
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
 it("recovers complete scenarios after three truncated replies without selecting them",async()=>{
  let cp=newGeneratorCheckpoint("teste","TF","REQ");
  const makeCase=(n:number)=>[
   "## Cenário "+String(n).padStart(2,"0")+" — Validar regra "+n,
   "### Passos",
   "1. Abrir pedido "+n+".",
   "### Resultado esperado",
   "- Pedido "+n+" validado."
  ].join("\n");
  const streamed=[
   ...Array.from({length:9},(_,index)=>makeCase(index+1)),
   "## Cenário 10 — Caso interrompido",
   "### Passos",
   "1. Abrir pedido 10.",
   "### Resultado esperado",
   "- O pedido "
  ].join("\n\n");
  const calls:number[]=[];
  const request=mock(batch=>{
   calls.push(batch.continuation);
   return {text:batch.continuation===0?streamed:
    "Continuação documentada e terminada ao limite.",truncated:true};
  });
  await expect(generateBatchedWithNvidia("teste","TF","REQ",{
   request,onCheckpoint:c=>{cp=c;}
  })).rejects.toThrow(/duas continuidades/);
  expect(calls).toEqual([0,1,2]);
  expect(cp.currentStage).toBe(0);
  const recovered=recoverCompletedCases(cp);
  expect(recovered).toHaveLength(9);
  expect(recovered[0].titulo).toContain("Validar regra 1");
  expect(recovered.every(item=>!item.selected&&
   Boolean(item.passos.trim()&&item.esperado.trim()))).toBe(true);
  expect(recovered.some(item=>item.titulo.includes("interrompido"))).toBe(false);
  // Explicit user retry can restart the failed stage while not replaying
  // anything already confirmed in earlier sections.
  const next=restartInterruptedGeneratorStage(cp);
  expect(next.currentStage).toBe(0);
  expect(next.partial).toBe("");
  expect(next.continuation).toBe(0);
  expect(cp.partial).toContain("Validar regra 9");
  const resumedRequest=mock(batch=>({text:batch.stage==="setup"?
   "# ROTEIRO DE TESTES\n## Objetivo\nValidar regra.\n## Pré-requisitos\n- A confirmar":
   batch.stage==="positive"?makeCase(1):
   batch.stage==="negative"?"[Sem cenários negativos adicionais documentados]":
   batch.stage==="regression"?"[Sem cenários de regressão adicionais documentados]":
   "## ✅ Critérios de aceite\n- [ ] Confirmar regra.",
   truncated:false}));
  const output=await generateBatchedWithNvidia("teste","TF","REQ",{
   checkpoint:next,request:resumedRequest
  });
  expect(output.checkpoint.currentStage).toBe(5);
  expect(output.text).toContain("## Cenário 01");
 });
 it("a retry of the last pending stage keeps previously completed sections",async()=>{
  const original=newGeneratorCheckpoint("teste","TF","REQ");
  original.sections=["# ROTEIRO DE TESTES\n## Objetivo\nValidar"];
  original.currentStage=1;
  original.partial="## Cenário 01 — Desconto\n### Passos\n1. Abrir\n";
  original.continuation=2;
  const next=restartInterruptedGeneratorStage(original);
  expect(next.sections).toEqual(original.sections);
  expect(next.sections).not.toBe(original.sections);
  const called:number[]=[];
  const request=mock(batch=>{
   called.push(batch.index);
   return {text:batch.stage==="positive"?
    "## Cenário 01 — Validar desconto\n### Passos\n1. Abrir\n### Resultado esperado\n- Corrigido":
    "[Sem cenários de regressão adicionais documentados]",truncated:false};
  });
  const done=await generateBatchedWithNvidia("teste","TF","REQ",{
   checkpoint:next,request
  });
  expect(called).toEqual([1,2,3,4]);
  expect(done.text).toContain("# ROTEIRO DE TESTES");
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
