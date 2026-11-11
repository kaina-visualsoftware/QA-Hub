import type {Scenario} from "../../lib/contracts";
/** F3.2: only explicit DB links count as requirement coverage.
 * Heuristic mentions in AI text never count as tested/covered.
 */
import {calculateRequirementCoverage} from "../../lib/legacy/qa-requirements-coverage.mjs";
import {composeRequirementContext} from "../../lib/legacy/qa-requirements-context.mjs";
type Requirement={id:string;tarefa_id:string;estado:string;codigo:string;titulo:string;
 descricao:string;criterios_aceite:string;ordem:number;tipo:string;updated_at:string};
type ScenarioLink={tarefa_id:string;requisito_id:string;cenario_id:string};
type SavedCase={id:string;tarefa_id:string;titulo:string;status:Scenario["status"]};
export type CoverageCandidate={id:string;codigo:string;titulo:string;
 reason:"unlinked"|"changed";linkedCount:number;coverage:string};
export function candidatesForReview(requirements:Requirement[],cases:SavedCase[],
 links:ScenarioLink[],taskId:string,changedCodes:string[]=[]){
 const matrix=calculateRequirementCoverage(requirements,cases,links,taskId);
 const changed=new Set(changedCodes);
 const candidates:CoverageCandidate[]=[];
 for(const r of matrix.items){
  if(r.linkedCount===0)candidates.push({
   id:r.id,codigo:r.codigo,titulo:r.titulo,linkedCount:0,
   coverage:r.coverage,reason:"unlinked"
  });
  else if(changed.has(r.codigo))candidates.push({
   id:r.id,codigo:r.codigo,titulo:r.titulo,linkedCount:r.linkedCount,
   coverage:r.coverage,reason:"changed"
  });
 }
 return {matrix,candidates};
}
export function prepareFocusedCoverageTask(requirements:Requirement[],ids:string[],
 taskId:string,taskContext:string){
 if(!ids.length||ids.length>35)throw Error("Selecione de 1 a 35 requisitos para gerar casos.");
 const approved=requirements.filter((r):r is Requirement&{estado:"aprovado"}=>
  r.tarefa_id===taskId&&r.estado==="aprovado");
 const selected=new Set(ids);
 if(approved.filter(r=>selected.has(r.id)).length!==selected.size)
  throw Error("A seleção contém requisitos indisponíveis ou não aprovados.");
 const codes=approved.filter(r=>selected.has(r.id)).map(r=>r.codigo);
 const instruction=[
  "FOCO DA GERAÇÃO INCREMENTAL:",
  "Gere somente casos novos para estes requisitos aprovados: "+codes.join(", ")+".",
  "Respeite o contexto da TF e os cenários existentes; não repita nenhum caso.",
  "Se não há evidência suficiente para criar um caso, explique a pendência em vez de inventar.",
  "Os casos serão apenas sugestões NÃO EXECUTADAS. Nenhum requisito será marcado como coberto automaticamente."
 ].join("\n");
 const composed=composeRequirementContext(approved,ids,instruction,{taskId,limit:20000});
 if(!taskContext.trim()||taskContext.length>30000)throw Error(
  "O contexto já revisado ultrapassou 30 mil caracteres. Revise a compactação antes de gerar.");
 return {task:taskContext,requirements:composed.text,codes,ids};
}
