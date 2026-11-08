export interface ParsedScenario { titulo:string;passos:string;esperado:string;obtido:string;observacoes:string;ordem:number;status:"nao_executado"; }
export interface ParsedReport { titulo:string;tipo_teste:"BUILD"|"RELEASE";descricao:string;conclusao:string;observacoes:string;cenarios:ParsedScenario[];funcionando:boolean|null;erro_reproduzido:boolean|null }
export declare function parseReport(text:string):ParsedReport;
export declare function extractExplicitScenarios(text:string):ParsedScenario[];
