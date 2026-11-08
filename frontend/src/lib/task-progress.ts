import { z } from "zod";
import { supabase } from "./supabase";
import { scenarioStatuses } from "./contracts";

export type TaskProgress = { total: number; executed: number; pending: number };
export type TaskProgressMap = Record<string, TaskProgress>;
type ProgressRow = { tarefa_id: string; status: (typeof scenarioStatuses)[number] };

const progressRow = z.object({
  tarefa_id: z.uuid(),
  status: z.enum(scenarioStatuses)
});
const CHUNK_SIZE = 20;
const PAGE_SIZE = 500;
const MAX_ROWS_PER_CHUNK = 10000;

// Never infer a task's execution progress from its overall status.
// Count the actual persisted scenario statuses, including blocked/failed.
export function summarizeTaskProgress(taskIds: string[], rows: ProgressRow[]): TaskProgressMap {
  const allowed = new Set(taskIds);
  const result: TaskProgressMap = Object.create(null) as TaskProgressMap;
  for (const id of allowed) result[id] = { total: 0, executed: 0, pending: 0 };
  for (const row of rows) {
    if (!allowed.has(row.tarefa_id)) continue;
    const entry = result[row.tarefa_id];
    entry.total++;
    if (row.status === "nao_executado") entry.pending++;
    else entry.executed++;
  }
  return result;
}

// Only fetch minimal task-scoped columns. PostgREST can impose a 1,000-row
// max response, so page every batch instead of reporting truncated progress.
// The visible home page is limited to 30 tasks; no private data is copied.
export async function listTaskProgress(taskIds: string[]): Promise<TaskProgressMap> {
  const ids = [...new Set(taskIds)];
  if (!ids.length) return {};
  if (ids.length > 80 || ids.some(id => !z.uuid().safeParse(id).success)) {
    throw Error("Seleção inválida para consultar progresso.");
  }
  const all: ProgressRow[] = [];
  for (let chunkStart = 0; chunkStart < ids.length; chunkStart += CHUNK_SIZE) {
    const chunk = ids.slice(chunkStart, chunkStart + CHUNK_SIZE);
    let offset = 0;
    for (;;) {
      const { data, error } = await supabase.from("qa_cenarios")
        .select("tarefa_id,status")
        .in("tarefa_id", chunk)
        .order("id", { ascending: true })
        .range(offset, offset + PAGE_SIZE - 1);
      if (error) throw Error("Falha ao consultar progresso: " + error.message);
      const rows = z.array(progressRow).parse(data ?? []);
      all.push(...rows);
      offset += rows.length;
      if (rows.length < PAGE_SIZE) break;
      if (offset >= MAX_ROWS_PER_CHUNK) {
        throw Error("Muitos cenários nesta página para exibir um progresso completo.");
      }
    }
  }
  return summarizeTaskProgress(ids, all);
}
