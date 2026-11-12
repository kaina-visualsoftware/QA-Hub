import {z} from "zod";
import {readAiHttpError,withAiRateLimitRetry} from "../../lib/ai-retry";
import type {AiWaitCallback} from "../../lib/ai-retry";
import {supabase,publishableKey,supabaseUrl} from "../../lib/supabase";
import {validateSemanticFacts} from "./semantic-context";
import type {SemanticChunk,SemanticGoal,ChunkOutcome} from "./semantic-context";

const responseSchema=z.object({
 chunkId:z.string(),source:z.enum(["TF","REQ"]),goal:z.enum(["task","post","teste"]),
 provider:z.literal("NVIDIA Build"),model:z.string(),
 unverified:z.number().int().min(0).max(100),
 facts:z.array(z.object({
  category:z.enum(["regra","aceite","antes","depois","excecao","permissao","dado","resultado","contexto"]),
  quote:z.string().min(10).max(450),summary:z.string().max(350)
 })).max(80)
});

export type SemanticRequestStage="preparing"|"sending"|"waiting"|"verifying";
async function analyzeSingleSemanticChunk(chunk:SemanticChunk,goal:SemanticGoal,
 signal:AbortSignal,onStage:(stage:SemanticRequestStage)=>void=()=>{},
 onWait:AiWaitCallback=()=>{}):Promise<ChunkOutcome>{
 onStage("preparing");
 const {data,error}=await supabase.auth.getSession();
 if(error)throw error;
 if(!data.session?.access_token)throw Error("Faça login novamente para analisar o contexto.");
 onStage("sending");
 onStage("waiting");
 const response=await withAiRateLimitRetry(async()=>{
  onStage("sending");onStage("waiting");
  const reply=await fetch(supabaseUrl.replace(/\/$/,"")+"/functions/v1/qa-context",{
   method:"POST",signal,
   headers:{Authorization:"Bearer "+data.session.access_token,apikey:publishableKey,
    "Content-Type":"application/json"},
   body:JSON.stringify({chunkId:chunk.id,source:chunk.source,goal,text:chunk.text})
  });
  if(!reply.ok)throw await readAiHttpError(reply);
  return reply;
 },{signal,onWait});
 onStage("verifying");
 const result=responseSchema.parse(await response.json());
 if(result.chunkId!==chunk.id||result.source!==chunk.source||result.goal!==goal)
  throw Error("A resposta semântica não corresponde ao trecho solicitado.");
 const verified=validateSemanticFacts(chunk,result.facts);
 return {id:chunk.id,facts:verified.facts,unverified:result.unverified+verified.unverified,
  model:result.model};
}


/** Timeout fallback splits the *original* source without trimming a character.
 * Both requests retain the original public chunk ID, and the merged quotes
 * are rechecked against that same full chunk for their correct source lines.
 * A failed child never masquerades as a completed parent checkpoint.
 */
export function splitSemanticChunk(chunk:SemanticChunk):[SemanticChunk,SemanticChunk]{
 const middle=Math.floor(chunk.text.length/2);
 const before=chunk.text.lastIndexOf("\n",middle);
 const after=chunk.text.indexOf("\n",middle);
 const near=(pos:number)=>pos>=chunk.text.length*.3&&pos<=chunk.text.length*.7;
 let cut=near(before)?before+1:near(after)?after+1:middle;
 if(cut>0&&cut<chunk.text.length&&
    /[\uD800-\uDBFF]/.test(chunk.text.charAt(cut-1))&&
    /[\uDC00-\uDFFF]/.test(chunk.text.charAt(cut)))cut--;
 const firstText=chunk.text.slice(0,cut),secondText=chunk.text.slice(cut);
 const secondLine=chunk.startLine+(firstText.match(/\n/g)?.length??0);
 return [
  {...chunk,text:firstText,end:chunk.start+cut,
   endLine:secondLine},
  {...chunk,text:secondText,start:chunk.start+cut,
   startLine:secondLine}
 ];
}
/** Avoid retry storms: one timed-out NVIDIA request per chunk.
 * The React workflow switches to literal offline extraction for the failed
 * chunk and every remaining chunk. No repeated HTTP 504s for subdivisions.
 */
export async function analyzeSemanticChunk(chunk:SemanticChunk,goal:SemanticGoal,
 signal:AbortSignal,onStage:(stage:SemanticRequestStage)=>void=()=>{},
 onWait:AiWaitCallback=()=>{}):Promise<ChunkOutcome>{
 return analyzeSingleSemanticChunk(chunk,goal,signal,onStage,onWait);
}
