import type {ChunkOutcome,VerifiedFact} from "./semantic-context";

/** Divergences are only CANDIDATES for QA review, never proven contradictions.
 * Compare only independently sourced citations that share a reference, or
 * substantial business terminology. "Before" versus "after" is intentional.
 */
export type ConflictKind="polaridade"|"valor"|"situacao";
export type ConflictDecision="pending"|"keep_both"|"prefer_left"|"prefer_right";
export type SemanticConflict={
 id:string;kind:ConflictKind;left:VerifiedFact;right:VerifiedFact;
 reason:string;
};
export const factKey=(fact:VerifiedFact)=>
 [fact.chunkId,fact.source,fact.line,fact.category,fact.quote].join("\u241f");

const norm=(s:string)=>s.normalize("NFD").replace(/[\u0300-\u036f]/g,"")
 .toLocaleLowerCase("pt-BR").replace(/\s+/g," ").trim();
const refs=(value:string)=>new Set((value.match(/\b(?:RF|RNF|REQ|CR|CT)[-_ ]?\d{1,6}\b/gi)??[])
 .map(s=>norm(s).replace(/[-_ ]/g,"")));
const stop=new Set("de da do das dos em no na nos nas a o e um uma para por com ao os as que como se ser ter foi sao são este esta esse essa pela pelo quando caso regra requisito dever deve deve-se deve ser não nao sim somente apenas sistema usuário usuario pedido cliente campo valor do".split(/\s+/));
function tokens(value:string){
 return new Set(norm(value).replace(/[^a-z0-9]+/g," ").split(" ")
  .filter(s=>s.length>3&&!stop.has(s)&&!/^\d+$/.test(s)));
}
function sameTopic(a:VerifiedFact,b:VerifiedFact):boolean{
 const aRefs=refs(a.quote),bRefs=refs(b.quote);
 if([...aRefs].some(x=>bRefs.has(x)))return true;
 const x=tokens(a.quote),y=tokens(b.quote);
 const shared=[...x].filter(t=>y.has(t)).length;
 return shared>=3&&shared/Math.min(x.size||1,y.size||1)>=.56;
}
function polar(value:string){
 const s=norm(value);
 return /\b(?:nao|nunca|jamais|proibid[oa]s?|vedad[oa]s?|bloquead[oa]s?|impedid[oa]s?|sem permissao|deve impedir|deve bloquear)\b/.test(s);
}
function state(value:string){
 const s=norm(value);
 if(/\b(?:reprovad[oa]s?|falhou|falha|erro|nao executad[oa]s?|pendente|bloquead[oa]s?)\b/.test(s))return "problem";
 if(/\b(?:apro vad[oa]s?|aprovad[oa]s?|sucesso|passou|concluid[oa]s?|liberad[oa]s?)\b/.test(s))return "ok";
 return "";
}
function amounts(value:string){
 const list=(value.match(/(?:R\$\s*)?\d{1,9}(?:\.\d{3})*,\d{1,3}\s*%?|\b\d{1,4}%\b/gi)??[])
 .map(v=>v.replace(/\s/g,"").toUpperCase());
 return [...new Set(list)].sort();
}
const shortId=(a:VerifiedFact,b:VerifiedFact)=>[
 factKey(a),factKey(b)
].sort().join("↔");
export function detectSemanticConflicts(outcomes:Map<string,ChunkOutcome>,
 limit=70):SemanticConflict[]{
 const facts=[...outcomes.values()].flatMap(x=>x.facts);
 const result:SemanticConflict[]=[];
 for(let i=0;i<facts.length;i++)for(let j=i+1;j<facts.length;j++){
  const a=facts[i],b=facts[j];
  if(a.chunkId===b.chunkId||a.quote===b.quote)continue;
  if(a.category==="antes"&&b.category==="depois"||
     a.category==="depois"&&b.category==="antes")continue;
  if(!sameTopic(a,b))continue;
  let kind:ConflictKind|undefined,reason="";
  const aa=amounts(a.quote),bb=amounts(b.quote);
  if(aa.length===1&&bb.length===1&&aa[0]!==bb[0]&&
    (refs(a.quote).size>0||refs(b.quote).size>0)){
   kind="valor";reason="Valores diferentes associados ao mesmo contexto.";
  }else if(polar(a.quote)!==polar(b.quote)){
   kind="polaridade";reason="Uma fonte restringe a ação e a outra aparenta permitir.";
  }else if(state(a.quote)&&state(b.quote)&&state(a.quote)!==state(b.quote)){
   kind="situacao";reason="As fontes indicam situações diferentes.";
  }
  if(!kind)continue;
  result.push({id:shortId(a,b),kind,left:a,right:b,reason});
  if(result.length>=limit)return result;
 }
 return result;
}
export function excludedFacts(conflicts:SemanticConflict[],
 decisions:Record<string,ConflictDecision>):Set<string>{
 const omitted=new Set<string>();
 for(const item of conflicts){
  if(decisions[item.id]==="prefer_left")omitted.add(factKey(item.right));
  if(decisions[item.id]==="prefer_right")omitted.add(factKey(item.left));
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
    " versus "+c.right.source+"-L"+c.right.line)
 ].join("\n");
}
