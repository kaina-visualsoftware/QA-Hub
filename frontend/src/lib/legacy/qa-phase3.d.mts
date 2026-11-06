import type { SupabaseClient } from "@supabase/supabase-js";
export function normalizeReleaseVersion(input:string):string;
export function exactTaskCodePresent(code:string,numbers:string[]):boolean;
export function comparisonCounters(type:"diff_texto"|"diff_xml",values:{adicionados:number;removidos:number;alterados:number}):{tipo:string;adicionados:number;removidos:number;alterados:number};
export function validateReference(input:{categoria:"checklist"|"regra"|"nota";titulo:string;conteudo:string}):{categoria:"checklist"|"regra"|"nota";titulo:string;conteudo:string};
export function linkTaskRelease(db:SupabaseClient,params:{taskId:string;version:string}):Promise<string>;
export function createReference(db:SupabaseClient,params:{userId:string;categoria:"checklist"|"regra"|"nota";titulo:string;conteudo:string}):Promise<{id:string}>;

export function recordComparison(db:SupabaseClient,params:{
  taskId:string;userId:string;type:"diff_texto"|"diff_xml";
  values:{adicionados:number;removidos:number;alterados:number}
}):Promise<{id:string}>;
