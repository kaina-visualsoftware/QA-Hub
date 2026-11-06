export type LocalScenario = {
  ordem:number; titulo:string; passos:string; esperado:string;
  obtido:string; observacoes:string; status:"nao_executado";
};
export type LocalDraft = {
  fields: Record<string,string>;
  cenarios: LocalScenario[];
};
export const ASSIST_SCENARIO_LIMIT: number;
export const ASSIST_FIELD_LIMITS: Readonly<Record<string,number>>;
export function extractLocalDraft(text:string):LocalDraft;
export function normalizeDraft(raw:Record<string,unknown>):LocalDraft;
