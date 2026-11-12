import {z} from "zod";
import {AiRequestError,abortableWait,readAiHttpError,withAiRateLimitRetry} from "../../lib/ai-retry";
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

export type SemanticRequestStage="preparing"|"sending"|"waiting"|"verifying"|"cooldown";
async function analyzeSingleSemanticChunk(chunk:SemanticChunk,goal:SemanticGoal,
 signal:AbortSignal,onStage:(stage:SemanticRequestStage)=>void=()=>{},
 onWait:AiWaitCallback=()=>{},profile:"standard"|"compact"="standard"):Promise<ChunkOutcome>{
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
   body:JSON.stringify({chunkId:chunk.id,source:chunk.source,goal,text:chunk.text,
    ...(profile==="compact"?{profile:"compact"}:{})})
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


/** Never extract a quote without NVIDIA. After one timeout, retry the exact
 * same source chunk once using a smaller output profile, after a visible and
 * cancellable cooldown. Further failures stay pending for user-triggered
 * resumption. Prior successful chunks are untouched.
 */
export async function analyzeSemanticChunk(chunk:SemanticChunk,goal:SemanticGoal,
 signal:AbortSignal,onStage:(stage:SemanticRequestStage)=>void=()=>{},
 onWait:AiWaitCallback=()=>{},options:{
  preferCompact?:boolean; wait?:(ms:number,signal?:AbortSignal)=>Promise<void>;
 }={}):Promise<ChunkOutcome>{
 const compactFirst=options.preferCompact===true;
 try{
  return await analyzeSingleSemanticChunk(chunk,goal,signal,onStage,onWait,
   compactFirst?"compact":"standard");
 }catch(reason){
  if(signal.aborted||compactFirst||!(reason instanceof AiRequestError)||
   reason.status!==504||reason.code!=="provider_timeout")throw reason;
  // The backend's Retry-After is a recovery hint, not proof the NVIDIA
  // provider is currently available. Only one bounded retry is allowed.
  const delay=Math.max(10000,Math.min(30000,
   (reason.retryAfterSeconds??15)*1000));
  onStage("cooldown");
  onWait({until:Date.now()+delay,attempt:1,estimated:reason.retryAfterSeconds===null,
   source:"provider",reason:"timeout"});
  try{
   await (options.wait??abortableWait)(delay,signal);
  }finally{onWait(null);}
  if(signal.aborted)throw new DOMException("Operação cancelada.","AbortError");
  return analyzeSingleSemanticChunk(chunk,goal,signal,onStage,onWait,"compact");
 }
}
