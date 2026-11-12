import {useEffect,useMemo,useRef,useState} from "react";
import {AiRequestError} from "../../lib/ai-retry";
import type {AiWaitState} from "../../lib/ai-retry";
import {analyzeSemanticChunk} from "./semantic-service";
import {buildSemanticPlan,compileSemanticContext} from "./semantic-context";
import type {ChunkOutcome,SemanticGoal} from "./semantic-context";
import {detectSemanticConflicts,excludedFacts,conflictNotes} from "./semantic-conflicts";
import type {ConflictDecision} from "./semantic-conflicts";

/** Long sources automatically use the verified chunk pipeline. A one-shot
 * extraction cannot read every line after the model input limit is reached.
 * Authorization and explicit QA review are still required for each source.
 */
export function useSemanticContext(task:string,requirements:string,goal:SemanticGoal,autoEnable=false){
 const [enabled,setEnabledState]=useState(false);
 const [outcomes,setOutcomes]=useState<Record<string,ChunkOutcome>>({});
 const [working,setWorking]=useState(false);
 const [activeChunk,setActiveChunk]=useState<string|null>(null);
 const [activeStage,setActiveStage]=useState<"preparing"|"sending"|"waiting"|"verifying"|null>(null);
 const [attempt,setAttempt]=useState(0);
 const [elapsed,setElapsed]=useState(0);
 const [startedAt,setStartedAt]=useState<number|null>(null);
 const [message,setMessage]=useState("");
 const [error,setError]=useState("");
 const [quotaWait,setQuotaWait]=useState<AiWaitState|null>(null);
 const [approved,setApproved]=useState(false);
 const [conflictDecisions,setConflictDecisions]=useState<Record<string,ConflictDecision>>({});
 const controller=useRef<AbortController|null>(null);
 const failedChunks=useRef<Record<string,number>>({});
 const workingRef=useRef(false);
 const sourceKey=goal+"|"+task+"|"+requirements;
 const latest=useRef(sourceKey);
 latest.current=sourceKey;
 const planState=useMemo(()=>{
  try{return {plan:buildSemanticPlan(task,requirements),error:""};}
  catch(reason){return {plan:null,error:reason instanceof Error?reason.message:String(reason)};}
 },[task,requirements]);
 const plan=planState.plan;
 useEffect(()=>{
  if(!working||startedAt===null)return;
  const tick=()=>setElapsed(Math.floor((Date.now()-startedAt)/1000));
  tick();
  const timer=window.setInterval(tick,1000);
  return ()=>window.clearInterval(timer);
 },[working,startedAt]);
 const complete=Boolean(plan&&plan.chunks.every(c=>outcomes[c.id]));
 const count=plan?.chunks.filter(c=>outcomes[c.id]).length??0;
 const conflicts=useMemo(()=>detectSemanticConflicts(
  new Map(Object.entries(outcomes))),[outcomes]);
 const conflictsReviewed=conflicts.every(item=>Boolean(conflictDecisions[item.id])&&
  conflictDecisions[item.id]!=="pending");
 const digest=useMemo(()=>plan?compileSemanticContext(
  plan,new Map(Object.entries(outcomes)),goal,{
   excluded:excludedFacts(conflicts,conflictDecisions),
   reviewNote:conflictsReviewed?conflictNotes(conflicts,conflictDecisions):""
  }):null,
  [plan,outcomes,goal,conflicts,conflictDecisions,conflictsReviewed]);
 const ready=Boolean(enabled&&complete&&conflictsReviewed&&digest&&
  digest.coverage.selectedFacts>0&&approved);
 useEffect(()=>{
  controller.current?.abort();
  controller.current=null;workingRef.current=false;
  failedChunks.current={};
  setOutcomes({});setEnabledState(autoEnable&&Boolean(plan));setWorking(false);
  setApproved(false);setConflictDecisions({});setMessage("");setError("");
  setActiveChunk(null);setActiveStage(null);setAttempt(0);setElapsed(0);setStartedAt(null);
  setQuotaWait(null);
 },[sourceKey,autoEnable,plan]);
 useEffect(()=>()=>controller.current?.abort(),[]);
 function setEnabled(value:boolean){
  if(workingRef.current)return;
  setEnabledState(value);setApproved(false);setMessage("");setError("");
 }
 function setConflictDecision(id:string,decision:ConflictDecision){
  if(workingRef.current||!conflicts.some(item=>item.id===id))return;
  setConflictDecisions(current=>({...current,[id]:decision}));
  setApproved(false);
 }
 function cancel(){controller.current?.abort();}
 async function run(id?:string,authorized=false){
  if(!authorized){setError("Autorize o envio dos textos à NVIDIA antes de analisar.");return;}
  if(!enabled||!plan||workingRef.current)return;
  const pending=plan.chunks.filter(c=>id?c.id===id:!outcomes[c.id]);
  if(!pending.length)return;
  workingRef.current=true;setWorking(true);
  setError("");setMessage("");
  setElapsed(0);setStartedAt(Date.now());setActiveStage("preparing");
  setAttempt(0);setQuotaWait(null);
  setApproved(false);
  const abort=new AbortController();controller.current=abort;
  const signature=sourceKey;
  let next={...outcomes},done=0;
  const failed:string[]=[];
  try{
   // Each successful parent is checkpointed; unsuccessful parts stay pending.
   // A transient failure cannot silently mark the source as fully analyzed.
   for(const chunk of pending){
    if(abort.signal.aborted||signature!==latest.current)throw Error("Análise cancelada.");
    setActiveChunk(chunk.id);setAttempt(value=>value+1);
    setActiveStage("preparing");
    try{
     const result=await analyzeSemanticChunk(chunk,goal,abort.signal,stage=>{
       if(signature===latest.current&&!abort.signal.aborted)setActiveStage(stage);
     },wait=>{
       if(signature!==latest.current||abort.signal.aborted)return;
       setQuotaWait(wait);
     },{preferCompact:Boolean(failedChunks.current[chunk.id])});
     if(abort.signal.aborted||signature!==latest.current)throw Error("A fonte mudou durante a análise.");
     next={...next,[chunk.id]:result};
     delete failedChunks.current[chunk.id];
     setOutcomes(next);done++;
     setMessage("Bloco "+chunk.id+" concluído: "+result.facts.length+
       " citação(ões) verificada(s). "+Object.keys(next).length+" de "+plan.chunks.length+".");
    }catch(reason){
     if(abort.signal.aborted||signature!==latest.current)throw reason;
     // No local extraction. Stop immediately on provider outage to avoid
     // repeated 504 storms, keep earlier NVIDIA results, and leave this chunk
     // and all later chunks pending for a deliberate user-triggered resume.
     const providerFailure=reason instanceof AiRequestError&&
       (reason.status===504||reason.code==="provider_timeout"||
        (reason.status===503&&reason.retryable));
     if(!providerFailure)throw reason;
     failedChunks.current[chunk.id]=(failedChunks.current[chunk.id]??0)+1;
     failed.push(chunk.id);
     break;
    }finally{setQuotaWait(null);}
   }
   if(failed.length){
    setError("A NVIDIA não concluiu "+failed.join(", ")+
     " mesmo após a recuperação disponível. Nenhum trecho foi extraído sem IA. "+
     "Os blocos concluídos foram mantidos. Use Retomar análise do texto "+
     "para tentar somente as partes pendentes.");
    setMessage(done+" parte(s) concluída(s) nesta tentativa. "+failed.length+
     " bloco(s) falharam; as demais partes continuam pendentes de análise pela NVIDIA.");
   }else if(Object.keys(next).length===plan.chunks.length)
    setMessage("Todos os blocos foram analisados. Revise a cobertura e autorize a geração.");
   else
    setMessage("Processamento interrompido após "+done+" parte(s); a análise poderá ser retomada.");
  }catch(reason){
   if(signature===latest.current){
    setError(abort.signal.aborted?"Análise interrompida. Os blocos concluídos foram mantidos.":
     reason instanceof Error?reason.message:"Falha na compactação semântica.");
   }
  }finally{
   workingRef.current=false;controller.current=null;setWorking(false);
   setActiveChunk(null);setActiveStage(null);setStartedAt(null);setQuotaWait(null);
  }
 }
 return {enabled,setEnabled,working,message,error,approved,setApproved,ready,plan,
  planError:planState.error,outcomes,count,complete,digest,run,cancel,
  conflicts,conflictsReviewed,conflictDecisions,setConflictDecision,
  activeChunk,activeStage,attempt,elapsed,quotaWait};
}
