import type {Scenario} from "../../lib/contracts";
import {useEffect,useMemo,useState} from "react";
import {useQuery} from "@tanstack/react-query";
import {FileCheck2,Layers,RefreshCcw} from "lucide-react";
import {supabase} from "../../lib/supabase";
import {candidatesForReview,prepareFocusedCoverageTask} from "./coverage-f32";
import type {CoverageCandidate} from "./coverage-f32";
import "./ai-f32.css";

type Requirement={id:string;tarefa_id:string;estado:string;codigo:string;titulo:string;
 descricao:string;criterios_aceite:string;ordem:number;tipo:string;updated_at:string};
type SavedCase={id:string;tarefa_id:string;titulo:string;status:Scenario["status"]};
type Link={tarefa_id:string;requisito_id:string;cenario_id:string};
export function CoverageReviewPanel({taskId,userId,approved,cases,changedCodes,
 taskText,busy=false,onGenerate}:{
 taskId:string;userId:string;approved:Requirement[];cases:SavedCase[];
 changedCodes:string[];taskText:string;busy?:boolean;
 onGenerate:(ids:string[])=>Promise<void>
}){
 const [checked,setChecked]=useState<string[]>([]);
 const [authorized,setAuthorized]=useState(false);
 const [busyLocal,setBusyLocal]=useState(false);
 const [error,setError]=useState("");
 const links=useQuery({
  queryKey:["f32-coverage-links",userId,taskId],
  enabled:approved.length>0,
  queryFn:async()=>{
   const {data,error}=await supabase.from("qa_requisito_cenarios")
    .select("tarefa_id,requisito_id,cenario_id")
    .eq("tarefa_id",taskId).eq("user_id",userId).limit(2001);
   if(error)throw error;
   if((data??[]).length>2000)throw Error("Há mais de 2000 vínculos. Consulte a matriz completa de requisitos.");
   return (data??[]) as Link[];
  }
 });
 const result=useMemo(()=>links.data?candidatesForReview(
  approved,cases,links.data,taskId,changedCodes):null,
  [approved,cases,links.data,taskId,changedCodes]);
 const candidates=result?.candidates??[];
 const signature=candidates.map(x=>x.id+":"+x.reason).join("|");
 useEffect(()=>{
  setChecked(candidates.slice(0,35).map(x=>x.id));
  setAuthorized(false);setError("");
 },[signature,taskId]);
 const focused=useMemo(()=>{
  try{
   return {data:checked.length?prepareFocusedCoverageTask(
    approved,checked,taskId,taskText):null,error:""};
  }catch(reason){return {data:null,error:reason instanceof Error?reason.message:
    "Seleção inválida."};}
 },[approved,checked,taskId,taskText]);
 async function request(){
  if(!authorized||!focused.data||busy||busyLocal)return;
  setBusyLocal(true);setError("");
  try{await onGenerate(focused.data.ids);setAuthorized(false);}
  catch(reason){setError(reason instanceof Error?reason.message:
   "Não foi possível preparar os cenários faltantes.");}
  finally{setBusyLocal(false);}
 }
 if(!approved.length)return <section className="qa-f32-coverage" aria-label="Cobertura de requisitos">
  <div className="qa-f32-heading"><Layers size={18} aria-hidden="true"/>
   <strong>Cobertura por requisitos aprovados</strong></div>
  <p>Esta TF ainda não possui requisitos aprovados. Cadastre e aprove-os antes
   de solicitar casos com cobertura verificável.</p>
 </section>;
 return <section className="qa-f32-coverage" aria-label="Cobertura de requisitos">
  <div className="qa-f32-heading">
   <Layers size={18} aria-hidden="true"/><strong>Cobertura por requisitos aprovados</strong>
   <button type="button" disabled={busy||busyLocal||links.isFetching}
    onClick={()=>void links.refetch()}><RefreshCcw size={15} aria-hidden="true"/>
    Atualizar vínculos</button>
  </div>
  <p>Somente cenários <strong>salvos e explicitamente vinculados</strong> contam como
   cobertura. Menções feitas pela IA não são vínculos nem comprovam execução.</p>
  {(links.isLoading||links.isFetching)&&<p role="status">Consultando vínculos salvos…</p>}
  {links.isError&&<p className="notice error" role="alert">
   Não foi possível verificar a cobertura: {String(links.error)}
  </p>}
  {result&&<div className="qa-f32-coverage-body">
   <div className="qa-f32-coverage-metrics">
    <span><b>{result.matrix.totals.total}</b> aprovados</span>
    <span><b>{result.matrix.totals.linked}</b> com vínculos</span>
    <span><b>{result.matrix.totals.unlinked}</b> sem vínculos</span>
    <span><b>{result.matrix.totals.validated}</b> validados em testes salvos</span>
   </div>
   {!candidates.length?<p role="status"><FileCheck2 size={16} aria-hidden="true"/>
    Todos os requisitos aprovados têm vínculo explícito e não há mudanças
    de versão identificadas. Isso não elimina a necessidade de testes de regressão.</p>:
   <>
    <strong>Gerar somente os requisitos com lacunas ou modificados</strong>
    <p>Escolha o que revisar. Requisitos alterados aparecem quando a comparação
     com a versão registrada foi carregada na seção de auditoria.</p>
    <div className="qa-f32-requirements">
     {candidates.map((item:CoverageCandidate)=><label key={item.id}>
      <input type="checkbox" checked={checked.includes(item.id)} disabled={busy||busyLocal}
       onChange={e=>{setChecked(value=>e.target.checked?
        [...value,item.id]:value.filter(x=>x!==item.id));setAuthorized(false);}}/>
      <span><strong>{item.codigo} · {item.titulo}</strong>
       <small>{item.reason==="unlinked"?"Sem cenários vinculados":
        "Fonte alterada desde a versão registrada; revisar impacto"}</small>
      </span>
     </label>)}
    </div>
    {focused.error&&<p className="notice error" role="alert">{focused.error}</p>}
    {focused.data&&<details className="qa-f32-focused-preview">
     <summary>Conferir os requisitos selecionados que serão enviados ({checked.length})</summary>
     <textarea aria-label="Requisitos focados para a geração" readOnly rows={7}
      value={focused.data.requirements}/>
    </details>}
    <label className="qa-f32-consent">
     <input type="checkbox" checked={authorized} disabled={busy||busyLocal||!focused.data}
      onChange={e=>setAuthorized(e.target.checked)}/>
     Revisei os requisitos selecionados e autorizo a NVIDIA a gerar somente
     sugestões de casos para eles, mantendo meus casos atuais.
    </label>
    <button type="button" className="qa-f32-coverage-submit"
     disabled={!authorized||!focused.data||busy||busyLocal||links.isFetching}
     onClick={()=>void request()}>
     {busyLocal?"Gerando casos adicionais…":"Preparar casos apenas para a seleção"}
    </button>
    <small>Os casos gerados entram como sugestões não executadas, sem vínculo
     automático. Vincule os cenários aos requisitos após revisá-los e salvá-los.</small>
   </>}
  </div>}
  {error&&<p className="notice error" role="alert">{error}</p>}
 </section>;
}
