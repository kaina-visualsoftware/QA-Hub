import {useEffect,useState} from "react";
import type {AiWaitState} from "../../lib/ai-retry";
import "./ai-rate-limit.css";

/** Visible countdown, not an invented estimate of provider availability. */
export function AiQuotaWait({state,onCancel}:{
 state:AiWaitState|null;onCancel?:()=>void;
}){
 const [,tick]=useState(0);
 useEffect(()=>{
  if(!state)return;
  const timer=window.setInterval(()=>tick(x=>x+1),1000);
  return ()=>window.clearInterval(timer);
 },[state]);
 if(!state)return null;
 const remaining=Math.max(0,Math.ceil((state.until-Date.now())/1000));
 return <div className="qa-ai-quota-wait" role="status">
  <strong>{state.reason==="timeout"?
   "A NVIDIA excedeu o tempo de resposta":"Limite temporário de requisições atingido"}</strong>
  <p>{state.reason==="timeout"?
   "Uma nova tentativa pela NVIDIA será feita com resposta mais curta. Nenhum trecho será extraído sem IA.":
   "A próxima tentativa será feita automaticamente"+(state.estimated?
    " após um intervalo preventivo":"")+
    ". Seu trabalho e as partes concluídas permanecem disponíveis."}</p>
  <span aria-live="off">Nova tentativa em <strong>{remaining} s</strong> ·
   espera {state.attempt} de {state.reason==="timeout"?"1":"2"}</span>
  {onCancel&&<button type="button" onClick={onCancel}>Cancelar espera</button>}
 </div>;
}
