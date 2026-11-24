import type {LocalDraft} from "../../lib/legacy/qa-assistant.mjs";
import type {FieldReview} from "./task-evidence";

/** Structural splitting only: no local interpretation and no omitted excerpts.
 * The Edge Function accepts 30k chars, but a much smaller UTF-8 envelope
 * limits model latency and accommodates non-ASCII documents.
 */
export const TASK_FIELD_CHUNK_CHAR_LIMIT=6500;
export const TASK_FIELD_CHUNK_BYTE_LIMIT=9000;
export const TASK_FIELD_CHUNK_CONCURRENCY=2;
export type TaskFieldChunk={
 index:number;start:number;end:number;startLine:number;text:string;
};
export type TaskFieldChunkResult={
 fields:LocalDraft["fields"];review:FieldReview[];
};
const encoder=new TextEncoder();
const byteLength=(s:string)=>encoder.encode(s).length;

export function splitTaskFieldSource(text:string):TaskFieldChunk[]{
 if(!text.trim())return [];
 const result:TaskFieldChunk[]=[];
 let start=0,startLine=1;
 while(start<text.length){
  let end=Math.min(text.length,start+TASK_FIELD_CHUNK_CHAR_LIMIT);
  if(byteLength(text.slice(start,end))>TASK_FIELD_CHUNK_BYTE_LIMIT){
   let lo=start+1,hi=end;
   while(lo<hi){
    const mid=Math.ceil((lo+hi)/2);
    if(byteLength(text.slice(start,mid))<=TASK_FIELD_CHUNK_BYTE_LIMIT)lo=mid;
    else hi=mid-1;
   }
   end=lo;
  }
  // A UTF-16 surrogate pair must not be broken between model requests.
  if(end<text.length&&end>start&&/^[\uDC00-\uDFFF]$/.test(text[end])&&
   /^[\uD800-\uDBFF]$/.test(text[end-1]))end--;
  if(end<text.length){
   const sample=text.slice(start,end);
   const line=sample.lastIndexOf("\n");
   const space=sample.lastIndexOf(" ");
   const best=line>sample.length*.55?line+1:
    space>sample.length*.65?space+1:-1;
   if(best>0)end=start+best;
  }
  if(end<=start)throw Error("Não foi possível dividir a TF sem perder caracteres.");
  const part=text.slice(start,end);
  result.push({index:result.length,start,end,startLine,text:part});
  startLine+=(part.match(/\n/g)?.length??0);
  start=end;
 }
 if(result.map(x=>x.text).join("")!==text)
  throw Error("A divisão em blocos não preservou a fonte integral.");
 return result;
}

const longFields=new Set(["explicacao","causa","correcao","conclusao","observacoes"]);
const norm=(value:string)=>value.normalize("NFD").replace(/\p{M}/gu,"")
 .toLocaleLowerCase("pt-BR").replace(/\s+/g," ").trim();
/** Deterministic consolidation of fields *already verified by NVIDIA*.
 * Do not manufacture fields, interpret unprocessed text, or silently
 * replace conflicting metadata with a guess.
 */
export function combineVerifiedTaskFields(results:Record<number,TaskFieldChunkResult>){
 const fields:Record<string,string>={},reviews:FieldReview[]=[],conflicts=new Set<string>();
 const seenReviews=new Set<string>();
 for(const index of Object.keys(results).map(Number).sort((a,b)=>a-b)){
  const part=results[index];
  for(const [field,value] of Object.entries(part.fields)){
   if(typeof value!=="string"||!value.trim())continue;
   const current=fields[field];
   if(!current){fields[field]=value.trim();continue;}
   if(norm(current)===norm(value))continue;
   if(longFields.has(field)){
    const existing=norm(current),next=norm(value);
    if(existing.includes(next))continue;
    if(next.includes(existing)){fields[field]=value.trim();continue;}
    // Retain independently verified complementary statements in source order.
    if((current.length+value.length+2)<=15000)
     fields[field]=current+"\n\n"+value.trim();
    else conflicts.add(field);
   }else{
    // Metadata and short summaries are ambiguous if chunks disagree.
    conflicts.add(field);
   }
  }
  for(const review of part.review){
   const id=[review.field,norm(review.value),norm(review.quote),review.status].join("|");
   if(seenReviews.has(id))continue;
   seenReviews.add(id);
   reviews.push(review);
  }
 }
 return {fields:fields as LocalDraft["fields"],fieldReview:reviews,
  conflictFields:[...conflicts]};
}
