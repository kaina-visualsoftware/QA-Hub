import {z} from "zod";
import {supabase,supabaseUrl,publishableKey} from "../../lib/supabase";
import {parseGeneratedCases} from "../../lib/legacy/qa-workspace.mjs";
import type {GeneratedCase} from "../../lib/legacy/qa-workspace.mjs";
import type {PostOutputFormat} from "./post-format";

export type PostSelection={start:number;end:number;oldText:string};
export type ReviewOperation="post_excerpt"|"test_case";
export type RevisionRequest={operation:ReviewOperation;task:string;requirements:string;
 current:string;format:PostOutputFormat;instructions:string};
const responseSchema=z.object({
 operation:z.enum(["post_excerpt","test_case"]),
 proposal:z.string().min(1).max(14000),
 provider:z.literal("NVIDIA Build"),model:z.string()
});
export function selectionFromText(text:string,start:number,end:number):PostSelection|null{
 if(!Number.isInteger(start)||!Number.isInteger(end)||start<0||end>text.length||
   end-start<12||end-start>9000)return null;
 return {start,end,oldText:text.slice(start,end)};
}
export function insertReviewedExcerpt(full:string,selection:PostSelection,newText:string){
 if(!newText.trim()||newText.length>13000)
  throw Error("A revisão não trouxe um trecho válido.");
 if(full.slice(selection.start,selection.end)!==selection.oldText)
  throw Error("O post mudou desde a seleção. Selecione novamente o trecho.");
 const updated=full.slice(0,selection.start)+newText+
  full.slice(selection.end);
 if(updated.length>80000)throw Error("O post revisado excederia o limite de caracteres.");
 return updated;
}
export function caseAsMarkdown(item:GeneratedCase){
 return [
  "## Cenário — "+item.titulo,
  "### Cenário",item.titulo,
  "### Passos",item.passos,
  "### Resultado esperado",item.esperado,
  ...(item.observacoes?["### Observações",item.observacoes]:[])
 ].join("\n\n");
}
export function applyCaseRevision(original:GeneratedCase,proposal:string):GeneratedCase{
 const candidates=parseGeneratedCases(proposal);
 if(candidates.length!==1)throw Error("A IA não retornou exatamente um caso. Revise ou descarte a proposta.");
 const value=candidates[0];
 if(value.titulo.trim().length<3||value.titulo.length>240||
  !value.passos.trim()||value.passos.length>20000||
  !value.esperado.trim()||value.esperado.length>20000)
  throw Error("O caso revisado não possui título, passos e resultado esperado válidos.");
 return {...original,titulo:value.titulo,passos:value.passos,
  esperado:value.esperado,observacoes:value.observacoes||original.observacoes};
}
export async function requestTargetedRevision(input:RevisionRequest,signal:AbortSignal){
 if(input.task.length>30000||input.requirements.length>20000||
  input.current.length>9000||input.current.trim().length<12||
  input.instructions.length>1200)
  throw Error("Revisão extensa demais para uma única seção.");
 const {data,error}=await supabase.auth.getSession();
 if(error)throw error;
 if(!data.session?.access_token)throw Error("Entre novamente para revisar com IA.");
 const response=await fetch(supabaseUrl.replace(/\/$/,"")+"/functions/v1/qa-revisions",{
  method:"POST",signal,
  headers:{Authorization:"Bearer "+data.session.access_token,
   apikey:publishableKey,"Content-Type":"application/json"},
  body:JSON.stringify(input)
 });
 if(!response.ok){
  let message="A NVIDIA não conseguiu revisar este trecho.";
  try{
   const obj:unknown=await response.json();
   if(obj&&typeof obj==="object"&&"message" in obj&&
    typeof obj.message==="string")message=obj.message;
  }catch{/* preserve original error */}
  throw Error(message);
 }
 const parsed=responseSchema.parse(await response.json());
 if(parsed.operation!==input.operation)
  throw Error("A IA respondeu com uma revisão de tipo diferente.");
 if(input.operation==="test_case")applyCaseRevision({
  titulo:"Prévia",passos:"Passos",esperado:"Esperado",observacoes:"",
  selected:true,source_index:"preview"
 },parsed.proposal);
 return parsed.proposal;
}
