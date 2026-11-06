import {
  taskToGeneratorText, parseGeneratedCases, markScenarioDuplicates,
  scenarioIdentity, attachReviewedCases, TASK_UUID
} from './qa-workspace.mjs';

// UI adapter for the embedded legacy generator, never owns or updates qa_tarefas.
export function createGeneratorReview({client, getMode, getUserId, state, embedded}) {
  const $=id=>document.getElementById(id);
  const linkedTf=new URLSearchParams(location.search).get('tf');
  const validTf=Boolean(linkedTf&&TASK_UUID.test(linkedTf));
  let task=null,existing=[],cached=false,busy=false,renderVersion=0;

  const status=message=>{$('qa-attach-status').textContent=message};
  const candidates=()=>state.teste.review||[];
  const recompute=()=>{
    const seen=new Set(existing.map(scenarioIdentity));
    for(const item of candidates()) {
      item.duplicate=seen.has(scenarioIdentity(item));
      if(item.duplicate)item.selected=false;
      seen.add(scenarioIdentity(item));
    }
  };

  function draw() {
    const source=state.teste,items=candidates();
    const list=$('qa-attach-list');
    list.replaceChildren();
    const selected=items.filter(x=>x.selected&&!x.duplicate).length;
    const duplicates=items.filter(x=>x.duplicate).length;
    $('qa-attach-info').textContent=task
      ? 'TF '+(task.codigo||task.titulo)+' · '+selected+' de '+items.length+' selecionado(s)'
        +(duplicates?' · '+duplicates+' duplicado(s) ignorado(s)':'')
        +'. A TF será preservada. Casos novos começam como não executados.'
      : 'Sem TF em foco. Escolha uma TF na barra superior ou crie um rascunho para associar estes casos.';
    $('qa-attach-save').hidden=!task;
    $('qa-attach-save').disabled=busy||!task||!selected||!getUserId();
    $('qa-attach-all').hidden=!task;
    $('qa-create-draft').hidden=Boolean(task);
    $('qa-attach-open').hidden=!task;
    if(task)$('qa-attach-open').href='./qa.html#/tarefa/'+encodeURIComponent(task.id)+'?tab=cenarios';

    for(const [index,item] of items.entries()) {
      const card=document.createElement('article');
      card.className='qa-case'+(item.duplicate?' duplicate':'');
      const heading=document.createElement('div');
      heading.className='qa-case-head';
      const check=document.createElement('input');
      check.type='checkbox';
      check.checked=Boolean(item.selected&&!item.duplicate);
      check.disabled=busy||Boolean(item.duplicate);
      check.setAttribute('aria-label','Selecionar caso '+(index+1));
      check.onchange=()=>{item.selected=check.checked;draw()};
      const label=document.createElement('strong');
      label.textContent='Caso '+(index+1)+(item.duplicate?' · Repetido ou já cadastrado':'');
      heading.append(check,label);card.append(heading);
      const fields=document.createElement('div');
      fields.className='qa-case-fields';
      for(const [name,title,wide,tag] of [
        ['titulo','Título',true,'input'],
        ['passos','Passos',false,'textarea'],
        ['esperado','Resultado esperado',false,'textarea'],
        ['observacoes','Objetivo e observações',true,'textarea']
      ]) {
        const holder=document.createElement('label');
        holder.className=wide?'full':'';
        holder.append(document.createTextNode(title));
        const control=document.createElement(tag);
        control.value=item[name]||'';
        control.disabled=busy;
        if(tag==='textarea')control.rows=name==='observacoes'?2:4;
        control.onchange=()=>{
          item[name]=control.value;
          recompute();
          draw();
        };
        holder.append(control);fields.append(holder);
      }
      card.append(fields);list.append(card);
    }
  }

  async function fetchTaskAndCases(){
    if(cached||!validTf||!getUserId())return;
    const [tfResult,scenarioResult]=await Promise.all([
      client.from('qa_tarefas').select('*').eq('id',linkedTf).maybeSingle(),
      client.from('qa_cenarios').select('titulo,passos,esperado').eq('tarefa_id',linkedTf).limit(3000)
    ]);
    if(tfResult.error||!tfResult.data)throw tfResult.error||Error('TF inexistente ou não autorizada.');
    if(scenarioResult.error)throw scenarioResult.error;
    task=tfResult.data;existing=scenarioResult.data||[];cached=true;
  }

  async function render() {
    const panel=$('qa-attach'),source=state.teste;
    panel.hidden=getMode()!=='teste'||!source.md;
    if(panel.hidden)return;
    if(source.reviewMd!==source.md) {
      source.reviewMd=source.md;
      source.review=null;
      source.generationId=source.generationId||
        (TASK_UUID.test(String(source.id||''))?String(source.id):crypto.randomUUID());
    }
    const parsed=parseGeneratedCases(source.md);
    if(!parsed.length) {
      $('qa-attach-list').replaceChildren();
      $('qa-attach-save').hidden=true;
      status('Nenhum caso reconhecido. Utilize títulos como ## Cenário 01 — Título.');
      return;
    }
    const version=++renderVersion;
    if(validTf&&getUserId()) {
      try {await fetchTaskAndCases()}
      catch(error) {
        task=null;
        status('Não foi possível acessar a TF: '+(error.message||error));
      }
    } else task=null;
    if(version!==renderVersion||getMode()!=='teste')return;
    if(!source.review)source.review=markScenarioDuplicates(parsed,existing);
    else recompute();
    draw();
  }

  async function loadTask(force=false) {
    if(!validTf||!getUserId())return;
    await fetchTaskAndCases();
    const input=taskToGeneratorText(task);
    for(const kind of ['post','teste']) {
      if(force||!state[kind].t)state[kind].t=input;
    }
    if(['post','teste'].includes(getMode()))$('t').value=state[getMode()].t;
    $('session-label').textContent='TF em foco: '+(task.codigo?'#'+task.codigo+' · ':'')+task.titulo+'. Revise os dados antes de usar a IA.';
    $('import-task').hidden=false;
    $('import-task').textContent='Recarregar dados da TF';
  }

  $('import-task').onclick=()=>{
    if(!['post','teste'].includes(getMode()))return;
    if($('t').value.trim()&&!confirm('Substituir o texto atual pelos dados da TF em foco?'))return;
    loadTask(true).catch(error=>{$('session-label').textContent=error.message||String(error)});
  };
  $('qa-attach-all').onclick=()=>{
    for(const item of candidates())item.selected=!item.duplicate;
    draw();
  };
  $('qa-create-draft').onclick=()=>{
    const source=state.teste;
    const title=(source.md.match(/^#\s+(?:ROTEIRO DE TESTES\s*[—–-]\s*)?(.+)$/im)||[])[1]
      ||'Nova TF com casos gerados';
    if(!confirm('Criar uma TF em rascunho? Confira os dados antes de salvar; os casos também serão revisados.'))return;
    if(embedded)parent.postMessage({
      type:'qa-hub:create-draft',title,description:(source.t||'').slice(0,4000),
      cases:candidates().filter(x=>x.selected&&!x.duplicate)
    },location.origin);
    else location.href='./qa.html#/nova';
  };
  $('qa-attach-save').onclick=async()=>{
    if(busy||!task)return;
    const selected=candidates().filter(x=>x.selected&&!x.duplicate);
    if(!selected.length)return status('Selecione ao menos um caso.');
    busy=true;draw();status('Gravando os casos revisados...');
    try {
      const taskId=task.id;
      const result=await attachReviewedCases(client,{
        taskId,generationId:state.teste.generationId,items:selected
      });
      const inserted=Number(result.inserted)||0,skipped=Number(result.skipped)||0;
      cached=false;
      await fetchTaskAndCases();
      recompute();
      status(inserted+' caso(s) adicionado(s) à TF. '+skipped+' duplicado(s) ignorado(s).');
      if(embedded)parent.postMessage({type:'qa-hub:cases-attached',taskId,inserted},location.origin);
    }catch(error){
      status('Não foi possível anexar: '+(error.message||error)+'. Revise os dados e tente novamente.');
    }finally{busy=false;draw()}
  };
  $('qa-attach-open').onclick=event=>{
    if(embedded&&task){
      event.preventDefault();
      parent.postMessage({type:'qa-hub:open-task',taskId:task.id},location.origin);
    }
  };
  if(embedded)document.querySelector('.qa-generator-session').hidden=!validTf;
  return {render,loadTask,getTask:()=>task};
}
