// R2: private attachment validation and local text extraction (no file
// contents are sent to AI services). Optional parsers load only on demand.
export const ATTACHMENT_LIMIT=10*1024*1024;
export const EXTRACTION_LIMIT=30000;
export const ATTACHMENT_TYPES=Object.freeze({
  pdf:'application/pdf',
  docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  txt:'text/plain',
  md:'text/markdown'
});
export const FILE_BUCKET='qa-requisitos';
const pathEnd=/\.([a-z0-9]+)$/i;
export function extensionForFile(name){
  const ext=pathEnd.exec(String(name||''))?.[1]?.toLowerCase();
  if(!Object.hasOwn(ATTACHMENT_TYPES,ext))throw Error('Formato não suportado. Use PDF, DOCX, TXT ou MD.');
  return ext;
}
export function validateRequirementFile(file,bytes){
  if(!file?.name)throw Error('Escolha um arquivo para anexar.');
  if(file.name.length>180||/[/\\\u0000-\u001f]/.test(file.name))
    throw Error('Nome de arquivo inválido ou muito longo (máximo de 180 caracteres).');
  const extension=extensionForFile(file.name);
  const mime=ATTACHMENT_TYPES[extension],size=Number(file.size);
  if(!Number.isInteger(size)||size<=0||size>ATTACHMENT_LIMIT)
    throw Error('O arquivo deve ter entre 1 byte e 10 MB.');
  if(file.type && ![mime,'application/octet-stream','text/plain'].includes(file.type) &&
      !(extension==='txt' && file.type.startsWith('text/')) &&
      !(extension==='md' && file.type.startsWith('text/')))
    throw Error('O tipo real informado pelo navegador não corresponde à extensão.');
  if(bytes){
    const raw=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);
    if(raw.byteLength!==size)throw Error('O tamanho do arquivo mudou durante a leitura.');
    if(extension==='pdf'&&String.fromCharCode(...raw.slice(0,5))!=='%PDF-')
      throw Error('O conteúdo não corresponde a um PDF válido.');
    if(extension==='docx'&&!(raw[0]===0x50&&raw[1]===0x4b&&raw[2]===0x03&&raw[3]===0x04))
      throw Error('O conteúdo não corresponde a um DOCX válido.');
    if(['md','txt'].includes(extension) &&
      raw.slice(0,Math.min(size,1024)).some(byte=>byte===0))
      throw Error('O arquivo parece binário, e não texto.');
  }
  return {extension,mime,size};
}
export function storagePathForFile(userId,taskId,uuid,extension){
  const rx=/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
  if(!rx.test(userId)||!rx.test(taskId)||!rx.test(uuid))
    throw Error('Identificador de conta, TF ou documento inválido.');
  if(!Object.hasOwn(ATTACHMENT_TYPES,extension))throw Error('Extensão de arquivo inválida.');
  return userId+'/'+taskId+'/'+uuid+'.'+extension;
}
export async function sha256Hex(bytes){
  if(!globalThis.crypto?.subtle)throw Error('O navegador não oferece validação criptográfica de arquivos.');
  const input=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);
  const digest=await crypto.subtle.digest('SHA-256',input);
  return [...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('');
}
function boundedText(text,warning=''){
  text=String(text||'').replace(/\r\n?/g,'\n').trim();
  if(text.length>EXTRACTION_LIMIT){
    text=text.slice(0,EXTRACTION_LIMIT).trimEnd();
    warning=[warning,'A extração excedeu 30.000 caracteres. Somente o primeiro trecho foi colocado para revisão; o arquivo original permanece completo.'].filter(Boolean).join(' ');
  }
  return {text,warning};
}
async function pdfText(buffer){
  const pdfjs=await import('https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc=
    'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.mjs';
  const task=pdfjs.getDocument({data:new Uint8Array(buffer),useSystemFonts:true});
  let pdf;
  try{
    pdf=await task.promise;
    if(pdf.numPages>200)throw Error('PDF muito extenso (mais de 200 páginas). Divida o documento.');
    const chunks=[];
    let reachedLimit=false;
    for(let page=1;page<=pdf.numPages;page++){
      const content=await (await pdf.getPage(page)).getTextContent();
      let value='';
      for(const item of content.items){
        if(typeof item.str!=='string')continue;
        value+=item.str+(item.hasEOL?'\n':' ');
      }
      if(value.trim())chunks.push('Página '+page+'\n'+value.trim());
      if(chunks.join('\n\n').length>EXTRACTION_LIMIT+1000){reachedLimit=true;break;}
    }
    const full=chunks.join('\n\n');
    if(!full.trim())return {
      text:'',warning:'PDF sem texto selecionável, possivelmente digitalizado. OCR ainda não está disponível; anexe o original e insira o texto manualmente.'
    };
    return boundedText(full,reachedLimit?'Prévia limitada às primeiras páginas do PDF.':'');
  }finally{
    try{await pdf?.destroy()}catch{}
    if(!pdf)try{await task.destroy()}catch{}
  }
}
async function docxText(buffer){
  const {default:JSZip}=await import('https://esm.sh/jszip@3.10.1');
  const zip=await JSZip.loadAsync(buffer,{checkCRC32:true});
  if(Object.keys(zip.files).length>1000)throw Error('DOCX com número excessivo de entradas.');
  const entry=zip.file('word/document.xml');
  if(!entry||!zip.file('[Content_Types].xml'))
    throw Error('O arquivo não contém a estrutura esperada de um DOCX.');
  if((entry._data?.uncompressedSize||0)>10*1024*1024)
    throw Error('DOCX expandido acima do limite seguro de leitura.');
  const xml=await entry.async('string');
  if(xml.length>10*1024*1024)
    throw Error('DOCX expandido acima do limite seguro de leitura.');
  const document=new DOMParser().parseFromString(xml,'application/xml');
  if(document.querySelector('parsererror'))
    throw Error('XML interno do DOCX inválido.');
  const ns='http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const paragraphs=[...document.getElementsByTagNameNS(ns,'p')];
  const text=paragraphs.map(p=>{
    const parts=[];
    for(const el of p.getElementsByTagName('*')){
      if(el.namespaceURI!==ns)continue;
      if(el.localName==='t')parts.push(el.textContent||'');
      else if(el.localName==='tab')parts.push('\t');
      else if(el.localName==='br')parts.push('\n');
    }
    return parts.join('');
  }).filter(Boolean).join('\n');
  if(!text.trim())return {text:'',warning:'DOCX sem texto extraível. O original poderá ser preservado, mas os requisitos precisarão ser inseridos manualmente.'};
  return boundedText(text);
}
function plainText(buffer){
  let warning='';
  let text;
  try{text=new TextDecoder('utf-8',{fatal:true}).decode(buffer)}
  catch{
    text=new TextDecoder('windows-1252').decode(buffer);
    warning='Arquivo não estava em UTF-8; foi interpretado como Windows-1252. Confira os acentos.';
  }
  if(text.charCodeAt(0)===0xfeff)text=text.slice(1);
  return boundedText(text,warning);
}
export async function extractRequirementFile(file){
  const buffer=await file.arrayBuffer();
  const bytes=new Uint8Array(buffer);
  const details=validateRequirementFile(file,bytes);
  const hash=await sha256Hex(bytes);
  let extracted;
  if(details.extension==='pdf')extracted=await pdfText(buffer);
  else if(details.extension==='docx')extracted=await docxText(buffer);
  else extracted=plainText(buffer);
  return {
    ...details,hash,text:extracted.text,warning:extracted.warning||'',
    file
  };
}
