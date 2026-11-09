import {z} from "zod";
import {supabase} from "../../lib/supabase";

const uuid=z.uuid();
const rowBase=z.object({id:uuid,titulo:z.string(),archived_at:z.string()});
export const trashSchema=z.object({
  tasks:z.array(rowBase.extend({
    codigo:z.string().nullish(),sistema:z.string().nullish(),
    versao:z.string().nullish()
  })),
  scenarios:z.array(rowBase.extend({
    tarefa_id:uuid,tarefa_titulo:z.string()
  }))
});
export type Trash=z.infer<typeof trashSchema>;

export function trashDate(value:string){
  const date=new Date(value);
  return Number.isNaN(date.getTime())?"Data indisponível":
    date.toLocaleString("pt-BR");
}

export async function listTrash():Promise<Trash>{
  const {data,error}=await supabase.rpc("qa_trash_v1");
  if(error)throw Error(error.message);
  return trashSchema.parse(data);
}

async function runArchiveRpc(
  name:"qa_archive_task"|"qa_restore_task"|"qa_archive_scenario"|"qa_restore_scenario",
  taskId:string,scenarioId?:string
):Promise<string>{
  const p_task=uuid.parse(taskId);
  const params:Record<string,string>={p_task};
  if(scenarioId)params.p_scenario=uuid.parse(scenarioId);
  const {data,error}=await supabase.rpc(name,params);
  if(error)throw Error(error.message);
  const returned=uuid.parse(data);
  if(returned!==scenarioId && returned!==taskId)
    throw Error("A confirmação do banco não corresponde ao registro solicitado.");
  return returned;
}
export const archiveTask=(taskId:string)=>runArchiveRpc("qa_archive_task",taskId);
export const restoreTask=(taskId:string)=>runArchiveRpc("qa_restore_task",taskId);
export const archiveScenario=(taskId:string,scenarioId:string)=>
  runArchiveRpc("qa_archive_scenario",taskId,scenarioId);
export const restoreScenario=(taskId:string,scenarioId:string)=>
  runArchiveRpc("qa_restore_scenario",taskId,scenarioId);
