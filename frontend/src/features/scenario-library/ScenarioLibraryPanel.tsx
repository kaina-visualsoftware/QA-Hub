import "./scenario-library.css";
import {ToastNotice} from "../../components/ui/Toasts";
import {useMemo,useState} from "react";
import {useMutation,useQuery,useQueryClient} from "@tanstack/react-query";
import {Button} from "@heroui/react";
import {BookCopy,Save} from "lucide-react";
import type {Scenario,Task} from "../../lib/contracts";
import {
  listScenarioModels,removeScenarioModel,saveScenarioModel,useScenarioModel
} from "./scenario-model-data";

export default function ScenarioLibraryPanel({task,scenarios,userId,onImported}:{
  task:Task;scenarios:Scenario[];userId:string;onImported:()=>Promise<void>;
}){
  const owner=task.user_id===userId;
  const client=useQueryClient();
  const [mode,setMode]=useState<"use"|"save">("use");
  const [term,setTerm]=useState("");
  const [selected,setSelected]=useState("");
  const [notice,setNotice]=useState("");
  const [error,setError]=useState("");
  const listing=useQuery({
    queryKey:["qa-scenario-models",userId],queryFn:()=>listScenarioModels(userId),
    enabled:owner
  });
  const visible=useMemo(()=>{
    const needle=term.trim().toLocaleLowerCase("pt-BR");
    return (listing.data??[]).filter(item=>!needle||
      [item.titulo,item.modulo,item.tipo_teste,item.passos].some(text=>
        text.toLocaleLowerCase("pt-BR").includes(needle)));
  },[listing.data,term]);
  const saving=useMutation({
    mutationFn:async()=>{
      const scenario=scenarios.find(item=>item.id===selected);
      if(!scenario)throw Error("Selecione um cenário existente.");
      return saveScenarioModel(userId,task,scenario);
    },
    onSuccess:async()=>{
      setNotice("Modelo salvo na biblioteca privada.");setError("");
      setSelected("");setMode("use");
      await client.invalidateQueries({queryKey:["qa-scenario-models",userId]});
    },
    onError:reason=>setError(reason.message)
  });
  const importing=useMutation({
    mutationFn:async(id:string)=>{
      const template=listing.data?.find(item=>item.id===id);
      if(!template)throw Error("Modelo indisponível.");
      const order=Math.max(0,...scenarios.map(item=>item.ordem))+1;
      await useScenarioModel(userId,task,template,order);
    },
    onSuccess:async()=>{
      setNotice("Cenário adicionado como pendente. Nenhum resultado foi copiado.");
      setError("");await onImported();
    },
    onError:reason=>setError(reason.message)
  });
  const removing=useMutation({
    mutationFn:(id:string)=>removeScenarioModel(userId,id),
    onSuccess:async()=>{
      setNotice("Modelo removido apenas da biblioteca.");
      setError("");await client.invalidateQueries({queryKey:["qa-scenario-models",userId]});
    },
    onError:reason=>setError(reason.message)
  });
  if(!owner)return <p className="notice error" role="alert">
    A biblioteca pertence ao proprietário da TF.</p>;
  const busy=saving.isPending||importing.isPending||removing.isPending;
  return <div className="qa-f6-library" aria-label="Biblioteca de cenários">
    <p className="text-muted text-sm">Reutilize roteiros nesta conta.
      O novo cenário começa sempre pendente, sem resultado observado ou evidências.</p>
    <div className="qa-f6-library-tabs" role="group" aria-label="Ações da biblioteca">
      <button type="button" aria-pressed={mode==="use"}
        className={mode==="use"?"selected":""} onClick={()=>{setMode("use");setError("");}}>
        <BookCopy size={16} aria-hidden="true"/> Usar modelo
      </button>
      <button type="button" aria-pressed={mode==="save"}
        className={mode==="save"?"selected":""} onClick={()=>{setMode("save");setError("");}}>
        <Save size={16} aria-hidden="true"/> Salvar cenário
      </button>
    </div>
    {mode==="save"&&<form className="qa-f6-library-save" onSubmit={event=>{
      event.preventDefault();
      if(!window.confirm("Salvar passos, resultado esperado e notas na sua biblioteca privada? Revise dados confidenciais antes de continuar."))return;
      saving.mutate();
    }}>
      <label className="field">Cenário desta TF
        <select value={selected} onChange={e=>setSelected(e.target.value)}>
          <option value="">Selecione…</option>
          {scenarios.map(item=><option key={item.id} value={item.id}>{item.titulo}</option>)}
        </select>
      </label>
      <p className="text-muted text-sm">Copia título, passos, esperado e notas.
        Não copia aprovação, falha, observado, anexos ou histórico.</p>
      <Button type="submit" isDisabled={!selected||busy}>Salvar na biblioteca</Button>
    </form>}
    {mode==="use"&&<>
      <label className="field">Buscar modelos
        <input type="search" value={term} placeholder="Nome, módulo ou passos…"
          onChange={e=>setTerm(e.target.value)} maxLength={120}/>
      </label>
      {listing.isPending&&<p role="status">Carregando biblioteca…</p>}
      {listing.isError&&<p role="alert" className="notice error">{listing.error.message}</p>}
      {listing.isSuccess&&visible.length===0&&<p className="text-muted text-sm">
        {listing.data.length===0?
          "Biblioteca vazia. Salve um cenário para reutilizá-lo.":"Nenhum modelo corresponde à busca."}
      </p>}
      {visible.map(item=><article className="qa-f6-library-item" key={item.id}>
        <div><strong>{item.titulo}</strong>
          <small>{item.modulo||"Sem módulo"} · {item.tipo_teste}</small></div>
        <details><summary>Ver roteiro</summary>
          <p><strong>Passos:</strong> {item.passos}</p>
          <p><strong>Esperado:</strong> {item.esperado}</p>
          {item.observacoes&&<p><strong>Notas:</strong> {item.observacoes}</p>}
        </details>
        <div className="qa-f6-library-actions">
          <Button variant="secondary" size="sm" isDisabled={busy}
            onPress={()=>{
              if(window.confirm("Adicionar este modelo como novo cenário pendente na TF?"))
                importing.mutate(item.id);
            }}>Adicionar à TF</Button>
          <Button variant="secondary" size="sm" isDisabled={busy}
            onPress={()=>{
              if(window.confirm("Excluir este modelo privado? Os cenários já criados não serão removidos."))
                removing.mutate(item.id);
            }}>Excluir modelo</Button>
        </div>
      </article>)}
      {listing.data?.length===100&&<small className="text-muted">
        Exibindo os 100 modelos mais recentes desta conta.</small>}
    </>}
    <ToastNotice message={notice} tone="success"/>
    <ToastNotice message={error} tone="error"/>
  </div>;
}
