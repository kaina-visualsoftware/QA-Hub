import {describe,expect,it} from "vitest";
import {locateEvidence,hasUnsupportedIdentifiers,parseGroundedFieldReply,
 parseGroundedScenarioReply} from "../src/features/tasks/task-evidence";

const source="Contexto.\nRF-101: O pedido 67866 mantém desconto negativo.\nO resultado deve ser exibido na tela.";
type Proof={quote:string;source_line:number|null;
 status:"verified"|"needs_review";reason:string|null;
 derivation?:"explicit"|"synthesized"};
type ReviewField={field:string;value:string;evidence:Proof};
const proof:Proof={quote:"RF-101: O pedido 67866 mantém desconto negativo.",
 source_line:2,status:"verified",reason:null};
const answer=(draft:Record<string,string>,evidence:Record<string,Proof>,
 review_fields:ReviewField[]=[],repaired=false)=>({
 provider:"NVIDIA Build",stage:"fields",model:"glm-test",
 draft,field_evidence:evidence,review_fields,repaired
});
const scenario=(fields:Record<string,unknown>,evidence:Proof)=>({
 source_index:0,titulo:"Validar pedido 67866",
 passos:"Abrir pedido 67866",esperado:"Resultado exibido na tela",
 observacoes:"",...fields,evidence
});
const scenarioReply=(rows:ReturnType<typeof scenario>[],
 review:ReturnType<typeof scenario>[]=[],repaired=false)=>({
 provider:"NVIDIA Build",stage:"scenarios",model:"glm-test",
 repaired,draft:{cenarios:rows},review_scenarios:review
});

