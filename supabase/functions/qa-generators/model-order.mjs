import {MODEL_REGISTRY} from "../_shared/llm/models.mjs";
import {modelBreakerState} from "../_shared/llm/call-model.mjs";

/** Chat-completion text endpoints with an explicit NVIDIA Build "Free Endpoint"
 * designation verified in the model catalogue. Do not trust /v1/models as a
 * billing/free-tier signal: it does not expose that classification.
 *
 * /v1/models discovers which of these endpoints are currently advertised to
 * the account. Unknown, embedding-only, partner-paid and unreviewed models
 * are never selected. The shared TF extraction catalogue stays untouched.
 *
 * Documentation used for the allowlist:
 * https://build.nvidia.com/nvidia/nemotron-3.5-lightning-30b-a3b
 * https://build.nvidia.com/openai/gpt-oss-20b
 * https://build.nvidia.com/z-ai/glm-5-3-flash
 */
export const VERIFIED_FREE_CHAT_MODELS=Object.freeze([
 "nvidia/nemotron-3.5-lightning-30b-a3b",
 "openai/gpt-oss-20b",
 "z-ai/glm-5.3-flash"
]);

let nextSlot=0;
/** For deterministic tests only; isolate rotation is not account-wide. */
export function resetGeneratorModelRotation(){nextSlot=0;}

/** Select among free, currently discovered chat endpoints, not a fixed model.
 * Failure history is shared with callModel's existing circuit breaker; blocked
 * or recently failing endpoints are deferred. Prefer no forced chain-of-thought
 * for streamed generation, but use a reasoning model if other models fail.
 * On equal health scores, rotate requests through the available candidates.
 *
 * @param {"teste"|"post"} mode
 * @param {readonly string[]} discovered
 * @param {{breakerState?:(model:string)=>{failures:number,open:boolean}}} options
 */
export function generatorModelOrder(mode,discovered,{breakerState=modelBreakerState}={}){
 if(!Array.isArray(discovered))throw TypeError("Catálogo de modelos inválido.");
 const unique=[...new Set(discovered)];
 if(mode!=="teste")return unique;
 const candidates=unique.filter(id=>
  VERIFIED_FREE_CHAT_MODELS.includes(id)&&Object.hasOwn(MODEL_REGISTRY,id));
 if(!candidates.length)return [];
 const offset=nextSlot++%candidates.length;
 const rotated=[...candidates.slice(offset),...candidates.slice(0,offset)];
 const score=id=>{
  const health=breakerState(id)??{failures:0,open:false};
  const failures=Math.max(0,Math.min(3,Number(health.failures)||0));
  const reasoning=MODEL_REGISTRY[id].reasoning==="always"?2:0;
  return (health.open?100:0)+failures*10+reasoning;
 };
 return rotated.sort((a,b)=>score(a)-score(b));
}
