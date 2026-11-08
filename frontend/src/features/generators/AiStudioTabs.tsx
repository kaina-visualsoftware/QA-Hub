import { FileText, ListChecks, Workflow } from "lucide-react";

export type AiStudioMode = "teste" | "post" | "diagrams";
const modes = [
  {id:"teste" as const, label:"Casos", Icon:ListChecks},
  {id:"post" as const, label:"Post", Icon:FileText},
  {id:"diagrams" as const, label:"Diagrama", Icon:Workflow}
];
export function AiStudioTabs({active,onChange}:{
  active:AiStudioMode;
  onChange:(next:AiStudioMode)=>void;
}) {
  return <nav className="qa-ai-studio-tabs" aria-label="Ferramentas da central de IA">
    {modes.map(({id,label,Icon})=><button type="button" key={id}
      className={active===id?"selected":""} aria-current={active===id?"page":undefined}
      onClick={()=>onChange(id)}>
      <Icon size={18} aria-hidden="true"/>{label}
    </button>)}
  </nav>;
}
