/** F8: deliberate server-side rollout controls, never authorization.
 * All requests still go through JWT, CORS, RLS and the 15/min RPC.
 * No user identifier, prompt or cohort value is logged or exposed.
 * Absent env preserves F7 behavior (100% enabled).
 */
export const AI_ROLLOUT_FEATURES=Object.freeze({
 "general":"QA_AI_F8_GENERAL_PERCENT",
 "task-phased":"QA_AI_F8_TASK_PERCENT",
 "generator-batch":"QA_AI_F8_GENERATOR_BATCH_PERCENT",
 "semantic":"QA_AI_F8_SEMANTIC_PERCENT",
 "revision":"QA_AI_F8_REVISION_PERCENT"
});
const safeRead=(name)=>{
 try{return typeof Deno!=="undefined"?Deno.env.get(name):undefined;}
 catch{return undefined;}
};
function percent(value){
 if(value===undefined||value===null||value==="")return 100;
 if(typeof value!=="string"||!/^(?:100|[1-9]?\d)$/.test(value))return 0;
 return Number(value);
}
/** Fast, deterministic non-cryptographic hashing for rollout distribution;
 * MUST NOT be used for authentication or security decisions.
 */
export function rolloutBucket(userId,feature){
 const input=feature+"|"+userId;
 let hash=2166136261;
 for(let i=0;i<input.length;i++){
  hash^=input.charCodeAt(i);
  hash=Math.imul(hash,16777619)>>>0;
 }
 return hash%100;
}
/** @param {string} feature
 * @param {string} userId
 * @param {(name:string)=>(string|undefined|null)} readEnv
 */
export function aiFeatureEnabled(feature,userId,readEnv=safeRead){
 if(!Object.hasOwn(AI_ROLLOUT_FEATURES,feature)||typeof userId!=="string"||
  !/^[0-9a-f-]{36}$/i.test(userId))return false;
 const global=readEnv("QA_AI_F8_ENABLED");
 if(global!==undefined&&global!==null&&global!==""&&global!=="true")return false;
 const pct=percent(readEnv(AI_ROLLOUT_FEATURES[feature]));
 return pct===100||pct>0&&rolloutBucket(userId,feature)<pct;
}
/** This denies optional model workflows only; never relaxes an ACL. */
export function disabledAiResponse(){
 return {error:"feature_disabled",
  message:"Esta funcionalidade de IA está temporariamente desativada. O conteúdo original foi preservado."};
}
