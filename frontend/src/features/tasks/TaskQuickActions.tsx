import {useEffect,useRef,useState} from "react";
import type {KeyboardEvent} from "react";
import {
  BookText,ClipboardList,FileText,FolderOpen,GitBranchPlus,GitMerge,History,
  ListChecks,Plus,Sparkles,Users,Workflow,X
} from "lucide-react";

export type QuickActionId=
  "run"|"scenario"|"cases"|"post"|"diagram"|"report"|"view-diagrams"|
  "documents"|"evidence"|"requirements"|"links"|"history"|"collaboration";

const groups:{label:string;items:{id:QuickActionId;label:string;icon:typeof Plus;ownerOnly?:boolean}[]}[]=[
  {label:"Testes",items:[
    {id:"run",label:"Executar testes",icon:ListChecks},
    {id:"scenario",label:"Novo cenário",icon:Plus,ownerOnly:true},
    {id:"cases",label:"Gerar casos com IA",icon:Sparkles,ownerOnly:true}
  ]},
  {label:"Criar",items:[
    {id:"post",label:"Gerar post com IA",icon:FileText,ownerOnly:true},
    {id:"diagram",label:"Criar diagrama",icon:GitBranchPlus,ownerOnly:true},
    {id:"report",label:"Gerar relatório",icon:ClipboardList,ownerOnly:true}
  ]},
  {label:"Consultar",items:[
    {id:"view-diagrams",label:"Visualizar diagramas",icon:Workflow},
    {id:"documents",label:"Posts e relatórios salvos",icon:FolderOpen},
    {id:"evidence",label:"Evidências",icon:ClipboardList},
    {id:"requirements",label:"Requisitos",icon:BookText},
    {id:"links",label:"Releases e referências",icon:GitMerge},
    {id:"history",label:"Histórico de execuções",icon:History},
    {id:"collaboration",label:"Equipe e comentários",icon:Users}
  ]}
];

export function TaskQuickActions({owner,canExecute,onAction}:{
  owner:boolean;canExecute:boolean;onAction:(action:QuickActionId)=>void;
}){
  const [open,setOpen]=useState(false);
  const root=useRef<HTMLDivElement>(null);
  const trigger=useRef<HTMLButtonElement>(null);
  useEffect(()=>{
    if(!open)return;
    const frame=requestAnimationFrame(()=>root.current?.querySelector<HTMLButtonElement>(
      ".qa-task-fab-items button:not(:disabled)")?.focus());
    function dismiss(event:PointerEvent){
      if(event.target instanceof Node&&!root.current?.contains(event.target))setOpen(false);
    }
    function keydown(event:globalThis.KeyboardEvent){
      if(event.key!=="Escape")return;
      event.preventDefault();setOpen(false);trigger.current?.focus();
    }
    document.addEventListener("pointerdown",dismiss);
    document.addEventListener("keydown",keydown);
    return ()=>{
      cancelAnimationFrame(frame);
      document.removeEventListener("pointerdown",dismiss);
      document.removeEventListener("keydown",keydown);
    };
  },[open]);
  function choose(action:QuickActionId){
    setOpen(false);onAction(action);
  }
  function menuKeyboard(event:KeyboardEvent<HTMLDivElement>){
    if(event.key!=="ArrowDown"&&event.key!=="ArrowUp")return;
    event.preventDefault();
    const items=Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>(
      "button:not(:disabled)"
    ));
    const index=items.indexOf(document.activeElement as HTMLButtonElement);
    items[(index+(event.key==="ArrowDown"?1:-1)+items.length)%items.length]?.focus();
  }
  return <div className="qa-task-fab" ref={root}>
    {open&&<div id="qa-task-quick-menu" className="qa-task-fab-menu"
      role="group" aria-label="Ações rápidas da TF" onKeyDown={menuKeyboard}>
      <div className="qa-task-fab-heading">
        <strong>Ações rápidas</strong>
        <button type="button" aria-label="Fechar ações rápidas"
          onClick={()=>{setOpen(false);trigger.current?.focus();}}>
          <X size={17} aria-hidden="true"/>
        </button>
      </div>
      <div className="qa-task-fab-items">
        {groups.map(group=>{
          const items=group.items.filter(item=>!item.ownerOnly||owner);
          if(!items.length)return null;
          return <div key={group.label} className="qa-task-fab-section"
            role="group" aria-label={group.label}>
            <p className="qa-task-fab-section-label" aria-hidden="true">{group.label}</p>
            {items.map(item=>{
              const Icon=item.icon;
              return <button key={item.id} type="button"
                disabled={item.id==="run"&&!canExecute}
                onClick={()=>choose(item.id)}>
                <Icon size={17} aria-hidden="true"/><span>{item.label}</span>
              </button>;
            })}
          </div>;
        })}
      </div>
    </div>}
    <button ref={trigger} type="button" className="qa-task-fab-trigger"
      aria-controls={open?"qa-task-quick-menu":undefined} aria-expanded={open}
      aria-label={open?"Recolher ações rápidas":"Abrir ações rápidas da TF"}
      onClick={()=>setOpen(value=>!value)}>
      {open?<X size={20} aria-hidden="true"/>:<Plus size={21} aria-hidden="true"/>}
      <span>{open?"Fechar":"Ações"}</span>
    </button>
  </div>;
}
