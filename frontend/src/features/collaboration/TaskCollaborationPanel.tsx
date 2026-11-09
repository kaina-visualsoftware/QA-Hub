import {useMemo,useState} from "react";
import {useMutation,useQuery,useQueryClient} from "@tanstack/react-query";
import {Button} from "@heroui/react";
import {ExternalLink,MessageCircle,Users,Workflow} from "lucide-react";
import type {Scenario,Task} from "../../lib/contracts";
import {scenarioStatusLabels} from "../../lib/contracts";
import {saveScenarioResult} from "../../lib/data";
import {
 teams,teamMembers,taskTeam,linkTask,unlinkTask,taskAssignee,assignTask,
 clearAssignee,taskComments,addTaskComment
} from "./team-data";
import type {TaskRights} from "./team-data";
import {githubIssueDraft,readAutomatedResults} from "../integrations/test-results";
import type {ImportedTestResult} from "../integrations/test-results";
import {GithubIssueLinks} from "../integrations/GithubIssueLinks";

export default function TaskCollaborationPanel({task,scenarios,userId,rights,onExecuted}:{
 task:Task;scenarios:Scenario[];userId:string;
 rights:TaskRights;onExecuted:()=>Promise<void>;
}){
 const client=useQueryClient();
 const owner=task.user_id===userId;
 const [tab,setTab]=useState<"team"|"comments"|"integration">("team");
 const [teamId,setTeamId]=useState("");
 const [personId,setPersonId]=useState("");
 const [comment,setComment]=useState("");
 const [repo,setRepo]=useState("");
 const [fileResults,setFileResults]=useState<ImportedTestResult[]>([]);
 const [reviewed,setReviewed]=useState<Record<string,string>>({});
 const [statusEdits,setStatusEdits]=useState<Record<string,ImportedTestResult["status"]>>({});
 const [processed,setProcessed]=useState<string[]>([]);
 const [showCount,setShowCount]=useState(12);
 const [message,setMessage]=useState("");
 const [error,setError]=useState("");
 const [fileBusy,setFileBusy]=useState(false);
 const [fileName,setFileName]=useState("");

 const list=useQuery({
  queryKey:["f5-teams",userId],queryFn:teams,enabled:owner
 });
 const linked=useQuery({
  queryKey:["f5-task-team",userId,task.id],
  queryFn:()=>taskTeam(task.id)
 });
 const activeTeamId=linked.data?.equipe_id??"";
 const members=useQuery({
  queryKey:["f5-members",userId,activeTeamId],
  queryFn:()=>teamMembers(activeTeamId),enabled:Boolean(activeTeamId)
 });
 const responsible=useQuery({
  queryKey:["f5-assignee",userId,task.id],
  queryFn:()=>taskAssignee(task.id)
 });
 const comments=useQuery({
  queryKey:["f5-comments",userId,task.id],
  queryFn:()=>taskComments(task.id),enabled:tab==="comments"
 });
 const mutation=useMutation({mutationFn:async(run:()=>Promise<unknown>)=>run(),
  onSuccess:async()=>Promise.all([
   client.invalidateQueries({queryKey:["f5-task-team",userId,task.id]}),
   client.invalidateQueries({queryKey:["f5-assignee",userId,task.id]}),
   client.invalidateQueries({queryKey:["f5-comments",userId,task.id]}),
   client.invalidateQueries({queryKey:["f5-members",userId]}),
   client.invalidateQueries({queryKey:["f5-rights",userId,task.id]}),
   client.invalidateQueries({queryKey:["task-search",userId]})
  ])
 });
 async function run(action:()=>Promise<unknown>,success:string){
  setError("");setMessage("");
  try{await mutation.mutateAsync(action);setMessage(success);}
  catch(reason){setError(reason instanceof Error?reason.message:"Não foi possível concluir a operação.");}
 }
 const memberOptions=members.data?.filter(m=>m.papel!=="leitor")??[];
 const repoUrl=useMemo(()=>{
  if(!repo.trim())return "";
  try{return githubIssueDraft(repo,task.titulo,
    ["TF: "+(task.codigo||task.id),"Tipo: "+task.tipo_teste,
      "Sistema: "+(task.sistema||"Não informado"),
      "Versão: "+(task.versao||"Não informada"),"",
      "Contexto:",task.descricao||"Sem descrição"].join("\n"));}
  catch{return "";}
 },[repo,task]);
 async function readFile(file:File|undefined){
  if(!file)return;
  setError("");setMessage("");setFileResults([]);setProcessed([]);setReviewed({});
  setStatusEdits({});setShowCount(12);setFileBusy(true);
  try{
   const parsed=await readAutomatedResults(file);
   setFileResults(parsed);
   setMessage(parsed.length+" resultado(s) disponíveis para conferência. Nenhuma TF foi alterada.");
  }catch(reason){
   setError(reason instanceof Error?reason.message:"Não foi possível ler este arquivo.");
  }finally{setFileBusy(false);}
 }
 async function applyResult(entry:ImportedTestResult){
  const scenarioId=reviewed[entry.id];
  const scenario=scenarios.find(item=>item.id===scenarioId);
  if(!scenario||!rights.canExecute)return;
  const status=statusEdits[entry.id]??entry.status;
  if(!window.confirm("Registrar "+scenarioStatusLabels[status]+
     " no cenário “"+scenario.titulo+"”? Esta operação altera a execução, mas não aprova a TF."))return;
  const observed=entry.observed.trim().slice(0,1600);
  if((status==="reprovado"||status==="bloqueado")&&observed.length<3){
   setError("Informe um resultado observado suficiente antes de registrar falha ou bloqueio.");
   return;
  }
  await run(async()=>{
   await saveScenarioResult(task.id,scenario.id,{
    status,obtido:status==="nao_executado"?"":observed
   });
   setProcessed(previous=>[...previous,entry.id]);
   await onExecuted();
  },"Resultado registrado. A TF não foi aprovada automaticamente.");
 }
 return <div className="qa-f5-collab" aria-label="Colaboração e integrações">
  <div className="qa-f5-tabs" role="group" aria-label="Áreas de colaboração">
   <button type="button" aria-pressed={tab==="team"} className={tab==="team"?"selected":""}
    onClick={()=>setTab("team")}><Users size={16}/> Equipe</button>
   <button type="button" aria-pressed={tab==="comments"} className={tab==="comments"?"selected":""}
    onClick={()=>setTab("comments")}><MessageCircle size={16}/> Conversa</button>
   <button type="button" aria-pressed={tab==="integration"} className={tab==="integration"?"selected":""}
    onClick={()=>setTab("integration")}><Workflow size={16}/> Integrações</button>
  </div>
  {tab==="team"&&<section className="qa-f5-tab" aria-label="Compartilhar tarefa com equipe">
   <h3>Compartilhamento interno</h3>
   <p className="text-muted text-sm">Somente integrantes aceitos podem consultar a TF.
    Arquivos privados e bibliotecas pessoais permanecem restritos ao proprietário.</p>
   {linked.isPending&&<p role="status">Consultando compartilhamento…</p>}
   {linked.isError&&<p role="alert" className="notice error">{linked.error.message}</p>}
   {activeTeamId?<div className="qa-f5-team-attached">
    <strong>Compartilhada com a equipe</strong>
    <p>{list.data?.find(t=>t.id===activeTeamId)?.nome||
     "Equipe "+activeTeamId.slice(0,8)}</p>
    {owner&&<Button variant="secondary" isDisabled={mutation.isPending}
      onPress={()=>{
       if(window.confirm("Revogar o acesso de toda a equipe a esta TF?"))
        void run(()=>unlinkTask(task.id),"Compartilhamento revogado.");
      }}>Revogar compartilhamento</Button>}
   </div>:owner?<div className="qa-f5-create">
    <label className="field">Escolher sua equipe
     <select value={teamId} onChange={e=>setTeamId(e.target.value)}>
      <option value="">Selecione…</option>
      {list.data?.filter(t=>t.owner_id===userId).map(t=>
       <option key={t.id} value={t.id}>{t.nome}</option>)}
     </select>
    </label>
    <Button isDisabled={!teamId||mutation.isPending}
     onPress={()=>void run(()=>linkTask(task.id,teamId,userId),
      "TF compartilhada somente com os integrantes da equipe.")}>Compartilhar com equipe</Button>
    {list.data?.every(t=>t.owner_id!==userId)&&
     <p className="text-muted text-sm">Crie uma equipe em Perfil e configurações → Equipes.</p>}
   </div>:<p className="text-muted text-sm">Esta TF não está ligada a uma equipe.</p>}
   <h3>Responsável pela execução</h3>
   <p className="text-muted text-sm">
    {responsible.data?.responsavel_id
     ?"Designado: "+(responsible.data.responsavel_id===userId?
       "Você":"QA "+responsible.data.responsavel_id.slice(0,8))
     :"Nenhum responsável designado."}
   </p>
   {owner&&<div className="qa-f5-create">
    <label className="field">Designar QA
     <select value={personId} onChange={e=>setPersonId(e.target.value)}>
      <option value="">Escolha o responsável…</option>
      <option value={userId}>Você (proprietário)</option>
      {memberOptions.filter(m=>m.usuario_id!==userId).map(m=>
       <option key={m.usuario_id} value={m.usuario_id}>
        QA {m.usuario_id.slice(0,8)} · {m.papel}
       </option>)}
     </select>
    </label>
    <Button isDisabled={!personId||mutation.isPending}
     onPress={()=>void run(()=>assignTask(task.id,userId,personId),
      "Responsável atualizado.")}>Atribuir</Button>
    {responsible.data&&<Button variant="secondary" isDisabled={mutation.isPending}
     onPress={()=>void run(()=>clearAssignee(task.id),"Atribuição removida.")}>Limpar</Button>}
   </div>}
   <p className="qa-f5-rights">Seu acesso nesta TF: <strong>{
    rights.role==="dono"?"Proprietário":rights.role==="gestor"?"Gestor":
    rights.role==="qa"?"QA":rights.role==="leitor"?"Leitura":"Sem permissão"
   }</strong>. {rights.canExecute?"Pode registrar execução.":"Não pode executar cenários."}</p>
  </section>}
  {tab==="comments"&&<section className="qa-f5-tab" aria-label="Comentários da tarefa">
   <h3>Conversa da TF</h3>
   {rights.canComment&&<form onSubmit={e=>{
    e.preventDefault();
    void run(async()=>{
     await addTaskComment(task.id,userId,comment);setComment("");
    },"Comentário registrado.");
   }}>
    <label className="field">Novo comentário
     <textarea value={comment} rows={3} maxLength={3000}
      placeholder="Compartilhe a observação com a equipe"
      onChange={e=>setComment(e.target.value)}/>
    </label>
    <Button type="submit" isDisabled={mutation.isPending||!comment.trim()}>
      Publicar comentário</Button>
   </form>}
   {!rights.canComment&&<p className="text-muted text-sm">
    Seu acesso permite consultar comentários, mas não publicar.</p>}
   {comments.isPending&&<p role="status">Carregando conversa…</p>}
   {comments.isError&&<p role="alert" className="notice error">{comments.error.message}</p>}
   {comments.data?.length===0&&<p className="text-muted text-sm">Ainda não há comentários.</p>}
   {comments.data?.map(item=><article className="qa-f5-comment" key={item.id}>
    <div><strong>{item.user_id===userId?"Você":"QA "+item.user_id.slice(0,8)}</strong>
     <time dateTime={item.created_at}>{new Date(item.created_at).toLocaleString("pt-BR")}</time></div>
    <p>{item.texto}</p>
   </article>)}
  </section>}
  {tab==="integration"&&<section className="qa-f5-tab" aria-label="Integrações da TF">
   <h3>GitHub Issues</h3>
   <p className="text-muted text-sm">Prepare um rascunho com os dados da TF.
    Confira o conteúdo no GitHub antes de publicar. Nenhum token é solicitado.</p>
   <label className="field">Repositório GitHub
    <input placeholder="organização/repositório" value={repo}
     onChange={e=>setRepo(e.target.value)} maxLength={180}/>
   </label>
   {repoUrl?<a className="secondary-link" href={repoUrl} target="_blank"
    rel="noopener noreferrer" onClick={event=>{
     if(!window.confirm("Abrir o rascunho no GitHub enviará o título e a descrição da TF ao GitHub pela URL. Revise e remova dados confidenciais antes de continuar. Abrir mesmo assim?"))
       event.preventDefault();
    }}><ExternalLink size={16}/> Revisar issue no GitHub</a>:
    <p className="text-muted text-sm">Use o formato organização/repositório.</p>}
   <GithubIssueLinks key={task.id} taskId={task.id} userId={userId} owner={owner}/>
   <div className="qa-f5-divider"/>
   <h3>Resultados automatizados</h3>
   <p className="text-muted text-sm">Importe um relatório JUnit XML ou Playwright JSON.
    Confira e associe individualmente cada teste ao cenário; não há registro automático.</p>
   <label className="field qa-files-picker-field">Selecionar relatório (até 2 MB)
    <span className="qa-files-picker">
     <span className="qa-files-picker-button">Escolher arquivo</span>
     <span className="qa-files-picker-name">{fileName||"Nenhum arquivo selecionado"}</span>
    </span>
    <input className="qa-files-hidden-input" aria-label="Selecionar relatório (até 2 MB)"
     type="file" accept=".xml,.json,application/json,application/xml,text/xml"
     disabled={fileBusy} onChange={e=>{
      const file=e.target.files?.[0];setFileName(file?.name??"");
      void readFile(file);e.target.value="";
     }}/>
   </label>
   {fileBusy&&<p role="status">Lendo arquivo no navegador…</p>}
   {!!fileResults.length&&<>
    <strong>{fileResults.length} resultado(s) para revisão</strong>
    {fileResults.slice(0,showCount).map(entry=>
     <div className="qa-f5-import-row" key={entry.id}>
      <strong>{entry.name}</strong>
      <small>{entry.source} · {scenarioStatusLabels[entry.status]}</small>
      <label className="field">Vincular a cenário
       <select value={reviewed[entry.id]??""} onChange={e=>
        setReviewed(previous=>({...previous,[entry.id]:e.target.value}))}>
        <option value="">Escolha…</option>
        {scenarios.map(s=><option key={s.id} value={s.id}>{s.titulo}</option>)}
       </select>
      </label>
      <label className="field">Resultado a registrar
       <select value={statusEdits[entry.id]??entry.status}
        onChange={e=>setStatusEdits(previous=>({
         ...previous,[entry.id]:e.target.value as ImportedTestResult["status"]
        }))}>
        {Object.entries(scenarioStatusLabels).map(([id,label])=>
         <option value={id} key={id}>{label}</option>)}
       </select>
      </label>
      <p className="qa-f5-observed">{entry.observed||"Sem observação"}</p>
      <Button variant="secondary" isDisabled={
       !rights.canExecute||!reviewed[entry.id]||
       processed.includes(entry.id)||mutation.isPending
      } onPress={()=>void applyResult(entry)}>
       {processed.includes(entry.id)?"Resultado registrado":"Registrar neste cenário"}
      </Button>
     </div>)}
    {fileResults.length>showCount&&<Button variant="secondary"
     onPress={()=>setShowCount(n=>n+12)}>Mostrar mais resultados</Button>}
   </>}
  </section>}
  {message&&<p className="notice" role="status">{message}</p>}
  {error&&<p className="notice error" role="alert">{error}</p>}
 </div>;
}