describe("F5 — evidência literal e revisão explícita",()=>{
 it("localiza citações com acentos, caixa, espaços e Unicode",()=>{
  expect(locateEvidence("Abertura 🧪\nAção permitida.","ACAO   PERMITIDA.")).toBe(2);
  expect(locateEvidence(source,"RF-101: O PEDIDO 67866 mantém desconto negativo.")).toBe(2);
  expect(locateEvidence(source,"Texto inventado não documentado")).toBeNull();
 });
 it("aceita somente valores corroborados e presentes na seção aplicável",()=>{
  const parsed=parseGroundedFieldReply(answer(
   {descricao:"O pedido 67866 mantém desconto negativo."},
   {descricao:proof}),source);
  expect(parsed.values.descricao).toMatch(/67866/);
  expect(parsed.review[0].status).toBe("verified");
  expect(parsed.verifiedCount).toBe(1);
 });
 it("aplica síntese fundamentada e mantém metadados presumidos só para revisão",()=>{
  const parsed=parseGroundedFieldReply(answer(
   {titulo:"Investigar desconto negativo no pedido 67866"},
   {titulo:{...proof,derivation:"synthesized"}},
   [{field:"ambiente",value:"Homologação",evidence:{
    ...proof,status:"needs_review",reason:"metadata_not_explicit",derivation:"synthesized"}}]
  ),source);
  expect(parsed.values.titulo).toContain("67866");
  expect(parsed.review.find(row=>row.field==="titulo")?.derivation).toBe("synthesized");
  expect(parsed.values).not.toHaveProperty("ambiente");
  expect(parsed.review.find(row=>row.field==="ambiente")?.reason)
   .toBe("metadata_not_explicit");
 });
 it("a API separa propostas sem comprovação e o cliente não as aplica",()=>{
  const parsed=parseGroundedFieldReply(answer(
   {descricao:"O pedido 67866 mantém desconto negativo."},
   {descricao:proof},
   [{field:"titulo",value:"Corrigir tarifa inventada",evidence:{
    ...proof,status:"needs_review",reason:"claim_not_supported_by_quote"}}]
  ),source);
  expect(parsed.values).not.toHaveProperty("titulo");
  expect(parsed.review.find(r=>r.field==="titulo")?.status).toBe("needs_review");
 });
 it("números inventados e citações falsas não viram valores verificados",()=>{
  const bad=answer({}, {},[
   {field:"titulo",value:"Pedido 99999",evidence:{
    ...proof,status:"needs_review",reason:"identifier_not_in_source"}},
   {field:"causa",value:"Causa não documentada",evidence:{
    quote:"Citação inventada",source_line:null,
    status:"needs_review",reason:"quote_not_found"}}
  ]);
  const parsed=parseGroundedFieldReply(bad,source);
  expect(parsed.verifiedCount).toBe(0);
  expect(parsed.review.every(r=>r.status==="needs_review")).toBe(true);
  expect(hasUnsupportedIdentifiers("Pedido 99999",source)).toBe(true);
 });
 it("não aceita versão 12.10 ou percentual 15,20 inventado quando a fonte registra 12.09 e 14,00",()=>{
  const src="Versão: 12.09. A taxa configurada é 14,00%.";
  expect(hasUnsupportedIdentifiers("12.10",src)).toBe(true);
  expect(hasUnsupportedIdentifiers("15,20%",src)).toBe(true);
  expect(hasUnsupportedIdentifiers("12.09",src)).toBe(false);
  const parsed=parseGroundedFieldReply(answer({versao:"12.10"},{
   versao:{quote:src,source_line:1,status:"verified",reason:null}
  }),src);
  expect(parsed.values.versao).toBe("");
  expect(parsed.review[0].status).toBe("needs_review");
 });
 it("JSON reparado ou linha incorreta exige revisão",()=>{
  const repaired=parseGroundedFieldReply(answer({}, {},[
   {field:"titulo",value:"Pedido 67866",evidence:{
    ...proof,status:"needs_review",reason:"json_repaired"}}
  ],true),source);
  expect(repaired.verifiedCount).toBe(0);
  expect(repaired.review[0].reason).toBe("json_repaired");
  const mismatch=parseGroundedFieldReply(answer({}, {},[
   {field:"titulo",value:"Pedido 67866",evidence:{
    ...proof,source_line:99,status:"needs_review",reason:"line_mismatch"}}
  ]),source);
  expect(mismatch.verifiedCount).toBe(0);
 });
 it("Zod rejeita esquema adulterado, campo extra e citações ausentes",()=>{
  expect(()=>parseGroundedFieldReply({
   ...answer({titulo:"Pedido 67866"},{titulo:proof}),
   field_evidence:{titulo:{...proof,status:"approved"}}
  },source)).toThrow(/estrutura/);
  expect(()=>parseGroundedFieldReply({
   ...answer({codigo:"67866"},{codigo:proof}),field_evidence:{
    codigo:proof,token:proof
   }
  },source)).toThrow(/estrutura/);
  expect(()=>parseGroundedFieldReply(answer({codigo:"67866"},{}),source))
   .toThrow(/estrutura/);
 });
 it("cenário sem referência confirmada não substitui a versão local",()=>{
  const baseline=scenario({titulo:"Validar pedido 99999",
   passos:"Abrir pedido 99999"},{
   ...proof,status:"needs_review",reason:"identifier_not_in_source"
  });
  const parsed=parseGroundedScenarioReply(scenarioReply([],[baseline]),source,
   [{source_index:0}]);
  expect(parsed.accepted).toHaveLength(0);
  expect(parsed.review[0].status).toBe("needs_review");
  expect(()=>parseGroundedScenarioReply(scenarioReply([baseline]),source,
   [{source_index:1}])).toThrow(/índice fora/);
 });
 it("cenário realmente citado passa como proposta, sem execução ou aprovação",()=>{
  const parsed=parseGroundedScenarioReply(scenarioReply([scenario({},proof)]),source,
   [{source_index:0}]);
  expect(parsed.accepted).toHaveLength(1);
  expect(parsed.review[0].sourceLine).toBe(2);
  expect(parsed.accepted[0]).not.toHaveProperty("status");
 });
});

describe("F8 — status de execução não pode contradizer a citação",()=>{
 it("não considera um teste pendente como aprovado",()=>{
  const quote="Observação: teste ainda não executado.";
  const source=quote;
  const response={
   provider:"NVIDIA Build",stage:"fields",model:"glm-fixture",repaired:false,
   draft:{conclusao:"Teste aprovado"},
   field_evidence:{conclusao:{quote,source_line:1,status:"verified",reason:null}},
   review_fields:[]
  };
  const result=parseGroundedFieldReply(response,source);
  expect(result.values.conclusao).toBe("");
  expect(result.review[0].status).toBe("needs_review");
  const plural="Os testes ainda não foram executados.";
  const pluralResponse={
   ...response,
   field_evidence:{conclusao:{quote:plural,source_line:1,status:"verified",reason:null}}
  };
  const pluralResult=parseGroundedFieldReply(pluralResponse,plural);
  expect(pluralResult.values.conclusao).toBe("");
  expect(pluralResult.review[0].status).toBe("needs_review");
 });
});
