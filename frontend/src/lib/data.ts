import { supabase } from "./supabase";
import { z } from "zod";
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
  items: Array<{ titulo: string; passos: string; esperado: string; observacoes: string }>,
  nextOrder=1
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
      ordem: Math.max(1,nextOrder) + index, obtido: "", status: "nao_executado"};
  });
  const { error } = await supabase.from("qa_cenarios").insert(rows);
  fail(error);
}

export async function setTaskStatus(taskId: string, status: Task["status"]): Promise<void> {
  const valid = taskSchema.shape.status.parse(status);
  const { data, error } = await supabase.from("qa_tarefas").update({
    status: valid, updated_at: new Date().toISOString()
  }).eq("id", taskId).select("id").maybeSingle();
  fail(error);
  if (!data) throw Error("Sem permissão para alterar a situação da TF.");
}

export async function removeTask(taskId: string): Promise<void> {
  const { data, error } = await supabase.from("qa_tarefas").delete()
    .eq("id", taskId).select("id").maybeSingle();
  fail(error);
  if (!data) throw Error("Sem permissão para excluir a TF.");
}

export async function editScenario(
  taskId: string, scenarioId: string, draft: ScenarioDraft
): Promise<void> {
  const fields = scenarioDraftSchema.parse(draft);
  const { data, error } = await supabase.from("qa_cenarios").update({
    ...fields, updated_at: new Date().toISOString()
  }).eq("id", scenarioId).eq("tarefa_id", taskId).select("id").maybeSingle();
  fail(error);
  if (!data) throw Error("Sem permissão para editar o cenário.");
}

export async function removeScenario(taskId: string, scenarioId: string): Promise<void> {
  // The FK detaches preserved evidence when a scenario is deleted.
  // Public image records cannot become orphaned while marked publishable:
  // revoke visibility before removing the scenario (fail closed).
  const { data, error } = await supabase.from("qa_cenarios").delete()
    .eq("id", scenarioId).eq("tarefa_id", taskId).select("id").maybeSingle();
  fail(error);
  if (!data) throw Error("Sem permissão para excluir o cenário.");
}

export const diagramSchema = z.object({
  id: z.uuid(), tarefa_id: z.uuid(), user_id: z.uuid(),
  titulo: z.string(), conteudo: z.string()
});
export type Diagram = z.infer<typeof diagramSchema>;

export const diagramDraftSchema = z.object({
  titulo: z.string().trim().min(1, "Informe o título.").max(160),
  conteudo: z.string().trim().min(4, "Informe o código Mermaid.").max(16000)
});
export type DiagramDraft = z.infer<typeof diagramDraftSchema>;

export async function listDiagrams(taskId: string): Promise<Diagram[]> {
  const { data, error } = await supabase.from("qa_diagramas").select("id,tarefa_id,user_id,titulo,conteudo")
    .eq("tarefa_id", taskId).order("created_at", { ascending: true });
  fail(error);
  return (data || []).map((item) => diagramSchema.parse(item));
}

export async function saveDiagram(taskId: string, userId: string, draft: DiagramDraft, id?: string): Promise<void> {
  const fields = diagramDraftSchema.parse(draft);
  if (id) {
    const { data, error } = await supabase.from("qa_diagramas").update({
      ...fields, updated_at: new Date().toISOString()
    }).eq("id", id).eq("tarefa_id", taskId).select("id").maybeSingle();
    fail(error);
    if (!data) throw Error("Diagrama indisponível ou sem permissão.");
    return;
  }
  const { error } = await supabase.from("qa_diagramas").insert({
    ...fields, tarefa_id: taskId, user_id: userId
  });
  fail(error);
}

export async function removeDiagram(taskId: string, id: string): Promise<void> {
  const { data, error } = await supabase.from("qa_diagramas").delete()
    .eq("id", id).eq("tarefa_id", taskId).select("id").maybeSingle();
  fail(error);
  if (!data) throw Error("Diagrama indisponível ou sem permissão.");
}
