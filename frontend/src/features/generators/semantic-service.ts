import {z} from "zod";
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
export async function analyzeSemanticChunk(chunk:SemanticChunk,goal:SemanticGoal,
 signal:AbortSignal,onStage:(stage:SemanticRequestStage)=>void=()=>{}):Promise<ChunkOutcome>{
 onStage("preparing");
 const {data,error}=await supabase.auth.getSession();
 if(error)throw error;
 if(!data.session?.access_token)throw Error("Faça login novamente para analisar o contexto.");
 onStage("sending");
 onStage("waiting");
 const response=await fetch(supabaseUrl.replace(/\/$/,"")+"/functions/v1/qa-context",{
  method:"POST",signal,
  headers:{Authorization:"Bearer "+data.session.access_token,apikey:publishableKey,
   "Content-Type":"application/json"},
  body:JSON.stringify({chunkId:chunk.id,source:chunk.source,goal,text:chunk.text})
 });
 if(!response.ok){
  let message="Não foi possível preparar esta parte do contexto (HTTP "+response.status+").";
  try{
   const value:unknown=await response.json();
   if(value&&typeof value==="object"&&"message" in value&&
    typeof value.message==="string")message=value.message;
  }catch{/* keep generic message */}
  if(response.status===429)message+=" A cota compartilhada foi atingida; tente continuar depois. O progresso foi preservado.";
  if(response.status===503)message+=" A NVIDIA está indisponível ou demorou demais. Você pode tentar novamente ou usar o modo rápido sem novas chamadas de IA.";
  throw Error(message);
 }
 onStage("verifying");
 const result=responseSchema.parse(await response.json());
 if(result.chunkId!==chunk.id||result.source!==chunk.source||result.goal!==goal)
  throw Error("A resposta semântica não corresponde ao trecho solicitado.");
 const verified=validateSemanticFacts(chunk,result.facts);
 return {id:chunk.id,facts:verified.facts,unverified:result.unverified+verified.unverified,
  model:result.model};
}
