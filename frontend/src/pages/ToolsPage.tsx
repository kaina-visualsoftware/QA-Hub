import { useState } from "react";
import { ArrowLeftRight, FileCode2, NotebookPen, PackageCheck } from "lucide-react";
import { useAuth } from "../features/auth/AuthProvider";
import ComparisonTool from "../features/links/ComparisonTool";
import ReleaseOrganizer from "../features/links/ReleaseOrganizer";
import ReferenceLibrary from "../features/links/ReferenceLibrary";

type Tool="release"|"text"|"xml"|"notes";
const tools=[
  {id:"release" as const,label:"Releases",Icon:PackageCheck},
  {id:"text" as const,label:"Comparar textos",Icon:ArrowLeftRight},
  {id:"xml" as const,label:"Comparar XML",Icon:FileCode2},
  {id:"notes" as const,label:"Informações",Icon:NotebookPen}
];
export default function ToolsPage(){
  const {user}=useAuth();
  const [tab,setTab]=useState<Tool>("release");
  const [version,setVersion]=useState("");
  return <div className="page qa-tools-page">
    <div className="page-heading"><div><p className="eyebrow">UTILITÁRIOS LOCAIS</p>
      <h1>Ferramentas</h1>
      <p className="text-muted text-sm">Recursos independentes de uma tarefa. Posts, cenários e diagramas
        continuam dentro de Tarefas.</p>
    </div></div>
    <div className="qa-tools-layout">
      <nav className="qa-tools-menu" aria-label="Ferramentas disponíveis">
        {tools.map(({id,label,Icon})=><button type="button" key={id}
          aria-current={tab===id?"page":undefined}
          className={"qa-tools-nav-item "+(tab===id?"selected":"")} onClick={()=>setTab(id)}>
          <Icon size={18} aria-hidden="true"/>{label}</button>)}
      </nav>
      <section className="panel qa-tools-content" aria-label="Ferramenta selecionada">
        {tab==="release"&&<div className="stack">
          <div><h2 className="font-semibold">Lista e comunicado de release</h2>
            <p className="text-muted text-sm mt-2">Organize listas, confira comunicados e gere BBCode
              no navegador, sem vincular automaticamente nenhuma TF.</p></div>
          <label className="field">Versão da release
            <input value={version} maxLength={40} placeholder="12.10.06.0000"
              onChange={event=>setVersion(event.target.value)}/></label>
          <ReleaseOrganizer version={version} expanded/>
        </div>}
        {tab==="text"&&<ComparisonTool key="text" initialMode="text"/>}
        {tab==="xml"&&<ComparisonTool key="xml" initialMode="xml"/>}
        {tab==="notes"&&<ReferenceLibrary userId={user?.id??""}/>}
      </section>
    </div>
  </div>;
}
