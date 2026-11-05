import { extractLocalDraft, normalizeDraft } from './qa-assistant.mjs';

export const OPEN_MODEL = Object.freeze({
  id:'onnx-community/Qwen2.5-0.5B-Instruct',
  library:'@huggingface/transformers@3.8.1',
  maxInput:6000
});

/** Accept only JSON content, not markdown, instructions, or arbitrary code. */
export function parseOpenModelJson(output) {
  let str=output;
  if(Array.isArray(str))str=str.at(-1)?.content||'';
  if(str && typeof str==='object' && !Array.isArray(str))str=str.content||'';
  if(typeof str!=='string')throw Error('O modelo não retornou texto válido.');
  const start=str.indexOf('{'),end=str.lastIndexOf('}');
  if(start<0||end<=start)throw Error('A IA não retornou JSON válido. Use a extração sem IA.');
  let parsed;
  try{parsed=JSON.parse(str.slice(start,end+1));}
  catch{throw Error('A resposta da IA não pôde ser interpretada. Use a extração sem IA.');}
  if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))
    throw Error('A IA retornou um formato incompatível.');
  return normalizeDraft(parsed);
}

/** Local parser anchors identifiers while AI helps with contextual text. */
export function mergeOpenModelDraft(text,response) {
  const local=extractLocalDraft(text);
  const ai=parseOpenModelJson(response);
  const fields={...local.fields,...ai.fields};
  for(const key of ['codigo','versao']){
    if(local.fields[key])fields[key]=local.fields[key];
  }
  const cenarios=local.cenarios.length?local.cenarios:ai.cenarios;
  return {fields,cenarios};
}

/** Worker isolation: CPU inference never blocks the QA form's UI thread. */
export function createOpenModelClient(workerFactory=()=>
  new Worker(new URL('./qa-open-model.worker.mjs',import.meta.url),{type:'module'})) {
  let worker=null,id=0,pending=new Map();
  function rejectPending(error){
    for(const task of pending.values())task.reject(error);
    pending.clear();
  }
  function getWorker(){
    if(worker)return worker;
    worker=workerFactory();
    worker.addEventListener('message',event=>{
      const data=event.data||{},task=pending.get(data.id);
      if(!task)return;
      if(data.type==='progress'){task.onProgress(String(data.message||''));return;}
      pending.delete(data.id);
      if(data.type==='result')task.resolve(data.output);
      else task.reject(Error(String(data.message||'Falha no modelo de IA local.')));
    });
    worker.addEventListener('error',()=>{
      rejectPending(Error('Não foi possível carregar a IA neste navegador. Use a extração sem IA.'));
      worker?.terminate?.();
      worker=null;
    });
    return worker;
  }
  return {
    async extract(text,onProgress=()=>{}){
      if(typeof text!=='string'||!text.trim())throw Error('Cole o texto antes de usar a IA.');
      if(text.length>OPEN_MODEL.maxInput)
        throw Error('Para a IA local, reduza o texto para até 6.000 caracteres. A extração sem IA aceita até 30.000.');
      const current=++id;
      const output=await new Promise((resolve,reject)=>{
        pending.set(current,{resolve,reject,onProgress});
        try{getWorker().postMessage({type:'extract',id:current,text});}
        catch(e){pending.delete(current);reject(e);}
      });
      return mergeOpenModelDraft(text,output);
    },
    dispose(){
      rejectPending(Error('Análise de IA cancelada.'));
      worker?.terminate?.();
      worker=null;
    }
  };
}

const defaultClient=createOpenModelClient();
export const extractWithOpenModel=(text,onProgress)=>defaultClient.extract(text,onProgress);
