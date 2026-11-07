import type { SupabaseClient } from "@supabase/supabase-js";
export interface TfDocument {id:string;tarefa_id:string;tipo:"post"|"relatorio";titulo:string;conteudo:string;versao:number;created_at:string}
export function buildExecutionReport(task:Record<string, unknown>,scenarios:Array<Record<string, unknown>>,createdAt?:Date):string;
export function cleanDocumentName(name:string,extension?:string):string;
export function saveTfDocument(db:SupabaseClient,options:{taskId:string;type:"post"|"relatorio";title:string;content:string;source?:"manual"|"execucao"|"gerado"}):Promise<TfDocument>;
