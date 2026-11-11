import {z} from "zod";

/** F5: the browser independently validates all server evidence before placing
 * AI values in a draft. This is *not* semantic entailment: QA confirmation
 * is still needed even for a quote that matches.
 */
const allowedFields=new Set([
 "codigo","titulo","tipo_teste","sistema","versao","ambiente","base_teste",
 "empresa","testador","descricao","explicacao","causa","correcao","conclusao","observacoes"
]);
const proof=z.strictObject({
 quote:z.string().max(550),
 source_line:z.number().int().positive().nullable(),
 status:z.enum(["verified","needs_review"]),
 reason:z.string().max(80).nullable()
});
const fieldsReply=z.strictObject({
 stage:z.literal("fields"),provider:z.literal("NVIDIA Build"),
 model:z.string().min(1),repaired:z.boolean(),
 draft:z.record(z.string(),z.string().max(20000)),
 field_evidence:z.record(z.string(),proof)
}).superRefine((v,ctx)=>{
 const names=Object.keys(v.draft);
 if(names.length<1||names.some(k=>!allowedFields.has(k))||
  Object.keys(v.field_evidence).length!==names.length||
  names.some(k=>!v.field_evidence[k])){
  ctx.addIssue({code:"custom",message:"Campos ou evidências inconsistentes"});
 }
});
const scenario=z.strictObject({
 source_index:z.number().int().min(0).max(49),
 titulo:z.string().min(3).max(240),
 passos:z.string().max(3400),
 esperado:z.string().max(1800),
 observacoes:z.string().max(1500),
 evidence:proof
});
const scenariosReply=z.strictObject({
 stage:z.literal("scenarios"),provider:z.literal("NVIDIA Build"),
 model:z.string().min(1),repaired:z.boolean(),
 draft:z.strictObject({cenarios:z.array(scenario).min(1).max(4)})
});
export type FieldReview={
 field:string;value:string;quote:string;sourceLine:number|null;
 status:"verified"|"needs_review";reason:string|null;
 origin:"NVIDIA"|"parser_local";
};
export type ScenarioReview={sourceIndex:number;title:string;quote:string;
 sourceLine:number|null;status:"verified"|"needs_review";reason:string|null};
export type GroundedScenario={source_index:number;titulo:string;passos:string;
 esperado:string;observacoes:string};
const norm=(s:string)=>s.normalize("NFD").replace(/\p{M}/gu,"")
 .toLocaleLowerCase("pt-BR").replace(/\s+/gu," ").trim();
/** Client-side check of normalized evidence and its line. The server computes
 * the line and we independently recalculate it to resist a malformed reply.
 */
