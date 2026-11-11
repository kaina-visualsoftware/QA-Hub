import {useEffect,useMemo,useRef,useState} from "react";
import {analyzeSemanticChunk} from "./semantic-service";
import {buildSemanticPlan,compileSemanticContext,SEMANTIC_REQUEST_BATCH} from "./semantic-context";
import type {ChunkOutcome,SemanticGoal} from "./semantic-context";
import {detectSemanticConflicts,excludedFacts,conflictNotes} from "./semantic-conflicts";
import type {ConflictDecision} from "./semantic-conflicts";

export function useSemanticContext(task:string,requirements:string,goal:SemanticGoal){
 const [enabled,setEnabledState]=useState(false);
 const [outcomes,setOutcomes]=useState<Record<string,ChunkOutcome>>({});
 const [working,setWorking]=useState(false);
 const [message,setMessage]=useState("");
 const [error,setError]=useState("");
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
  setOutcomes({});setEnabledState(false);setWorking(false);
  setApproved(false);setConflictDecisions({});setMessage("");setError("");
 },[sourceKey]);
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
  setApproved(false);
  const abort=new AbortController();controller.current=abort;
  const signature=sourceKey;
  let next={...outcomes},done=0;
  try{
   for(const chunk of pending.slice(0,id?1:SEMANTIC_REQUEST_BATCH)){
    if(abort.signal.aborted||signature!==latest.current)throw Error("Análise cancelada.");
    const result=await analyzeSemanticChunk(chunk,goal,abort.signal);
    if(abort.signal.aborted||signature!==latest.current)throw Error("A fonte mudou durante a análise.");
    next={...next,[chunk.id]:result};
    setOutcomes(next);done++;
    setMessage("Trechos analisados: "+Object.keys(next).length+" de "+plan.chunks.length+".");
   }
   if(Object.keys(next).length===plan.chunks.length)
    setMessage("Todos os blocos foram analisados. Revise a cobertura e autorize a geração.");
   else
    setMessage("Lote concluído: "+done+" parte(s). Continue para analisar as próximas.");
  }catch(reason){
   if(signature===latest.current){
    setError(abort.signal.aborted?"Análise interrompida. Os blocos concluídos foram mantidos.":
     reason instanceof Error?reason.message:"Falha na compactação semântica.");
   }
  }finally{
   workingRef.current=false;controller.current=null;setWorking(false);
  }
 }
 return {enabled,setEnabled,working,message,error,approved,setApproved,ready,plan,
  planError:planState.error,outcomes,count,complete,digest,run,cancel,
  conflicts,conflictsReviewed,conflictDecisions,setConflictDecision};
}
