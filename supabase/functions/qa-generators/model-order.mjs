/** Prefer the lower-latency NVIDIA Build model for streamed QA cases.
 * GLM Flash performs reasoning before yielding visible tokens; in production it
 * repeatedly timed out during case generation. Keep both allowlisted models
 * available, preserve their discovery order for other generator modes, and
 * never inject a model that the provider did not advertise.
 */
export const CASE_STREAM_PREFERRED_MODEL="nvidia/nemotron-3.5-lightning-30b-a3b";
export function generatorModelOrder(mode,discovered){
 if(!Array.isArray(discovered))throw TypeError("Lista de modelos inválida.");
 const unique=[...new Set(discovered)];
 if(mode!=="teste"||!unique.includes(CASE_STREAM_PREFERRED_MODEL))return unique;
 return [CASE_STREAM_PREFERRED_MODEL,
  ...unique.filter(id=>id!==CASE_STREAM_PREFERRED_MODEL)];
}
