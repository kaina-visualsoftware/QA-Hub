import {z} from "zod";
import {supabase} from "../../lib/supabase";
import {scenarioStatuses} from "../../lib/contracts";

const historyRow=z.object({
  id:z.uuid(),cenario_id:z.uuid(),tarefa_id:z.uuid(),user_id:z.uuid(),
  actor_id:z.uuid().nullish(),origem:z.enum(["base","alteracao"]),
  status_anterior:z.enum(scenarioStatuses).nullish(),
  status_novo:z.enum(scenarioStatuses),
  obtido_anterior:z.string(),obtido_novo:z.string(),created_at:z.string()
});
export type ExecutionHistory=z.infer<typeof historyRow>;
const taskChange=z.object({
  id:z.uuid(),tarefa_id:z.uuid(),user_id:z.uuid(),
  anterior:z.record(z.string(),z.unknown()),
  atual:z.record(z.string(),z.unknown()),created_at:z.string()
});
export type TaskChange=z.infer<typeof taskChange>;
export const HISTORY_SIZE=40;

export async function historyPage(taskId:string,scenarioId:string,page:number){
  z.uuid().parse(taskId);
  if(scenarioId)z.uuid().parse(scenarioId);
  if(!Number.isSafeInteger(page)||page<0)throw Error("Página inválida.");
  let query=supabase.from("qa_execucao_historico").select("*")
    .eq("tarefa_id",taskId).order("created_at",{ascending:false})
    .order("id",{ascending:false})
    .range(page*HISTORY_SIZE,(page+1)*HISTORY_SIZE-1);
  if(scenarioId)query=query.eq("cenario_id",scenarioId);
  const {data,error}=await query;
  if(error)throw error;
  return z.array(historyRow).parse(data??[]);
}
export async function listTaskChanges(taskId:string){
  z.uuid().parse(taskId);
  const {data,error}=await supabase.from("qa_tarefa_mudancas").select("*")
    .eq("tarefa_id",taskId).order("created_at",{ascending:false}).limit(100);
  if(error)throw error;
  return z.array(taskChange).parse(data??[]);
}
export function changedFields(before:Record<string,unknown>,after:Record<string,unknown>){
  return Object.keys(after).filter(key=>String(before[key]??"")!==String(after[key]??""))
    .map(key=>({field:key,old:String(before[key]??""),next:String(after[key]??"")}));
}
