import { supabase } from "./supabase";
import {
  scenarioSchema, taskSchema, resultSchema, taskDraftSchema, scenarioDraftSchema
} from "./contracts";
import type { Task, Scenario, TaskDraft, ScenarioDraft, ExecutionResult } from "./contracts";

const fail = (error: { message: string } | null) => { if (error) throw Error(error.message); };

export async function getAdminRole(userId: string): Promise<boolean> {
  const { data, error } = await supabase.from("qa_admins")
    .select("user_id").eq("user_id", userId).maybeSingle();
  fail(error);
  return Boolean(data);
}

export async function listTasks(userId: string, isAdmin: boolean): Promise<Task[]> {
  let query = supabase.from("qa_tarefas").select("*")
    .order("executado_em", { ascending: false }).limit(1000);
  if (!isAdmin) query = query.eq("user_id", userId);
  const { data, error } = await query;
  fail(error);
  return (data || []).map((record) => taskSchema.parse(record));
}

export async function listScenarios(taskId: string): Promise<Scenario[]> {
  const { data, error } = await supabase.from("qa_cenarios").select("*")
    .eq("tarefa_id", taskId).order("ordem", { ascending: true }).limit(1000);
  fail(error);
  return (data || []).map((record) => scenarioSchema.parse(record));
}

export async function createTask(userId: string, draft: TaskDraft): Promise<Task> {
  const fields = taskDraftSchema.parse(draft);
  const { data, error } = await supabase.from("qa_tarefas").insert({
    ...fields, user_id: userId, status: "rascunho"
  }).select("*").single();
  fail(error);
  return taskSchema.parse(data);
}

export async function updateTask(taskId: string, draft: TaskDraft): Promise<Task> {
  const fields = taskDraftSchema.parse(draft);
  const { data, error } = await supabase.from("qa_tarefas")
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq("id", taskId).select("*").maybeSingle();
  fail(error);
  if (!data) throw Error("TF não encontrada ou sem permissão de alteração.");
  return taskSchema.parse(data);
}

export async function addScenario(
  taskId: string, userId: string, draft: ScenarioDraft, nextOrder: number
): Promise<void> {
  const fields = scenarioDraftSchema.parse(draft);
  const { error } = await supabase.from("qa_cenarios").insert({
    ...fields, tarefa_id: taskId, user_id: userId,
    ordem: Math.max(0, nextOrder), obtido: "", status: "nao_executado"
  });
  fail(error);
}

export async function saveScenarioResult(
  taskId: string, scenarioId: string, result: ExecutionResult
): Promise<void> {
  const checked = resultSchema.parse(result);
  const { data, error } = await supabase.from("qa_cenarios").update({
    status: checked.status,
    obtido: checked.obtido,
    updated_at: new Date().toISOString()
  }).eq("tarefa_id", taskId).eq("id", scenarioId).select("id").maybeSingle();
  fail(error);
  if (!data) throw Error("Cenário não encontrado ou sem permissão de alteração.");
}

export async function addExtractedScenarios(
  taskId: string, userId: string,
  items: Array<{ titulo: string; passos: string; esperado: string; observacoes: string }>
): Promise<void> {
  if (!items.length) return;
  if (items.length > 50) throw Error("Máximo de 50 cenários por importação.");
  const rows = items.map((item, index) => {
    const value = scenarioDraftSchema.parse({
      titulo: item.titulo, passos: item.passos.slice(0, 20000),
      esperado: (item.esperado || "Conferir o comportamento descrito nos passos.").slice(0, 20000),
      observacoes: item.observacoes || ""
    });
    return {...value, tarefa_id: taskId, user_id: userId,
      ordem: index + 1, obtido: "", status: "nao_executado"};
  });
  const { error } = await supabase.from("qa_cenarios").insert(rows);
  fail(error);
}
