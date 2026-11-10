import {z} from "zod";
import {supabase} from "../../lib/supabase";

const uuid=z.uuid();
export const teamRole=z.enum(["gestor","qa","leitor"]);
export type TeamRole=z.infer<typeof teamRole>;
const team=z.object({
 id:uuid,owner_id:uuid,nome:z.string(),created_at:z.string()
});
export type Team=z.infer<typeof team>;
const member=z.object({
 equipe_id:uuid,usuario_id:uuid,papel:teamRole,aceito_em:z.string()
});
export type TeamMember=z.infer<typeof member>;
const invite=z.object({
 id:uuid,equipe_id:uuid,email:z.string(),papel:teamRole,
 criado_por:uuid,estado:z.enum(["pendente","aceito","recusado"]),created_at:z.string()
});
export type TeamInvite=z.infer<typeof invite>;
const taskLink=z.object({tarefa_id:uuid,equipe_id:uuid});
const assignee=z.object({tarefa_id:uuid,responsavel_id:uuid});
const comment=z.object({
 id:uuid,tarefa_id:uuid,user_id:uuid,texto:z.string(),created_at:z.string()
});
export type TaskComment=z.infer<typeof comment>;

function failed(error:{message:string}|null){if(error)throw Error(error.message);}
export async function teams():Promise<Team[]>{
 const {data,error}=await supabase.from("qa_equipes").select("*")
  .order("created_at",{ascending:false}).limit(80);
 failed(error);return z.array(team).parse(data??[]);
}
export async function createTeam(ownerId:string,name:string){
 uuid.parse(ownerId);
 const trimmed=name.trim();
 if(trimmed.length<2||trimmed.length>90)throw Error("Informe um nome de 2 a 90 caracteres.");
 const {data,error}=await supabase.from("qa_equipes").insert({
  owner_id:ownerId,nome:trimmed
 }).select("id").single();
 failed(error);return uuid.parse(data?.id);
}
export async function teamMembers(teamId:string):Promise<TeamMember[]>{
 uuid.parse(teamId);
 const {data,error}=await supabase.from("qa_equipe_membros").select("*")
  .eq("equipe_id",teamId).order("aceito_em",{ascending:true}).limit(100);
 failed(error);return z.array(member).parse(data??[]);
}
export async function teamInvites(teamId?:string):Promise<TeamInvite[]>{
 let query=supabase.from("qa_equipe_convites").select("*")
  .order("created_at",{ascending:false}).limit(80);
 if(teamId)query=query.eq("equipe_id",uuid.parse(teamId));
 const {data,error}=await query;
 failed(error);return z.array(invite).parse(data??[]);
}
export async function inviteMember(teamId:string,userId:string,email:string,role:"qa"|"leitor"){
 uuid.parse(teamId);uuid.parse(userId);
 const normalized=email.trim().toLowerCase();
 if(normalized.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized))
  throw Error("Informe um e-mail válido.");
 if(role!=="qa"&&role!=="leitor")throw Error("Permissão inválida.");
 const {error}=await supabase.from("qa_equipe_convites").insert({
  equipe_id:teamId,criado_por:userId,email:normalized,papel:role,estado:"pendente"
 });
 failed(error);
}
export async function respondInvite(inviteId:string,accept:boolean){
 uuid.parse(inviteId);
 const {data,error}=await supabase.from("qa_equipe_convites")
  .update({estado:accept?"aceito":"recusado"})
  .eq("id",inviteId).eq("estado","pendente").select("id").single();
 failed(error);if(data?.id!==inviteId)throw Error("Convite indisponível.");
}
export async function taskTeam(taskId:string){
 uuid.parse(taskId);
 const {data,error}=await supabase.from("qa_tarefa_equipes")
  .select("tarefa_id,equipe_id").eq("tarefa_id",taskId).maybeSingle();
 failed(error);return data?taskLink.parse(data):null;
}
export async function linkTask(taskId:string,teamId:string,userId:string){
 uuid.parse(taskId);uuid.parse(teamId);uuid.parse(userId);
 const {data,error}=await supabase.from("qa_tarefa_equipes").insert({
  tarefa_id:taskId,equipe_id:teamId,vinculado_por:userId
 }).select("tarefa_id").single();
 failed(error);if(data?.tarefa_id!==taskId)throw Error("Compartilhamento não confirmado.");
}
export async function unlinkTask(taskId:string){
 uuid.parse(taskId);
 const {data,error}=await supabase.from("qa_tarefa_equipes").delete()
  .eq("tarefa_id",taskId).select("tarefa_id").single();
 failed(error);if(data?.tarefa_id!==taskId)throw Error("Revogação não confirmada.");
}
export async function taskAssignee(taskId:string){
 uuid.parse(taskId);
 const {data,error}=await supabase.from("qa_tarefa_responsaveis")
  .select("tarefa_id,responsavel_id").eq("tarefa_id",taskId).maybeSingle();
 failed(error);return data?assignee.parse(data):null;
}
export async function assignTask(taskId:string,actorId:string,assigneeId:string){
 uuid.parse(taskId);uuid.parse(actorId);uuid.parse(assigneeId);
 const {data,error}=await supabase.from("qa_tarefa_responsaveis").upsert({
  tarefa_id:taskId,atribuido_por:actorId,responsavel_id:assigneeId,
  updated_at:new Date().toISOString()
 },{onConflict:"tarefa_id"}).select("tarefa_id").single();
 failed(error);if(data?.tarefa_id!==taskId)throw Error("Atribuição não confirmada.");
}
export async function clearAssignee(taskId:string){
 uuid.parse(taskId);
 const {error}=await supabase.from("qa_tarefa_responsaveis").delete()
  .eq("tarefa_id",taskId);
 failed(error);
}
export async function taskComments(taskId:string):Promise<TaskComment[]>{
 uuid.parse(taskId);
 const {data,error}=await supabase.from("qa_tarefa_comentarios").select("*")
  .eq("tarefa_id",taskId).order("created_at",{ascending:false}).limit(80);
 failed(error);return z.array(comment).parse(data??[]);
}
export async function addTaskComment(taskId:string,userId:string,text:string){
 uuid.parse(taskId);uuid.parse(userId);
 const value=text.trim();
 if(value.length<1||value.length>3000)throw Error("Comentário deve ter de 1 a 3.000 caracteres.");
 const {data,error}=await supabase.from("qa_tarefa_comentarios").insert({
  tarefa_id:taskId,user_id:userId,texto:value
 }).select("id").single();
 failed(error);return uuid.parse(data?.id);
}
export type TaskRights={role:"dono"|TeamRole|"nenhum";canExecute:boolean;canComment:boolean;canManage:boolean};
export async function getTaskRights(taskId:string,userId:string,ownerId:string):Promise<TaskRights>{
 uuid.parse(taskId);uuid.parse(userId);uuid.parse(ownerId);
 if(userId===ownerId)return {role:"dono",canExecute:true,canComment:true,canManage:true};
 const linked=await taskTeam(taskId);
 if(!linked)return {role:"nenhum",canExecute:false,canComment:false,canManage:false};
 const list=await teamMembers(linked.equipe_id);
 const member=list.find(row=>row.usuario_id===userId);
 if(!member)return {role:"nenhum",canExecute:false,canComment:false,canManage:false};
 const assigned=member.papel==="qa" ? await taskAssignee(taskId):null;
 return {
  role:member.papel,
  canExecute:member.papel==="gestor"||(member.papel==="qa"&&assigned?.responsavel_id===userId),
  canComment:member.papel!=="leitor",canManage:false
 };
}


