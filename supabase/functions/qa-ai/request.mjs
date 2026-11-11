import {modelRequestOptions} from "../_shared/llm/models.mjs";
// Shared NVIDIA request policy for QA tasks and diagram helpers.
// GLM-5.3 Flash always reasons; "enable_thinking: false" does not disable it.
export const MODEL_DISCOVERY_TIMEOUT_MS=7000;
export const PROVIDER_TIMEOUT_MS=35000;

export function nvidiaRequestOptions(model,mode="task"){
  return modelRequestOptions(model,mode,false);
}

export function hasMeaningfulTaskData(draft){
  if(!draft||typeof draft!=="object"||Array.isArray(draft))return false;
  const meaningful=value=>typeof value==="string"&&
    value.trim().length>3&&!/^(?:n\/?a|não informado|nao informado|sem dados|\.{3})$/i.test(value.trim());
  return ["descricao","explicacao","causa","correcao","conclusao"]
    .some(field=>meaningful(draft[field])) ||
    (Array.isArray(draft.cenarios)&&draft.cenarios.some(item=>
      item&&typeof item==="object"&&meaningful(item.passos||item.esperado)));
}
