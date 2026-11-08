import type { SupabaseClient } from "@supabase/supabase-js";
export interface Requirement { id:string;tarefa_id:string;codigo:string;tipo:string;titulo:string;descricao:string;criterios_aceite:string;estado:"aprovado";updated_at:string;ordem:number; }
export interface RequirementSnapshot {id:string;codigo:string;tipo:string;titulo:string;descricao:string;criterios_aceite:string;updated_at:string}
export function approvedRequirementRows(rows:Array<{
  id:string; tarefa_id:string; codigo:string; tipo:string; titulo:string; descricao:string;
  criterios_aceite:string; estado:string; updated_at:string; ordem:number
}>,taskId:string):Requirement[];
export function loadApprovedRequirements(db:SupabaseClient,task:{id:string;user_id:string},uid:string):Promise<Requirement[]>;
export function composeRequirementContext(items:Requirement[],selectedIds:string[],complement?:string,options?:{limit?:number;taskId?:string}):{text:string;length:number;selectedCount:number;selectedIds:string[];snapshots:RequirementSnapshot[]};
export function recordRequirementUsage(db:SupabaseClient,options:{taskId:string;uid:string;type:"post"|"teste"|"diagrama";artifactRef:string;snapshots:RequirementSnapshot[]}):Promise<string|null>;
