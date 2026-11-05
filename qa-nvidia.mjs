import { mergeOpenModelDraft } from './qa-ai-open.mjs';

export const NVIDIA_MAX_INPUT = 20000;

/**
 * Authenticated requests only: Supabase Functions automatically attaches the
 * user's Auth token. The NVIDIA API key stays in the Edge Function's secrets.
 */
export async function extractWithNvidia(text, db, onStatus=()=>{}) {
  if(typeof text!=='string'||!text.trim())throw Error('Cole o texto da TF antes de usar a IA.');
  if(text.length>NVIDIA_MAX_INPUT)throw Error('A IA online aceita até 20.000 caracteres. Reduza o relatório.');
  if(!db?.functions?.invoke)throw Error('A conexão com a IA está indisponível.');
  onStatus('Enviando o relatório para a NVIDIA Build…');
  const {data,error}=await db.functions.invoke('qa-ai',{
    body:{text},
    signal:AbortSignal.timeout(65000)
  });
  if(error){
    let message='';
    try{const info=await error.context?.json?.();message=info?.message||'';}catch{}
    throw Error(message || 'Não foi possível contatar a IA. Tente a extração sem IA ou o modelo local.');
  }
  if(!data?.draft || typeof data.draft!=='object')
    throw Error('A NVIDIA não retornou a estrutura esperada. Tente novamente ou use a extração local.');
  const draft=mergeOpenModelDraft(text,JSON.stringify(data.draft));
  onStatus('Campos estruturados pelo modelo '+String(data.model||'NVIDIA Build')+'.');
  return {draft,model:String(data.model||'NVIDIA Build')};
}
