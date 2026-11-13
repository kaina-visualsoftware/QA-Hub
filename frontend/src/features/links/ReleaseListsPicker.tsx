import {useCallback,useEffect,useMemo,useState} from "react";
import {useMutation,useQuery,useQueryClient} from "@tanstack/react-query";
import {Button} from "@heroui/react";
import {Check,FolderPlus,Settings2,Trash2,Users,Plus,BookOpen} from "lucide-react";
import {QAModal} from "../../components/ui/QAModal";
import {ToastNotice} from "../../components/ui/Toasts";
import {useAuth} from "../auth/AuthProvider";
import {teams} from "../collaboration/team-data";
import {getAdminRole} from "../../lib/data";
import {
 releaseLists,releaseItems,createReleaseList,renameReleaseList,removeReleaseList,
 addReleaseItem,removeReleaseItem
} from "./release-lists-data";
import type {ReleaseList,ReleaseListScope} from "./release-lists-data";

const titleFor=(scope:ReleaseListScope)=>scope==="pessoal"?"Pessoal":scope==="equipe"?"Equipe":"Global";
const listKey=(userId:string)=>["release-lists",userId] as const;
const itemKey=(userId:string,id:string)=>["release-list-items",userId,id] as const;

export default function ReleaseListsPicker({value,onChange}:{
 value:string;onChange:(names:string)=>void
}){
 const {user}=useAuth(),userId=user?.id??"";
 const client=useQueryClient();
 const [selected,setSelected]=useState("");
 const [excluded,setExcluded]=useState<string[]>([]);
 const [manageOpen,setManageOpen]=useState(false);
 const [managed,setManaged]=useState("");
 const [name,setName]=useState("");
 const [scope,setScope]=useState<ReleaseListScope>("pessoal");
 const [teamId,setTeamId]=useState("");
 const [itemName,setItemName]=useState("");
 const [rename,setRename]=useState("");
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const lists=useQuery({queryKey:listKey(userId),queryFn:releaseLists,
   enabled:!!userId,refetchOnWindowFocus:false});
 const activeItems=useQuery({queryKey:itemKey(userId,selected),
   queryFn:()=>releaseItems(selected),enabled:!!selected,refetchOnWindowFocus:false});
 const managedItems=useQuery({queryKey:itemKey(userId,managed),
   queryFn:()=>releaseItems(managed),enabled:manageOpen&&!!managed,refetchOnWindowFocus:false});
 const teamList=useQuery({queryKey:["f5-teams",userId],queryFn:teams,
   enabled:manageOpen&&!!userId});
 const admin=useQuery({queryKey:["role",userId],queryFn:()=>getAdminRole(userId),
   enabled:manageOpen&&!!userId});
 const ownedTeams=useMemo(()=>teamList.data?.filter(t=>t.owner_id===userId)??[],
   [teamList.data,userId]);
 const currentList=lists.data?.find(x=>x.id===selected);
 const managedList=lists.data?.find(x=>x.id===managed);
 const canManage=useCallback((list:ReleaseList)=>{
   if(list.escopo==="global")return admin.data===true;
   if(list.escopo==="equipe")return ownedTeams.some(t=>t.id===list.equipe_id);
   return list.owner_id===userId;
 },[admin.data,ownedTeams,userId]);
 const active=activeItems.data?.filter(item=>item.ativo)??[];
 const chosen=active.filter(item=>!excluded.includes(item.id));
 const mutation=useMutation({mutationFn:async(action:()=>Promise<unknown>)=>action(),
   onSuccess:async()=>{
     await client.invalidateQueries({queryKey:listKey(userId)});
     await client.invalidateQueries({queryKey:["release-list-items",userId]});
   }});
 const execute=async(action:()=>Promise<unknown>,success:string)=>{
   setError("");setNotice("");
   try{await mutation.mutateAsync(action);setNotice(success);}
   catch(reason){setError(reason instanceof Error?reason.message:"Não foi possível salvar.");}
 };
 useEffect(()=>{setSelected("");setExcluded([]);setManaged("");},[userId]);
 useEffect(()=>{
   if(!selected||!activeItems.isSuccess)return;
   const names=activeItems.data.filter(x=>x.ativo&&!excluded.includes(x.id))
     .map(x=>x.nome).join("\n");
   onChange(names);
 // Depend only on fetched data and checked identifiers; changing a manual
 // override must not trigger a reapply of the saved preset.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[selected,activeItems.data,activeItems.isSuccess,excluded]);
 const choose=(id:string)=>{
   setSelected(id);setExcluded([]);
   if(!id)onChange("");
 };
 const changeChecked=(id:string,checked:boolean)=>{
   setExcluded(current=>checked?current.filter(x=>x!==id):[...new Set([...current,id])]);
 };
 function openManage(){
   setManageOpen(true);setError("");setNotice("");
   setManaged(selected);setRename(currentList?.nome??"");
 }
 function chooseManage(id:string){
   setManaged(id);setRename(lists.data?.find(x=>x.id===id)?.nome??"");
   setError("");setNotice("");setItemName("");
 }
 return <div className="qa-release-lists">
   <div className="qa-release-list-heading">
     <label htmlFor="release-saved-list">Equipe / sprints</label>
     <Button size="sm" variant="secondary" onPress={openManage}>
       <Settings2 size={15} aria-hidden="true"/> Gerenciar listas
     </Button>
   </div>
   <select id="release-saved-list" value={selected} onChange={event=>choose(event.target.value)}
     disabled={!userId||lists.isPending} aria-describedby="release-saved-list-help">
     <option value="">Selecionar lista cadastrada (opcional)</option>
     {(lists.data??[]).map(list=><option key={list.id} value={list.id}>
       {titleFor(list.escopo)} · {list.nome}
     </option>)}
   </select>
   <p id="release-saved-list-help" className="qa-release-helper">
     {lists.isPending?"Carregando suas listas…":
       lists.isError?"Não foi possível buscar as listas. A entrada manual continua disponível.":
       selected?"Escolha os nomes que devem participar desta organização.":
       "Use uma lista pessoal, da sua equipe ou disponibilizada pela administração."}
   </p>
   {lists.isError&&<p className="qa-release-error" role="alert">{lists.error.message}</p>}
   {selected&&<div className="qa-release-preset">
     {activeItems.isPending?<p role="status">Carregando nomes…</p>:
       activeItems.isError?<p role="alert">Não foi possível carregar os nomes: {activeItems.error.message}</p>:
       !active.length?<p className="qa-release-helper">Esta lista está vazia. Adicione nomes em Gerenciar listas.</p>:
       <>
         <div className="qa-release-preset-head">
           <strong>{currentList?.nome??"Lista selecionada"}</strong>
           <span>{chosen.length} de {active.length} selecionados</span>
         </div>
         <div className="qa-release-options" role="group" aria-label="Nomes para esta release">
           {active.map(item=><label key={item.id} className="qa-release-option">
             <input type="checkbox" checked={!excluded.includes(item.id)}
               onChange={e=>changeChecked(item.id,e.target.checked)}/>
             <span>{item.nome}</span>
           </label>)}
         </div>
       </>}
   </div>}
   <details className="qa-release-manual">
     <summary>{selected?"Ajustar nomes somente nesta release":"Informar nomes manualmente"}</summary>
     <label className="field" htmlFor="release-free-names">Um nome por linha
       <textarea id="release-free-names" rows={3} maxLength={10000}
         value={value} onChange={event=>onChange(event.target.value)}
         placeholder={"Sprint Financeiro\nSprint Fiscal\nSprint Integrações"}/>
     </label>
     <p className="qa-release-helper">Esta edição não altera a lista cadastrada.</p>
   </details>
   <QAModal open={manageOpen} title="Gerenciar listas de equipe e sprints" size="lg"
     busy={mutation.isPending} onClose={()=>setManageOpen(false)}>
     <div className="qa-release-manager">
       <p className="qa-release-helper">Salve listas para reutilizar em outras releases.
         Listas pessoais são privadas; listas de equipe são compartilhadas com integrantes;
         listas globais são mantidas por administradores.</p>
       <section className="qa-release-manager-panel" aria-label="Criar uma lista">
         <h3><FolderPlus size={18}/> Nova lista</h3>
         <form onSubmit={event=>{
           event.preventDefault();
           void execute(async()=>{
             const id=await createReleaseList(userId,name,scope,teamId||null);
             setName("");setManaged(id);setSelected(id);setExcluded([]);
           },"Lista criada.");
         }}>
           <label className="field">Nome da lista
             <input value={name} onChange={event=>setName(event.target.value)}
               minLength={2} maxLength={90} placeholder="Ex.: Sprints do financeiro" required/>
           </label>
           <div className="qa-release-manager-columns">
             <label className="field">Visibilidade
               <select value={scope} onChange={e=>setScope(e.target.value as ReleaseListScope)}>
                 <option value="pessoal">Só eu</option>
                 {ownedTeams.length>0&&<option value="equipe">Integrantes de uma equipe</option>}
                 {admin.data===true&&<option value="global">Todos os usuários</option>}
               </select>
             </label>
             {scope==="equipe"&&<label className="field">Equipe
               <select value={teamId} onChange={e=>setTeamId(e.target.value)} required>
                 <option value="">Escolher equipe…</option>
                 {ownedTeams.map(t=><option key={t.id} value={t.id}>{t.nome}</option>)}
               </select>
             </label>}
           </div>
           <div className="qa-release-manager-actions">
             <Button type="submit" isDisabled={mutation.isPending||name.trim().length<2||
               (scope==="equipe"&&!teamId)}>
               <Plus size={16}/> Criar lista
             </Button>
           </div>
         </form>
         {teamList.isError&&<p role="alert" className="qa-release-error">{teamList.error.message}</p>}
         {admin.isError&&<p role="alert" className="qa-release-error">Não foi possível verificar a permissão global.</p>}
       </section>
       <section className="qa-release-manager-panel" aria-label="Editar listas">
         <h3><BookOpen size={18}/> Listas disponíveis</h3>
         <label className="field">Escolha uma lista
           <select value={managed} onChange={event=>chooseManage(event.target.value)}>
             <option value="">Escolher…</option>
             {(lists.data??[]).map(list=><option key={list.id} value={list.id}>
               {titleFor(list.escopo)} · {list.nome}
             </option>)}
           </select>
         </label>
         {managedList&&<div className="qa-release-manage-details">
           <div className="qa-release-manage-status">
             <span><Users size={15}/> {titleFor(managedList.escopo)}</span>
             {canManage(managedList)?"Você pode editar esta lista.":"Lista somente leitura."}
           </div>
           {canManage(managedList)&&<form className="qa-release-rename"
             onSubmit={event=>{event.preventDefault();
               void execute(()=>renameReleaseList(managed,rename),"Nome da lista atualizado.");
             }}>
             <label className="field">Renomear lista
               <input value={rename} onChange={event=>setRename(event.target.value)}
                 minLength={2} maxLength={90} required/>
             </label>
             <Button type="submit" variant="secondary" isDisabled={mutation.isPending||rename.trim().length<2}>
               Salvar nome
             </Button>
           </form>}
           <p className="qa-release-manage-caption">Nomes da lista</p>
           {managedItems.isPending?<p role="status">Carregando nomes…</p>:
             managedItems.isError?<p role="alert">{managedItems.error.message}</p>:
             !managedItems.data?.length?<p className="qa-release-helper">Nenhum nome cadastrado.</p>:
             <ul className="qa-release-manage-items">
               {managedItems.data.map(item=><li key={item.id}>
                 <span><Check size={15} aria-hidden="true"/>{item.nome}</span>
                 {canManage(managedList)&&<Button size="sm" variant="secondary"
                   aria-label={"Excluir "+item.nome} isDisabled={mutation.isPending}
                   onPress={()=>{
                     if(window.confirm('Excluir "'+item.nome+'" desta lista?'))
                       void execute(()=>removeReleaseItem(item.id),"Nome excluído.");
                   }}><Trash2 size={15} aria-hidden="true"/></Button>}
               </li>)}
             </ul>}
           {canManage(managedList)&&<>
             <form className="qa-release-add-name" onSubmit={event=>{
               event.preventDefault();
               void execute(async()=>{
                 await addReleaseItem(managed,itemName,
                   Math.max(0,...(managedItems.data??[]).map(item=>item.ordem))+1);
                 setItemName("");
               },"Nome adicionado.");
             }}>
               <label className="field">Adicionar um nome
                 <input value={itemName} maxLength={90} minLength={2} required
                   onChange={event=>setItemName(event.target.value)}
                   placeholder="Ex.: Sprint de integrações"/>
               </label>
               <Button type="submit" isDisabled={mutation.isPending||itemName.trim().length<2}>
                 <Plus size={16}/> Adicionar
               </Button>
             </form>
             <div className="qa-release-danger">
               <Button size="sm" variant="secondary" isDisabled={mutation.isPending}
                 onPress={()=>{
                   if(window.confirm('Excluir a lista "'+managedList.nome+'" e todos os seus nomes?'))
                     void execute(async()=>{
                       await removeReleaseList(managed);
                       if(selected===managed){setSelected("");onChange("");}
                       setManaged("");
                     },"Lista excluída.");
                 }}><Trash2 size={15}/> Excluir lista</Button>
             </div>
           </>}
         </div>}
       </section>
       <ToastNotice message={notice} tone="success"/>
       <ToastNotice message={error} tone="error"/>
     </div>
   </QAModal>
 </div>;
}
