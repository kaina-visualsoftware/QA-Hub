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
  quote.trim().length<8||quote.length>550)return null;
 const normQuote=evidenceKey(quote);
 if(normQuote.length<8)return null;
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
   for(const letter of lowered){normalized+=letter;offsets.push(i);}
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
 return {status:"verified",source_line:found.line,reason:null,quote:found.quote};
}
