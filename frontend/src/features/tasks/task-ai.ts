import type {UseFormReturn} from "react-hook-form";
import { normalizeTaskVersion } from "../../lib/task-version";
import type {Scenario,TaskDraft} from "../../lib/contracts";
import {extractLocalDraft,normalizeDraft} from "../../lib/legacy/qa-assistant.mjs";
import type {LocalDraft} from "../../lib/legacy/qa-assistant.mjs";
import {supabase} from "../../lib/supabase";
import {cleanQaSourceText,formatQaSentenceCase} from "../../lib/legacy/qa-text-cleaner.mjs";

export type SuggestedScenario={
  titulo:string;passos:string;esperado:string;observacoes:string;selected:boolean;
};

const FIELD_LIMITS:Readonly<Partial<Record<keyof TaskDraft,number>>>={
  titulo:240,descricao:30000,codigo:100,sistema:160,versao:100,
  ambiente:240,base_teste:240,empresa:240,testador:240,
  explicacao:30000,causa:30000,correcao:30000,
  conclusao:30000,observacoes:30000
};

/** Shared field normalization for new TFs and AI regeneration. */
export function taskAiFieldValues(draft:LocalDraft):Partial<TaskDraft>{
  const fields:Partial<TaskDraft>={};
  for(const [name,limit] of Object.entries(FIELD_LIMITS)){
    const value=draft.fields[name]?.trim();
    if(!value)continue;
    const prose=["titulo","descricao","explicacao","causa","correcao","conclusao","observacoes"];
    const cleaned=prose.includes(name)?formatQaSentenceCase(value):value;
    // Never place the full report, copied UI controls or a test script in the summary.
    const normalized=name==="descricao"
      ?cleaned.replace(/\s*\n+\s*/g," ").replace(/\s+/g," ").slice(0,650).trim()
      :name==="versao" ? normalizeTaskVersion(cleaned.slice(0,limit))
      :cleaned.slice(0,limit);
    if(normalized)(fields as Record<string,string>)[name]=normalized;
  }
  if(draft.fields.tipo_teste==="BUILD"||draft.fields.tipo_teste==="RELEASE")
    fields.tipo_teste=draft.fields.tipo_teste;
  return fields;
}

/** Apply the SAME normalized NVIDIA fields used when regenerating an existing TF.
 * Values typed by the QA win; a new analysis may replace only an earlier AI value
 * that was not subsequently edited. The raw source is archived separately.
 */
export function mergeTaskAiCreation(
  original:TaskDraft,draft:LocalDraft,{
    keepDescription=false,previousAiValues={}
  }:{keepDescription?:boolean;previousAiValues?:Partial<TaskDraft>}={}
):TaskDraft{
  const merged={...original};
  const generated=taskAiFieldValues(draft);
  for(const [name,value] of Object.entries(generated)){
    if(!value||(name==="descricao"&&keepDescription))continue;
    const key=name as keyof TaskDraft;
    const current=String(merged[key]??"");
    const wasGenerated=previousAiValues[key]!==undefined&&current===previousAiValues[key];
    const defaultBuild=name==="tipo_teste"&&current==="BUILD"&&value==="RELEASE";
    // The original source must always give way to a generated summary on the
    // FIRST analysis. On later analyses, preserve a QA-edited summary.
    const freshSummary=name==="descricao"&&previousAiValues.descricao===undefined;
    if(!current.trim()||wasGenerated||defaultBuild||freshSummary){
      (merged as Record<string,string>)[name]=value;
    }
  }
  return merged;
}

/** Use the same structured summaries on creation and regeneration. */
export function applyTaskAiFields(
  form:Pick<UseFormReturn<TaskDraft>,"setValue">,
  draft:LocalDraft
):number{
  const values=taskAiFieldValues(draft);
  for(const [name,value] of Object.entries(values)){
    form.setValue(name as keyof TaskDraft,value as never,{
      shouldValidate:true,shouldDirty:true,shouldTouch:true
    });
  }
  return Object.keys(values).length;
}

function identity(item:Pick<SuggestedScenario,"titulo"|"passos"|"esperado">){
  // Equivalent objectives are the same test even when steps are rewritten.
  return item.titulo.normalize("NFD").replace(/\p{M}/gu,"")
    .toLocaleLowerCase("pt-BR")
    .replace(/^\s*(?:cenario\s*\d+\s*[-—–:.]?\s*|\d+\s*[-—–:.]\s*)/u,"")
    .replace(/[^a-z0-9]+/g," ").trim();
}

