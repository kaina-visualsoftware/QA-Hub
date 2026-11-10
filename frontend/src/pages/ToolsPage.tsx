import { useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { Button } from "@heroui/react";
import {
  ArrowLeftRight, BookOpenText, FileCheck2, FileDiff,
  LockKeyhole, NotebookPen, PackageCheck, Plus
} from "lucide-react";
import { useAuth } from "../features/auth/AuthProvider";
import { QAModal } from "../components/ui/QAModal";
import { ToastNotice } from "../components/ui/Toasts";
import { VersionInput } from "../components/ui/VersionInput";
import { normalizeTaskVersion } from "../lib/task-version";
import ComparisonTool from "../features/links/ComparisonTool";
import ReleaseOrganizer from "../features/links/ReleaseOrganizer";
import ReferenceLibrary from "../features/links/ReferenceLibrary";
import type { Reference } from "../features/links/ReferenceLibrary";

type Tool = "release" | "comparison" | "notes";
const tools = [
  {
    id: "release", label: "Releases", description: "Organizar listas e comunicados",
    Icon: PackageCheck
  },
  {
    id: "comparison", label: "Comparações", description: "Conferir diferenças de texto e XML",
    Icon: ArrowLeftRight
  },
  {
    id: "notes", label: "Informações", description: "Consultar regras, notas e checklists",
    Icon: NotebookPen
  }
] as const;

function onTabKeyDown(event:KeyboardEvent<HTMLButtonElement>,index:number,
  onChange:(tool:Tool)=>void) {
  const nextIndex = event.key==="ArrowDown" || event.key==="ArrowRight"
    ? (index+1)%tools.length
    : event.key==="ArrowUp" || event.key==="ArrowLeft"
      ? (index+tools.length-1)%tools.length
      : event.key==="Home"?0
        : event.key==="End"?tools.length-1:-1;
  if(nextIndex===-1)return;
  event.preventDefault();
  const id=tools[nextIndex].id;
  onChange(id);
  requestAnimationFrame(()=>document.getElementById("qa-tool-tab-"+id)?.focus());
}

function ToolHeading({icon:Icon,title,description,privacy,children}:{
  icon:typeof PackageCheck;title:string;description:string;privacy?:string;
  children?:ReactNode;
}){
  return <div className="qa-tools-workspace-heading">
    <span className="qa-tools-workspace-icon" aria-hidden="true"><Icon size={23}/></span>
    <div className="qa-tools-workspace-heading-text">
      <h2>{title}</h2>
      <p>{description}</p>
      {privacy&&<span className="qa-tools-privacy">
        <LockKeyhole size={14} aria-hidden="true"/>{privacy}
      </span>}
    </div>
    {children&&<div className="qa-tools-workspace-action">{children}</div>}
  </div>;
}

export default function ToolsPage(){
  const {user}=useAuth();
  const [tab,setTab]=useState<Tool>("release");
  const [version,setVersion]=useState("");
  const [notesOpen,setNotesOpen]=useState(false);
  const [editingNote,setEditingNote]=useState<Reference|null>(null);
  const [notice,setNotice]=useState("");
  function closeNoteModal(){setNotesOpen(false);setEditingNote(null);}
  function editNote(record:Reference){
    setEditingNote(record);
    setNotice("");
    setNotesOpen(true);
  }
  return <div className="page qa-tools-page qa-tools-v2">
    <header className="page-heading qa-tools-page-heading">
      <div>
        <h1>Ferramentas</h1>
        <p>Organize publicações, compare resultados e mantenha suas referências de QA.
          Cada utilitário funciona de forma independente das tarefas.</p>
      </div>
    </header>
    <div className="qa-tools-layout">
      <nav className="qa-tools-menu" aria-label="Ferramentas disponíveis" role="tablist"
        aria-orientation="vertical">
        <div className="qa-tools-menu-header">Escolha uma ferramenta</div>
        {tools.map(({id,label,description,Icon},index)=>
          <button type="button" role="tab" key={id}
            id={"qa-tool-tab-"+id}
            aria-controls={"qa-tool-panel-"+id}
            aria-selected={tab===id} tabIndex={tab===id?0:-1}
            onKeyDown={event=>onTabKeyDown(event,index,setTab)}
            onClick={()=>setTab(id)}
            className={"qa-tools-nav-item "+(tab===id?"selected":"")}>
            <span className="qa-tools-nav-icon" aria-hidden="true"><Icon size={19}/></span>
            <span className="qa-tools-nav-copy">
              <strong>{label}</strong>
              <small>{description}</small>
            </span>
          </button>)}
        <div className="qa-tools-menu-foot">
          <FileCheck2 size={16} aria-hidden="true"/>
          Posts, cenários e diagramas são gerados dentro de cada TF.
        </div>
      </nav>
      <div className="qa-tools-panels">
        <section role="tabpanel" id="qa-tool-panel-release"
          aria-labelledby="qa-tool-tab-release" hidden={tab!=="release"}
          className="qa-tools-content">
          <ToolHeading icon={PackageCheck} title="Releases"
            description="Prepare a lista da versão, revise o comunicado e copie o resultado para publicação."
            privacy="Processamento local. Nenhuma tarefa é vinculada automaticamente."/>
          <div className="qa-tools-workspace-body qa-tools-release">
            <div className="qa-tools-release-version">
              <label className="field">Versão da release
                <VersionInput value={version} onValueChange={setVersion}/>
              </label>
              <p>Digite os números; a versão será formatada como 00.00.00.0000.</p>
            </div>
            <ReleaseOrganizer version={normalizeTaskVersion(version)} expanded/>
          </div>
        </section>
        <section role="tabpanel" id="qa-tool-panel-comparison"
          aria-labelledby="qa-tool-tab-comparison" hidden={tab!=="comparison"}
          className="qa-tools-content">
          <ToolHeading icon={FileDiff} title="Comparações"
            description="Compare o conteúdo original com o atualizado e identifique exatamente o que mudou."
            privacy="Textos e XML são processados somente no navegador."/>
          <div className="qa-tools-workspace-body qa-tools-comparison">
            <ComparisonTool initialMode="text" embedded/>
          </div>
        </section>
        <section role="tabpanel" id="qa-tool-panel-notes"
          aria-labelledby="qa-tool-tab-notes" hidden={tab!=="notes"}
          className="qa-tools-content">
          <ToolHeading icon={BookOpenText} title="Informações importantes"
            description="Sua biblioteca de notas, regras de negócio e checklists para consultas rápidas."
            privacy="Registros privados da conta, armazenados com controle de acesso.">
            <Button onPress={()=>{setEditingNote(null);setNotice("");setNotesOpen(true);}}>
              <Plus size={17} aria-hidden="true"/> Nova informação
            </Button>
          </ToolHeading>
          <div className="qa-tools-workspace-body qa-tools-notes">
            <ReferenceLibrary userId={user?.id??""} view="list" onEdit={editNote}/>
            <ToastNotice message={notice} tone="success"/>
          </div>
        </section>
      </div>
    </div>
    <QAModal open={notesOpen}
      title={editingNote?"Editar informação":"Nova informação"} eyebrow="BIBLIOTECA DE QA"
      size="md" description={editingNote?
        "Altere a categoria, o título ou o conteúdo deste registro.":
        "Registre uma regra, nota ou checklist para consultar depois."}
      onClose={closeNoteModal}>
      {notesOpen&&<ReferenceLibrary key={editingNote?.id??"new"}
        userId={user?.id??""} view="form" initial={editingNote}
        onSaved={()=>{
          setNotice(editingNote?"Informação atualizada com sucesso.":
            "Informação privada salva na biblioteca.");
          closeNoteModal();
        }}/>}
    </QAModal>
  </div>;
}
