/** F5 - deterministic evidence verification. Pure and side effect free.
 * Quotes, identifiers and line numbers are derived from the source text,
 * never trusted merely because a model supplied them. No model calls.
 */
const strip=s=>String(s??"").normalize("NFD").replace(/\p{M}/gu,"")
 .toLocaleLowerCase("pt-BR");
export function evidenceKey(text){
 return strip(text).replace(/\s+/gu," ").trim();
}
/** Normalize with UTF-16 offset tracking so a quote matching across newlines
 * or accents maps to a real source line. The backend never trusts model lines.
 */
export function findEvidence(source,quote){
 if(typeof source!=="string"||typeof quote!=="string"||
  quote.trim().length<12||quote.length>550)return null;
 const normQuote=evidenceKey(quote);
 if(normQuote.length<12)return null;
 let normalized="",offsets=[],pendingSpace=false,spacePos=0;
 for(let i=0;i<source.length;){
  const cp=source.codePointAt(i);
  const char=String.fromCodePoint(cp);
  const delta=char.length;
  const lowered=strip(char);
  if(/\s/u.test(char)){
   if(normalized.length){pendingSpace=true;spacePos=i;}
  }else if(lowered){
   if(pendingSpace){
    normalized+=" ";offsets.push(spacePos);pendingSpace=false;
   }
   normalized+=lowered;for(let k=0;k<lowered.length;k++)offsets.push(i);
  }
  i+=delta;
 }
 const at=normalized.indexOf(normQuote);
 if(at<0)return null;
 const position=offsets[at];
 let line=1;
 for(let i=0;i<position;i++)if(source[i]==="\n")line++;
 return {line,index:position,quote:quote.trim()};
}
const technicalToken=/\b(?:[a-z]{1,12}[-_/ ]?\d{2,}|(?:\d+[.,/-]){2,}\d+|\d{3,})\b/giu;
const money=/\bR\$\s*\d[\d.,]*/giu;
const links=/https?:\/\/[^\s"'<>]+/giu;
export function unsupportedIdentifiers(value,source){
 const input=evidenceKey(value),original=evidenceKey(source);
 const names=new Set([
  ...(input.match(technicalToken)??[]),
  ...(input.match(money)??[]),
  ...(input.match(links)??[])
 ]);
 return [...names].filter(id=>!original.includes(id));
}
const suspicious=/\b(?:javascript:|ignore (?:all|previous) instructions|reveal (?:the )?(?:secret|token|password))\b/iu;
const common=new Set(["para","como","pela","pelo","deve","quando","onde","esta","este","essa","esse","ainda","antes","depois","outros","outro","sobre","todos","serao","dados","sistema","tarefa","valor","campos","passos"]);
function sharedEvidenceTerms(value,quote){
 const terms=s=>new Set((evidenceKey(s).match(/[a-z0-9]{4,}/g)??[])
  .filter(w=>!common.has(w)).map(w=>w.slice(0,5)));
 const a=terms(value),b=terms(quote);
 return a.size===0||[...a].some(term=>b.has(term));
}
/** Refuse explicit claims of passed/executed tests when a cited source
 * actually says that execution is pending or unrecorded. A shared word such
 * as "teste" alone must not reverse the factual status of a test.
 */
export function executionContradiction(value,quote){
 const success=/\b(?:aprovad[oa]s?|passou|validado|executad[oa]s?\s+com\s+sucesso|teste[s]?\s+conclu[ií]d[oa]s?)\b/iu;
 const pending=/\b(?:n[aã]o\s+(?:(?:foi|foram|est[aá]|est[aã]o)\s+)?(?:executad[oa]s?|registrad[oa]s?|testad[oa]s?|realizad[oa]s?)|pendente|a\s+confirmar)\b/iu;
 return success.test(value)&&pending.test(quote);
}
/** A verified citation proves the quote occurs in submitted source, NOT that
 * every paraphrase is logically entailed. Unverifiable content stays in review.
 */
export function verifyGrounding(source,value,quote){
 const found=findEvidence(source,quote);
 if(!found)return {status:"needs_review",source_line:null,reason:"quote_not_found",quote:typeof quote==="string"?quote.slice(0,550):""};
 const unsupported=unsupportedIdentifiers(value,source);
 if(unsupported.length)return {status:"needs_review",source_line:found.line,
  reason:"identifier_not_in_source",quote:found.quote};
 if(suspicious.test(value))return {status:"needs_review",source_line:found.line,
  reason:"untrusted_instruction",quote:found.quote};
 if(executionContradiction(value,found.quote))return {
  status:"needs_review",source_line:found.line,
  reason:"execution_not_proven",quote:found.quote
 };
 if(!sharedEvidenceTerms(value,found.quote))return {
  status:"needs_review",source_line:found.line,
  reason:"claim_not_supported_by_quote",quote:found.quote
 };
 return {status:"verified",source_line:found.line,reason:null,quote:found.quote};
}