export function freshTaskAiScenarios(
  draft:LocalDraft,existing:Pick<Scenario,"titulo"|"passos"|"esperado">[]=[],
  selected=true
):SuggestedScenario[]{
  const seen=new Set(existing.map(identity));
  const fresh:SuggestedScenario[]=[];
  for(const item of draft.cenarios){
    const scenario={
      titulo:formatQaSentenceCase(item.titulo).trim().slice(0,240),
      passos:formatQaSentenceCase(item.passos).trim().slice(0,20000),
      esperado:formatQaSentenceCase(item.esperado).trim().slice(0,20000),
      observacoes:formatQaSentenceCase(item.observacoes).trim().slice(0,20000),
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

const SOURCE_NAME="Fonte original da TF";

/** Archive pasted reports in a protected task source rather than the summary. */
export async function archiveTaskAiSource(taskId:string,userId:string,text:string):Promise<void>{
  const source=text.trim();
  if(source.length<5)throw Error("Fonte original inválida.");
  const {data,error}=await supabase.from("qa_requisito_fontes")
    .select("id,texto_extraido").eq("tarefa_id",taskId)
    .eq("tipo_fonte","texto").eq("nome_arquivo",SOURCE_NAME)
    .order("created_at",{ascending:false}).limit(20);
  if(error)throw Error("Não foi possível consultar a fonte original: "+error.message);
  if(data?.some(row=>row.texto_extraido===source))return;
  const {error:insertError}=await supabase.from("qa_requisito_fontes").insert({
    tarefa_id:taskId,user_id:userId,tipo_fonte:"texto",
    nome_arquivo:SOURCE_NAME,texto_extraido:source
  });
  if(insertError)throw Error("Não foi possível arquivar a fonte original: "+insertError.message);
}

export async function loadTaskAiSource(taskId:string):Promise<string|null>{
  const {data,error}=await supabase.from("qa_requisito_fontes")
    .select("texto_extraido").eq("tarefa_id",taskId)
    .eq("tipo_fonte","texto").eq("nome_arquivo",SOURCE_NAME)
    .order("created_at",{ascending:false}).limit(1).maybeSingle();
  if(error)throw Error("Falha ao carregar a fonte original: "+error.message);
  return data?.texto_extraido||null;
}

export type GeneratedTaskDraft=LocalDraft & {extractionSource:"nvidia"|"local"};

/** The provider can respond with HTTP 200 but no structured content. In that
 * case use the existing deterministic report parser, never an empty "success".
 * The 200k parser ceiling is explicit; long inputs are never silently truncated.
 */
function localSourceDraft(source:string):LocalDraft|null{
  if(source.length>200000)return null;
  try{
    const extracted=extractLocalDraft(source);
    return Object.keys(extracted.fields).length||extracted.cenarios.length?extracted:null;
  }catch{return null;}
}

function completeSourceDraft(fromAi:LocalDraft,local:LocalDraft|null):LocalDraft{
  if(!local)return fromAi;
  const localByTitle=new Map(local.cenarios.map(item=>[identity(item),item]));
  const enriched=fromAi.cenarios.map(item=>{
    const source=localByTitle.get(identity(item));
    if(!source)return item;
    // A partial model reply can omit the expected result of a documented test.
    return {
      ...item,
      passos:item.passos?.trim()?item.passos:source.passos,
      esperado:item.esperado?.trim()?item.esperado:source.esperado,
      observacoes:item.observacoes?.trim()?item.observacoes:source.observacoes
    };
  });
  const known=new Set(enriched.map(identity));
  const additional=local.cenarios.filter(item=>{
    const key=identity(item);
    if(!key||known.has(key))return false;
    known.add(key);
    return true;
  });
  // Never replace meaningful NVIDIA fields or duplicate a source scenario.
  return {
    fields:{...local.fields,...fromAi.fields},
    cenarios:[...enriched,...additional].slice(0,50)
  };
}

export async function generateTaskAiDraft(text:string,{aiText}:{aiText?:string}={}):Promise<GeneratedTaskDraft>{
  const source=text.trim();
  if(!source)throw Error("Informe a descrição da tarefa para gerar com IA.");
  // Preserve the original report separately; do not send copied UI controls to NVIDIA.
  const relevant=cleanQaSourceText(source);
  if(!relevant||relevant.length<10)
    throw Error("A descrição contém apenas elementos de interface. Cole o conteúdo da TF.");
  // For extremely large TFs, the QA reviews an explicit extractive
  // selection before sending it. The full original remains available for the
  // local parser and is archived unchanged once the TF is created.
  const prepared=aiText?cleanQaSourceText(aiText):relevant;
  if(!prepared.trim())throw Error("O contexto preparado da TF está vazio.");
  const {data,error}=await supabase.functions.invoke("qa-ai",{
    body:{text:prepared},signal:AbortSignal.timeout(65000)
  });
  if(error){
    let detail:{message?:string;error?:string}={};
    try{detail=await error.context?.json?.()??{};}catch{}
    if(detail.error==="nvidia_not_configured")
      throw Error("A NVIDIA ainda não está configurada. Preencha manualmente ou tente mais tarde.");
    throw Error(detail.message||"Falha ao analisar a TF com IA NVIDIA.");
  }
  if(data?.provider!=="NVIDIA Build")
    throw Error("A resposta da análise não foi autenticada como NVIDIA Build.");

  const raw=data?.draft;
  const validRaw=!data?.fallback&&raw&&typeof raw==="object"&&!Array.isArray(raw)&&
    Object.keys(raw).length>0;
  const parsed=validRaw?normalizeDraft(raw):null;
  const usefulAi=Boolean(parsed&&(Object.keys(parsed.fields).length||parsed.cenarios.length));
  const local=localSourceDraft(relevant);
  const complete=completeSourceDraft(usefulAi&&parsed?parsed:{fields:{},cenarios:[]},local);
  if(!Object.keys(complete.fields).length&&!complete.cenarios.length)
    throw Error("A NVIDIA não estruturou os campos e a extração local não foi suficiente. Revise o texto ou continue manualmente; o conteúdo original foi preservado.");
  return {...complete,extractionSource:usefulAi?"nvidia":"local"};
}
