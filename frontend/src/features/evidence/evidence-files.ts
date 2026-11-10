import type { SupabaseClient } from "@supabase/supabase-js";

export const EVIDENCE_BUCKET="qa-evidence-private";
export const MAX_EVIDENCE_BYTES=10*1024*1024;
export const ACCEPT_EVIDENCE=".png,.jpg,.jpeg,.webp,.pdf,.txt";
const EXTENSION_MIME:Readonly<Record<string,string>>={
  png:"image/png",jpg:"image/jpeg",jpeg:"image/jpeg",webp:"image/webp",
  pdf:"application/pdf",txt:"text/plain"
};
const MIME_EXTENSION:Readonly<Record<string,string>>={
  "image/png":"png","image/jpeg":"jpg","image/webp":"webp",
  "application/pdf":"pdf","text/plain":"txt"
};
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type EvidenceFile = {
  id:string;tarefa_id:string;cenario_id:string|null;user_id:string;
  nome_original:string;mime_type:string;tamanho_bytes:number;
  objeto_path:string;descricao:string;created_at:string;
};
export type FileInput = Pick<File,"name"|"size"|"type"|"slice">;

export async function validateEvidenceFile(file:FileInput):Promise<{mime:string;extension:string}> {
  if(!file.name.trim()||file.name.length>240)
    throw Error("Use um nome de arquivo de até 240 caracteres.");
  if(!Number.isSafeInteger(file.size)||file.size<1||file.size>MAX_EVIDENCE_BYTES)
    throw Error("O arquivo precisa ter entre 1 byte e 10 MB.");
  const ext=file.name.toLowerCase().split(".").pop()??"";
  const mime=EXTENSION_MIME[ext];
  if(!mime)throw Error("Use PNG, JPG, WEBP, PDF ou TXT.");
  if(file.type && file.type!=="application/octet-stream" && file.type!==mime)
    throw Error("O tipo do arquivo não corresponde à extensão.");
  const bytes=new Uint8Array(await file.slice(0,Math.min(file.size,64)).arrayBuffer());
  const ascii=(from:number,to:number)=>String.fromCharCode(...bytes.slice(from,to));
  let valid=false;
  switch(mime){
    case "image/png": valid=bytes.length>=8 &&
      bytes.slice(0,8).every((v,i)=>v===[137,80,78,71,13,10,26,10][i]);break;
    case "image/jpeg": valid=bytes.length>=3 &&
      bytes[0]===255&&bytes[1]===216&&bytes[2]===255;break;
    case "image/webp": valid=ascii(0,4)==="RIFF"&&ascii(8,12)==="WEBP";break;
    case "application/pdf":valid=ascii(0,5)==="%PDF-";break;
    case "text/plain":{
      const text=new Uint8Array(await file.slice(0,Math.min(file.size,4096)).arrayBuffer());
      try {new TextDecoder("utf-8",{fatal:true}).decode(text);valid=!text.includes(0);}
      catch {valid=false;}
      break;
    }
  }
  if(!valid)throw Error("O conteúdo não corresponde a um arquivo válido desse tipo.");
  return {mime,extension:MIME_EXTENSION[mime]};
}

export function fileStoragePath(userId:string,taskId:string,id:string,extension:string){
  if(!UUID.test(userId)||!UUID.test(taskId)||!UUID.test(id)||
    !Object.values(MIME_EXTENSION).includes(extension))
    throw Error("Identificadores ou extensão de arquivo inválidos.");
  return userId+"/"+taskId+"/"+id+"."+extension;
}

export async function listEvidenceFiles(db:SupabaseClient,taskId:string):Promise<EvidenceFile[]> {
  if(!UUID.test(taskId))throw Error("TF inválida.");
  const {data,error}=await db.from("qa_evidencia_arquivos")
    .select("id,tarefa_id,cenario_id,user_id,nome_original,mime_type,tamanho_bytes,objeto_path,descricao,created_at")
    .eq("tarefa_id",taskId).order("created_at",{ascending:false}).limit(101);
  if(error)throw error;
  if((data??[]).length>100)throw Error("Mais de 100 anexos: consulte o histórico completo.");
  return (data??[]) as EvidenceFile[];
}

