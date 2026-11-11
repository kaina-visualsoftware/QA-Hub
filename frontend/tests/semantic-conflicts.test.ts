import {describe,expect,it} from "vitest";
import {buildSemanticPlan,compileSemanticContext,validateSemanticFacts} from
 "../src/features/generators/semantic-context";
import type {ChunkOutcome} from "../src/features/generators/semantic-context";
import {detectSemanticConflicts,excludedFacts,conflictNotes} from
 "../src/features/generators/semantic-conflicts";

describe("F2.1 — revisão assistida de divergências entre fontes",()=>{
 const prepare=(a:string,b:string)=>{
  const plan=buildSemanticPlan(a,b);
  const outcomes=new Map<string,ChunkOutcome>();
  for(const chunk of plan.chunks){
   const fact=validateSemanticFacts(chunk,[{
    category:"regra",quote:chunk.text.trim(),summary:"Regra de negócio."
   }]);
   outcomes.set(chunk.id,{id:chunk.id,facts:fact.facts,unverified:fact.unverified,model:"mock"});
  }
  return {plan,outcomes};
 };
 it("sinaliza permissões opostas com o mesmo requisito sem decidir qual é verdadeira",()=>{
  const {outcomes}=prepare(
   "RF-33: Não permitir editar pedidos após o faturamento.",
   "RF-33: Permitir editar pedidos após o faturamento.");
  const candidates=detectSemanticConflicts(outcomes);
  expect(candidates).toHaveLength(1);
  expect(candidates[0].kind).toBe("polaridade");
  expect(candidates[0].left.quote).toContain("Não permitir");
  expect(candidates[0].right.quote).toContain("Permitir");
 });
 it("não confunde uma mudança de comportamento antes/depois com contradição",()=>{
  const plan=buildSemanticPlan(
   "RF-33: Anteriormente era permitido editar pedidos.",
   "RF-33: Agora não é permitido editar pedidos.");
  const outcomes=new Map<string,ChunkOutcome>();
  for(const c of plan.chunks){
   const fact=validateSemanticFacts(c,[{
    category:c.source==="TF"?"antes":"depois",quote:c.text.trim(),summary:"Comportamento."
   }]);
   outcomes.set(c.id,{id:c.id,facts:fact.facts,unverified:0,model:"mock"});
  }
  expect(detectSemanticConflicts(outcomes)).toHaveLength(0);
 });
 it("reconhece valores discordantes, sem afetar outros requisitos",()=>{
  const {outcomes}=prepare("RF-90: Limite mensal é R$ 12,50.",
   "RF-90: Limite mensal é R$ 22,50.");
  const conflicts=detectSemanticConflicts(outcomes);
  expect(conflicts).toHaveLength(1);
  expect(conflicts[0].kind).toBe("valor");
 });
 it("deixa as duas fontes no contexto se o QA as marcar para esclarecimento",()=>{
  const {plan,outcomes}=prepare(
   "RF-33: Não permitir editar pedidos após o faturamento.",
   "RF-33: Permitir editar pedidos após o faturamento.");
  const conflicts=detectSemanticConflicts(outcomes);
  const decisions={[conflicts[0].id]:"keep_both" as const};
  const compiled=compileSemanticContext(plan,outcomes,"teste",{
   excluded:excludedFacts(conflicts,decisions),
   reviewNote:conflictNotes(conflicts,decisions)
  });
  expect(compiled.task).toContain("DIVERGÊNCIAS");
  expect(compiled.task).toContain("Não permitir");
  expect(compiled.requirements).toContain("Permitir");
  expect(compiled.coverage.missingIds).toEqual([]);
 });
 it("consegue priorizar uma das fontes sem alterar o original",()=>{
  const {plan,outcomes}=prepare(
   "RF-33: Não permitir editar pedidos após o faturamento.",
   "RF-33: Permitir editar pedidos após o faturamento.");
  const conflicts=detectSemanticConflicts(outcomes);
  const decisions={[conflicts[0].id]:"prefer_left" as const};
  const compiled=compileSemanticContext(plan,outcomes,"teste",{
   excluded:excludedFacts(conflicts,decisions)
  });
  expect(compiled.task).toContain("Não permitir");
  expect(compiled.requirements).not.toContain("Permitir");
  expect(plan.requirements).toContain("Permitir");
 });
 it("bloqueia a liberação de contexto enquanto houver decisões pendentes",()=>{
  const {outcomes}=prepare(
   "RF-33: Não permitir editar pedidos após o faturamento.",
   "RF-33: Permitir editar pedidos após o faturamento.");
  const conflicts=detectSemanticConflicts(outcomes);
  expect(()=>conflictNotes(conflicts,{})).toThrow(/Revise as divergências/);
 });
});
