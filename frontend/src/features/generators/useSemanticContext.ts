import {useEffect,useMemo,useRef,useState} from "react";
import {AiRequestError} from "../../lib/ai-retry";
import type {AiWaitState} from "../../lib/ai-retry";
import {analyzeSemanticChunk} from "./semantic-service";
import type {SemanticRequestStage} from "./semantic-service";
import {runSemanticQueue} from "./semantic-queue";
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
 const [activeStages,setActiveStages]=useState<Record<string,SemanticRequestStage>>({});
 const [attempt,setAttempt]=useState(0);
 const [elapsed,setElapsed]=useState(0);
 const [startedAt,setStartedAt]=useState<number|null>(null);
 const [message,setMessage]=useState("");
 const [error,setError]=useState("");
 const [quotaWaits,setQuotaWaits]=useState<Record<string,AiWaitState>>({});
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
 const activeChunks=Object.keys(activeStages);
 const activeChunk=activeChunks[0]??null;
 const activeStage=activeChunk?activeStages[activeChunk]:null;
 const quotaWait=Object.values(quotaWaits).sort((a,b)=>a.until-b.until)[0]??null;
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
  setActiveStages({});setAttempt(0);setElapsed(0);setStartedAt(null);
  setQuotaWaits({});
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
  setElapsed(0);setStartedAt(Date.now());
  setActiveStages({});setQuotaWaits({});setAttempt(0);setApproved(false);
  const abort=new AbortController();controller.current=abort;
  const signature=sourceKey;
  let next={...outcomes},done=0;
  const isActive=()=>!abort.signal.aborted&&signature===latest.current;
  try{
   const queue=await runSemanticQueue({items:pending,signal:abort.signal,
    process:async chunk=>{
     if(!isActive())throw Error("Análise cancelada ou fonte alterada.");
     // At most two jobs are active; the Supabase 15/minute RPC still guards
     // every model attempt (including fallback models and 429 retries).
     setAttempt(value=>value+1);
     setActiveStages(current=>({...current,[chunk.id]:"preparing"}));
     try{
      const result=await analyzeSemanticChunk(chunk,goal,abort.signal,stage=>{
       if(!isActive())return;
       setActiveStages(current=>({...current,[chunk.id]:stage}));
      },wait=>{
       if(!isActive())return;
       setQuotaWaits(current=>{
        const updated={...current};
        if(wait)updated[chunk.id]=wait;
        else delete updated[chunk.id];
        return updated;
       });
      },{preferCompact:Boolean(failedChunks.current[chunk.id])});
      if(!isActive())throw Error("A fonte mudou ou a análise foi cancelada.");
      // Both workers checkpoint only facts returned by NVIDIA and verified
      // against their OWN source chunk. Out-of-order completions cannot
      // overwrite or omit the other worker's results.
      next={...next,[chunk.id]:result};
      setOutcomes(current=>({...current,[chunk.id]:result}));
      delete failedChunks.current[chunk.id];
      done++;
      setMessage("Bloco "+chunk.id+" concluído: "+result.facts.length+
       " citação(ões) verificada(s). "+Object.keys(next).length+" de "+plan.chunks.length+".");
     }catch(reason){
      if(isActive()&&reason instanceof AiRequestError&&
         (reason.status===504||reason.code==="provider_timeout"||
          (reason.status===503&&reason.retryable)))
       failedChunks.current[chunk.id]=(failedChunks.current[chunk.id]??0)+1;
      throw reason;
     }finally{
      if(signature===latest.current){
       setActiveStages(current=>{
        const updated={...current};delete updated[chunk.id];return updated;
       });
       setQuotaWaits(current=>{
        const updated={...current};delete updated[chunk.id];return updated;
       });
      }
     }
    }});
   if(signature!==latest.current)return;
   if(queue.cancelled){
    setError("Análise interrompida. Os blocos concluídos pela NVIDIA foram mantidos.");
    setMessage(done+" parte(s) concluída(s) neste lote; as demais continuam pendentes.");
   }else if(queue.failures.length){
    const failed=queue.failures.map(item=>item.item.id);
    const first=queue.failures[0].reason;
    const allProvider=queue.failures.every(item=>item.reason instanceof AiRequestError&&
     (item.reason.status===504||item.reason.code==="provider_timeout"||
      (item.reason.status===503&&item.reason.retryable)));
    setError(allProvider?
     "A NVIDIA não concluiu "+failed.join(", ")+" após a recuperação disponível. "+
     "Nenhum trecho foi extraído sem IA. Os demais blocos concluídos foram mantidos. "+
     "Retome somente as partes pendentes.":
     first instanceof Error?first.message:"Falha na análise pela NVIDIA.");
    setMessage(done+" parte(s) concluída(s) neste lote; "+
     queue.failures.length+" bloco(s) falharam. Não foram iniciados novos blocos após a falha.");
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
   // Do not overwrite a newer run if the source changed during this one.
   if(controller.current===abort){
    workingRef.current=false;controller.current=null;setWorking(false);
    setActiveStages({});setStartedAt(null);setQuotaWaits({});
   }
  }
 }
 return {enabled,setEnabled,working,message,error,approved,setApproved,ready,plan,
  planError:planState.error,outcomes,count,complete,digest,run,cancel,
  conflicts,conflictsReviewed,conflictDecisions,setConflictDecision,
  activeChunk,activeStage,activeChunks,activeStages,attempt,elapsed,quotaWait};
}
