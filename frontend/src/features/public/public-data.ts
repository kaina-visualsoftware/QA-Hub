import { z } from "zod";
import { supabase } from "../../lib/supabase";

const uuid = z.uuid();
export const publicTaskCardSchema = z.object({
  id: uuid,
  titulo: z.string(),
  codigo: z.string().nullish(),
  tipo_teste: z.string(),
  sistema: z.string().nullish(),
  versao: z.string().nullish(),
  executado_em: z.string().nullish()
});
export const publicTaskDetailSchema = publicTaskCardSchema.extend({
  status: z.string(),
  descricao: z.string().nullish(),
  explicacao: z.string().nullish(),
  causa: z.string().nullish(),
  correcao: z.string().nullish(),
  conclusao: z.string().nullish(),
  observacoes: z.string().nullish()
});
export const publicScenarioSchema = z.object({
  id: uuid, titulo: z.string(), ordem: z.number(),
  passos: z.string().nullish(), esperado: z.string().nullish(),
  obtido: z.string().nullish(), observacoes: z.string().nullish(),
  status: z.string().nullish()
});
export const publicDiagramSchema = z.object({
  id: uuid, titulo: z.string(), conteudo: z.string()
});
export type PublicTaskCard = z.infer<typeof publicTaskCardSchema>;
export type PublicTaskDetail = z.infer<typeof publicTaskDetailSchema>;
export type PublicScenario = z.infer<typeof publicScenarioSchema>;
export type PublicDiagram = z.infer<typeof publicDiagramSchema>;

export const PUBLIC_TASK_COLUMNS =
  "id,titulo,codigo,tipo_teste,sistema,versao,executado_em";
export const PUBLIC_DETAIL_COLUMNS = PUBLIC_TASK_COLUMNS +
  ",status,descricao,explicacao,causa,correcao,conclusao,observacoes";
export const PUBLIC_SCENARIO_COLUMNS = "id,titulo,ordem,passos,esperado,obtido,observacoes,status";
export const PUBLIC_DIAGRAM_COLUMNS = "id,titulo,conteudo";

export async function listPublishedTasks(): Promise<PublicTaskCard[]> {
  const { data, error } = await supabase.from("qa_tarefas")
    .select(PUBLIC_TASK_COLUMNS).eq("publica", true)
    .order("executado_em", { ascending: false }).limit(150);
  if (error) throw Error("Não foi possível consultar a biblioteca pública.");
  return z.array(publicTaskCardSchema).parse(data ?? []);
}
export async function loadPublishedTask(taskId: string) {
  uuid.parse(taskId);
  // Exact opt-in filter; an administrator session must never broaden this query.
  const task = await supabase.from("qa_tarefas")
    .select(PUBLIC_DETAIL_COLUMNS).eq("id", taskId)
    .eq("publica", true).maybeSingle();
  if (task.error) throw Error("Não foi possível carregar a TF pública.");
  if (!task.data) return null;
  const [scenarios, diagrams] = await Promise.all([
    supabase.from("qa_cenarios").select(PUBLIC_SCENARIO_COLUMNS)
      .eq("tarefa_id", taskId).order("ordem", { ascending: true }).limit(300),
    supabase.from("qa_diagramas").select(PUBLIC_DIAGRAM_COLUMNS)
      .eq("tarefa_id", taskId).order("created_at", { ascending: true }).limit(100)
  ]);
  if (scenarios.error || diagrams.error) {
    throw Error("Não foi possível carregar os itens publicados.");
  }
  return {
    task: publicTaskDetailSchema.parse(task.data),
    scenarios: z.array(publicScenarioSchema).parse(scenarios.data ?? []),
    diagrams: z.array(publicDiagramSchema).parse(diagrams.data ?? [])
  };
}
export async function updatePublication(taskId: string, userId: string, publish: boolean) {
  uuid.parse(taskId);
  uuid.parse(userId);
  const { data, error } = await supabase.from("qa_tarefas")
    .update({ publica: publish, updated_at: new Date().toISOString() })
    .eq("id", taskId).eq("user_id", userId)
    .select("id,publica").maybeSingle();
  if (error) throw Error(error.message);
  if (!data || data.id !== taskId || data.publica !== publish)
    throw Error("Não foi possível alterar a publicação. Somente o autor pode fazer isso.");
  return publish;
}
