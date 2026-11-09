import {z} from "zod";
import {supabase} from "../../lib/supabase";

const uuid=z.uuid();
const reference=z.object({
  id:uuid,tarefa_id:uuid,user_id:uuid,repositorio:z.string(),
  numero:z.number().int().positive(),created_at:z.string()
});
export type GithubIssueReference=z.infer<typeof reference>;
export type GithubIssueStatus={title:string;state:"open"|"closed";url:string};

export function normalizeGithubRepo(raw:string):string {
  const repo=raw.trim().toLowerCase();
  if(repo.length>180||!/^[a-z0-9][a-z0-9_.-]*\/[a-z0-9][a-z0-9_.-]*$/.test(repo)||
    repo.split("/").some(part=>part==="."||part===".."||part.startsWith(".")))
    throw Error("Informe um repositório no formato organização/repositório.");
  return repo;
}
export function githubIssueNumber(raw:string|number):number {
  const text=String(raw).trim();
  if(!/^[1-9][0-9]{0,8}$/.test(text))throw Error("Número de issue inválido.");
  return Number(text);
}
export function githubIssueUrl(repo:string,number:number):string {
  const normalized=normalizeGithubRepo(repo);
  const valid=githubIssueNumber(number);
  return "https://github.com/"+normalized+"/issues/"+valid;
}
export async function listGithubIssueLinks(taskId:string):Promise<GithubIssueReference[]> {
  uuid.parse(taskId);
  const {data,error}=await supabase.from("qa_tarefa_github_issues").select(
    "id,tarefa_id,user_id,repositorio,numero,created_at"
  ).eq("tarefa_id",taskId).order("created_at",{ascending:false}).limit(60);
  if(error)throw error;
  return z.array(reference).parse(data??[]);
}
export async function linkGithubIssue(taskId:string,userId:string,repo:string,number:string|number) {
  uuid.parse(taskId);uuid.parse(userId);
  const normalized=normalizeGithubRepo(repo),issueNumber=githubIssueNumber(number);
  const {data,error}=await supabase.from("qa_tarefa_github_issues").insert({
    tarefa_id:taskId,user_id:userId,repositorio:normalized,numero:issueNumber
  }).select("id").single();
  if(error)throw error;
  if(!data?.id)throw Error("O banco não confirmou a associação.");
  return uuid.parse(data.id);
}
export async function unlinkGithubIssue(id:string,taskId:string){
  uuid.parse(id);uuid.parse(taskId);
  const {data,error}=await supabase.from("qa_tarefa_github_issues").delete()
    .eq("id",id).eq("tarefa_id",taskId).select("id").single();
  if(error)throw error;
  if(data?.id!==id)throw Error("Vínculo não encontrado ou sem permissão.");
}
// Public GitHub Issues only. No credentials, no private issue lookups and no
// automatic export of the task's description. Called only when the QA clicks.
export async function checkPublicGithubIssue(repo:string,number:number):Promise<GithubIssueStatus> {
  const normalized=normalizeGithubRepo(repo);
  const valid=githubIssueNumber(number);
  const endpoint="https://api.github.com/repos/"+normalized+"/issues/"+valid;
  const response=await fetch(endpoint,{
    headers:{"Accept":"application/vnd.github+json"},
    cache:"no-store"
  });
  if(response.status===404||response.status===403||response.status===429)
    throw Error("Não foi possível consultar: issue privada, inexistente ou limite da API. Abra no GitHub.");
  if(!response.ok)throw Error("Consulta ao GitHub indisponível ("+response.status+").");
  const data=z.object({
    title:z.string(),state:z.enum(["open","closed"]),html_url:z.url(),
    pull_request:z.unknown().optional()
  }).parse(await response.json());
  if(data.pull_request)throw Error("O número informado é um pull request, não uma issue.");
  if(data.html_url.toLowerCase()!==githubIssueUrl(normalized,valid).toLowerCase())
    throw Error("O GitHub retornou uma referência diferente da solicitada.");
  return {title:data.title.slice(0,240),state:data.state,url:data.html_url};
}
