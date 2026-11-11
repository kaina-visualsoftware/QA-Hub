import { parseOpenModelJson,mergeOpenModelDraft } from './qa-ai-open.mjs';
import { extractLocalDraft } from './qa-assistant.mjs';


/**
 * Authenticated requests only: Supabase Functions automatically attaches the
 * user's Auth token. The NVIDIA API key stays in the Edge Function's secrets.
 */
export async function extractWithNvidia(text, db, onStatus=()=>{}) {
  if(typeof text!=='string'||!text.trim())throw Error('Cole o texto da TF antes de usar a IA.');
  if(!db?.functions?.invoke)throw Error('A conexão com a IA está indisponível.');
  onStatus('Enviando o relatório para a NVIDIA Build…');
  const {data,error}=await db.functions.invoke('qa-ai',{
    body:{text},
    signal:AbortSignal.timeout(95000)
  });
  const fallback=()=>{
    onStatus('A NVIDIA não retornou campos utilizáveis; organizando o texto localmente.');
    if(text.length>30000)throw Error('A NVIDIA não retornou campos utilizáveis. Tente novamente; o texto original foi preservado.');
    return {draft:extractLocalDraft(text),model:'Extração local',fallback:true};
  };
  if(error){
    let info={};
    try{info=await error.context?.json?.()||{};}catch{}
    if(['ai_temporarily_unavailable','free_model_unavailable'].includes(info.error)){
      return fallback();
    }
    throw Error(info.message || 'Não foi possível contatar a IA. Tente novamente ou use a extração sem IA.');
  }
  if(data?.fallback || !data?.draft || typeof data.draft!=='object'){
    return fallback();
  }
  try {
    const draft=text.length>30000?parseOpenModelJson(JSON.stringify(data.draft)):mergeOpenModelDraft(text,JSON.stringify(data.draft));
    onStatus('Campos organizados com '+String(data.model||'NVIDIA Build')+'.');
    return {draft,model:String(data.model||'NVIDIA Build'),fallback:false};
  } catch {
    return fallback();
  }
}
