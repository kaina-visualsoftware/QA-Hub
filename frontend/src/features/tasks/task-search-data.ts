import { z } from "zod";
import { supabase } from "../../lib/supabase";
import { taskSchema, taskStatusLabels } from "../../lib/contracts";
import type { Task } from "../../lib/contracts";

export const TASK_SEARCH_SIZE=30;
export type TaskSearchFilters={
  search:string; status:string; type:string;
};
export const emptyTaskFilters:TaskSearchFilters={
  search:"",status:"",type:""
};
const searchResult=z.object({
  items:z.array(taskSchema),total:z.number().int().nonnegative()
});
const statistics=z.object({
  total:z.number().int().nonnegative(),
  pending:z.number().int().nonnegative(),
  approved:z.number().int().nonnegative(),
  problem:z.number().int().nonnegative(),
  scenarios:z.number().int().nonnegative(),
  executed:z.number().int().nonnegative(),
  statuses:z.object({
    rascunho:z.number(),em_teste:z.number(),aprovado:z.number(),
    reprovado:z.number(),bloqueado:z.number()
  }),
  recent:z.array(taskSchema)
});
export type TaskStats=z.infer<typeof statistics>;
const savedFilter=z.object({
  id:z.uuid(),user_id:z.uuid(),nome:z.string(),
  pesquisa:z.string(),situacao:z.string(),tipo:z.string(),
  created_at:z.string()
});
export type SavedTaskFilter=z.infer<typeof savedFilter>;

export function normalizeTaskFilters(filters:TaskSearchFilters):TaskSearchFilters{
  const search=filters.search.trim().slice(0,120);
  const status=Object.hasOwn(taskStatusLabels,filters.status)?filters.status:"";
  const type=["BUILD","RELEASE"].includes(filters.type)?filters.type:"";
  return {search,status,type};
}
export async function searchTasksPage(filters:TaskSearchFilters,page:number):Promise<{
  items:Task[];total:number;
}>{
  if(!Number.isInteger(page)||page<0)throw Error("Página inválida.");
  const input=normalizeTaskFilters(filters);
  const {data,error}=await supabase.rpc("qa_search_tasks",{
    p_search:input.search,p_status:input.status,p_type:input.type,
    p_page:page,p_page_size:TASK_SEARCH_SIZE
  });
  if(error)throw error;
  return searchResult.parse(data);
}
export async function taskStatistics():Promise<TaskStats>{
  const {data,error}=await supabase.rpc("qa_task_stats");
  if(error)throw error;
  return statistics.parse(data);
}
export async function getTaskById(id:string,userId:string,isAdmin:boolean):Promise<Task|null>{
  const uuid=z.uuid().parse(id);
  const scoped=supabase.from("qa_tarefas").select("*").eq("id",uuid).is("archived_at",null);
  const {data,error}=await (isAdmin?scoped:scoped.eq("user_id",z.uuid().parse(userId)))
    .limit(1);
  if(error)throw error;
  const row=(data??[]).find(item=>item.id===uuid);
  if(row)return taskSchema.parse(row);
  if(isAdmin)return null;
  // A team member can read a TF shared through RLS even when they are not
  // its owner. Query that single ID only; never enumerate another account.
  const shared=await supabase.from("qa_tarefas").select("*").eq("id",uuid).is("archived_at",null).limit(1);
  if(shared.error)throw shared.error;
  const sharedRow=(shared.data??[]).find(item=>item.id===uuid);
  return sharedRow?taskSchema.parse(sharedRow):null;
}
export async function listSavedFilters(userId:string):Promise<SavedTaskFilter[]>{
  z.uuid().parse(userId);
  const {data,error}=await supabase.from("qa_filtros_salvos").select("*")
    .eq("user_id",userId).order("created_at",{ascending:false}).limit(30);
  if(error)throw error;
  return z.array(savedFilter).parse(data??[]);
}
export async function saveFilter(userId:string,name:string,filters:TaskSearchFilters){
  z.uuid().parse(userId);
  const normalized=normalizeTaskFilters(filters);
  if(name.trim().length<2||name.trim().length>60)
    throw Error("Informe um nome de 2 a 60 caracteres.");
  const {data,error}=await supabase.from("qa_filtros_salvos").insert({
    user_id:userId,nome:name.trim(),pesquisa:normalized.search,
    situacao:normalized.status,tipo:normalized.type
  }).select("id").single();
  if(error)throw error;
  if(!data?.id)throw Error("O banco não confirmou o filtro salvo.");
  return data.id as string;
}
export async function deleteFilter(userId:string,id:string){
  z.uuid().parse(userId);z.uuid().parse(id);
  const {data,error}=await supabase.from("qa_filtros_salvos").delete()
    .eq("user_id",userId).eq("id",id).select("id").single();
  if(error)throw error;
  if(data?.id!==id)throw Error("O filtro não foi excluído.");
}
