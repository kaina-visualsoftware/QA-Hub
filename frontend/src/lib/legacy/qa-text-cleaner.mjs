/**
 * Removes isolated browser/attachment controls copied alongside a QA report.
 * Do not strip words *within* sentences: "Abrir o relatório" is a test step.
 * Preserve filenames, file paths, technical snippets and the original line order.
 */
const UI_ONLY_LABELS=new Set([
  "preview","prévia","pre-visualização","pré-visualização",
  "google drive","arquivo do google drive","arquivo do drive",
  "download","baixar","abrir","abrir arquivo","abrir no drive",
  "abrir em nova guia","abrir em nova aba","visualizar","ver arquivo",
  "copiar","copiar link","compartilhar","fechar","ver mais",
  "mostrar mais","carregar mais","expandir prévia",
  "abrir com","fazer download","baixar arquivo"
]);

function uiLabel(line){
  return line.trim().replace(/^#{1,6}\s*/,"")
    .replace(/^[•*]\s*/,"")
    .replace(/[.!]\s*$/,"")
    .toLocaleLowerCase("pt-BR").replace(/\s+/g," ").trim();
}

export function isCopiedInterfaceLine(line){
  return typeof line==="string"&&UI_ONLY_LABELS.has(uiLabel(line));
}

export function cleanQaSourceText(value){
  if(typeof value!=="string")return "";
  return value.replace(/^\uFEFF/,"").replace(/\r\n?/g,"\n")
    .split("\n").filter(line=>!isCopiedInterfaceLine(line))
    .join("\n").replace(/\n[ \t]*\n(?:[ \t]*\n)+/g,"\n\n").trim();
}

const ACRONYMS=new Set([
  "QA","TF","IA","API","CPF","CNPJ","ERP","SQL","JSON","XML","HTML","CSS",
  "PDF","DOCX","TXT","CSV","XLSX","DV","NF","NFC","UI","UX","URL",
  "HTTP","HTTPS","IP","ID","UUID","PIX","PR","SKU","CLP",
  "MQTT","RAM","CPU","GPU","SIA","VSAPP","BUILD","RELEASE","GET",
  "POST","PUT","PATCH","DELETE","CTE","HTTPS","TCP","UDP"
]);

function looksLikeCode(line){
  return /^\s*(?:SELECT\b.+\bFROM\b|UPDATE\b.+\bSET\b|INSERT\s+INTO\b|DELETE\s+FROM\b|CREATE\s+TABLE\b|ALTER\s+TABLE\b|IF\b.+\bTHEN\b)/i.test(line) ||
    /^\s*[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)+\s*(?:=|\()/u.test(line);
}

function sentenceCaseLine(line){
  const letters=line.match(/\p{L}/gu)||[];
  if(letters.length<4||looksLikeCode(line))return line;
  const capitals=(line.match(/\p{Lu}/gu)||[]).length;
  // Preserve names, acronyms and identifiers in ordinary mixed-case prose.
  if(capitals/letters.length<0.85)return line;
  let output=line.toLocaleLowerCase("pt-BR");
  output=output.replace(/\b[A-Za-z]{2,8}\b/g,word=>
    ACRONYMS.has(word.toUpperCase())?word.toUpperCase():word);
  // Capitalize the first word of every line/sentence, including numbered steps.
  output=output.replace(/(^\s*(?:[-*•]\s*|\d+[.)]\s*)?|[.!?]\s+)(\p{L})/gu,
    (_match,prefix,letter)=>prefix+letter.toLocaleUpperCase("pt-BR"));
  return output;
}

/** Sentence case for all-uppercase prose, keeping technical acronyms/codes intact. */
export function formatQaSentenceCase(value){
  return cleanQaSourceText(value).split("\n").map(sentenceCaseLine).join("\n");
}
