/** F3: lightweight estimate (UTF-8 bytes / 3), not a model tokenizer.
 * Keep this formula aligned with _shared/llm/token-budget.mjs via Node tests.
 */
const encoder=new TextEncoder();
export const TOKEN_ESTIMATE_NOTICE="Estimativa local — a NVIDIA pode contabilizar tokens de forma diferente.";
export function estimateContextTokens(text:string):number{
 return Math.ceil(encoder.encode(text).length/3);
}
/** Explicit editing budget for the prepared text, independently of char limits.
 * Reserves room for system instructions and generated output at the server.
 */
export function localContextBudget(charLimit:number):number{
 if(!Number.isInteger(charLimit)||charLimit<1000||charLimit>250000)
  throw Error("Limite de preparação inválido.");
 return Math.max(800,Math.floor(charLimit/3));
}
export function fitsContextBudget(text:string,characters:number,tokens:number){
 return text.length<=characters&&estimateContextTokens(text)<=tokens;
}
