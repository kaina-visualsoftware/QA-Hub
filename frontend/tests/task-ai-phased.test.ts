import {afterEach,describe,expect,it,vi} from "vitest";
import {supabase} from "../src/lib/supabase";
import {locateEvidence} from "../src/features/tasks/task-evidence";
import {generateTaskAiDraftPhased,pipelinePendingCount,
 TASK_BATCH_CONCURRENCY} from "../src/features/tasks/task-ai-phased";
import type {TaskPipelineCheckpoint} from "../src/features/tasks/task-ai-phased";

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
type Seed={source_index:number;titulo:string;passos:string;esperado:string;observacoes:string};
const sourceSeeds=(source:string):Seed[]=>{
 const matches=[...source.matchAll(/CENÁRIO (\d+) — Validar desconto (\d+)/g)];
 return matches.map((m,i)=>({
  source_index:i,titulo:"Validar desconto "+m[1],
  passos:"1. Abrir pedido de teste "+m[1]+".\n2. Solicitar remoção de desconto.",
  esperado:"Desconto removido na operação "+m[1]+".",observacoes:""
 }));
};
function reply(body:Record<string,unknown>){
 const source=String(body.text??"");
 const lines=source.split("\n");
 const proof=(quote:string)=>({quote,source_line:locateEvidence(source,quote),
  status:"verified",reason:null});
 const find=(pattern:RegExp)=>lines.find(line=>pattern.test(line))?.trim()||
  lines.find(line=>line.trim().length>=8)?.trim()||source.slice(0,60);
 const mode=body.mode;
 if(mode==="task-fields"){
  const rf=/RF-103/.test(source);
  const quote=find(rf?/RF-103/:/desconto negativo/i);
  const field=rf?{
   titulo:"Validar máscara de telefone",descricao:"Validar máscara de telefone."
  }:{
   titulo:"Corrigir remoção de descontos negativos",
   descricao:"O desconto negativo permanece após excluir.",
   causa:"A rotina ignorava percentuais negativos.",
   correcao:"A remoção passou a considerar negativos."
  };
  const quotes=rf?{titulo:quote,descricao:quote}:{
   titulo:quote,descricao:quote,
   causa:find(/rotina ignorava/i),correcao:find(/remoção passou/i)
  };
  return {data:{provider:"NVIDIA Build",stage:"fields",model:"fixture",
   repaired:false,draft:field,
   field_evidence:Object.fromEntries(Object.keys(field).map(key=>[
    key,proof((quotes as Record<string,string>)[key]??quote)
   ])),review_fields:[]},error:null};
 }
 if(mode==="task-seeds"){
  const seeds=sourceSeeds(source);
  return {data:{provider:"NVIDIA Build",stage:"seeds",model:"fixture",
   repaired:false,draft:{seeds:seeds.map(seed=>({
    ...seed,evidence:proof(find(new RegExp("CENÁRIO "+(seed.source_index+1)+" —")))
   }))},review_seeds:[]},error:null};
 }
 if(mode==="task-scenarios"){
  const seeds=body.seeds as Seed[];
  return {data:{provider:"NVIDIA Build",stage:"scenarios",model:"fixture",
   repaired:false,draft:{cenarios:seeds.map(seed=>({
    ...seed,evidence:proof(find(new RegExp("CENÁRIO "+(seed.source_index+1)+" —")))
   }))},review_scenarios:[]},error:null};
 }
 throw Error("Unexpected mode "+mode);
}
const invoke=(body:Record<string,unknown>)=>reply(body);
const failure=(status=503)=>({data:null,error:{context:{status,
 json:async()=>({code:"provider_unavailable",message:"NVIDIA indisponível"})}}} as never);

