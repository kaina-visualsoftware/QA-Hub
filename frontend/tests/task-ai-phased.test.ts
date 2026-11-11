import {afterEach,describe,expect,it,vi} from "vitest";
import {supabase} from "../src/lib/supabase";
import {extractLocalDraft} from "../src/lib/legacy/qa-assistant.mjs";
import {generateTaskAiDraftPhased,newCheckpoint,pipelinePendingCount,TASK_BATCH_CONCURRENCY}
 from "../src/features/tasks/task-ai-phased";

vi.mock("../src/lib/supabase",()=>({supabase:{functions:{invoke:vi.fn()}}}));
afterEach(()=>vi.restoreAllMocks());

const sourceWith=(count:number)=>[
 "QUAL É O PROBLEMA IDENTIFICADO?--",
 "O desconto negativo do pedido permanece após excluir.",
 "ANÁLISE DE VIABILIDADE:",
 "A rotina ignorava percentuais negativos.",
 "O QUE O DESENVOLVEDOR ALTEROU:",
 "A remoção passou a considerar negativos.",
 ...Array.from({length:count},(_,i)=>[
  "CENÁRIO "+(i+1)+" — Validar desconto "+(i+1),
  "Passos:",
  "1. Abrir pedido de teste "+(i+1)+".",
  "2. Solicitar remoção de desconto.",
  "Resultado esperado: Desconto removido na operação "+(i+1)+"."
 ].join("\n"))
].join("\n\n");
const fields={provider:"NVIDIA Build",stage:"fields",
 draft:{titulo:"Corrigir remoção de descontos negativos",
  descricao:"Desconto não é removido após exclusão.",
  causa:"A rotina ignorava percentuais negativos.",
  correcao:"A limpeza passou a considerar negativos."}};
const cases=(seeds:unknown[])=>({provider:"NVIDIA Build",stage:"scenarios",
 draft:{cenarios:(seeds as {source_index:number;titulo:string;passos:string;esperado:string;observacoes:string}[])
  .map(s=>({...s,titulo:s.titulo+" revisado"}))}});
function reply(body:Record<string,unknown>){
 if(body.mode==="task-fields")return {data:fields,error:null};
 if(body.mode==="task-scenarios")return {data:cases(body.seeds as unknown[]),error:null};
 throw Error("Modo inesperado");
}

