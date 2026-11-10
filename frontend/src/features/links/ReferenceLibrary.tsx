import { useMemo, useState } from "react";
import {ToastNotice} from "../../components/ui/Toasts";
import { Button } from "@heroui/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Clipboard, NotebookPen, Save, Trash2 } from "lucide-react";
import { z } from "zod";
import { createReference, validateReference } from "../../lib/legacy/qa-phase3.mjs";
import { supabase } from "../../lib/supabase";

const referenceSchema=z.object({
  id:z.uuid(),categoria:z.enum(["checklist","regra","nota"]),
  titulo:z.string(),conteudo:z.string(),created_at:z.string()
});
type Reference=z.infer<typeof referenceSchema>;
async function fetchReferences(userId:string):Promise<Reference[]>{
  const {data,error}=await supabase.from("qa_referencias")
    .select("id,categoria,titulo,conteudo,created_at").eq("user_id",userId)
    .order("created_at",{ascending:false}).limit(101);
  if(error)throw error;
  if((data??[]).length>100)throw Error("Mais de 100 referências: acesse o histórico completo no legado.");
  return z.array(referenceSchema).parse(data??[]);
}
export default function ReferenceLibrary({userId,view="all",onCreated}:{
  userId:string;view?:"all"|"list"|"form";onCreated?:()=>void;
}){
  const client=useQueryClient();
  const [category,setCategory]=useState<Reference["categoria"]>("nota");
  const [title,setTitle]=useState("");
  const [content,setContent]=useState("");
  const [search,setSearch]=useState("");
  const [message,setMessage]=useState("");
  const [failure,setFailure]=useState("");
  const [deleting,setDeleting]=useState<string|null>(null);
  const references=useQuery({queryKey:["qa-references",userId],
    queryFn:()=>fetchReferences(userId),enabled:!!userId});
  const filtered=useMemo(()=>references.data?.filter(item=>{
    const text=(item.titulo+" "+item.conteudo+" "+item.categoria).toLocaleLowerCase("pt-BR");
    return text.includes(search.toLocaleLowerCase("pt-BR").trim());
  })??[],[references.data,search]);
  const save=useMutation({
    mutationFn:()=>{
      const valid=validateReference({titulo:title,conteudo:content,categoria:category});
      return createReference(supabase,{userId,...valid});
    },
    onSuccess:async()=>{
      setTitle("");setContent("");setFailure("");setMessage("Referência privada salva.");
      await client.invalidateQueries({queryKey:["qa-references",userId]});
      onCreated?.();
    },
    onError:(error)=>setFailure(error.message)
  });
  async function remove(item:Reference){
    if(!window.confirm("Excluir a referência '"+item.titulo+"'?"))return;
    setMessage("");setFailure("");setDeleting(item.id);
    try{
      const {data,error}=await supabase.from("qa_referencias").delete()
        .eq("id",item.id).eq("user_id",userId).select("id").maybeSingle();
      if(error)throw error;
      if(!data)throw Error("Referência indisponível ou sem permissão.");
      await client.invalidateQueries({queryKey:["qa-references",userId]});
      setMessage("Referência excluída.");
    }catch(reason){setFailure(reason instanceof Error?reason.message:"Não foi possível excluir.");}
    finally{setDeleting(null);}
  }
  async function copy(content:string){
    try{await navigator.clipboard.writeText(content);setMessage("Conteúdo copiado.");setFailure("");}
    catch{setFailure("Permissão de copiar indisponível neste navegador.");}
  }
  return <section className="stack qa-references"
    aria-labelledby={view==="all"?"references-heading":undefined}
    aria-label={view==="list"?"Biblioteca de informações":view==="form"?"Cadastro de informação":undefined}>
    {view==="all"&&<div><h2 id="references-heading" className="font-semibold">Informações importantes</h2>
      <p className="text-muted text-sm mt-2">Checklists, regras e notas privadas da sua conta.
        Não guarde senhas, tokens ou dados pessoais neste cadastro.</p></div>}
    {view!=="list"&&<form className="generator-context stack" onSubmit={event=>{event.preventDefault();void save.mutateAsync();}}>
      <h3 className="font-semibold flex items-center gap-2"><NotebookPen size={17}/> {view==="form"?"Dados da informação":"Nova referência"}</h3>
      {view==="form"&&<p className="text-muted text-sm">
        Não inclua senhas, tokens nem dados pessoais.</p>}
      <div className="form-grid">
        <label className="field">Categoria<select value={category}
          onChange={event=>setCategory(event.target.value as Reference["categoria"])}>
          <option value="nota">Nota</option><option value="regra">Regra</option>
          <option value="checklist">Checklist</option></select></label>
        <label className="field grow-2">Título<input value={title} maxLength={160}
          placeholder="Ex.: Conferência de descontos" onChange={event=>setTitle(event.target.value)}/></label>
      </div>
      <label className="field">Conteúdo
        <textarea rows={4} maxLength={2000} value={content} onChange={event=>setContent(event.target.value)}/>
      </label>
      <div><Button type="submit" isDisabled={save.isPending||title.trim().length<3||content.trim().length<3}>
        <Save size={16}/> {view==="form"?"Salvar informação":"Salvar referência"}
      </Button></div>
    </form>}
    {view!=="form"&&<>
    <label className="field">Pesquisar registros
      <input type="search" value={search} onChange={event=>setSearch(event.target.value)}
        placeholder="Título, categoria ou texto"/>
    </label>
    <h3 className="font-semibold">Referências da conta</h3>
    {references.isPending&&<p role="status">Carregando referências…</p>}
    {references.isError&&<p role="alert" className="notice error">{references.error.message}</p>}
    {references.isSuccess&&filtered.length===0&&<p className="text-muted text-sm">
      {search?"Nenhum registro encontrado.":"Nenhuma referência privada registrada."}
    </p>}
    {filtered.map(item=><article key={item.id} className="requirement-row">
      <div className="section-heading"><div><strong>{item.titulo}</strong>
        <p className="text-muted text-sm">{item.categoria}</p></div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onPress={()=>void copy(item.conteudo)}>
            <Clipboard size={14}/> Copiar</Button>
          <Button variant="secondary" size="sm" isDisabled={deleting===item.id}
            onPress={()=>void remove(item)}><Trash2 size={14}/> Excluir</Button>
        </div>
      </div>
      <p className="text-sm mt-3 qa-reference-text">{item.conteudo}</p>
    </article>)}
    </>}
    <ToastNotice message={message} tone="success"/>
    <ToastNotice message={failure} tone="error"/>
  </section>;
}