describe("Criação faseada com extração exclusiva pela NVIDIA",()=>{
 it("extrai apenas os campos na etapa 1, sem chamadas de geração de casos",async()=>{
  const spy=vi.spyOn(supabase.functions,"invoke").mockImplementation(async(_name,args)=>
   invoke(args!.body as Record<string,unknown>));
  const result=await generateTaskAiDraftPhased(sourceWith(6),{fieldsOnly:true});
  const modes=spy.mock.calls.map(x=>(x[1]?.body as {mode:string}).mode);
  expect(modes).toEqual(["task-fields"]);
  expect(result.fields.titulo).toBeDefined();
  expect(result.cenarios).toEqual([]);
  expect(result.seedsPending).toBe(false);
  expect(result.pendingBatches).toBe(0);
  expect(result.partial).toBe(false);
  expect(result.extractionSource).toBe("nvidia");
 });
 it("extrai campos e usa etapa NVIDIA de descoberta mesmo sem cenários",async()=>{
  const spy=vi.spyOn(supabase.functions,"invoke").mockImplementation(async(_n,args)=>
   invoke(args!.body as Record<string,unknown>));
  const text="REQUISITO RF-103: validar máscara de telefone ao cadastrar estrangeiro.";
  const result=await generateTaskAiDraftPhased(text);
  expect(result.fields.titulo).toBeDefined();
  expect(result.cenarios).toHaveLength(0);
  expect(result.partial).toBe(false);
  expect(result.extractionSource).toBe("nvidia");
  expect(spy.mock.calls.map(c=>(c[1]?.body as {mode:string}).mode))
   .toEqual(["task-fields","task-seeds"]);
 });
 it("identifica cenários exclusivamente pela NVIDIA e gera lotes de até quatro em paralelo",async()=>{
  const text=sourceWith(9);
  let active=0,maxActive=0;
  const spy=vi.spyOn(supabase.functions,"invoke").mockImplementation(async(_n,args)=>{
   const body=args!.body as Record<string,unknown>;
   if(body.mode==="task-scenarios"){
    active++;maxActive=Math.max(active,maxActive);
    await new Promise(resolve=>setTimeout(resolve,10));
    active--;
   }
   return invoke(body) as never;
  });
  const result=await generateTaskAiDraftPhased(text);
  const modes=spy.mock.calls.map(c=>(c[1]?.body as {mode:string}).mode);
  expect(modes.slice(0,2)).toEqual(["task-fields","task-seeds"]);
  expect(modes.filter(x=>x==="task-seeds")).toHaveLength(1);
  expect(modes.filter(x=>x==="task-scenarios")).toHaveLength(3);
  expect(TASK_BATCH_CONCURRENCY).toBe(2);
  expect(maxActive).toBe(2);
  expect(result.cenarios).toHaveLength(9);
  expect(result.cenarios.every(x=>x.status==="nao_executado")).toBe(true);
  expect(result.unprocessedScenarios).toBe(0);
  expect(result.partial).toBe(false);
 });
 it("falha parcial conserva só lotes concluídos pela NVIDIA e retoma sem refazer",async()=>{
  const text=sourceWith(6),checkpoints:TaskPipelineCheckpoint[]=[];
  let failSecond=true;
  const spy=vi.spyOn(supabase.functions,"invoke").mockImplementation(async(_n,args)=>{
   const body=args!.body as Record<string,unknown>;
   if(body.mode==="task-scenarios"&&
    (body.seeds as Seed[])[0].source_index>=4&&failSecond)return failure();
   return invoke(body);
  });
  const partial=await generateTaskAiDraftPhased(text,{
   onCheckpoint:x=>checkpoints.push(x)
  });
  expect(partial.partial).toBe(true);
  expect(partial.pendingBatches).toBe(1);
  expect(partial.cenarios).toHaveLength(4);
  const saved=checkpoints.at(-1)!;
  expect(pipelinePendingCount(saved)).toBe(1);
  failSecond=false;
  const before=spy.mock.calls.length;
  const resumed=await generateTaskAiDraftPhased(text,{checkpoint:saved});
  expect(resumed.partial).toBe(false);
  expect(resumed.cenarios).toHaveLength(6);
  const next=spy.mock.calls.slice(before).map(c=>(c[1]?.body as {mode:string}).mode);
  expect(next).toEqual(["task-scenarios"]);
 });
 it("falha 503 não invoca parser local e mantém checkpoint",async()=>{
  const log:TaskPipelineCheckpoint[]=[];
  vi.spyOn(supabase.functions,"invoke").mockResolvedValue(failure());
  await expect(generateTaskAiDraftPhased(sourceWith(2),{onCheckpoint:x=>log.push(x)}))
   .rejects.toThrow(/Nenhuma extração local/);
  expect(log).toHaveLength(1);
  expect(log[0].fields).toBeNull();
  expect(log[0].seeds).toBeNull();
 });
 it("se a etapa de descoberta falhar, os campos NVIDIA permanecem para retomada",async()=>{
  const text=sourceWith(2),checkpoints:TaskPipelineCheckpoint[]=[];
  let bad=true;
  vi.spyOn(supabase.functions,"invoke").mockImplementation(async(_n,args)=>{
   const body=args!.body as Record<string,unknown>;
   return bad&&body.mode==="task-seeds"?failure():invoke(body);
  });
  await expect(generateTaskAiDraftPhased(text,{onCheckpoint:x=>checkpoints.push(x)}))
   .rejects.toThrow(/identificação dos cenários/);
  const saved=checkpoints.at(-1)!;
  expect(saved.resolvedFields).toBe(true);
  expect(saved.resolvedSeeds).toBe(false);
  bad=false;
  const result=await generateTaskAiDraftPhased(text,{checkpoint:saved});
  expect(result.cenarios).toHaveLength(2);
  expect(result.partial).toBe(false);
 });
 it("uma citação de seed inventada não cria cenário nem falso sucesso",async()=>{
  const text=sourceWith(1);
  vi.spyOn(supabase.functions,"invoke").mockImplementation(async(_n,args)=>{
   const body=args!.body as Record<string,unknown>,r=invoke(body);
   if(body.mode!=="task-seeds")return r as never;
   const original=(r.data as {draft:{seeds:Record<string,unknown>[]}}).draft.seeds[0];
   return {data:{...(r.data as Record<string,unknown>),
    draft:{seeds:[]},review_seeds:[{...original,evidence:{
     quote:"Esta citação não existe na TF.",source_line:null,
     status:"needs_review",reason:"quote_not_found"
    }}]},error:null} as never;
  });
  const result=await generateTaskAiDraftPhased(text);
  expect(result.cenarios).toHaveLength(0);
  expect(result.partial).toBe(true);
  expect(result.needsReviewCount).toBeGreaterThan(0);
 });
 it("cancelamento antes da requisição não executa nenhuma chamada NVIDIA",async()=>{
  const controller=new AbortController();
  const spy=vi.spyOn(supabase.functions,"invoke")
   .mockImplementation(async()=>invoke({mode:"task-fields",text:sourceWith(2)}));
  await expect(generateTaskAiDraftPhased(sourceWith(2),{
   signal:controller.signal,
   onProgress:progress=>{if(progress.stage==="fields")controller.abort();}
  })).rejects.toMatchObject({name:"AbortError"});
  expect(spy).not.toHaveBeenCalled();
 });
});
