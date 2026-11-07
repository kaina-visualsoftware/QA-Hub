export function validateEvidence(input:{
  tipo:"observacao"|"log"|"captura"|"referencia";
  resumo:string;referencia?:string;cenario_id?:string|null
}):{tipo:"observacao"|"log"|"captura"|"referencia";resumo:string;referencia:string;cenario_id:string|null};
export function auditLabel(item:{acao:string;detalhes?:Record<string,unknown>}):string;
export function auditDetails(item:{acao:string;detalhes?:Record<string,unknown>}):string;
