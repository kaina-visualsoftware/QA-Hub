/** F5 — Zod contract for the authenticated task-fields/task-scenarios API.
 * Only accepted structured data may reach the client. No model output executes.
 * Any JSON repair or weak citation is explicitly flagged for human review.
 */
import {z} from "npm:zod@4.6.7";
import {jsonrepair} from "npm:jsonrepair@3.15.0";
import {verifyGrounding} from "./grounding.mjs";

const FIELDS=[
 "codigo","titulo","tipo_teste","sistema","versao","ambiente","base_teste",
 "empresa","testador","descricao","explicacao","causa","correcao","conclusao","observacoes"
] as const;
const allowed=new Set<string>(FIELDS);
const fEntry=z.object({value:z.string().max(20000),evidence:z.string().max(550)}).strict();
const fieldsSchema=z.object({fields:z.record(z.string(),fEntry)
 .refine(o=>Object.keys(o).every(k=>allowed.has(k)),{message:"Campo não autorizado"})}).strict();
const scenarioSchema=z.object({
 source_index:z.number().int().min(0).max(49),
 titulo:z.string().min(3).max(240),
 passos:z.string().max(3400),
 esperado:z.string().max(1800),
 observacoes:z.string().max(1500),
 evidence:z.string().max(550)
}).strict();
const scenariosSchema=z.object({cenarios:z.array(scenarioSchema).min(1).max(4)}).strict();
type SourceEvidence={
 quote:string;source_line:number|null;status:"verified"|"needs_review";reason:string|null
};
function decodeModel(response:unknown):{data:unknown;repaired:boolean}|null{
 if(!response||typeof response!=="object")return null;
 const payload=response as {choices?:{finish_reason?:unknown;message?:{
  content?:unknown;tool_calls?:unknown;function_call?:unknown
 }}[]};
 const choice=payload.choices?.[0];
 if(choice?.finish_reason==="length"||!choice?.message||
  choice.message.tool_calls||choice.message.function_call)return null;
 const raw=choice.message.content;
 if(typeof raw!=="string"||!raw.trim()||raw.length>60000)return null;
 let source=raw.trim();
 const fence=String.fromCharCode(96).repeat(3);
 if(source.startsWith(fence)){
  if(!source.endsWith(fence))return null;
  source=source.slice(3,-3).replace(/^json\s*/i,"").trim();
 }
 try{return {data:JSON.parse(source),repaired:false};}
 catch{
  try{return {data:JSON.parse(jsonrepair(source)),repaired:true};}
  catch{return null;}
 }
}
function evidence(source:string,value:string,quote:string,repaired:boolean):SourceEvidence{
 const checked=verifyGrounding(source,value,quote);
 if(repaired&&checked.status==="verified")return {
  quote:checked.quote,source_line:checked.source_line,
  status:"needs_review",reason:"json_repaired"
 };
 return checked as SourceEvidence;
}
export type ReviewCandidate={field:string;value:string;evidence:SourceEvidence};
export function groundedTaskFields(response:unknown,source:string){
 const decoded=decodeModel(response);
 if(!decoded)return null;
 const parsed=fieldsSchema.safeParse(decoded.data);
 if(!parsed.success)return null;
 const draft:Record<string,string>={},field_evidence:Record<string,SourceEvidence>={};
 const review_fields:ReviewCandidate[]=[];
 let anchored=0;
 for(const [name,{value, evidence:quote}] of Object.entries(parsed.data.fields)){
  if(!value.trim())continue;
  const record=evidence(source,value,quote,decoded.repaired);
  if(record.source_line!==null)anchored++;
  if(record.status==="verified"){
   draft[name]=value.trim();field_evidence[name]=record;
  }else review_fields.push({field:name,value:value.trim(),evidence:record});
 }
 if(!anchored)return null;
 // Older F4 clients read only draft and cannot apply review-only values.
 return {draft,field_evidence,review_fields,repaired:decoded.repaired};
}
export function groundedTaskScenarios(response:unknown,source:string,
 seeds:{source_index:number;titulo:string;passos:string;esperado:string;observacoes:string}[]){
 const decoded=decodeModel(response);
 if(!decoded)return null;
 const parsed=scenariosSchema.safeParse(decoded.data);
 if(!parsed.success)return null;
 const seedMap=new Map(seeds.map(s=>[s.source_index,s]));
 const used=new Set<number>(),rows=[];
 let anchored=0;
 for(const item of parsed.data.cenarios){
  const seed=seedMap.get(item.source_index);
  if(!seed||used.has(item.source_index))return null;
  used.add(item.source_index);
  const combined=[item.titulo,item.passos,item.esperado,item.observacoes].join(" ");
  let record=evidence(source,combined,item.evidence,decoded.repaired);
  // A quote from a different scenario is not sufficient evidence for this ID.
  const normalized=(s:string)=>s.normalize("NFD").replace(/\p{M}/gu,"")
   .toLocaleLowerCase("pt-BR").replace(/\s+/g," ").trim();
  const seedText=normalized([seed.titulo,seed.passos,seed.esperado].join(" "));
  const quoteText=normalized(record.quote);
  const words=quoteText.split(/\W+/).filter(w=>w.length>=5);
  if(record.source_line!==null&&words.length&&
   !words.some(w=>seedText.includes(w)))record={
    ...record,status:"needs_review",reason:"citation_unrelated_to_seed"
   };
  if(record.source_line!==null)anchored++;
  rows.push({source_index:item.source_index,titulo:item.titulo.trim(),
   passos:item.passos.trim(),esperado:item.esperado.trim(),
   observacoes:item.observacoes.trim(),evidence:record});
 }
 if(used.size!==seeds.length||!anchored)return null;
 // Older F4 clients reject incomplete draft rows and keep their local version.
 return {draft:{cenarios:rows.filter(row=>row.evidence.status==="verified")},
  review_scenarios:rows.filter(row=>row.evidence.status==="needs_review"),
  repaired:decoded.repaired};
}
