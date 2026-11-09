// Robust, data-only extraction of NVIDIA Chat Completions. Never execute model output.
const key=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'');
const fields={
  codigo:'codigo cod numero_tf tf pedido chamado',
  titulo:'titulo assunto nome title task_title',
  tipo_teste:'tipo_teste tipo_de_teste test_type',
  sistema:'sistema modulo sistema_modulo produto',
  versao:'versao version versao_sistema',
  ambiente:'ambiente ambiente_teste',
  base_teste:'base_teste base_de_teste base',
  empresa:'empresa cliente',
  testador:'testador responsavel analista',
  descricao:'descricao descricao_do_teste o_que_foi_testado resumo objetivo description',
  explicacao:'explicacao como_funciona funcionamento fluxo',
  causa:'causa causa_raiz problema problema_identificado analise',
  correcao:'correcao alteracao solucao ajuste mudanca',
  conclusao:'conclusao resultado_final conclusion',
  observacoes:'observacoes obs notas ressalvas'
};
const caseFields={
  titulo:'titulo nome cenario',
  passos:'passos etapas steps acoes procedimento',
  esperado:'esperado resultado_esperado expected',
  objetivo:'objetivo objetivo_do_cenario test_goal',
  obtido:'obtido resultado_obtido resultado_observado actual',
  observacoes:'observacoes obs notes'
};
const strings=value=>typeof value==='string'?value.trim():typeof value==='number'?String(value):Array.isArray(value)?value.map(strings).join('\n').trim():'';
const find=(object,aliases)=>{
  if(!object||typeof object!=='object')return undefined;
  const entries=Object.entries(object);
  for(const alias of aliases.split(' ')){
    const found=entries.find(([name])=>key(name)===alias);
    if(found)return found[1];
  }
  return undefined;
};
const canonical=(object)=>{
  if(Array.isArray(object))object={cenarios:object};
  if(!object||typeof object!=='object')return null;
  const nested=find(object,'tarefa dados tf task campos resultado data extracao');
  if(nested&&typeof nested==='object'&&!Array.isArray(nested))object={...nested,...object};
  const draft={};
  for(const [field,aliases] of Object.entries(fields)){
    const value=strings(find(object,aliases));
    if(value)draft[field]=value.slice(0,field==='titulo'?240:20000);
  }
  if(draft.tipo_teste){
    const name=draft.tipo_teste.toUpperCase();
    if(name.includes('RELEASE'))draft.tipo_teste='RELEASE';
    else if(name.includes('BUILD'))draft.tipo_teste='BUILD';
    else delete draft.tipo_teste;
  }
  const raw=find(object,'cenarios cenarios_testados casos_de_teste casos test_cases scenarios');
  if(raw){
    const data=(Array.isArray(raw)?raw:[raw]).slice(0,20).map(item=>{
      if(typeof item==='string')item={titulo:item};
      if(!item||typeof item!=='object')return null;
      const row={};
      for(const [field,aliases] of Object.entries(caseFields)){
        row[field]=strings(find(item,aliases)).slice(0,20000);
      }
      if(!row.titulo&&!row.passos&&!row.esperado&&!row.obtido)return null;
      row.titulo ||= 'Cenário de teste';
      return row;
    }).filter(Boolean);
    if(data.length)draft.cenarios=data;
  }
  return Object.keys(draft).length?draft:null;
};
const parse=(s)=>{
  try{return JSON.parse(s);}catch{}
  const repaired=s
    .replace(/,\s*([}\]])/g,'$1')
    .replace(/([{,]\s*)'([^'\n]+)'\s*:/g,(_,start,k)=>start+JSON.stringify(k)+':')
    .replace(/:\s*'([^'\n]*)'(?=\s*[,}\]])/g,(_,v)=>':'+JSON.stringify(v))
    .replace(/([{,]\s*)([a-zA-Z_][\w -]*)\s*:/g,(_,start,k)=>start+JSON.stringify(k.trim())+':');
  try{return JSON.parse(repaired);}catch{return null;}
};
function parseText(input){
  if(input&&typeof input==='object')return canonical(input);
  if(typeof input!=='string')return null;
  const s=input.replace(/<think>[\s\S]*?<\/think>/gi,'').trim().slice(0,100000);
  const direct=canonical(parse(s));
  if(direct)return direct;
  const fences=[...s.matchAll(/\x60{3}(?:json|javascript|js)?\s*([\s\S]*?)\x60{3}/gi)].map(m=>m[1]);
  const fragments=[...fences];
  let first=-1,depth=0,quote='',escaped=false;
  for(let i=0;i<s.length;i++){
    const ch=s[i];
    if(quote){
      if(escaped)escaped=false;
      else if(ch==='\\')escaped=true;
      else if(ch===quote)quote='';
      continue;
    }
    if(ch==='"'||ch==="'"){quote=ch;continue;}
    if(ch==='{'){if(depth===0)first=i;depth++;}
    else if(ch==='}'&&depth>0){
      depth--;
      if(depth===0&&first>=0){fragments.push(s.slice(first,i+1));first=-1;}
    }
  }
  for(const fragment of fragments){const draft=canonical(parse(fragment));if(draft)return draft;}
  // Plain prose: headings, markdown labels and paragraphs.
  const entries=Object.entries(fields).flatMap(([name,aliases])=>aliases.split(' ').map(a=>[name,a]));
  const output={};let current=null;
  for(const line of s.split(/\r?\n/)){
    const stripped=line.trim().replace(/^#{1,6}\s*/,'').replace(/^\*\*/,'').replace(/\*\*:/,':');
    const match=stripped.match(/^([^:：]{2,70})\s*[:：]\s*(.*)$/);
    const selected=match&&entries.find(([,alias])=>key(match[1])===alias)?.[0];
    if(selected){current=selected;output[current]=match[2];}
    else if(current&&stripped&&!stripped.startsWith('{'))output[current]+='\n'+stripped;
  }
  return canonical(output);
}
export function parseNvidiaDraft(response){
  const inputs=[];
  if(response&&typeof response==='object'){
    const choice=response.choices?.[0]||{};
    const message=choice.message||choice.delta||{};
    inputs.push(message.parsed,message.content,
      message.tool_calls?.[0]?.function?.arguments,
      choice.text,response.output_text,response.draft,response.data);
    if(Array.isArray(message.content)){
      inputs.push(message.content.map(p=>p.text||p.content||'').join('\n'));
    }
  }
  inputs.push(response);
  for(const input of inputs){const draft=parseText(input);if(draft)return draft;}
  return null;
}
