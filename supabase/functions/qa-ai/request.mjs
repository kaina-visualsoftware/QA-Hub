// Shared NVIDIA request policy for QA tasks and diagram helpers.
// GLM-5.3 Flash always reasons; "enable_thinking: false" does not disable it.
export const MODEL_DISCOVERY_TIMEOUT_MS=7000;
export const PROVIDER_TIMEOUT_MS=35000;

export function nvidiaRequestOptions(model,mode="task"){
  const glm=model==="z-ai/glm-5.3-flash";
  const nemotron=model.startsWith("nvidia/nemotron-");
  return {
    temperature:0.1,
    max_tokens:mode==="diagram"?3200:mode==="summary"?2800:glm?8192:6000,
    stream:false,
    // Never force JSON on Mermaid or natural-language summary requests.
    ...(mode==="task"?{response_format:{type:"json_object"}}:{}),
    ...(glm?{reasoning_effort:"low"}:
      nemotron?{chat_template_kwargs:{enable_thinking:false}}:{})
  };
}

export function hasMeaningfulTaskData(draft){
  if(!draft||typeof draft!=="object"||Array.isArray(draft))return false;
  const meaningful=value=>typeof value==="string"&&
    value.trim().length>3&&!/^(?:n\\/?a|não informado|nao informado|sem dados|\\.{3})$/i.test(value.trim());
  return ["descricao","explicacao","causa","correcao","conclusao"]
    .some(field=>meaningful(draft[field])) ||
    (Array.isArray(draft.cenarios)&&draft.cenarios.some(item=>
      item&&typeof item==="object"&&meaningful(item.passos||item.esperado)));
}
