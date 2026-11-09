import type { SupabaseClient } from "@supabase/supabase-js";
export interface GeneratedCase {
  source_index: number | string;
  titulo: string; passos: string; esperado: string; observacoes: string;
  selected: boolean; duplicate?: boolean;
}
export const TASK_UUID: RegExp;
export function taskToGeneratorText(task: Record<string, unknown>): string;
export function scenarioIdentity(item: Pick<GeneratedCase,"titulo"|"passos"|"esperado">): string;
export function parseGeneratedCases(markdown: string): GeneratedCase[];
export function markScenarioDuplicates(items: GeneratedCase[], existing: Pick<GeneratedCase,"titulo"|"passos"|"esperado">[]): GeneratedCase[];
export function onlyNewScenarioCandidates(items: GeneratedCase[], existing: Pick<GeneratedCase,"titulo"|"passos"|"esperado">[]): GeneratedCase[];
export function validateReviewedCases(items: GeneratedCase[]): Array<Omit<GeneratedCase,"selected"|"duplicate">>;
export function attachReviewedCases(client: SupabaseClient, params: {taskId:string;generationId:string;items:GeneratedCase[]}): Promise<{inserted:number;skipped:number;tarefa_id:string}>;
