// Parent visibility is checked on every request; no persistent signed URLs.
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const formats={
 'image/png':['png'],'image/jpeg':['jpg','jpeg'],'image/webp':['webp'],
 'application/pdf':['pdf'],'text/plain':['txt'],'text/markdown':['md'],
 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':['docx']
};
const headers={'Access-Control-Allow-Origin':'*','Cache-Control':'no-store, private, max-age=0',
 'Cross-Origin-Resource-Policy':'cross-origin','X-Content-Type-Options':'nosniff',
 'Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'none'; sandbox"};
export function createPublicAttachmentHandler({base,key,fetcher=fetch}){
 const deny=status=>new Response('Arquivo indisponível.',{status,headers});
 return async req=>{
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:{...headers,'Access-Control-Allow-Methods':'GET, OPTIONS'}});
  if(req.method!=='GET')return deny(405);
  const params=new URL(req.url).searchParams,id=params.get('file')??'';
  const kind=params.get('kind')??'evidence';
  if(!uuid.test(id)||!['evidence','source'].includes(kind))return deny(400);
  if(!base||!key)return deny(503);
  const auth={apikey:key,Authorization:'Bearer '+key};
  async function query(table,params){
   const response=await fetcher(base+'/rest/v1/'+table+'?'+new URLSearchParams({...params,limit:'1'}),
    {headers:auth,signal:AbortSignal.timeout(8000),redirect:'error'});
   if(!response.ok)return null;
   const data=await response.json();return Array.isArray(data)?data[0]:null;
  }
  try{
   const source=kind==='source';
   const file=await query(source?'qa_requisito_fontes':'qa_evidencia_arquivos',{
    id:'eq.'+id,select:source?
     'user_id,tarefa_id,tipo_fonte,mime,tamanho_arquivo,storage_path,nome_arquivo':
     'user_id,tarefa_id,mime_type,tamanho_bytes,objeto_path,nome_original'
   });
   if(!file||(source&&file.tipo_fonte!=='arquivo'))return deny(404);
   const owner=file.user_id,task=file.tarefa_id;
   const mime=source?file.mime:file.mime_type,size=source?file.tamanho_arquivo:file.tamanho_bytes;
   const path=source?file.storage_path:file.objeto_path;
   if(!uuid.test(owner)||!uuid.test(task)||!Object.hasOwn(formats,mime)||
    !Number.isSafeInteger(size)||size<1||size>10485760||typeof path!=='string')return deny(404);
   const parts=path.split('/'),name=parts[2]??'',dot=name.lastIndexOf('.');
   const objectId=name.slice(0,dot),ext=name.slice(dot+1);
   if(parts.length!==3||parts[0]!==owner||parts[1]!==task||!uuid.test(objectId)||
    !formats[mime].includes(ext)||(!source&&objectId!==id))return deny(404);
   const parent=await query('qa_tarefas',{id:'eq.'+task,user_id:'eq.'+owner,publica:'eq.true',select:'id'});
   if(!parent)return deny(404);
   const response=await fetcher(base+'/storage/v1/object/authenticated/'+
    (source?'qa-requisitos/':'qa-evidence-private/')+parts.map(encodeURIComponent).join('/'),
    {headers:auth,signal:AbortSignal.timeout(12000),redirect:'error'});
   if(!response.ok||!response.body)return deny(404);
   const filename=String(source?file.nome_arquivo:file.nome_original);
   const disposition=(mime.startsWith('image/')?'inline':'attachment')+
    "; filename*=UTF-8''"+encodeURIComponent(filename).replaceAll("'",'%27');
   return new Response(response.body,{headers:{...headers,'Content-Type':mime,'Content-Disposition':disposition}});
  }catch{return deny(404);}
 };
}