export function locateEvidence(source:string,quote:string):number|null{
 if(quote.trim().length<8||quote.length>550)return null;
 const target=norm(quote);
 if(target.length<8)return null;
 // Build a normalized string and map every UTF-16 code unit to source offsets.
 let result="",offsets:number[]=[],space=false,spaceAt=0;
 for(let i=0;i<source.length;){
  const cp=source.codePointAt(i);
  if(cp===undefined)break;
  const char=String.fromCodePoint(cp);
  const clean=norm(char);
  if(/\s/u.test(char)){if(result.length){space=true;spaceAt=i;}}
  else if(clean){
   if(space){result+=" ";offsets.push(spaceAt);space=false;}
   result+=clean;for(let x=0;x<clean.length;x++)offsets.push(i);
  }
  i+=char.length;
 }
 const pos=result.indexOf(target);
 if(pos<0)return null;
 let line=1;
 for(let k=0;k<offsets[pos];k++)if(source[k]==="\n")line++;
 return line;
}
const idPattern=/\b(?:[a-z]{1,12}[-_/ ]?\d{2,}|(?:\d+[.,/-]){2,}\d+|\d{3,})\b/giu;
const moneyPattern=/\bR\$\s*\d[\d.,]*/giu;
const urlPattern=/https?:\/\/[^\s"'<>]+/giu;
export function hasUnsupportedIdentifiers(value:string,source:string):boolean{
 const v=norm(value),s=norm(source);
 return [...new Set([...(v.match(idPattern)??[]),
  ...(v.match(moneyPattern)??[]),...(v.match(urlPattern)??[])])]
  .some(token=>!s.includes(token));
}
const suspicious=/\b(?:javascript:|ignore (?:all|previous) instructions|reveal (?:the )?(?:secret|token|password))\b/iu;
const common=new Set(["para","como","pela","pelo","deve","quando","onde","esta","este","essa","esse","ainda","antes","depois","outros","outro","sobre","todos","serao","dados","sistema","tarefa","valor","campos","passos"]);
function sharesTerms(value:string,quote:string):boolean{
 const terms=(s:string)=>new Set((norm(s).match(/[a-z0-9]{4,}/g)??[])
  .filter(w=>!common.has(w)).map(w=>w.slice(0,5)));
 const words=terms(value),citation=terms(quote);
 return words.size===0||[...words].some(word=>citation.has(word));
}
function verified(source:string,value:string,quote:string,line:number|null):boolean{
 const found=locateEvidence(source,quote);
 return found!==null&&found===line&&
  !hasUnsupportedIdentifiers(value,source)&&!suspicious.test(value)&&sharesTerms(value,quote);
}
export const EVIDENCE_REASONS:Record<string,string>={
 quote_not_found:"Citação não localizada no texto enviado",
 identifier_not_in_source:"Número, versão ou identificador não localizado na origem",
 untrusted_instruction:"Conteúdo com instrução não confiável",
 json_repaired:"Resposta JSON reparada; exige conferência",
 citation_unrelated_to_seed:"Citação não corresponde ao cenário indicado",
 line_mismatch:"Linha de origem divergente",
 unverified_model:"Evidência ainda não verificada",
 claim_not_supported_by_quote:"A afirmação não compartilha termos relevantes com a citação"
};
export function parseGroundedFieldReply(data:unknown,source:string){
 const response=fieldsReply.safeParse(data);
 if(!response.success)throw Error("A estrutura de campos ou suas evidências é inválida.");
 const values:Record<string,string>={},review:FieldReview[]=[];
 for(const [field,value] of Object.entries(response.data.draft)){
  if(!value.trim())continue;
  const evidence=response.data.field_evidence[field];
  const safe=verified(source,value,evidence.quote,evidence.source_line)&&
   evidence.status==="verified"&&!response.data.repaired;
  const line=locateEvidence(source,evidence.quote);
  values[field] = safe?value:"";
  review.push({
   field,value,quote:evidence.quote,sourceLine:line,
   status:safe?"verified":"needs_review",
   reason:safe?null:response.data.repaired?"json_repaired":
    evidence.reason??"line_mismatch",origin:"NVIDIA"
  });
 }
 return {values,review,repaired:response.data.repaired,
  verifiedCount:review.filter(x=>x.status==="verified").length};
}
export function parseGroundedScenarioReply(data:unknown,source:string,
 seeds:{source_index:number}[]){
 const response=scenariosReply.safeParse(data);
 if(!response.success)throw Error("Os cenários não respeitam o schema de evidências.");
 const allowed=new Set(seeds.map(s=>s.source_index));
 const seen=new Set<number>(),accepted:GroundedScenario[]=[],review:ScenarioReview[]=[];
 for(const row of response.data.draft.cenarios){
  if(!allowed.has(row.source_index)||seen.has(row.source_index))
   throw Error("A NVIDIA retornou um índice fora dos cenários de origem.");
  seen.add(row.source_index);
  const combined=[row.titulo,row.passos,row.esperado,row.observacoes].join(" ");
  const good=verified(source,combined,row.evidence.quote,row.evidence.source_line)&&
   row.evidence.status==="verified"&&!response.data.repaired&&
   Boolean(row.titulo.trim()&&row.passos.trim()&&row.esperado.trim());
  const line=locateEvidence(source,row.evidence.quote);
  review.push({sourceIndex:row.source_index,title:row.titulo,
   quote:row.evidence.quote,sourceLine:line,
   status:good?"verified":"needs_review",
   reason:good?null:response.data.repaired?"json_repaired":
    row.evidence.reason??"unverified_model"});
  if(good)accepted.push({
   source_index:row.source_index,titulo:row.titulo,passos:row.passos,
   esperado:row.esperado,observacoes:row.observacoes
  });
 }
 if(seen.size!==seeds.length)
  throw Error("Nem todos os cenários de origem receberam evidência.");
 return {accepted,review,repaired:response.data.repaired};
}
