// Isolated synthetic API for F4. Never contacts production Supabase.
// Shared by existing E2E suites to preserve regression coverage.
const saved=[];

export async function mockF4Rpc(route,tasks=[],scenarios=[]){
  const req=route.request(),url=new URL(req.url()),path=url.pathname,method=req.method();
  const cors={
    "Access-Control-Allow-Origin":"*",
    "Access-Control-Allow-Headers":"authorization, apikey, x-client-info, content-type, prefer, accept",
    "Access-Control-Allow-Methods":"GET,POST,PATCH,DELETE,OPTIONS"
  };
  const send=(value,status=200)=>route.fulfill({
    status,headers:cors,contentType:"application/json",body:JSON.stringify(value)
  });
  if(path.endsWith("/rest/v1/rpc/qa_search_tasks")){
    const input=req.postDataJSON()??{};
    const needle=(input.p_search??"").trim().toLowerCase();
    const status=input.p_status??"",type=input.p_type??"";
    const filtered=tasks.filter(t=>
      (!status||t.status===status)&&(!type||t.tipo_teste===type)&&
      (!needle||[t.titulo,t.codigo,t.sistema,t.versao,t.descricao].some(
        value=>String(value??"").toLowerCase().includes(needle)))
    );
    const page=input.p_page??0,size=Math.min(50,input.p_page_size??30);
    await send({items:filtered.slice(page*size,(page+1)*size),
      total:filtered.length,page,page_size:size});
    return true;
  }
  if(path.endsWith("/rest/v1/rpc/qa_task_stats")){
    const count=status=>tasks.filter(t=>t.status===status).length;
    const total=scenarios.length,executed=scenarios.filter(s=>s.status!=="nao_executado").length;
    await send({
      total:tasks.length,
      pending:count("rascunho")+count("em_teste"),
      approved:count("aprovado"),
      problem:count("reprovado")+count("bloqueado"),
      statuses:{
        rascunho:count("rascunho"),em_teste:count("em_teste"),
        aprovado:count("aprovado"),reprovado:count("reprovado"),
        bloqueado:count("bloqueado")
      },
      scenarios:total,executed,recent:tasks.slice(0,5)
    });
    return true;
  }
  if(path.endsWith("/rest/v1/qa_filtros_salvos")){
    const userId=url.searchParams.get("user_id")?.replace(/^eq\./,"");
    if(method==="GET"){
      await send(saved.filter(s=>s.user_id===userId));
      return true;
    }
    if(method==="POST"){
      const body=req.postDataJSON();
      const row={...body,id:"99999999-9999-4999-8999-"+String(saved.length+1).padStart(12,"0"),
        created_at:"2026-11-08T12:00:00Z"};
      if(saved.some(s=>s.nome===row.nome&&s.user_id===row.user_id)){
        await send({message:"Nome de filtro já utilizado"},409);return true;
      }
      saved.unshift(row);await send({id:row.id},201);return true;
    }
    if(method==="DELETE"){
      const id=url.searchParams.get("id")?.replace(/^eq\./,"");
      const index=saved.findIndex(s=>s.id===id && s.user_id===userId);
      if(index<0){await send({message:"Filtro não encontrado"},404);return true;}
      const [removed]=saved.splice(index,1);
      await send({id:removed.id});return true;
    }
  }
  return false;
}