export async function revokeMember(teamId:string,userId:string){
 uuid.parse(teamId);uuid.parse(userId);
 const {data,error}=await supabase.from("qa_equipe_membros").delete()
  .eq("equipe_id",teamId).eq("usuario_id",userId).select("usuario_id").single();
 failed(error);if(data?.usuario_id!==userId)throw Error("Revogação não confirmada.");
}
export async function changeMemberRole(teamId:string,userId:string,role:"qa"|"leitor"){
 uuid.parse(teamId);uuid.parse(userId);
 const {data,error}=await supabase.from("qa_equipe_membros")
  .update({papel:role}).eq("equipe_id",teamId).eq("usuario_id",userId)
  .select("usuario_id").single();
 failed(error);if(data?.usuario_id!==userId)throw Error("Permissão não atualizada.");
}
export async function cancelInvite(id:string){
 uuid.parse(id);
 const {data,error}=await supabase.from("qa_equipe_convites").delete()
  .eq("id",id).select("id").single();
 failed(error);if(data?.id!==id)throw Error("Convite não cancelado.");
}
export async function deleteTeam(id:string){
 uuid.parse(id);
 const {data,error}=await supabase.from("qa_equipes").delete()
  .eq("id",id).select("id").single();
 failed(error);if(data?.id!==id)throw Error("Equipe não excluída.");
}

export async function renameTeam(id:string,ownerId:string,name:string){
  uuid.parse(id);uuid.parse(ownerId);
  const value=name.trim();
  if(value.length<2||value.length>90)throw Error("Nome deve ter entre 2 e 90 caracteres.");
  const {data,error}=await supabase.from("qa_equipes").update({nome:value})
    .eq("id",id).eq("owner_id",ownerId).select("id").maybeSingle();
  failed(error);
  if(data?.id!==id)throw Error("Equipe não encontrada ou sem permissão.");
}

export async function editTaskComment(taskId:string,userId:string,id:string,text:string){
  uuid.parse(taskId);uuid.parse(userId);uuid.parse(id);
  const value=text.trim();
  if(value.length<1||value.length>3000)throw Error("Comentário deve ter entre 1 e 3.000 caracteres.");
  const {data,error}=await supabase.from("qa_tarefa_comentarios").update({texto:value})
    .eq("id",id).eq("tarefa_id",taskId).eq("user_id",userId)
    .select("id").maybeSingle();
  failed(error);
  if(data?.id!==id)throw Error("Comentário não encontrado ou sem permissão.");
}
export async function removeTaskComment(taskId:string,userId:string,id:string){
  uuid.parse(taskId);uuid.parse(userId);uuid.parse(id);
  const {data,error}=await supabase.from("qa_tarefa_comentarios").delete()
    .eq("id",id).eq("tarefa_id",taskId).eq("user_id",userId)
    .select("id").maybeSingle();
  failed(error);
  if(data?.id!==id)throw Error("Comentário não encontrado ou sem permissão.");
}
