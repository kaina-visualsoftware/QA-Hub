import {describe,expect,it} from "vitest";
import {buildSemanticPlan,compileSemanticContext,validateSemanticFacts} from
 "../src/features/generators/semantic-context";
import type {ChunkOutcome,VerifiedFact} from "../src/features/generators/semantic-context";
import {detectSemanticConflicts,excludedFacts,conflictNotes,factKey} from
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
 const asFact=(quote:string,line:number,category:VerifiedFact["category"]="regra"):VerifiedFact=>({
  source:"TF",chunkId:"TF-"+String(line).padStart(3,"0"),line,quote,category,summary:"Citação devolvida pela NVIDIA."
 });
 const report=(pairs:[string,string][])=>{
  const outcomes=new Map<string,ChunkOutcome>();
  let index=1;
  for(const [a,b] of pairs){
   for(const quote of [a,b]){
    const fact=asFact(quote,index++);
    outcomes.set(fact.chunkId,{id:fact.chunkId,facts:[fact],unverified:0,model:"NVIDIA"});
   }
  }
  return outcomes;
 };
 it("não inventa divergências entre resultados equivalentes e descrições históricas",()=>{
  const cases:[string,string][]=[
   ["A nota é emitida sem rejeição E160.",
    "A nota é autorizada sem rejeição E160."],
   ["Os campos de base de cálculo PIS/COFINS aparecem preenchidos com R$ 200,00.",
    "A nota com PIS/COFINS informa a base de cálculo no provedor."],
   ["Esta correção faz o sistema enviar a base de cálculo junto com a nota.",
    "Não há campos de base de cálculo na nota quando PIS/COFINS são zerados."],
   ["Campo base PIS e COFINS deve estar preenchido quando os tributos são maiores que zero.",
    "Série configurada com Não manda PIS/COFINS não envia base de cálculo."],
   ["A prefeitura rejeitava notas com erro E160 quando faltava base de cálculo.",
    "Agora a nota é autorizada sem rejeição E160."],
   ["Se uma nota ainda for rejeitada com E160, conferir o cálculo e o envio.",
    "A nota de teste foi emitida e autorizada normalmente."],
   ["A nota sem PIS/COFINS não exibe base de cálculo.",
    "Se a base aparecer com valores quando PIS/COFINS estão zerados, isso indica falha."],
   ["A base só é enviada quando PIS e COFINS forem maiores que zero.",
    "Tags de base só são enviadas quando a base é maior que zero."],
   ["A prefeitura autoriza a nota normalmente.",
    "Valor que exige arredondamento também teve nota autorizada."],
   ["O campo Valor PIS deve estar vazio com série Não manda PIS/COFINS.",
    "O campo Valor PIS deve estar preenchido com série que envia PIS/COFINS."]
  ];
  const outcomes=report(Array.from({length:59},(_,i)=>cases[i%cases.length]));
  expect(detectSemanticConflicts(outcomes)).toHaveLength(0);
 });
 it("não trata dois cenários fiscais distintos como o mesmo campo contraditório",()=>{
  const outcomes=report([
   ["RF-50: Campo base PIS deve estar vazio quando o PIS estiver zerado.",
    "RF-50: Campo base PIS deve estar preenchido quando o PIS for positivo."],
   ["RF-50: Não enviar base quando o PIS for zerado.",
    "RF-50: Enviar base quando o PIS for positivo."],
   ["RF-50: Anteriormente não enviar base, agora deve enviar.",
    "RF-50: Deve enviar base após a correção."]
  ]);
  expect(detectSemanticConflicts(outcomes)).toHaveLength(0);
 });
 it("detecta oposição explícita de preenchimento no MESMO requisito e condição",()=>{
  const conflicts=detectSemanticConflicts(report([
   ["RF-50: Campo base PIS deve estar vazio quando o PIS for positivo.",
    "RF-50: Campo base PIS deve estar preenchido quando o PIS for positivo."]
  ]));
  expect(conflicts).toHaveLength(1);
  expect(conflicts[0].kind).toBe("situacao");
 });
 it("consolida comparações idênticas sem omitir citações em escolhas do QA",()=>{
  const cases:[string,string][]=[
   ["RF-33: Não permitir editar pedidos após o faturamento.",
    "RF-33: Permitir editar pedidos após o faturamento."],
   ["RF-33: Não permitir editar pedidos após o faturamento.",
    "RF-33: Permitir editar pedidos após o faturamento."]
  ];
  const conflicts=detectSemanticConflicts(report(cases));
  expect(conflicts).toHaveLength(1);
  expect(conflicts[0].pairs?.length).toBe(4);
  const allOpposing=new Set(conflicts[0].pairs?.map(p=>factKey(p.right)));
  expect(excludedFacts(conflicts,{[conflicts[0].id]:"prefer_left"})).toEqual(allOpposing);
  expect(()=>conflictNotes(conflicts,{})).toThrow();
 });

});