describe("F4 — extração de tarefa em etapas",()=>{
 it("preserva o texto original e extrai apenas os campos quando não há cenários",async()=>{
  const spy=vi.spyOn(supabase.functions,"invoke").mockImplementation(async(_name,args)=>
   reply(args!.body as Record<string,unknown>) as never);
  const original="REQUISITO RF-103: validar máscara de telefone ao cadastrar estrangeiro.";
  const result=await generateTaskAiDraftPhased(original);
  expect(result.fields.titulo).toBe("Corrigir remoção de descontos negativos");
  expect(result.partial).toBe(false);
  expect(result.totalBatches).toBe(0);
  expect(spy).toHaveBeenCalledTimes(1);
  expect(spy.mock.calls[0][1]?.body).toEqual({text:original,mode:"task-fields"});
 });
 it("usa blocos de quatro, no máximo duas chamadas simultâneas e índices estáveis",async()=>{
  const original=sourceWith(9);
  const local=extractLocalDraft(original);
  expect(local.cenarios.length).toBeGreaterThanOrEqual(8);
  let active=0,maxActive=0;
  const spy=vi.spyOn(supabase.functions,"invoke").mockImplementation(async(_name,args)=>{
   const body=args!.body as Record<string,unknown>;
   if(body.mode==="task-scenarios"){
    active++;maxActive=Math.max(active,maxActive);
    await Promise.resolve();
    active--;
   }
   return reply(body) as never;
  });
  const result=await generateTaskAiDraftPhased(original);
  expect(TASK_BATCH_CONCURRENCY).toBe(2);
  expect(maxActive).toBeLessThanOrEqual(2);
  expect(maxActive).toBeGreaterThan(1);
  const batchCalls=spy.mock.calls.filter(c=>(c[1]?.body as {mode?:string}).mode==="task-scenarios");
  expect(batchCalls.length).toBe(Math.ceil(Math.min(local.cenarios.length,20)/4));
  expect(batchCalls.every(c=>(c[1]?.body as {seeds:unknown[]}).seeds.length<=4)).toBe(true);
  const ids=batchCalls.flatMap(c=>(c[1]?.body as {seeds:{source_index:number}[]})
   .seeds.map(s=>s.source_index));
  expect([...new Set(ids)].length).toBe(ids.length);
  expect(result.partial).toBe(false);
  expect(result.cenarios).toHaveLength(local.cenarios.length);
  expect(result.cenarios.every(s=>s.status==="nao_executado")).toBe(true);
 });
 it("salva lotes concluídos na memória, conserva fallback parcial e retoma só pendentes",async()=>{
  const original=sourceWith(6);
  expect(extractLocalDraft(original).cenarios.length).toBeGreaterThanOrEqual(5);
  let failSecond=true;
  const checkpointLog:ReturnType<typeof newCheckpoint>[]=[];
  const spy=vi.spyOn(supabase.functions,"invoke").mockImplementation(async(_name,args)=>{
   const body=args!.body as Record<string,unknown>;
   if(body.mode==="task-scenarios"&&
    (body.seeds as {source_index:number}[])[0].source_index>=4&&failSecond){
    return {data:null,error:{context:{status:503,
     json:async()=>({code:"provider_unavailable",message:"Indisponível"})}}} as never;
   }
   return reply(body) as never;
  });
  const partial=await generateTaskAiDraftPhased(original,{
   onCheckpoint:checkpoint=>{checkpointLog.push(checkpoint);}
  });
  expect(partial.partial).toBe(true);
  expect(partial.pendingBatches).toBe(1);
  expect(partial.completedBatches).toBe(1);
  expect(partial.cenarios).toHaveLength(extractLocalDraft(original).cenarios.length);
  const saved=checkpointLog.at(-1)!;
  expect(pipelinePendingCount(saved)).toBe(1);
  failSecond=false;
  const before=spy.mock.calls.length;
  const resumed=await generateTaskAiDraftPhased(original,{checkpoint:saved});
  expect(resumed.partial).toBe(false);
  expect(resumed.pendingBatches).toBe(0);
  const next=spy.mock.calls.slice(before);
  expect(next).toHaveLength(1);
  expect((next[0][1]?.body as {mode:string}).mode).toBe("task-scenarios");
  expect(resumed.cenarios).toHaveLength(partial.cenarios.length);
 });
 it("não disfarça falha de autenticação como sucesso local",async()=>{
  vi.spyOn(supabase.functions,"invoke").mockResolvedValue({
   data:null,error:{context:{status:401,
    json:async()=>({code:"unauthorized",message:"Sessão encerrada."})}}
  } as never);
  await expect(generateTaskAiDraftPhased(sourceWith(1))).rejects.toThrow(/Sessão encerrada/);
 });
 it("preserva extração local quando a NVIDIA está fora, sinalizando pendências",async()=>{
  vi.spyOn(supabase.functions,"invoke").mockResolvedValue({
   data:null,error:{context:{status:503,
    json:async()=>({code:"provider_unavailable",message:"NVIDIA indisponível"})}}
  } as never);
  const original=sourceWith(2);
  const result=await generateTaskAiDraftPhased(original);
  expect(result.partial).toBe(true);
  expect(result.fields.causa).toMatch(/percentuais negativos/i);
  expect(result.pendingBatches).toBeGreaterThan(0);
  expect(result.extractionSource).toBe("local");
 });
 it("aborto não reenvia nem salva; checkpoint continua disponível para retomar",async()=>{
  const controller=new AbortController(),checkpoints:ReturnType<typeof newCheckpoint>[]=[];
  const spy=vi.spyOn(supabase.functions,"invoke").mockImplementation(async()=>reply({mode:"task-fields"}) as never);
  await expect(generateTaskAiDraftPhased(sourceWith(2),{
   signal:controller.signal,
   onCheckpoint:s=>checkpoints.push(s),
   onProgress:s=>{if(s.stage==="fields")controller.abort();}
  })).rejects.toMatchObject({name:"AbortError"});
  expect(checkpoints).toHaveLength(1);
  expect(pipelinePendingCount(checkpoints[0])).toBeGreaterThan(0);
  expect(spy).not.toHaveBeenCalled();
 });
 it("não inventa cenários quando só existe requisito documental",async()=>{
  vi.spyOn(supabase.functions,"invoke").mockImplementation(async(_name,args)=>
   reply(args!.body as Record<string,unknown>) as never);
  const result=await generateTaskAiDraftPhased(
   "RF-201: o sistema deve bloquear confirmação sem autorização.");
  expect(result.cenarios).toHaveLength(0);
  expect(result.partial).toBe(false);
 });
});
