export function extractExplicitScenarios(source:string):Array<{ordem:number;titulo:string;passos:string;esperado:string;obtido:string;observacoes:string;status:"nao_executado"}>;
export function parseReport(source:string):{titulo:string;descricao:string;tipo_teste:"BUILD"|"RELEASE";conclusao:string;observacoes:string;cenarios:ReturnType<typeof extractExplicitScenarios>};