export async function uploadEvidenceFile(db:SupabaseClient,args:{
  file:File;userId:string;taskId:string;scenarioId:string|null;
  scenarioIds:string[];description:string
}):Promise<EvidenceFile> {
  const {file,userId,taskId,scenarioId,scenarioIds,description}=args;
  const {mime,extension}=await validateEvidenceFile(file);
  if(description.length>1000)throw Error("A descrição pode ter até 1.000 caracteres.");
  if(scenarioId && (!UUID.test(scenarioId)||!scenarioIds.includes(scenarioId)))
    throw Error("Cenário não pertence à TF.");
  const id=crypto.randomUUID();
  const path=fileStoragePath(userId,taskId,id,extension);
  const storage=db.storage.from(EVIDENCE_BUCKET);
  const {error:uploadError}=await storage.upload(path,file,{
    contentType:mime,upsert:false,cacheControl:"0"
  });
  if(uploadError)throw uploadError;
  try {
    const {data,error}=await db.from("qa_evidencia_arquivos").insert({
      id,tarefa_id:taskId,cenario_id:scenarioId,user_id:userId,
      nome_original:file.name,mime_type:mime,tamanho_bytes:file.size,
      objeto_path:path,descricao:description.trim()
    }).select("id,tarefa_id,cenario_id,user_id,nome_original,mime_type,tamanho_bytes,objeto_path,descricao,created_at").single();
    if(error)throw error;
    if(!data?.id || data.id!==id || data.objeto_path!==path)
      throw Error("Metadados do arquivo não confirmados pelo banco.");
    return data as EvidenceFile;
  }catch(reason){
    // The DELETE policy permits only ORPHAN object cleanup. It cannot remove
    // an object referenced by an immutable evidence record.
    const {error:cleanupError}=await storage.remove([path]);
    if(cleanupError)throw Error(
      "Não foi possível registrar o anexo nem limpar o envio. Contate o suporte: "+
      cleanupError.message
    );
    throw reason;
  }
}

export function assertOwnEvidenceFile(record:EvidenceFile,userId:string,taskId:string){
  if(record.user_id!==userId||record.tarefa_id!==taskId||
    !Object.hasOwn(MIME_EXTENSION,record.mime_type)||
    record.objeto_path!==fileStoragePath(userId,taskId,record.id,MIME_EXTENSION[record.mime_type]))
    throw Error("Anexo sem autorização ou com caminho inválido.");
}

export async function readPrivateEvidence(db:SupabaseClient,record:EvidenceFile,
  userId:string,taskId:string):Promise<Blob> {
  assertOwnEvidenceFile(record,userId,taskId);
  const {data,error}=await db.storage.from(EVIDENCE_BUCKET).download(record.objeto_path);
  if(error)throw error;
  if(!data)throw Error("Arquivo não disponível.");
  return data;
}

/** Modify editable metadata without replacing an immutable storage object. */
export async function updateEvidenceDescription(db:SupabaseClient,file:EvidenceFile,
  userId:string,taskId:string,description:string):Promise<void>{
  assertOwnEvidenceFile(file,userId,taskId);
  const value=description.trim();
  if(value.length>1000)throw Error("A observação pode ter até 1.000 caracteres.");
  const {data,error}=await db.from("qa_evidencia_arquivos")
    .update({descricao:value})
    .eq("id",file.id).eq("tarefa_id",taskId).eq("user_id",userId)
    .select("id").maybeSingle();
  if(error)throw error;
  if(data?.id!==file.id)throw Error("Não foi possível editar o anexo.");
}

/** The private Storage DELETE policy allows removal only after metadata is gone.
 * Revoke public permission first; never leave an authorized public image orphan.
 */
export async function removeEvidenceFile(db:SupabaseClient,file:EvidenceFile,
  userId:string,taskId:string):Promise<void>{
  assertOwnEvidenceFile(file,userId,taskId);
  const {data,error}=await db.from("qa_evidencia_arquivos")
    .delete().eq("id",file.id).eq("tarefa_id",taskId).eq("user_id",userId)
    .select("id").maybeSingle();
  if(error)throw error;
  if(data?.id!==file.id)throw Error("Anexo não encontrado ou sem permissão.");
  const {error:storageError}=await db.storage.from(EVIDENCE_BUCKET).remove([file.objeto_path]);
  if(storageError)throw Error("Registro excluído, porém a limpeza do arquivo privado falhou. "+
    "O arquivo não está mais vinculado nem disponível publicamente. Contate o suporte.");
}
