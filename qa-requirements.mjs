// R1: deterministic, offline parsing of explicit requirements and text sections.
// Classifications and missing IDs are suggestions until the user reviews them.
export const REQUIREMENT_TYPES=['RF','RNF','RN','CA'];
export const REQUIREMENT_STATES=['rascunho','aprovado','arquivado'];
export const MAX_SOURCE=30000;
export const MAX_ITEMS=100;
const tidy=value=>String(value??'').replace(/\r\n?/g,'\n').trim();
export const requirementKey=value=>tidy(value).normalize('NFD')
  .replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
function headingType(value){
  const v=requirementKey(value);
  if(/requisitos? nao funcionais?|nao funcionais?|^rnf\b/.test(v))return 'RNF';
  if(/regras? de negocio|^rn\b/.test(v))return 'RN';
  if(/criterios? de aceite|^ca\b/.test(v))return 'CA';
  if(/requisitos? funcionais?|^rf\b/.test(v))return 'RF';
  return null;
}
const codeLine=/^\s*(?:[-*•]\s*)?(?:\[\s*)?(RF|RNF|RN|CA)\s*[- ]?\s*(\d{1,4})\s*\]?\s*[:.)–—-]\s*(.+)$/i;
const bulletLine=/^\s*(?:[-*•]\s+|\d{1,3}[.)]\s+)(.+)$/;
const acceptanceHeader=/^\s*(?:#{1,4}\s*)?(?:crit[eé]rios? de aceite|resultado esperado)\s*:?\s*$/i;
const sentence=value=>tidy(value).split(/(?<=[.!?])\s+/)[0].replace(/[:;.]\s*$/,'').slice(0,110);
export function normalizeRequirement(item){
  const tipo=tidy(item.tipo).toUpperCase();
  const codigo=tidy(item.codigo).toUpperCase();
  const titulo=tidy(item.titulo);
  const descricao=tidy(item.descricao);
  const criterios_aceite=tidy(item.criterios_aceite);
  const estado=tidy(item.estado)||'rascunho';
  const origem_trecho=tidy(item.origem_trecho).slice(0,1200);
  const ordem=Number.isInteger(Number(item.ordem))?Number(item.ordem):0;
  if(!REQUIREMENT_TYPES.includes(tipo))throw Error('Tipo de requisito inválido.');
  if(!new RegExp('^'+tipo+'-[0-9]{3,4}$').test(codigo))throw Error('Código inválido: '+codigo+'. Use RF-001, RNF-001, RN-001 ou CA-001.');
  if(titulo.length<3||titulo.length>240)throw Error('Título precisa ter de 3 a 240 caracteres.');
  if(descricao.length<5||descricao.length>6000)throw Error('Descrição precisa ter de 5 a 6.000 caracteres.');
  if(criterios_aceite.length>4000)throw Error('Critérios de aceite excedem 4.000 caracteres.');
  if(!['rascunho','aprovado'].includes(estado))throw Error('Estado inválido para importação.');
  if(ordem<0||ordem>100000)throw Error('Ordem inválida.');
  return {tipo,codigo,titulo,descricao,criterios_aceite,estado,origem_trecho,ordem};
}
export function parseRequirements(raw,{existing=[]}={}){
  const input=tidy(raw);
  if(input.length<5)throw Error('Informe ao menos 5 caracteres para organizar os requisitos.');
  if(input.length>MAX_SOURCE)throw Error('O limite para texto é de 30.000 caracteres.');
  const lines=input.split('\n');
  const chunks=[];
  let current=null,sectionType=null,acceptance=false;
  function push(){
    if(current?.body?.trim())chunks.push(current);
    current=null;acceptance=false;
  }
  function make(text,{code=null,tipo=null,explicit=false}={}){
    push();
    current={body:tidy(text),criteria:[],code,tipo:tipo||sectionType||'RF',
      suggested:!explicit||!tipo,explicit,lines:[tidy(text)]};
  }
  for(const line of lines){
    const value=line.trim();
    if(!value){if(current&&!acceptance)push();continue;}
    const header=/^#{1,5}\s*(.+)$/.exec(value);
    if(header&&headingType(header[1])){
      push();sectionType=headingType(header[1]);continue;
    }
    if(acceptanceHeader.test(value)){
      acceptance=true;
      if(!current)make('Critérios de aceite documentados', {tipo:'CA'});
      continue;
    }
    const code=codeLine.exec(value);
    if(code){
      const tipo=code[1].toUpperCase();
      make(code[3],{code:tipo+'-'+String(Number(code[2])).padStart(3,'0'),tipo,explicit:true});
      continue;
    }
    const bullet=bulletLine.exec(value);
    if(bullet){
      if(acceptance&&current){
        current.criteria.push(bullet[1].trim());
        continue;
      }
      make(bullet[1]);continue;
    }
    if(/^(Dado|Quando|Então|E que)\b/i.test(value)&&current){
      current.criteria.push(value);acceptance=true;continue;
    }
    if(header){
      push();
      make(header[1]);continue;
    }
    if(!current)make(value);
    else{
      current.body+=' '+value;current.lines.push(value);
    }
  }
  push();
  if(!chunks.length)throw Error('Nenhum requisito identificável no texto.');
  if(chunks.length>MAX_ITEMS)throw Error('Mais de 100 itens detectados. Divida a fonte em blocos menores.');

  const used=new Set(existing.map(x=>String(x.codigo||'').toUpperCase()));
  const present=new Set(existing.filter(x=>x.estado!=='arquivado')
    .map(x=>requirementKey(x.descricao)));
  const seen=new Set();
  const next=type=>{
    let n=1;
    while(used.has(type+'-'+String(n).padStart(3,'0')))n++;
    if(n>9999)throw Error('Limite de códigos excedido.');
    const value=type+'-'+String(n).padStart(3,'0');
    used.add(value);return value;
  };
  return chunks.map((chunk,index)=>{
    const tipo=chunk.tipo,code=chunk.code||next(tipo);
    if(chunk.code)used.add(chunk.code);
    const description=chunk.body.slice(0,6000);
    const duplicate=present.has(requirementKey(description))||
      seen.has(requirementKey(description))||
      existing.some(x=>String(x.codigo).toUpperCase()===code)||
      chunks.slice(0,index).some(x=>x.code===code&&code!=null);
    seen.add(requirementKey(description));
    const title=(sentence(chunk.body)||'Requisito a revisar').slice(0,240);
    return {
      codigo:code,tipo,titulo:title,descricao:description,
      criterios_aceite:chunk.criteria.join('\n').slice(0,4000),
      origem_trecho:chunk.lines.join('\n').slice(0,1200),
      estado:'rascunho',ordem:index+1,
      suggested:chunk.suggested,duplicate,selected:!duplicate
    };
  });
}
export function prepareImport(raw,items){
  const text=tidy(raw);
  if(text.length<5||text.length>MAX_SOURCE)throw Error('Fonte deve conter de 5 a 30.000 caracteres.');
  const active=items.filter(item=>item.selected&&!item.duplicate);
  if(!active.length)throw Error('Selecione ao menos um requisito para salvar.');
  if(active.length>100)throw Error('No máximo 100 requisitos por importação.');
  const payload=active.map((item,index)=>normalizeRequirement({...item,ordem:index+1}));
  const codes=new Set();
  for(const item of payload){
    if(codes.has(item.codigo))throw Error('Código repetido: '+item.codigo);
    codes.add(item.codigo);
  }
  return {text,items:payload};
}
