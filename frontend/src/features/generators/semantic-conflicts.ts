import type {ChunkOutcome,VerifiedFact} from "./semantic-context";

/** Review only high-confidence, literal oppositions between NVIDIA-produced
 * source citations. This never extracts facts from the TF or decides truth.
 *
 * A shared keyword or a 'não' anywhere in two long quotes is NOT a conflict:
 * tax scenarios, before/after history and successful results commonly contain
 * opposite-sounding vocabulary while describing compatible conditions.
 */
export type ConflictKind="polaridade"|"valor"|"situacao";
export type ConflictDecision="pending"|"keep_both"|"prefer_left"|"prefer_right";
export type ConflictPair={left:VerifiedFact;right:VerifiedFact};
export type SemanticConflict={
 id:string;kind:ConflictKind;left:VerifiedFact;right:VerifiedFact;
 reason:string;
 /** Equivalent comparisons collapsed into a single QA decision. */
 pairs?:ConflictPair[];
};
export const factKey=(fact:VerifiedFact)=>
 [fact.chunkId,fact.source,fact.line,fact.category,fact.quote].join("\u241f");

const norm=(s:string)=>s.normalize("NFD").replace(/[\u0300-\u036f]/g,"")
 .toLocaleLowerCase("pt-BR").replace(/\s+/g," ").trim();
const refs=(value:string)=>new Set((value.match(/\b(?:RF|RNF|REQ|CR|CT)[-_ ]?\d{1,6}\b/gi)??[])
 .map(s=>norm(s).replace(/[-_ ]/g,"")));
const sameRefs=(a:string,b:string):boolean=>{
 const x=refs(a),y=refs(b);
 if(!x.size&&!y.size)return true;
 return x.size===y.size&&[...x].every(ref=>y.has(ref));
};
/** The entire literal statement, not merely its topic, must match after
 * replacing ONE unambiguous opposing predicate. Qualifiers and scopes remain.
 */
