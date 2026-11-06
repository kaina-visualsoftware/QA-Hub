// Issue #30: normalize all-uppercase narrative text before persistence.
// Titles, keys, credentials, IDs and generated artifacts are excluded.
export const TECHNICAL_TERMS=Object.freeze([
 'QA','CPF','CNPJ','API','SQL','NF','NF-E','XML','JSON','HTTP','HTTPS',
 'URL','UI','UX','ERP','SIA','CLP','OS','PIX','ID','UUID','IP','DNS',
 'HTML','CSS','JS','PDF','CSV','JWT','RLS','TF','POST','GET','PUT','DELETE',
 'SKU','EAN','IBGE','CEP','ICMS','ISS','PIS','COFINS','ICMS-ST'
]);
const PROTECT=[
 /\u0060{3}[\s\S]*?\u0060{3}/g,
 /\u0060[^\u0060\n]*\u0060/g,
 /\b(?:https?:\/\/|www\.)[^\s<>"']+/gi,
 /(?<![\p{L}\p{N}_])[\w.%+-]+@[\w.-]+\.[a-z]{2,}(?![\w.-])/giu,
 /\b[A-Za-z]:\\(?:[^\\\s]+\\)*[^\\\s]*/g,
 /(?<!\w)(?:\/[\w.-]+){2,}(?!\w)/g,
 /\b(?:[a-z_]+[A-Z][a-zA-Z0-9]*|[A-Z]{2,}\d+[A-Z0-9_-]*)\b/g
];
const letter=/\p{L}/u,lower=/\p{Ll}/u,upper=/\p{Lu}/u;
function maskTokens(input,terms){
 const values=[];
 const mask=value=>'\uE000'+(values.push(value)-1)+'\uE001';
 let text=input;
 for(const expression of PROTECT)text=text.replace(expression,hit=>mask(hit));
 for(const term of terms){
  const safe=term.replace(/[-/\\^$*+?.()|[\]{}]/g,'\\$&');
  text=text.replace(new RegExp('(?<![\\p{L}\\p{N}])'+safe+'(?![\\p{L}\\p{N}])','giu'),hit=>mask(hit));
 }
 return {text,restore(value){
  return value.replace(/\uE000(\d+)\uE001/g,(_,i)=>values[Number(i)]??'');
 }};
}
function toSentenceCase(line){
 let first=true;
 return Array.from(line.toLocaleLowerCase('pt-BR')).map(char=>{
  if(first&&letter.test(char)){first=false;return char.toLocaleUpperCase('pt-BR');}
  if(/[.!?]/.test(char))first=true;
  return char;
 }).join('');
}
export function normalizeNarrative(value,{terms=TECHNICAL_TERMS}={}){
 if(typeof value!=='string'||!value.trim())return value;
 let fenced=false;
 return value.split(/(\r\n|\r|\n)/).map(line=>{
  if(/^\r\n$|^\r$|^\n$/.test(line))return line;
  if(/^\s*\u0060{3}/.test(line)){fenced=!fenced;return line;}
  if(fenced)return line;
  const {text,restore}=maskTokens(line,terms);
  if(!letter.test(text)||!upper.test(text)||lower.test(text))return line;
  return restore(toSentenceCase(text));
 }).join('');
}
export const TASK_NARRATIVE_FIELDS=Object.freeze([
 'descricao','explicacao','causa','correcao','conclusao','observacoes'
]);
export const SCENARIO_NARRATIVE_FIELDS=Object.freeze([
 'passos','esperado','obtido','observacoes'
]);
export function normalizeNarrativeFields(values,fields){
 const copy={...values};
 for(const name of fields)if(typeof copy[name]==='string')
  copy[name]=normalizeNarrative(copy[name]);
 return copy;
}
