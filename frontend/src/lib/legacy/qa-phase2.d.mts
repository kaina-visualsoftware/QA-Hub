import type { SupabaseClient } from "@supabase/supabase-js";
export interface TfDocument {id:string;tarefa_id:string;tipo:"post"|"relatorio";titulo:string;conteudo:string;versao:number;created_at:string}
export type ExecutionSummary = {
  total:number;
  nao_executado:number;
  aprovado:number;
  reprovado:number;
  bloqueado:number;
  finalizados:number;
};
export function executionSummary(scenarios?:Array<Record<string, unknown>>):ExecutionSummary;
export function buildTestedSummary(scenarios?:Array<Record<string, unknown>>):string;
export function suggestedExecutionConclusion(scenarios?:Array<Record<string, unknown>>):string;
export function buildExecutionReport(task:Record<string, unknown>,scenarios:Array<Record<string, unknown>>,createdAt?:Date):string;
export function cleanDocumentName(name:string,extension?:string):string;
export function saveTfDocument(db:SupabaseClient,options:{taskId:string;type:"post"|"relatorio";title:string;content:string;source?:"manual"|"execucao"|"gerado"}):Promise<TfDocument>;
