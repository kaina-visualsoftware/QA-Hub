export const REQUIREMENT_TYPES: string[];
export const REQUIREMENT_STATES: string[];
export interface DraftRequirement {
  codigo:string; tipo:string; titulo:string; descricao:string; criterios_aceite:string;
  origem_trecho:string; estado:"rascunho"|"aprovado"; ordem:number;
  suggested?:boolean; duplicate?:boolean; selected:boolean;
}
export function parseRequirements(source:string,options?:{existing:Array<{codigo:string;descricao:string;estado:string}>}):DraftRequirement[];
export function prepareImport(source:string,items:DraftRequirement[]):{text:string;items:Array<Omit<DraftRequirement,"selected"|"duplicate"|"suggested">>};
export function normalizeRequirement(item:Omit<DraftRequirement,"selected"|"duplicate"|"suggested">):Omit<DraftRequirement,"selected"|"duplicate"|"suggested">;
