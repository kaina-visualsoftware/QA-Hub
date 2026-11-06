import type { SupabaseClient } from "@supabase/supabase-js";
export const COVERAGE_STATES: Record<string,string>;
export interface CoverageScenario {id:string;tarefa_id:string;titulo:string;status:"nao_executado"|"aprovado"|"reprovado"|"bloqueado"}
export interface CoverageRequirement {id:string;tarefa_id:string;codigo:string;tipo:string;titulo:string;descricao:string;estado:string;ordem:number}
export interface CoverageLink {id:string;tarefa_id:string;requisito_id:string;cenario_id:string}
export interface CoverageRow extends CoverageRequirement {
  cases:CoverageScenario[];linkedCount:number;executedCount:number;
  coverage:string; statusCounts:Record<string,number>;
}
export function calculateRequirementCoverage(
  requirements:CoverageRequirement[],scenarios:CoverageScenario[],links:CoverageLink[],taskId:string
):{items:CoverageRow[];totals:{total:number;linked:number;unlinked:number;validated:number;pending:number;blocked:number;failed:number;fullyExecuted:number;distinctLinkedCases:number;coveragePercent:number;validationPercent:number}};
export function saveRequirementScenarioLinks(db:SupabaseClient,params:{taskId:string;requirementId:string;scenarioIds:string[]}):Promise<{tarefa_id:string;requisito_id:string;linked:number;inserted:number;removed:number}>;
export function coverageCsv(rows:CoverageRow[]):string;
