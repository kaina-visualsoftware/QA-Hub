import {describe,expect,it,vi} from "vitest";
import {generateBatchedWithNvidia,newGeneratorCheckpoint,unfinishedGeneratorStages} from
 "../src/features/generators/batched-stream";
import type {GeneratorBatchRequest,GeneratorMode} from "../src/features/generators/stream";
import {recoverInterruptedWizardCases} from "../src/features/tasks/wizard-case-recovery";

const scenario=(index:number)=>[
 "## Cenário "+String(index).padStart(2,"0")+" — Regra "+index,
 "### Cenário","Validar a regra "+index+".",
 "### Passos","1. Abrir o pedido "+index+".",
 "### Resultado esperado","- A regra "+index+" é aplicada corretamente."
].join("\n");

describe("Criar TF — recuperar cenários de streaming interrompido",()=>{
 it("recupera nove cenários recebidos sem selecioná-los e retoma só etapas pendentes",async()=>{
  let checkpoint=newGeneratorCheckpoint("teste","TF original","Requisitos");
  const received=Array.from({length:9},(_,i)=>scenario(i+1)).join("\n\n");
  const seen:GeneratorBatchRequest[]=[];
  let shouldFail=true;
  const request=vi.fn(async(_mode:GeneratorMode,_task:string,_req:string,
   onChunk:(text:string)=>void,_signal?:AbortSignal,_wait?:unknown,batch?:GeneratorBatchRequest)=>{
   const part=batch!;
   seen.push(part);
   if(part.index===1&&part.continuation===0){
    onChunk(received);
    throw Error("A IA não concluiu a resposta. Tente novamente.");
   }
   if(part.index===1&&part.continuation===1&&shouldFail)
    throw Error("Conexão interrompida");
   const text=part.index===0?"# ROTEIRO DE TESTES\n## Objetivo\nValidar regras.":
    part.index===1?"\n\n---\n":
    part.index===2?"[Sem cenários negativos adicionais documentados]":
    part.index===3?"[Sem cenários de regressão adicionais documentados]":
    "## Critérios de aceite\n- Revisar resultados.";
   onChunk(text);
   return {text,truncated:false};
  });
  await expect(generateBatchedWithNvidia("teste","TF original","Requisitos",{
   request,onCheckpoint:cp=>{checkpoint=cp;}
  })).rejects.toThrow("Conexão interrompida");
  expect(unfinishedGeneratorStages(checkpoint)).toBe(4);
  const recovered=recoverInterruptedWizardCases(checkpoint);
  expect(recovered).toHaveLength(9);
  expect(recovered.every(item=>!item.selected)).toBe(true);
  expect(recovered.every(item=>item.passos&&item.esperado)).toBe(true);
  shouldFail=false;
  const answer=await generateBatchedWithNvidia("teste","TF original","Requisitos",{
   checkpoint,request,onCheckpoint:cp=>{checkpoint=cp;}
  });
  expect(unfinishedGeneratorStages(checkpoint)).toBe(0);
  expect(recoverInterruptedWizardCases(checkpoint)).toHaveLength(9);
  expect(answer.text).toContain("Regra 09");
  expect(seen.filter(item=>item.index===0)).toHaveLength(1);
  expect(seen.filter(item=>item.index===1&&item.continuation===0)).toHaveLength(1);
 });
 it("ignora rascunhos sem passos/resultado e remove duplicados",()=>{
  const cp=newGeneratorCheckpoint("teste","TF","REQ");
  cp.partial=scenario(1)+"\n\n## Cenário 02 — Incompleto\n### Passos\n1. Abrir.";
  const first=recoverInterruptedWizardCases(cp);
  expect(first).toHaveLength(1);
  expect(recoverInterruptedWizardCases(cp,first)).toHaveLength(0);
 });
});
