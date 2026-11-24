import {describe,expect,it,vi,afterEach} from "vitest";
import {supabase} from "../src/lib/supabase";
import {cleanQaSourceText} from "../src/lib/legacy/qa-text-cleaner.mjs";
import {locateEvidence} from "../src/features/tasks/task-evidence";
import {splitTaskFieldSource,TASK_FIELD_CHUNK_BYTE_LIMIT,TASK_FIELD_CHUNK_CHAR_LIMIT,
 TASK_FIELD_CHUNK_CONCURRENCY} from "../src/features/tasks/task-ai-chunks";
import {generateTaskAiDraftPhased,pipelinePendingCount}
 from "../src/features/tasks/task-ai-phased";
import type {TaskPipelineCheckpoint} from "../src/features/tasks/task-ai-phased";

vi.mock("../src/lib/supabase",()=>({supabase:{functions:{invoke:vi.fn()}}}));
afterEach(()=>vi.restoreAllMocks());

const makeSource=(minLength:number)=>{
 const preface="TF: Conferência de cadastro por filial em pedidos.\n";
 const line="A conferência do cadastro por filial valida dados do pedido sem alterar o registro.\n";
 return preface+line.repeat(Math.ceil((minLength-preface.length)/line.length));
};
const reply=(source:string)=>{
 const quote=source.split("\n").find(x=>x.includes("conferência do cadastro"))||
  source.slice(0,Math.min(source.length,95));
 return {data:{stage:"fields",provider:"NVIDIA Build",model:"fixture",repaired:false,
  draft:{titulo:"Conferência de cadastro por filial"},
  field_evidence:{titulo:{quote,source_line:locateEvidence(source,quote),
   status:"verified",reason:null}},review_fields:[]},error:null};
};

describe("Criação uniforme com NVIDIA por blocos",()=>{
 it.each([10000,80000])("preserva toda a origem com %i caracteres e nunca envia a TF inteira",async length=>{
  const source=makeSource(length);
  const cleaned=cleanQaSourceText(source);
  const chunks=splitTaskFieldSource(cleaned);
  expect(chunks.length).toBeGreaterThan(1);
  expect(chunks.map(c=>c.text).join("")).toBe(cleaned);
  expect(chunks.every(c=>c.text.length<=TASK_FIELD_CHUNK_CHAR_LIMIT)).toBe(true);
  expect(chunks.every(c=>new TextEncoder().encode(c.text).length<=TASK_FIELD_CHUNK_BYTE_LIMIT)).toBe(true);
  let active=0,maxActive=0;
  const requests:string[]=[];
  vi.spyOn(supabase.functions,"invoke").mockImplementation(async(_name,args)=>{
   const body=args!.body as {mode:string;text:string};
   expect(body.mode).toBe("task-fields");
   expect(body.text.length).toBeLessThanOrEqual(TASK_FIELD_CHUNK_CHAR_LIMIT);
   requests.push(body.text);
   active++;maxActive=Math.max(maxActive,active);
   await new Promise(resolve=>setTimeout(resolve,2));
   active--;
   return reply(body.text);
  });
  const progress:number[]=[];
  const result=await generateTaskAiDraftPhased(source,{fieldsOnly:true,
   onProgress:state=>{if(state.stage==="fields")progress.push(state.current);}
  });
  expect(requests).toHaveLength(chunks.length);
  expect(new Set(requests).size).toBeLessThanOrEqual(chunks.length);
  for(const chunk of chunks)expect(requests).toContain(chunk.text);
  expect(maxActive).toBeLessThanOrEqual(TASK_FIELD_CHUNK_CONCURRENCY);
  expect(maxActive).toBe(2);
  expect(progress.at(-1)).toBe(chunks.length);
  expect(result.fields.titulo).toContain("Conferência");
  expect(result.partial).toBe(false);
  expect(result.fieldsPending).toBe(false);
  expect(result.cenarios).toEqual([]);
 });
 it("conserva partes prontas e retoma apenas a parte com falha",async()=>{
  const source=makeSource(14000);
  let failing=true,checkpoint:TaskPipelineCheckpoint|null=null;
  let calls=0;
  vi.spyOn(supabase.functions,"invoke").mockImplementation(async(_name,args)=>{
   const body=args!.body as {mode:string;text:string};
   calls++;
   if(failing&&calls===2)
    return {data:null,error:{context:{status:503,
     json:async()=>({code:"provider_unavailable",message:"Indisponível"})}}} as never;
   return reply(body.text);
  });
  const first=await generateTaskAiDraftPhased(source,{fieldsOnly:true,
   onCheckpoint:value=>{checkpoint=value;}
  });
  expect(first.partial).toBe(true);
  expect(first.fieldsPending).toBe(true);
  expect(pipelinePendingCount(checkpoint!)).toBe(1);
  const before=calls;
  failing=false;
  const next=await generateTaskAiDraftPhased(source,{fieldsOnly:true,checkpoint});
  expect(calls-before).toBe(1);
  expect(next.partial).toBe(false);
  expect(next.fieldsPending).toBe(false);
 });
 it("aceita resposta NVIDIA explicitamente vazia em parte sem dados",async()=>{
  const source="Apenas dados operacionais. ".repeat(500)+"\\n"+
   "A conferência do cadastro por filial valida dados do pedido.";
  vi.spyOn(supabase.functions,"invoke").mockImplementation(async(_name,args)=>{
   const body=args!.body as {text:string};
   if(!body.text.includes("conferência do cadastro"))return {data:{stage:"fields",provider:"NVIDIA Build",model:"fixture",
    repaired:false,draft:{},field_evidence:{},review_fields:[]},error:null};
   return reply(body.text);
  });
  const result=await generateTaskAiDraftPhased(source,{fieldsOnly:true});
  expect(result.fields.titulo).toContain("Conferência");
  expect(result.partial).toBe(false);
  expect(result.fieldsPending).toBe(false);
 });
 it("não mascara cancelamento nem executa extração local",async()=>{
  const source=makeSource(10000);
  const abort=new AbortController();
  const spy=vi.spyOn(supabase.functions,"invoke").mockImplementation(async(_name,args)=>
   reply((args!.body as {text:string}).text));
  await expect(generateTaskAiDraftPhased(source,{fieldsOnly:true,signal:abort.signal,
   onProgress:state=>{if(state.stage==="fields")abort.abort();}
  })).rejects.toMatchObject({name:"AbortError"});
  expect(spy).not.toHaveBeenCalled();
 });
});
