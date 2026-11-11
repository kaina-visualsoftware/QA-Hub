import {afterEach,describe,expect,it,vi} from "vitest";
import {supabase} from "../src/lib/supabase";
import {extractLocalDraft} from "../src/lib/legacy/qa-assistant.mjs";
import {locateEvidence} from "../src/features/tasks/task-evidence";
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
type TestSeed={source_index:number;titulo:string;passos:string;esperado:string;observacoes:string};
function reply(body:Record<string,unknown>){
 const source=String(body.text??"");
 const lines=source.split("\n");
 const proof=(quote:string)=>({quote,source_line:locateEvidence(source,quote),
  status:"verified",reason:null});
 const find=(pattern:RegExp)=>lines.find(line=>pattern.test(line))?.trim()||
  lines.find(line=>line.trim().length>=8)?.trim()||source.slice(0,60);
 if(body.mode==="task-fields"){
  const phone=/telefone|estrangeiro/i.test(source);
  const quote=find(phone?/telefone|estrangeiro/i:/desconto negativo/i);
  const title=phone?"Validar máscara de telefone estrangeiro":
   "Corrigir remoção de descontos negativos";
  const entries=phone?{
   titulo:title,descricao:"Validar máscara de telefone para clientes estrangeiros."
  }:{
   titulo:title,descricao:"Desconto não é removido após exclusão.",
   causa:"A rotina ignorava percentuais negativos.",
   correcao:"A limpeza passou a considerar negativos."
  };
  const quotes=phone?{titulo:quote,descricao:quote}:{
   titulo:quote,descricao:quote,
   causa:find(/rotina ignorava/i),correcao:find(/remoção passou/i)
  };
  return {data:{provider:"NVIDIA Build",stage:"fields",model:"glm-fixture",
   repaired:false,draft:entries,
   field_evidence:Object.fromEntries(Object.keys(entries).map(name=>[
    name,proof(quotes[name as keyof typeof quotes])
   ]))},error:null};
 }
 if(body.mode==="task-scenarios"){
  const seeds=body.seeds as TestSeed[];
  return {data:{provider:"NVIDIA Build",stage:"scenarios",model:"glm-fixture",
   repaired:false,draft:{cenarios:seeds.map(seed=>{
    const quote=find(new RegExp("CEN[ÁA]RIO\\s+"+(seed.source_index+1)+"\\b","i"));
    return {...seed,titulo:seed.titulo+" revisado",evidence:proof(quote)};
   })}},error:null};
 }
 throw Error("Modo inesperado");
}

describe("F4 — extração de tarefa em etapas",()=>{
 it("preserva o texto original e extrai apenas os campos quando não há cenários",async()=>{
  const spy=vi.spyOn(supabase.functions,"invoke").mockImplementation(async(_name,args)=>
   reply(args!.body as Record<string,unknown>) as never);
  const original="REQUISITO RF-103: validar máscara de telefone ao cadastrar estrangeiro.";
  const result=await generateTaskAiDraftPhased(original);
  expect(result.fields.titulo).toBe("Validar máscara de telefone estrangeiro");
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
 it("F4: preserva localmente cenários muito extensos sem reenviar lotes inválidos",async()=>{
  const original=[
   "CENÁRIO 1 — Caso com relatório extenso",
   "Passos:",
   ...Array.from({length:180},(_,i)=>
    "1. Verificar registro de exemplo "+i+" e seu comportamento de negócio documentado."),
   "Resultado esperado: Nenhuma duplicidade de dados."
  ].join("\n");
  const local=extractLocalDraft(original);
  expect(local.cenarios.length).toBeGreaterThan(0);
  vi.spyOn(supabase.functions,"invoke").mockImplementation(async(_name,args)=>
   reply(args!.body as Record<string,unknown>) as never);
  const result=await generateTaskAiDraftPhased(original);
  expect(result.partial).toBe(true);
  expect(result.cenarios).toHaveLength(local.cenarios.length);
  expect(result.extractionReason).toMatch(/trechos limitados|não foram enviados/i);
 });
 it("F5: não preenche automaticamente título sem citação, apesar de outros campos verificados",async()=>{
  const original=sourceWith(2);
  vi.spyOn(supabase.functions,"invoke").mockImplementation(async(_name,args)=>{
   const body=args!.body as Record<string,unknown>;
   const response=reply(body);
   if(body.mode!=="task-fields")return response as never;
   const data=response.data as {draft:Record<string,string>;
    field_evidence:Record<string,unknown>};
   return {data:{...data,draft:{...data.draft,titulo:"Problema de tarifa inventada"},
    field_evidence:{...data.field_evidence,titulo:{
     quote:"Texto que não aparece no relatório",source_line:null,
     status:"needs_review",reason:"quote_not_found"
    }}},error:null} as never;
  });
  const result=await generateTaskAiDraftPhased(original);
  expect(result.fieldReview.some(r=>r.field==="titulo"&&r.status==="needs_review")).toBe(true);
  expect(result.fields.titulo).not.toBe("Problema de tarifa inventada");
  expect(result.needsReviewCount).toBeGreaterThan(0);
  expect(result.partial).toBe(true);
 });
 it("F5: cenário com citação falsa não substitui a versão local nem conclui o lote",async()=>{
  const original=sourceWith(2);
  const local=extractLocalDraft(original);
  vi.spyOn(supabase.functions,"invoke").mockImplementation(async(_name,args)=>{
   const body=args!.body as Record<string,unknown>;
   const response=reply(body);
   if(body.mode!=="task-scenarios")return response as never;
   const data=response.data as {draft:{cenarios:{source_index:number;
    evidence:unknown}[]}};
   const rows=data.draft.cenarios.map((row,index)=>index===0?{
    ...row,evidence:{quote:"Citação inexistente",
     source_line:null,status:"needs_review",reason:"quote_not_found"}
   }:row);
   return {data:{...data,draft:{cenarios:rows}},error:null} as never;
  });
  const result=await generateTaskAiDraftPhased(original);
  expect(result.partial).toBe(true);
  expect(result.pendingBatches).toBeGreaterThan(0);
  expect(result.scenarioReview.some(item=>item.status==="needs_review")).toBe(true);
  expect(result.cenarios[0].titulo).toBe(local.cenarios[0].titulo);
  expect(result.cenarios[0].status).toBe("nao_executado");
 });
 it("F5: resposta reparada exige revisão e mantém preenchimento local",async()=>{
  const original=sourceWith(0);
  vi.spyOn(supabase.functions,"invoke").mockImplementation(async(_name,args)=>{
   const body=args!.body as Record<string,unknown>;
   const response=reply(body);
   const data=response.data as Record<string,unknown>;
   return {data:{...data,repaired:true},error:null} as never;
  });
  const result=await generateTaskAiDraftPhased(original);
  expect(result.partial).toBe(true);
  expect(result.fieldReview.every(r=>r.status==="needs_review")).toBe(true);
  expect(result.fieldReview.some(r=>r.reason==="json_repaired")).toBe(true);
  expect(result.extractionSource).toBe("local");
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
