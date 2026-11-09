import {useState} from "react";
import {ToastNotice} from "../../components/ui/Toasts";
import {useMutation,useQuery,useQueryClient} from "@tanstack/react-query";
import {Button} from "@heroui/react";
import {Users,UserPlus} from "lucide-react";
import {
 teams,createTeam,teamMembers,teamInvites,inviteMember,
 respondInvite,revokeMember,changeMemberRole,cancelInvite,deleteTeam
} from "./team-data";

export default function TeamsSettings({userId}:{userId:string}){
 const client=useQueryClient();
 const [name,setName]=useState("");
 const [selected,setSelected]=useState("");
 const [email,setEmail]=useState("");
 const [role,setRole]=useState<"qa"|"leitor">("qa");
 const [notice,setNotice]=useState("");
 const [error,setError]=useState("");
 const teamList=useQuery({
  queryKey:["f5-teams",userId],queryFn:teams,enabled:!!userId
 });
 const invites=useQuery({
  queryKey:["f5-invites",userId],queryFn:()=>teamInvites(),enabled:!!userId
 });
 const team=teamList.data?.find(item=>item.id===selected);
 const members=useQuery({
  queryKey:["f5-members",userId,selected],
  queryFn:()=>teamMembers(selected),enabled:!!team
 });
 const selectedInvites=(invites.data??[]).filter(item=>item.equipe_id===selected
   &&item.estado==="pendente");
 const pastInvites=(invites.data??[]).filter(item=>item.equipe_id===selected
   &&item.estado!=="pendente");
 const change=useMutation({
  mutationFn:async (action:()=>Promise<unknown>)=>action(),
  onSuccess:async ()=>{
   await Promise.all([
    client.invalidateQueries({queryKey:["f5-teams",userId]}),
    client.invalidateQueries({queryKey:["f5-invites",userId]}),
    client.invalidateQueries({queryKey:["f5-members",userId]}),
    client.invalidateQueries({queryKey:["task-search",userId]})
   ]);
  }
 });
 async function act(action:()=>Promise<unknown>,message:string){
  setError("");setNotice("");
  try{await change.mutateAsync(action);setNotice(message);}
  catch(reason){setError(reason instanceof Error?reason.message:"Falha ao salvar.");}
 }
 return <section className="panel qa-f5-teams" aria-label="Equipes e convites">
  <div className="qa-profile-title">
   <Users size={21} aria-hidden="true"/>
   <div><h2>Equipes</h2>
    <p className="text-muted text-sm">Compartilhe somente TFs escolhidas, sem publicá-las.</p></div>
  </div>
  {invites.data?.some(item=>item.criado_por!==userId&&item.estado==="pendente")&&
   <div className="qa-f5-invites" aria-label="Convites recebidos">
    <h3>Convites para você</h3>
    {invites.data.filter(item=>item.criado_por!==userId&&item.estado==="pendente").map(inv=>
     <div className="qa-f5-item" key={inv.id}>
      <span><strong>{teamList.data?.find(t=>t.id===inv.equipe_id)?.nome??"Equipe convidante"}</strong>
       <small>Permissão: {inv.papel==="qa"?"QA":"Leitura"}</small></span>
      <div className="qa-f5-actions">
       <Button isDisabled={change.isPending}
        onPress={()=>void act(()=>respondInvite(inv.id,true),"Convite aceito.")}>Aceitar</Button>
       <Button variant="secondary" isDisabled={change.isPending}
        onPress={()=>void act(()=>respondInvite(inv.id,false),"Convite recusado.")}>Recusar</Button>
      </div>
     </div>)}
   </div>}
  <div className="qa-f5-create">
   <label className="field">Nome da equipe
    <input value={name} onChange={e=>setName(e.target.value)}
     maxLength={90} placeholder="Ex.: QA Financeiro"/>
   </label>
   <Button isDisabled={change.isPending||name.trim().length<2}
    onPress={()=>void act(async()=>{
     const id=await createTeam(userId,name);
     setSelected(id);setName("");
    },"Equipe criada.")}>Criar equipe</Button>
  </div>
  {teamList.isPending&&<p role="status">Carregando equipes…</p>}
  {teamList.isError&&<p className="notice error" role="alert">{teamList.error.message}</p>}
  {teamList.data?.length===0&&<p className="text-muted text-sm">
    Nenhuma equipe. Crie uma para organizar os responsáveis por suas TFs.</p>}
  {!!teamList.data?.length&&<label className="field">Selecionar equipe
   <select value={selected} onChange={e=>setSelected(e.target.value)}>
    <option value="">Escolher…</option>
    {teamList.data.map(item=><option key={item.id} value={item.id}>
     {item.nome}{item.owner_id===userId?" (sua)":""}</option>)}
   </select>
  </label>}
  {team&&<div className="qa-f5-team-details">
   <h3>{team.nome}</h3>
   <div className="qa-f5-members" aria-label="Integrantes">
    <strong>Integrantes</strong>
    {members.data?.map(member=><div className="qa-f5-item" key={member.usuario_id}>
     <span><strong>{member.usuario_id===userId?"Você":
       "QA · "+member.usuario_id.slice(0,8)}</strong>
       <small>{member.papel==="gestor"?"Gestor":member.papel==="qa"?"QA":"Leitor"}</small></span>
     {team.owner_id===userId&&member.usuario_id!==userId&&
      <div className="qa-f5-actions">
       <label className="sr-only" htmlFor={"member-role-"+member.usuario_id}>Permissão do integrante</label>
       <select id={"member-role-"+member.usuario_id} value={member.papel}
        disabled={change.isPending}
        onChange={e=>{
         const newRole=e.currentTarget.value as "qa"|"leitor";
         void act(()=>changeMemberRole(team.id,member.usuario_id,newRole),
          "Permissão atualizada.");
        }}>
        <option value="qa">QA</option><option value="leitor">Leitor</option>
       </select>
       <Button variant="secondary" isDisabled={change.isPending}
        onPress={()=>{
         if(window.confirm("Remover o acesso deste integrante às TFs da equipe?"))
          void act(()=>revokeMember(team.id,member.usuario_id),"Acesso revogado.");
        }}>Remover</Button>
      </div>}
    </div>)}
   </div>
   {team.owner_id===userId&&<>
    <div className="qa-f5-invite-form">
     <h3><UserPlus size={16}/> Convidar integrante</h3>
     <label className="field">E-mail cadastrado
      <input type="email" autoComplete="off" value={email}
       onChange={e=>setEmail(e.target.value)}
       placeholder="qa@empresa.com"/>
     </label>
     <div className="qa-f5-actions">
      <label className="field">Permissão
       <select value={role} onChange={e=>setRole(e.target.value as "qa"|"leitor")}>
        <option value="qa">QA</option><option value="leitor">Leitor</option>
       </select>
      </label>
      <Button isDisabled={change.isPending||!email.includes("@")}
       onPress={()=>void act(async()=>{
        await inviteMember(team.id,userId,email,role);setEmail("");
       },"Convite registrado. Avise a pessoa para acessar Perfil → Equipes.")}>Convidar</Button>
     </div>
     <p className="text-muted text-sm">O convite aparece na conta que entrar com o mesmo
      e-mail confirmado. Nenhum e-mail automático é enviado.</p>
    </div>
    {!!selectedInvites.length&&<div className="qa-f5-invites">
     <h3>Convites pendentes</h3>
     {selectedInvites.map(inv=><div className="qa-f5-item" key={inv.id}>
      <span>{inv.email}<small>{inv.papel==="qa"?"QA":"Leitura"}</small></span>
      <Button variant="secondary" isDisabled={change.isPending}
       onPress={()=>void act(()=>cancelInvite(inv.id),"Convite cancelado.")}>Cancelar</Button>
     </div>)}
    </div>}
    {!!pastInvites.length&&<details className="qa-f5-invites-history">
      <summary>Convites anteriores ({pastInvites.length})</summary>
      <p className="text-muted text-sm">Se um integrante foi removido,
        libere o convite anterior antes de convidá-lo novamente.</p>
      {pastInvites.map(inv=><div className="qa-f5-item" key={inv.id}>
        <span>{inv.email}<small>{inv.estado==="aceito"?"Aceito":"Recusado"}</small></span>
        <Button variant="secondary" isDisabled={change.isPending}
          onPress={()=>{
            if(window.confirm("Remover este registro de convite? Isso não revoga uma associação ativa."))
              void act(()=>cancelInvite(inv.id),"Registro removido. Um novo convite pode ser criado.");
          }}>Liberar novo convite</Button>
      </div>)}
    </details>}
    <Button variant="secondary" isDisabled={change.isPending}
     onPress={()=>{
      if(window.confirm("Excluir esta equipe? Todos os compartilhamentos dela serão revogados."))
       void act(async()=>{
        await deleteTeam(team.id);setSelected("");
       },"Equipe excluída e acesso revogado.");
     }}>Excluir equipe</Button>
   </>}
  </div>}
  <ToastNotice message={notice} tone="success"/>
  <ToastNotice message={error} tone="error"/>
 </section>;
}
