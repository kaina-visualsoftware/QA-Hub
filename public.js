import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.119.0';
import {QA_CONFIG} from './qa-config.js';
import {createDiagramViewer} from './qa-diagram-viewer.mjs';

const db=createClient(QA_CONFIG.url,QA_CONFIG.publishableKey,{
  auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}
});
const $=selector=>document.querySelector(selector);
const viewer=createDiagramViewer($('#diagram-viewer'));
let tasks=[],diagrams=[];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function error(message){
  $('#public-error').hidden=false;
  $('#public-error').textContent=message;
}
const fieldNames=[
  ['codigo','Código'],['tipo_teste','Tipo'],['status','Situação'],['sistema','Sistema'],
  ['versao','Versão'],['descricao','O que foi testado'],['explicacao','Como funciona'],
  ['causa','Problema e causa'],['correcao','O que foi alterado'],
  ['conclusao','Conclusão'],['observacoes','Observações']
];
function addFact(container,label,value){
  if(value===null||value===undefined||String(value).trim()==='')return;
  const line=document.createElement('div');
  const heading=document.createElement('h3');
  const p=document.createElement('p');
  heading.textContent=label;p.textContent=String(value);
  line.append(heading,p);
  container.append(line);
}
function renderList(){
  const query=$('#public-search').value.trim().toLocaleLowerCase('pt-BR');
  const filtered=tasks.filter(t=>[t.titulo,t.codigo,t.sistema,t.versao].some(s=>String(s||'').toLocaleLowerCase('pt-BR').includes(query)));
  $('#public-list-count').textContent=filtered.length+' TF(s) públicas';
  $('#public-list').innerHTML=filtered.length?filtered.map(t=>
    '<a class="public-task-card" href="./public.html?tf='+encodeURIComponent(t.id)+'">'+
    '<strong>'+esc(t.titulo)+'</strong><span>'+esc(t.codigo||'Sem código')+
    ' · '+esc(t.sistema||'Sistema não informado')+
    ' · '+esc(t.tipo_teste||'')+'</span></a>'
  ).join(''):'<p class="public-empty">Nenhuma TF pública encontrada.</p>';
}
async function showList(){
  const {data,error:failure}=await db.from('qa_tarefas')
    .select('id,titulo,codigo,tipo_teste,sistema,versao,executado_em')
    .eq('publica',true).order('executado_em',{ascending:false}).limit(150);
  if(failure)throw failure;
  tasks=data||[];
  renderList();
}
async function drawMermaid(source,target){
  try{
    const {default:mermaid}=await import('https://esm.sh/mermaid@12.3.0');
    mermaid.initialize({startOnLoad:false,securityLevel:'strict',theme:'neutral',maxTextSize:16000});
    if(source.length>16000)throw Error('Conteúdo muito extenso.');
    if(mermaid.parse)await mermaid.parse(source);
    const {svg}=await mermaid.render('public-mermaid-'+crypto.randomUUID().replaceAll('-',''),source);
    target.innerHTML=svg;
    return svg;
  }catch{
    target.textContent='Não foi possível visualizar este diagrama.';
    return null;
  }
}
async function showTask(id){
  const {data:task,error:taskError}=await db.from('qa_tarefas')
    .select('*').eq('id',id).eq('publica',true).maybeSingle();
  if(taskError)throw taskError;
  if(!task){error('Esta TF não é pública ou não existe.');return;}
  const [scenariosResponse,diagramsResponse]=await Promise.all([
    db.from('qa_cenarios').select('*').eq('tarefa_id',id).order('ordem',{ascending:true}),
    db.from('qa_diagramas').select('*').eq('tarefa_id',id).order('created_at',{ascending:true})
  ]);
  if(scenariosResponse.error)throw scenariosResponse.error;
  if(diagramsResponse.error)throw diagramsResponse.error;
  diagrams=diagramsResponse.data||[];
  $('#public-browse').hidden=true;
  $('#public-detail').hidden=false;
  $('#public-task-title').textContent=task.titulo;
  $('#public-task-meta').textContent=(task.codigo||'TF')+' · '+(task.sistema||'Sistema não informado');
  const facts=$('#public-summary-fields');facts.replaceChildren();
  for(const [name,label] of fieldNames)addFact(facts,label,task[name]);
  const scenarios=scenariosResponse.data||[];
  const sc=$('#public-scenario-list');
  sc.replaceChildren();
  if(!scenarios.length)sc.textContent='Nenhum cenário publicado.';
  for(const [i,item] of scenarios.entries()){
    const card=document.createElement('article');
    card.className='public-scenario';
    const h=document.createElement('h3');h.textContent=(i+1)+'. '+item.titulo;card.append(h);
    for(const [key,label] of [
      ['passos','Passos'],['esperado','Resultado esperado'],
      ['obtido','Resultado observado'],['observacoes','Observações']
    ])addFact(card,label,item[key]);
    sc.append(card);
  }
  const list=$('#public-diagram-list');
  list.replaceChildren();
  if(!diagrams.length){list.textContent='Nenhum diagrama publicado.';return;}
  for(const diagram of diagrams){
    const card=document.createElement('article');card.className='public-diagram';
    const header=document.createElement('header');
    const heading=document.createElement('h3');heading.textContent=diagram.titulo;
    const zoom=document.createElement('button');
    zoom.className='btn soft';zoom.type='button';zoom.textContent='Ampliar';
    const preview=document.createElement('div');preview.className='diagram-render public-diagram-preview';
    preview.textContent='Carregando diagrama…';
    zoom.addEventListener('click',async()=>{
      const svg=preview.querySelector('svg')?.outerHTML||await drawMermaid(diagram.conteudo,preview);
      if(svg)viewer.open(svg,diagram.titulo);
    });
    header.append(heading,zoom);card.append(header,preview);list.append(card);
    await drawMermaid(diagram.conteudo,preview);
  }
}
async function start(){
  const id=new URLSearchParams(location.search).get('tf');
  try{
    if(id){
      if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)){
        error('Link de TF inválido.');return;
      }
      await showTask(id);
    }else await showList();
  }catch{
    error('Não foi possível carregar as TFs públicas. Tente novamente.');
  }
}
$('#public-search').addEventListener('input',renderList);
start();
