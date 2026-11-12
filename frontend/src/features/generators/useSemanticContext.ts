import {useEffect,useMemo,useRef,useState} from "react";
import {AiRequestError} from "../../lib/ai-retry";
import type {AiWaitState} from "../../lib/ai-retry";
import {analyzeSemanticChunk} from "./semantic-service";
import {extractLocalSemanticChunk} from "./semantic-local";
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
 const [activeStage,setActiveStage]=useState<"preparing"|"sending"|"waiting"|"verifying"|"local"|null>(null);
 const [attempt,setAttempt]=useState(0);
 const [elapsed,setElapsed]=useState(0);
 const [startedAt,setStartedAt]=useState<number|null>(null);
 const [message,setMessage]=useState("");
 const [error,setError]=useState("");
 const [quotaWait,setQuotaWait]=useState<AiWaitState|null>(null);
 const [approved,setApproved]=useState(false);
 const [conflictDecisions,setConflictDecisions]=useState<Record<string,ConflictDecision>>({});
 const controller=useRef<AbortController|null>(null);
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
  let providerUnavailable=false;
  try{
   // One upstream failure switches remaining chunks to literal local
   // extraction. This prevents 504 storms and keeps previous model results.
   // Each local quote is exact-source data, NEVER presented as AI analysis.
   for(const chunk of pending){
    if(abort.signal.aborted||signature!==latest.current)throw Error("Análise cancelada.");
    setActiveChunk(chunk.id);setAttempt(value=>value+1);
    setActiveStage("preparing");
    let result:ChunkOutcome;
    if(providerUnavailable){
     setActiveStage("local");
     result=extractLocalSemanticChunk(chunk,goal);
    }else{
     try{
      result=await analyzeSemanticChunk(chunk,goal,abort.signal,stage=>{
       if(signature===latest.current&&!abort.signal.aborted)setActiveStage(stage);
      },wait=>{
       if(signature!==latest.current||abort.signal.aborted)return;
       setQuotaWait(wait);
      });
     }catch(reason){
      if(abort.signal.aborted||signature!==latest.current)throw reason;
      // Authentication, permissions and invalid input still stop the flow.
      // Only a provider outage/time-out/quota error activates local recovery.
      const providerFailure=reason instanceof AiRequestError&&(
       reason.status===504||["provider_timeout","provider_unavailable",
        "provider_rate_limited","quota_exhausted"].includes(reason.code));
      if(!providerFailure)throw reason;
      providerUnavailable=true;
      setActiveStage("local");
      result=extractLocalSemanticChunk(chunk,goal);
     }
    }
    if(abort.signal.aborted||signature!==latest.current)throw Error("A fonte mudou durante a análise.");
    next={...next,[chunk.id]:result};
    setOutcomes(next);done++;
    setMessage("Parte "+chunk.id+" preparada ("+
     (result.method==="local"?"seleção literal local, sem IA":
      result.facts.length+" citação(ões) verificadas pela IA")+
     "). "+Object.keys(next).length+" de "+plan.chunks.length+".");
    setQuotaWait(null);
   }
   if(Object.keys(next).length===plan.chunks.length){
    const totalLocal=Object.values(next).filter(x=>x.method==="local").length;
    setMessage(totalLocal>0?
     "Todas as "+plan.chunks.length+" partes foram percorridas. "+totalLocal+
     " parte(s) usaram seleção literal local devido à indisponibilidade da NVIDIA. "+
     "A seleção local não é interpretação da IA; confira as regras, as revisões e a matriz de cobertura antes de gerar.":
     "Todos os blocos foram analisados pela NVIDIA. Revise a cobertura e autorize a geração.");
   }else
    setMessage("Preparação interrompida após "+done+" parte(s); o trabalho pode ser retomado.");
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
