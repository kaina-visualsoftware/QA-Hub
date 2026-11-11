/** F3 - estimate, never present as a tokenizer-exact count.
 * Hosted NVIDIA Build does not advertise a reliable public /tokenize contract.
 * UTF-8 bytes / 3 is a conservative *heuristic*, NOT an upper bound or
 * a guarantee: the model-specific server tokenizer is authoritative.
 */
export const TOKEN_ESTIMATE_METHOD="utf8_bytes_div_3_with_chat_overhead";
export const TOKEN_ESTIMATE_WARNING="Estimativa local, não é a contagem oficial do tokenizador NVIDIA.";
/** @type {Readonly<Record<string,number>>} */
export const MODEL_CONTEXT_PUBLISHED=Object.freeze({
 "z-ai/glm-5.3-flash":1048576,
 "nvidia/nemotron-3.5-lightning-30b-a3b":1000000
});
/** Product limits intentionally smaller than the model card's maximum. Their
 * purpose is to reduce slow/expensive long context requests on free endpoints.
 * They are NOT limitations claimed by the NVIDIA hosted service.
 */
/** @type {Readonly<Record<string,number>>} */
export const APP_CONTEXT_BUDGETS=Object.freeze({
 task:150000,diagram:60000,summary:60000,post:90000,
 teste:90000,semantic:32000,revision:90000
});
const encoder=new TextEncoder();
/** @param {unknown} input */
export function estimateTextTokens(input){
 if(typeof input!=="string")throw TypeError("Conteúdo deve ser texto.");
 return Math.ceil(encoder.encode(input).length/3);
}
/** @param {unknown} messages */
export function estimateMessageTokens(messages){
 if(!Array.isArray(messages)||!messages.length)throw TypeError("Mensagens inválidas.");
 for(const message of messages){
  if(!message||typeof message!=="object"||
   !["system","user","assistant","tool"].includes(message.role)||
   typeof message.content!=="string")throw TypeError("Mensagem de IA inválida.");
 }
 const serialized=JSON.stringify(messages);
 return estimateTextTokens(serialized)+messages.length*16+64;
}
/** @param {unknown} mode */
export function normalizedMode(mode){
 const value=typeof mode==="string"?mode:"task";
 return value.startsWith("semantic")?"semantic":value.startsWith("revision")?"revision":
  Object.hasOwn(APP_CONTEXT_BUDGETS,value)?value:"task";
}
/** @param {{messages?:unknown, model?:string, mode?:string,
 * maxOutputTokens?:number, marginRatio?:number}} args */
export function planTokenBudget({messages,model,mode="task",maxOutputTokens=8192,
  marginRatio=.18}={}){
 const configured=APP_CONTEXT_BUDGETS[normalizedMode(mode)];
 if(!MODEL_CONTEXT_PUBLISHED[model])throw TypeError("Modelo não registrado.");
 if(!Number.isInteger(maxOutputTokens)||maxOutputTokens<1||maxOutputTokens>100000)
  throw TypeError("Reserva de saída inválida.");
 if(typeof marginRatio!=="number"||marginRatio<.1||marginRatio>.5)
  throw TypeError("Margem de segurança inválida.");
 const contextTokens=Math.min(MODEL_CONTEXT_PUBLISHED[model],configured);
 const safetyTokens=Math.ceil(contextTokens*marginRatio);
 const inputLimitTokens=Math.max(0,contextTokens-maxOutputTokens-safetyTokens);
 const estimatedInputTokens=estimateMessageTokens(messages);
 return Object.freeze({
  model,mode:normalizedMode(mode),method:TOKEN_ESTIMATE_METHOD,
  publishedContextTokens:MODEL_CONTEXT_PUBLISHED[model],
  operationalContextTokens:contextTokens,estimatedInputTokens,
  inputLimitTokens,maxOutputTokens,safetyTokens,
  fits:estimatedInputTokens<=inputLimitTokens,
  remainingEstimatedTokens:Math.max(0,inputLimitTokens-estimatedInputTokens),
  exact:false
 });
}
