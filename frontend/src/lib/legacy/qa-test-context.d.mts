import type { SupabaseClient } from "@supabase/supabase-js";
export const TEST_TASK_LIMIT: number;
export function sanitizeAiContext(input: unknown): string;
export interface TaskSupport { scenarios: Record<string, unknown>[]; documents: Record<string, unknown>[]; evidence: Record<string, unknown>[]; events: Record<string, unknown>[]; failures: string[]; }
export function fetchTaskSupport(db: SupabaseClient,task: {id:string;titulo:string;user_id:string},uid:string):Promise<TaskSupport>;
export function composeFullTaskContext(task: {id:string;titulo:string;[key:string]:unknown}, support?:Partial<TaskSupport>, options?:{manual?:string;limit?:number}):{
 text:string;length:number;missing:string[];failedSources:string[];sourceCounts:{scenarios:number;documents:number;evidence:number;events:number}
};
