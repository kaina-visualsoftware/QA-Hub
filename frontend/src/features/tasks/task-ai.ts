import type {UseFormReturn} from "react-hook-form";
import type {Scenario,TaskDraft} from "../../lib/contracts";
import {normalizeDraft} from "../../lib/legacy/qa-assistant.mjs";
import type {LocalDraft} from "../../lib/legacy/qa-assistant.mjs";
import {supabase} from "../../lib/supabase";

export type SuggestedScenario={
  titulo:string;passos:string;esperado:string;observacoes:string;selected:boolean;
};

const FIELD_LIMITS:Readonly<Partial<Record<keyof TaskDraft,number>>>={
  titulo:240,codigo:100,sistema:160,versao:100,
  ambiente:240,base_teste:240,empresa:240,testador:240,
  explicacao:30000,causa:30000,correcao:30000,
  conclusao:30000,observacoes:30000
};

/**
 * Apply all AI-derived structured fields to the actual React Hook Form.
 * The description is left untouched as it contains the source report that
 * the user pasted; never destroy that source while regenerating.
 */
export function applyTaskAiFields(
  form:Pick<UseFormReturn<TaskDraft>,"setValue">,
  draft:LocalDraft
):number{
  let applied=0;
  for(const [name,limit] of Object.entries(FIELD_LIMITS)){
    const value=draft.fields[name]?.trim();
    if(!value)continue;
    form.setValue(name as keyof typeof FIELD_LIMITS,value.slice(0,limit),{
      shouldValidate:true,shouldDirty:true,shouldTouch:true
    });
    applied++;
  }
  if(draft.fields.tipo_teste==="BUILD"||draft.fields.tipo_teste==="RELEASE"){
    form.setValue("tipo_teste",draft.fields.tipo_teste,{
      shouldValidate:true,shouldDirty:true,shouldTouch:true
    });
    applied++;
  }
  return applied;
}

function identity(item:Pick<SuggestedScenario,"titulo"|"passos"|"esperado">){
  return [item.titulo,item.passos,item.esperado]
    .map(text=>text.toLocaleLowerCase("pt-BR").trim().replace(/\s+/g," ")).join("\u0000");
}

export function freshTaskAiScenarios(
  draft:LocalDraft,existing:Pick<Scenario,"titulo"|"passos"|"esperado">[]=[],
  selected=true
):SuggestedScenario[]{
  const seen=new Set(existing.map(identity));
  const fresh:SuggestedScenario[]=[];
  for(const item of draft.cenarios){
    const scenario={
      titulo:item.titulo.trim().slice(0,240),
      passos:item.passos.trim().slice(0,20000),
      esperado:item.esperado.trim().slice(0,20000),
      observacoes:item.observacoes.trim().slice(0,20000),
      selected
    };
    if(scenario.titulo.length<3||!scenario.passos||!scenario.esperado)continue;
    const key=identity(scenario);
    if(seen.has(key))continue;
    seen.add(key);
    fresh.push(scenario);
  }
  return fresh;
}

/** Recheck after refresh, because existing tests can change during an AI review. */
export function onlyNewTaskAiSelections(
  selected:SuggestedScenario[],existing:Pick<Scenario,"titulo"|"passos"|"esperado">[]
):SuggestedScenario[]{
  const seen=new Set(existing.map(identity));
  return selected.filter(item=>{
    const key=identity(item);
    if(seen.has(key))return false;
    seen.add(key);
    return true;
  });
}

export async function generateTaskAiDraft(text:string):Promise<LocalDraft>{
  const source=text.trim();
  if(!source||source.length>20000)
    throw Error("Informe uma descrição de até 20.000 caracteres para gerar com IA.");
  const {data,error}=await supabase.functions.invoke("qa-ai",{
    body:{text:source},signal:AbortSignal.timeout(65000)
  });
  if(error){
    let detail:{message?:string;error?:string}={};
    try{detail=await error.context?.json?.()??{};}catch{}
    if(detail.error==="nvidia_not_configured")
      throw Error("A NVIDIA ainda não está configurada. Preencha manualmente ou tente mais tarde.");
    throw Error(detail.message||"Falha ao analisar a TF com IA NVIDIA.");
  }
  const raw=data?.draft;
  if(data?.fallback||data?.provider!=="NVIDIA Build"||
    !raw||typeof raw!=="object"||Array.isArray(raw)||!Object.keys(raw).length)
    throw Error("A NVIDIA não retornou campos válidos. Gere novamente ou preencha manualmente.");
  const draft=normalizeDraft(raw);
  if(!Object.keys(draft.fields).length&&!draft.cenarios.length)
    throw Error("A NVIDIA não identificou dados suficientes. Revise o texto de origem.");
  return draft;
}
