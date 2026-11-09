import type { SupabaseClient } from "@supabase/supabase-js";
export function collectTaskContext(task: {
  titulo?:string;codigo?:string|null;sistema?:string|null;descricao?:string|null;
  explicacao?:string|null;causa?:string|null;correcao?:string|null;
  conclusao?:string|null;observacoes?:string|null
},scenarios?:Array<{titulo?:string;passos?:string;esperado?:string;obtido?:string}>):string;
export function requestAiDiagramSummary(options:{
  db:Pick<SupabaseClient,"functions">;
  text:string;
  signal?:AbortSignal;
}):Promise<string>;
export function fallbackFlowchart(text:string):string;
export function horizontalFlowchart(source:string):string;
export function cleanMermaid(source:string):string;
export function requestAiDiagram(options:{
  db: Pick<SupabaseClient,"functions">;
  text:string;
  repair?: {mermaid:string;syntaxError:string}|null;
  onProgress?:(message:string)=>void;
}):Promise<{code:string;fallback:boolean}>;
