import type {UseFormReturn} from "react-hook-form";
import { normalizeTaskVersion } from "../../lib/task-version";
import type {Scenario,TaskDraft} from "../../lib/contracts";
import {normalizeDraft} from "../../lib/legacy/qa-assistant.mjs";
import type {LocalDraft} from "../../lib/legacy/qa-assistant.mjs";
import {supabase} from "../../lib/supabase";
import {readAiInvokeError,withAiRateLimitRetry} from "../../lib/ai-retry";
import type {AiWaitCallback} from "../../lib/ai-retry";
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

export type GeneratedTaskDraft=LocalDraft & {extractionSource:"nvidia"|"local";extractionReason?:string};

/** The NVIDIA response is the only source for AI-generated fields.
 * Do not use a local parser to fill missing data, scenarios, or provider errors.
 */
export async function generateTaskAiDraft(text:string,{aiText,signal,onWait}:{aiText?:string;signal?:AbortSignal;onWait?:AiWaitCallback}={}):Promise<GeneratedTaskDraft>{
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
  const requestSignal=signal??AbortSignal.timeout(95000);
  const {data,error}=await withAiRateLimitRetry(async()=>{
    const response=await supabase.functions.invoke("qa-ai",{
      body:{text:prepared},signal:requestSignal
    });
    if(response.error&&response.error.context?.status===429)
      throw await readAiInvokeError(response.error);
    return response;
  },{signal:requestSignal,onWait});
  if(error){
    let detail:{message?:string;error?:string;code?:string}={};
    try{detail=await error.context?.json?.()??{};}catch{}
    const status=typeof error.context?.status==="number"?error.context.status:0;
    const code=detail.error??detail.code??"";
    if(status===429||code==="rate_limited"||code==="nvidia_rate_limited")
      throw Error(detail.message||"A NVIDIA atingiu a cota de chamadas. O documento foi preservado; retome após a liberação.");
    if(status===401||status===403)
      throw Error(detail.message||"Sessão inválida para acessar a NVIDIA. Entre novamente no QA Hub.");
    throw Error(detail.message||"A NVIDIA não concluiu a análise"+
      (status?" (HTTP "+status+")":"")+". Nenhum dado foi extraído fora da IA. "+
      "A fonte original foi mantida para uma nova tentativa ou preenchimento manual.");
  }
  if(data?.provider!=="NVIDIA Build"||data?.fallback)
    throw Error("A NVIDIA não retornou uma resposta estruturada verificável. "+
      "Nenhum mecanismo local foi usado; retome a análise ou preencha manualmente.");
  const raw=data?.draft;
  if(!raw||typeof raw!=="object"||Array.isArray(raw)||!Object.keys(raw).length)
    throw Error("A NVIDIA respondeu sem campos estruturados. A fonte foi preservada; tente novamente.");
  const parsed=normalizeDraft(raw);
  if(!Object.keys(parsed.fields).length&&!parsed.cenarios.length)
    throw Error("A NVIDIA não forneceu campos ou cenários utilizáveis. A fonte foi preservada.");
  return {...parsed,extractionSource:"nvidia"};
}
