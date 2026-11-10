// Public image proxy: reevaluate both opt-in flags on EVERY request.
const valid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const extensions:Record<string,string>={"image/png":"png","image/jpeg":"jpg","image/webp":"webp"};
const headers={"Access-Control-Allow-Origin":"*","Cache-Control":"no-store, private, max-age=0",
 "Cross-Origin-Resource-Policy":"cross-origin","X-Content-Type-Options":"nosniff",
 "Referrer-Policy":"no-referrer","Content-Security-Policy":"default-src 'none'; sandbox"};
const deny=(status:number)=>new Response("Imagem indisponível.",{status,headers});
Deno.serve(async req=>{
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:{...headers,"Access-Control-Allow-Methods":"GET, OPTIONS"}});
 if(req.method!=="GET")return deny(405);
 const id=new URL(req.url).searchParams.get("file")??"";
 if(!valid.test(id))return deny(400);
 const base=Deno.env.get("SUPABASE_URL"),key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
 if(!base||!key)return deny(503);
 const auth={apikey:key,Authorization:"Bearer "+key};
 const query=async(table:string,params:Record<string,string>)=>{
   const url=base+"/rest/v1/"+table+"?"+new URLSearchParams({...params,limit:"1"});
   const resp=await fetch(url,{headers:auth,signal:AbortSignal.timeout(8000),redirect:"error"});
   return resp.ok?(await resp.json() as Record<string,unknown>[]):null;
 };
 try{
  const files=await query("qa_evidencia_arquivos",{
    id:"eq."+id,select:"user_id,tarefa_id,cenario_id,mime_type,tamanho_bytes,objeto_path,publica"
  });
  const file=files?.[0];
  if(!file||file.publica!==true||!file.cenario_id||
     typeof file.mime_type!=="string"||!extensions[file.mime_type]||
     typeof file.tamanho_bytes!=="number"||file.tamanho_bytes>10485760)return deny(404);
  const owner=String(file.user_id),task=String(file.tarefa_id),scenario=String(file.cenario_id);
  const expected=owner+"/"+task+"/"+id+"."+extensions[file.mime_type];
  if(!valid.test(owner)||!valid.test(task)||!valid.test(scenario)||file.objeto_path!==expected)return deny(404);
  const tasks=await query("qa_tarefas",{id:"eq."+task,user_id:"eq."+owner,publica:"eq.true",select:"id"});
  if(!tasks?.length)return deny(404);
  const cases=await query("qa_cenarios",{id:"eq."+scenario,tarefa_id:"eq."+task,select:"id"});
  if(!cases?.length)return deny(404);
  const path=expected.split("/").map(encodeURIComponent).join("/");
  const image=await fetch(base+"/storage/v1/object/authenticated/qa-evidence-private/"+path,
    {headers:auth,signal:AbortSignal.timeout(12000),redirect:"error"});
  if(!image.ok||!image.body)return deny(404);
  return new Response(image.body,{headers:{...headers,"Content-Type":file.mime_type,"Content-Disposition":"inline"}});
 }catch{return deny(404);}
});
