import type { SupabaseClient } from "@supabase/supabase-js";
export function collectTaskContext(task: {
  titulo?:string;codigo?:string|null;sistema?:string|null;descricao?:string|null;
  explicacao?:string|null;causa?:string|null;correcao?:string|null;
  conclusao?:string|null;observacoes?:string|null
},scenarios?:Array<{titulo?:string;passos?:string;esperado?:string;obtido?:string}>):string;
export function fallbackFlowchart(text:string):string;
export function horizontalFlowchart(source:string):string;
export function cleanMermaid(source:string):string;
export function requestAiDiagram(options:{
  db: Pick<SupabaseClient,"functions">;
  text:string;
  onProgress?:(message:string)=>void;
}):Promise<{code:string;fallback:boolean}>;
