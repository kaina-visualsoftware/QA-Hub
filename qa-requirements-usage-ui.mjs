// Private read-only history of the exact approved requirement revisions used
// in posts, test plans and diagrams. Never displays or downloads source files.
export function createRequirementUsageUi({db,getTaskId}){
  const list=document.querySelector('#requirements-usage-list');
  const status=document.querySelector('#requirements-usage-status');
  if(!list||!status)throw Error('Histórico de requisitos indisponível.');
  let token=0;
  const build=(tag,cls='',text='')=>{
    const el=document.createElement(tag);if(cls)el.className=cls;
    el.textContent=text;return el;
  };
  function reset(){
    token++;
    list.replaceChildren();
    status.textContent='Nenhuma geração vinculada aos requisitos desta TF.';
  }
  async function load(taskId){
    const index=++token;
    list.replaceChildren();
    if(!taskId)return reset();
    status.textContent='Consultando histórico de requisitos…';
    try{
      const {data,error}=await db.from('qa_geracao_contextos')
        .select('id,tarefa_id,tipo,artefato_ref,requisitos_snapshot,quantidade,created_at')
        .eq('tarefa_id',taskId).order('created_at',{ascending:false}).limit(100);
      if(error)throw error;
      if(index!==token||getTaskId()!==taskId)return;
      const rows=data||[];
      status.textContent=rows.length?
        rows.length+' registro(s) de contextos gerados.' :
        'Ainda não há gerações com requisitos aprovados vinculadas a esta TF.';
      for(const item of rows){
        const article=build('article','qa-req-saved');
        const label={post:'Post',teste:'Roteiro de testes',diagrama:'Diagrama'}[item.tipo]||item.tipo;
        const when=item.created_at?new Date(item.created_at).toLocaleString('pt-BR'):'Data não informada';
        const title=build('strong','',label+' · '+when);
        article.append(title,build('p','muted fine',
          (Number(item.quantidade)||0)+' requisito(s) utilizados · ID da geração: '+item.artefato_ref));
        const details=build('details','qa-r3-usage-detail');
        details.append(build('summary','','Consultar versões e conteúdo usados'));
        const snapshots=Array.isArray(item.requisitos_snapshot)?item.requisitos_snapshot:[];
        for(const req of snapshots){
          const section=build('div','qa-r3-usage-item');
          const recorded=req.updated_at?new Date(req.updated_at).toLocaleString('pt-BR'):'Versão não informada';
          section.append(build('strong','',req.codigo+' · '+req.titulo),
            build('p','','Revisão utilizada: '+recorded),
            build('p','',req.descricao));
          if(req.criterios_aceite)section.append(build('p','','Critérios de aceite: '+req.criterios_aceite));
          details.append(section);
        }
        article.append(details);list.append(article);
      }
    }catch(error){
      if(index!==token)return;
      status.textContent='Não foi possível consultar o histórico de requisitos: '+(error?.message||String(error));
    }
  }
  return {load,reset};
}