const canonical=(s:string)=>norm(s).replace(/[“”"']/g,"").replace(/\s*([.:;,])\s*/g,"$1")
 .replace(/[.!;:,]+$/g,"").trim();
type Signature={kind:ConflictKind;key:string;side:string;reason:string};
const modals=/\b(nao\s+)?(permitir|permite|pode|podera|deve|devera|enviar|envia|exibir|exibe|incluir|inclui|alterar|altera|cancelar|cancela)\b/g;
function modalSignature(quote:string):Signature|null{
 const s=canonical(quote),hits=[...s.matchAll(modals)];
 if(hits.length!==1)return null;
 const match=hits[0],negative=Boolean(match[1]);
 // A free-standing 'não' elsewhere (e.g. 'não recebe rejeição') must not
 // negate an unrelated business action.
 const base=s.slice(0,match.index)+match[2]+s.slice((match.index??0)+match[0].length);
 return {kind:"polaridade",key:base,side:negative?"deny":"allow",
  reason:"A mesma ação e condição são explicitamente permitidas e proibidas."};
}
const money=/r\$\s*\d{1,9}(?:\.\d{3})*,\d{1,3}/g;
const percent=/\b\d{1,4}(?:[.,]\d{1,3})?\s*%/g;
function valueSignature(quote:string):Signature|null{
 const s=canonical(quote);
 const matches=[...s.matchAll(money),...s.matchAll(percent)].sort(
  (a,b)=>(a.index??0)-(b.index??0));
 if(matches.length!==1)return null;
 const m=matches[0],unit=m[0].startsWith("r$")?"reais":"percentual";
 return {kind:"valor",
  key:s.slice(0,m.index)+("<"+unit+">")+s.slice((m.index??0)+m[0].length),
  side:m[0].replace(/\s+/g,""),
  reason:"A mesma regra e condição apresentam valores diferentes."};
}
const fieldStates=/\b(vazi[oa]s?|zerad[oa]s?|ausente|preenchid[oa]s?)\b/g;
function fieldSignature(quote:string):Signature|null{
 const s=canonical(quote),hits=[...s.matchAll(fieldStates)];
 if(hits.length!==1||!/\b(?:campo|campos|tag|base de calculo|atributo)\b/.test(s))return null;
 const m=hits[0],empty=/^(?:vazi|zerad|ausente)/.test(m[0]);
 return {kind:"situacao",
  key:s.slice(0,m.index)+"<estado>"+s.slice((m.index??0)+m[0].length),
  side:empty?"empty":"filled",
  reason:"O mesmo campo, no mesmo cenário, é descrito como vazio e preenchido."};
}
const invoiceStates=/\b(aprovad[oa]s?|autorizad[oa]s?|rejeitad[oa]s?|reprovad[oa]s?)\b/g;
function invoiceSignature(quote:string):Signature|null{
 const s=canonical(quote);
 // Do not compare a hypothetical failure, a historical bug or different NF.
 if(/\b(?:se|caso|antes|anteriormente|rejeitava|era|eram|deveria|esperado)\b/.test(s))
  return null;
 if(!/\b(?:nf[- ]?\d+|nfs[- ]?e\s*\d+)\b/.test(s))return null;
 const hits=[...s.matchAll(invoiceStates)];
 if(hits.length!==1)return null;
 const m=hits[0],bad=/^(?:rejeitad|reprovad)/.test(m[0]);
 return {kind:"situacao",
  key:s.slice(0,m.index)+"<situacao>"+s.slice((m.index??0)+m[0].length),
  side:bad?"bad":"good",
  reason:"A mesma nota fiscal consta como autorizada e rejeitada."};
}
const signatures=(quote:string)=>[
 modalSignature(quote),valueSignature(quote),fieldSignature(quote),invoiceSignature(quote)
].filter((x):x is Signature=>x!==null);
const opposed=(a:Signature,b:Signature):boolean=>
 a.kind===b.kind&&a.key===b.key&&a.side!==b.side;

const shortId=(a:VerifiedFact,b:VerifiedFact)=>[
 factKey(a),factKey(b)
].sort().join("↔");
export function detectSemanticConflicts(outcomes:Map<string,ChunkOutcome>,
 limit=70):SemanticConflict[]{
 const facts=[...outcomes.values()].flatMap(x=>x.facts);
 const result:SemanticConflict[]=[],groups=new Map<string,SemanticConflict>();
 const parsed=facts.map(f=>signatures(f.quote));
 for(let i=0;i<facts.length;i++)for(let j=i+1;j<facts.length;j++){
  const a=facts[i],b=facts[j];
  if(a.chunkId===b.chunkId||a.quote===b.quote)continue;
  if(!sameRefs(a.quote,b.quote))continue;
  if(a.category==="antes"||b.category==="antes")continue;
  // Opposing before/after and a historically rejected invoice are not
  // simultaneous operational requirements.
  if(/\b(?:antes da correcao|anteriormente|rejeitava|era rejeitad[oa])\b/.test(
   norm(a.quote+" "+b.quote)))continue;
  const match=parsed[i].find(x=>parsed[j].some(y=>opposed(x,y)));
  if(!match)continue;
  // Purely matched statements preserve all their qualifiers. A positive-tax
  // example cannot conflict with a zero-tax scenario by keyword alone.
  const ordered=[a,b].sort((x,y)=>canonical(x.quote).localeCompare(canonical(y.quote)));
  const left=ordered[0],right=ordered[1];
  const key=match.kind+"|"+match.key+"|"+
   [canonical(a.quote),canonical(b.quote)].sort().join("↔");
  let group=groups.get(key);
  if(group){
   group.pairs?.push({left,right});
  }else if(result.length<limit){
   group={id:shortId(left,right),kind:match.kind,left,right,
    reason:match.reason,pairs:[{left,right}]};
   groups.set(key,group);result.push(group);
  }
 }
 return result;
}
export function excludedFacts(conflicts:SemanticConflict[],
 decisions:Record<string,ConflictDecision>):Set<string>{
 const omitted=new Set<string>();
 for(const item of conflicts){
  const pairs=item.pairs??[{left:item.left,right:item.right}];
  if(decisions[item.id]==="prefer_left")
   for(const pair of pairs)omitted.add(factKey(pair.right));
  if(decisions[item.id]==="prefer_right")
   for(const pair of pairs)omitted.add(factKey(pair.left));
 }
 return omitted;
}
export function conflictNotes(conflicts:SemanticConflict[],
 decisions:Record<string,ConflictDecision>):string{
 const undecided=conflicts.filter(c=>!decisions[c.id]||decisions[c.id]==="pending");
 if(undecided.length)throw Error("Revise as divergências antes de gerar.");
 const warnings=conflicts.filter(c=>decisions[c.id]==="keep_both");
 if(!warnings.length)return "";
 return [
  "DIVERGÊNCIAS REVISADAS PELO QA — NÃO RESOLVIDAS:",
  "Os pares a seguir são dados conflitantes ou temporalmente distintos. Não os trate como fatos confirmados nem inferira aprovação. Marque como A CONFIRMAR.",
  ...warnings.map(c=>c.kind+": "+c.left.source+"-L"+c.left.line+
    " versus "+c.right.source+"-L"+c.right.line+
    ((c.pairs?.length??1)>1?" (comparações equivalentes agrupadas)":""))
 ].join("\n");
}
