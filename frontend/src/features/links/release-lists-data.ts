import {z} from "zod";
import {supabase} from "../../lib/supabase";

export const releaseListScope=z.enum(["pessoal","equipe","global"]);
export type ReleaseListScope=z.infer<typeof releaseListScope>;
const uuid=z.uuid();
const listSchema=z.object({
 id:uuid,owner_id:uuid,nome:z.string(),escopo:releaseListScope,
 equipe_id:uuid.nullable(),created_at:z.string(),updated_at:z.string()
});
const itemSchema=z.object({
 id:uuid,lista_id:uuid,nome:z.string(),ordem:z.number().int(),
 ativo:z.boolean(),created_at:z.string()
});
export type ReleaseList=z.infer<typeof listSchema>;
export type ReleaseListItem=z.infer<typeof itemSchema>;

function fail(error:{message:string}|null){if(error)throw Error(error.message);}
export function normalizeReleaseItem(value:string){
 const cleaned=value.replace(/\\s+/g," ").trim();
 if(cleaned.length<2||cleaned.length>90)throw Error("Use um nome de 2 a 90 caracteres.");
 return cleaned;
}
export async function releaseLists():Promise<ReleaseList[]>{
 const {data,error}=await supabase.from("qa_release_listas")
  .select("id,owner_id,nome,escopo,equipe_id,created_at,updated_at")
  .order("nome",{ascending:true}).limit(101);
 fail(error);
 if((data??[]).length>100)throw Error("Mais de 100 listas disponíveis. Solicite a revisão do cadastro.");
 return z.array(listSchema).parse(data??[]);
}
export async function releaseItems(listId:string):Promise<ReleaseListItem[]>{
 uuid.parse(listId);
 const {data,error}=await supabase.from("qa_release_lista_itens")
  .select("id,lista_id,nome,ordem,ativo,created_at")
  .eq("lista_id",listId).order("ordem",{ascending:true}).limit(201);
 fail(error);
 if((data??[]).length>200)throw Error("Esta lista possui itens demais.");
 return z.array(itemSchema).parse(data??[]);
}
export async function createReleaseList(userId:string,name:string,scope:ReleaseListScope,teamId:string|null){
 uuid.parse(userId);releaseListScope.parse(scope);
 const nome=normalizeReleaseItem(name);
 if(scope==="equipe"&&!teamId)throw Error("Escolha uma equipe que você gerencia.");
 const equipe_id=scope==="equipe"?uuid.parse(teamId):null;
 const {data,error}=await supabase.from("qa_release_listas")
  .insert({owner_id:userId,nome,escopo:scope,equipe_id})
  .select("id").single();
 fail(error);
 return uuid.parse(data?.id);
}
export async function renameReleaseList(id:string,nome:string){
 uuid.parse(id);
 const {data,error}=await supabase.from("qa_release_listas")
  .update({nome:normalizeReleaseItem(nome),updated_at:new Date().toISOString()})
  .eq("id",id).select("id").maybeSingle();
 fail(error);
 if(data?.id!==id)throw Error("Lista não encontrada ou sem permissão.");
}
export async function removeReleaseList(id:string){
 uuid.parse(id);
 const {data,error}=await supabase.from("qa_release_listas")
  .delete().eq("id",id).select("id").maybeSingle();
 fail(error);
 if(data?.id!==id)throw Error("Não foi possível excluir a lista.");
}
export async function addReleaseItem(listId:string,nome:string,ordem:number){
 uuid.parse(listId);
 if(!Number.isSafeInteger(ordem)||ordem<0||ordem>10000)throw Error("Ordem inválida.");
 const {data,error}=await supabase.from("qa_release_lista_itens")
  .insert({lista_id:listId,nome:normalizeReleaseItem(nome),ordem})
  .select("id").single();
 fail(error);
 return uuid.parse(data?.id);
}
export async function renameReleaseItem(id:string,name:string){
 uuid.parse(id);
 const {data,error}=await supabase.from("qa_release_lista_itens")
  .update({nome:normalizeReleaseItem(name)}).eq("id",id).select("id").maybeSingle();
 fail(error);
 if(data?.id!==id)throw Error("Nome não encontrado ou sem permissão.");
}
export async function setReleaseItemActive(id:string,ativo:boolean){
 uuid.parse(id);
 const {data,error}=await supabase.from("qa_release_lista_itens")
  .update({ativo}).eq("id",id).select("id").maybeSingle();
 fail(error);
 if(data?.id!==id)throw Error("Não foi possível alterar a situação.");
}
export async function removeReleaseItem(id:string){
 uuid.parse(id);
 const {data,error}=await supabase.from("qa_release_lista_itens")
  .delete().eq("id",id).select("id").maybeSingle();
 fail(error);
 if(data?.id!==id)throw Error("Nome não encontrado ou sem permissão.");
}
