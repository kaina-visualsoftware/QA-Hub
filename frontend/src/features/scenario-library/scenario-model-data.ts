import {z} from "zod";
import {scenarioDraftSchema} from "../../lib/contracts";
import type {Scenario,Task,ScenarioDraft} from "../../lib/contracts";
import {addScenario} from "../../lib/data";
import {supabase} from "../../lib/supabase";

const uuid=z.uuid();
const modelSchema=z.object({
  id:uuid,user_id:uuid,titulo:z.string(),passos:z.string(),
  esperado:z.string(),observacoes:z.string(),
  modulo:z.string(),tipo_teste:z.enum(["BUILD","RELEASE"]),
  created_at:z.string()
});
export type ScenarioModel=z.infer<typeof modelSchema>;

export function reusableDraft(source:Pick<Scenario,"titulo"|"passos"|"esperado"|"observacoes">):ScenarioDraft{
  // Do not copy any status, observed result, evidence, ownership or execution history.
  return scenarioDraftSchema.parse({
    titulo:source.titulo,passos:source.passos,
    esperado:source.esperado,observacoes:source.observacoes
  });
}
export async function listScenarioModels(userId:string):Promise<ScenarioModel[]>{
  uuid.parse(userId);
  const {data,error}=await supabase.from("qa_modelos_cenario")
    .select("id,user_id,titulo,passos,esperado,observacoes,modulo,tipo_teste,created_at")
    .eq("user_id",userId).order("created_at",{ascending:false}).limit(100);
  if(error)throw error;
  return z.array(modelSchema).parse(data??[]);
}
export async function saveScenarioModel(userId:string,task:Task,source:Scenario){
  uuid.parse(userId);
  if(task.user_id!==userId||source.tarefa_id!==task.id)
    throw Error("Somente o proprietário pode salvar cenários desta TF na própria biblioteca.");
  const values=reusableDraft(source);
  const {data,error}=await supabase.from("qa_modelos_cenario").insert({
    user_id:userId,...values,
    modulo:(task.sistema??"").trim().slice(0,160),
    tipo_teste:task.tipo_teste
  }).select("id").single();
  if(error)throw error;
  return uuid.parse(data?.id);
}
export async function useScenarioModel(userId:string,task:Task,model:ScenarioModel,nextOrder:number){
  uuid.parse(userId);
  if(task.user_id!==userId)throw Error("Somente o proprietário pode adicionar cenários.");
  // Immutable model is copied into a NEW pending case. No result is copied.
  if(model.user_id!==userId)throw Error("Modelo pertence a outra conta.");
  const draft=reusableDraft(model);
  await addScenario(task.id,userId,draft,nextOrder);
}
export async function removeScenarioModel(userId:string,modelId:string){
  uuid.parse(userId);uuid.parse(modelId);
  const {data,error}=await supabase.from("qa_modelos_cenario").delete()
    .eq("id",modelId).eq("user_id",userId).select("id").single();
  if(error)throw error;
  if(data?.id!==modelId)throw Error("Modelo não removido.");
}
