import { parseOpenModelJson } from './qa-ai-open.mjs';


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

  if(error){
    let info={};
    try{info=await error.context?.json?.()||{};}catch{}
    throw Error(info.message || 'A NVIDIA não concluiu a extração. O relatório original foi preservado.');
  }
  if(data?.provider!=='NVIDIA Build'||data?.fallback||
     !data?.draft||typeof data.draft!=='object'||!Object.keys(data.draft).length)
    throw Error('A NVIDIA não devolveu campos válidos. Nenhuma extração local foi executada.');
  try {
    const draft=parseOpenModelJson(JSON.stringify(data.draft));
    // Literal consistency checks are allowed; they never infer missing values.
    for(const key of ['codigo','versao']){
      if(draft.fields?.[key] && !text.includes(draft.fields[key]))
        delete draft.fields[key];
    }
    if(!Object.keys(draft.fields??{}).length&&!draft.cenarios?.length)
      throw Error('Sem dados estruturados.');
    onStatus('Campos organizados com '+String(data.model||'NVIDIA Build')+'.');
    return {draft,model:String(data.model||'NVIDIA Build'),fallback:false};
  } catch {
    throw Error('A resposta da NVIDIA não pôde ser validada. O relatório foi preservado.');
  }
}
