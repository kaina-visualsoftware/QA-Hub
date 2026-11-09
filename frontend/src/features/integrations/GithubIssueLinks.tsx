import {useState} from "react";
import {useMutation,useQuery,useQueryClient} from "@tanstack/react-query";
import {Button} from "@heroui/react";
import {ExternalLink,Link2,RefreshCw} from "lucide-react";
import {
  checkPublicGithubIssue,githubIssueUrl,linkGithubIssue,
  listGithubIssueLinks,unlinkGithubIssue
} from "./github-issues";
import type {GithubIssueStatus} from "./github-issues";

export function GithubIssueLinks({taskId,userId,owner}:{
  taskId:string;userId:string;owner:boolean;
}){
  const client=useQueryClient();
  const [repo,setRepo]=useState("");
  const [number,setNumber]=useState("");
  const [message,setMessage]=useState("");
  const [error,setError]=useState("");
  const [statuses,setStatuses]=useState<Record<string,GithubIssueStatus>>({});
  const [checking,setChecking]=useState<string|null>(null);
  const linked=useQuery({
    queryKey:["f5-github-links",userId,taskId],
    queryFn:()=>listGithubIssueLinks(taskId)
  });
  const add=useMutation({
    mutationFn:()=>linkGithubIssue(taskId,userId,repo,number),
    onSuccess:async()=>{
      setRepo("");setNumber("");setError("");
      setMessage("Issue vinculada à TF.");
      await client.invalidateQueries({queryKey:["f5-github-links",userId,taskId]});
    },
    onError:(reason)=>setError(reason.message)
  });
  const remove=useMutation({
    mutationFn:(id:string)=>unlinkGithubIssue(id,taskId),
    onSuccess:async()=>{
      setError("");setMessage("Vínculo removido. A issue no GitHub não foi alterada.");
      await client.invalidateQueries({queryKey:["f5-github-links",userId,taskId]});
    },
    onError:(reason)=>setError(reason.message)
  });
  async function check(id:string,repository:string,issueNumber:number){
    if(checking)return;
    setChecking(id);setError("");setMessage("");
    try{
      const result=await checkPublicGithubIssue(repository,issueNumber);
      setStatuses(old=>({...old,[id]:result}));
    }catch(reason){
      setError(reason instanceof Error?reason.message:"Não foi possível consultar o GitHub.");
    }finally{setChecking(null);}
  }
  return <section className="qa-f5-issues" aria-label="Issues vinculadas à TF">
    <h4>Issues vinculadas</h4>
    <p className="text-muted text-sm">Associe uma issue existente. A consulta de estado é manual,
      disponível para repositórios públicos, sem token. Para issues privadas,
      use o link e consulte no GitHub com sua própria conta.</p>
    {owner&&<form className="qa-f5-create" onSubmit={event=>{
      event.preventDefault();setError("");setMessage("");add.mutate();
    }}>
      <label className="field">Repositório
        <input value={repo} maxLength={180} placeholder="organização/repositório"
          disabled={add.isPending} onChange={event=>setRepo(event.target.value)}/>
      </label>
      <label className="field">Número da issue
        <input value={number} inputMode="numeric" maxLength={9} placeholder="123"
          disabled={add.isPending} onChange={event=>setNumber(event.target.value)}/>
      </label>
      <Button type="submit" isDisabled={add.isPending||!repo.trim()||!number.trim()}>
        <Link2 size={16} aria-hidden="true"/> Vincular issue
      </Button>
    </form>}
    {linked.isPending&&<p role="status">Carregando issues vinculadas…</p>}
    {linked.isError&&<p className="notice error" role="alert">{linked.error.message}</p>}
    {linked.isSuccess&&linked.data.length===0&&<p className="text-muted text-sm">
      Nenhuma issue vinculada a esta TF.</p>}
    {linked.data?.map(issue=><article className="qa-f5-import-row" key={issue.id}>
      <strong>{issue.repositorio} #{issue.numero}</strong>
      {statuses[issue.id]&&<p className="text-sm">
        <strong>{statuses[issue.id].state==="open"?"Aberta":"Fechada"}</strong>
        {" · "}{statuses[issue.id].title}
      </p>}
      <div className="flex items-center gap-2 flex-wrap mt-2">
        <a className="secondary-link" href={githubIssueUrl(issue.repositorio,issue.numero)}
          target="_blank" rel="noopener noreferrer">
          <ExternalLink size={16} aria-hidden="true"/> Abrir no GitHub
        </a>
        <Button variant="secondary" size="sm" isDisabled={checking!==null}
          onPress={()=>void check(issue.id,issue.repositorio,issue.numero)}>
          <RefreshCw size={15} aria-hidden="true"/>
          {checking===issue.id?"Consultando…":"Consultar estado"}
        </Button>
        {owner&&<Button variant="secondary" size="sm" isDisabled={remove.isPending}
          onPress={()=>{
            if(window.confirm("Desvincular esta issue? O registro no GitHub não será alterado."))
              remove.mutate(issue.id);
          }}>Desvincular</Button>}
      </div>
    </article>)}
    {message&&<p role="status" className="notice">{message}</p>}
    {error&&<p role="alert" className="notice error">{error}</p>}
  </section>;
}
