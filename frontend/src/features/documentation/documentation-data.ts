import {z} from 'zod';
import {supabase} from '../../lib/supabase';
export const docTypes={nota:'Nota',manual:'Manual',solucao:'Solução de problema',tarefa:'Documentação de tarefa',checklist:'Checklist'};
export const documentationDraftSchema=z.object({
 titulo:z.string().trim().min(3,'Informe um título com pelo menos 3 caracteres.').max(160),
 conteudo:z.string().trim().min(3,'Escreva o conteúdo da documentação.').max(80000),
 tipo_documentacao:z.enum(['nota','manual','solucao','tarefa','checklist']).default('nota'),
 publica:z.boolean().default(false),tarefa_id:z.uuid().nullable().default(null)
});
export type DocDraft=z.infer<typeof documentationDraftSchema>;
export type Documentation=DocDraft&{id:string;user_id?:string;categoria:string;created_at:string;updated_at:string};
export type DocFile={id:string;documentacao_id:string;nome:string;mime:string;tamanho:number;path:string;created_at:string};
const columns='id,user_id,categoria,titulo,conteudo,tipo_documentacao,publica,tarefa_id,created_at,updated_at';
const fileColumns='id,documentacao_id,nome,mime,tamanho,path,created_at';
export async function listDocumentation(scope:'mine'|'public',userId?:string):Promise<Documentation[]>{
 if(scope==='public'){
  const {data,error}=await supabase.rpc('qa_public_documentacoes_v1');if(error)throw error;return data??[];
 }
 if(!userId)return [];
 const {data,error}=await supabase.from('qa_referencias').select(columns).eq('user_id',userId).order('updated_at',{ascending:false});
 if(error)throw error;return data??[];
}
export async function loadDocumentation(id:string,userId?:string):Promise<Documentation|null>{
 z.uuid().parse(id);
 if(userId){const {data,error}=await supabase.from('qa_referencias').select(columns).eq('id',id).eq('user_id',userId).maybeSingle();if(error)throw error;if(data)return data;}
 const {data,error}=await supabase.rpc('qa_public_documentacoes_v1',{p_id:id});if(error)throw error;return data?.[0]??null;
}
export async function saveDocumentation(draft:DocDraft,userId:string,id?:string):Promise<Documentation>{
 const valid=documentationDraftSchema.parse(draft);
 const body={...valid,categoria:valid.tipo_documentacao==='checklist'?'checklist':'nota',updated_at:new Date().toISOString()};
 const query=id?supabase.from('qa_referencias').update(body).eq('id',id).eq('user_id',userId):supabase.from('qa_referencias').insert({...body,user_id:userId});
 const {data,error}=await query.select(columns).single();if(error)throw error;
 if(!data?.id)throw Error('O salvamento não foi confirmado.');return data;
}
export async function listDocFiles(id:string):Promise<DocFile[]>{
 const {data,error}=await supabase.from('qa_documentacao_arquivos').select(fileColumns).eq('documentacao_id',id).order('created_at');
 if(error)throw error;return data??[];
}
const formats:Record<string,string[]>={png:['image/png'],jpg:['image/jpeg'],jpeg:['image/jpeg'],webp:['image/webp'],gif:['image/gif'],mp4:['video/mp4'],webm:['video/webm'],ogg:['video/ogg'],pdf:['application/pdf'],txt:['text/plain'],md:['text/markdown','text/plain'],csv:['text/csv','text/plain'],docx:['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],xlsx:['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],zip:['application/zip','application/x-zip-compressed']};
export const docFileAccept=Object.keys(formats).map(ext=>'.'+ext).join(',');
export function documentationFileFormat(file:Pick<File,'name'|'size'|'type'>){
 const ext=file.name.toLowerCase().split('.').pop()??'';
 if(!file.name.trim()||file.name.length>240||file.size<1||file.size>50*1024*1024)throw Error('Use arquivos de até 50 MB, com nome de até 240 caracteres.');
 if(!Object.hasOwn(formats,ext)||file.type&&file.type!=='application/octet-stream'&&!formats[ext].includes(file.type))throw Error('Formato não suportado. Use imagem, vídeo MP4/WebM/OGG, PDF, Office, texto ou ZIP.');
 return ext;
}
export async function uploadDocFile(file:File,docId:string,userId:string){
 const ext=documentationFileFormat(file),id=crypto.randomUUID(),path=userId+'/'+docId+'/'+id+'.'+ext;
 const storage=supabase.storage.from('qa-documentacoes');
 const {error:uploadError}=await storage.upload(path,file,{contentType:formats[ext][0],cacheControl:'0',upsert:false});if(uploadError)throw uploadError;
 const {error}=await supabase.from('qa_documentacao_arquivos').insert({id,documentacao_id:docId,user_id:userId,nome:file.name,mime:formats[ext][0],tamanho:file.size,path});
 if(error){await storage.remove([path]);throw error;}
}
export async function readDocFile(file:DocFile){
 const {data,error}=await supabase.storage.from('qa-documentacoes').download(file.path);if(error)throw error;return data;
}
export async function removeDocFile(file:DocFile){
 const {data,error}=await supabase.from('qa_documentacao_arquivos').delete().eq('id',file.id).eq('documentacao_id',file.documentacao_id).select('id').single();
 if(error)throw error;if(!data?.id)throw Error('Arquivo não encontrado ou sem permissão.');
 const {error:storageError}=await supabase.storage.from('qa-documentacoes').remove([file.path]);if(storageError)throw Error('O anexo foi desvinculado, mas a limpeza do arquivo falhou. '+storageError.message);
}
export async function deleteDocumentation(doc:Documentation,userId:string){
 if(doc.user_id!==userId)throw Error('Somente o autor pode excluir esta documentação.');
 for(const file of await listDocFiles(doc.id))await removeDocFile(file);
 const {data,error}=await supabase.from('qa_referencias').delete().eq('id',doc.id).eq('user_id',userId).select('id').single();
 if(error)throw error;if(!data?.id)throw Error('A exclusão não foi confirmada.');
}
