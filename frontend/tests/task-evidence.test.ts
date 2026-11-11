import {describe,expect,it} from "vitest";
import {locateEvidence,hasUnsupportedIdentifiers,parseGroundedFieldReply,
 parseGroundedScenarioReply} from "../src/features/tasks/task-evidence";

const source="Contexto.\nRF-101: O pedido 67866 mantém desconto negativo.\nO resultado deve ser exibido na tela.";
const evidence={quote:"RF-101: O pedido 67866 mantém desconto negativo.",
 source_line:2,status:"verified" as const,reason:null};
const answer=(draft:Record<string,string>,records:Record<string,unknown>,
 repaired=false)=>({provider:"NVIDIA Build",stage:"fields",model:"glm-test",
 draft,field_evidence:records,repaired});

describe("F5 — evidência literal, schema e confirmação humana",()=>{
 it("verifica acentos, caixa, espaços e linhas com Unicode",()=>{
  expect(locateEvidence("Abertura 🧪\nAção permitida.","ACAO   PERMITIDA.")).toBe(2);
  expect(locateEvidence(source,"RF-101: O PEDIDO 67866 mantém desconto negativo.")).toBe(2);
  expect(locateEvidence(source,"Texto inventado não documentado")).toBeNull();
 });
 it("aceita somente campos com evidência confirmada pelo servidor e pelo cliente",()=>{
  const result=parseGroundedFieldReply(answer({descricao:"O pedido 67866 mantém desconto negativo."},
   {descricao:evidence}),source);
  expect(result.values.descricao).toMatch(/67866/);
  expect(result.review[0].status).toBe("verified");
  expect(result.verifiedCount).toBe(1);
 });
 it("citação real sobre assunto diferente não comprova a afirmação do modelo",()=>{
  const response=parseGroundedFieldReply(answer({titulo:"Corrigir taxas indevidas"},
   {titulo:evidence}),source);
  expect(response.values.titulo).toBe("");
  expect(response.review[0].status).toBe("needs_review");
 });
 it("número inventado e citação falsa ficam em needs_review, sem preencher campos",()=>{
  const result=parseGroundedFieldReply(answer({
   titulo:"Falha no pedido 99999",causa:"Causa não documentada"
  },{
   titulo:evidence,causa:{...evidence,quote:"Citação inventada."}
  }),source);
  expect(result.values.titulo).toBe("");
  expect(result.values.causa).toBe("");
  expect(result.review.every(x=>x.status==="needs_review")).toBe(true);
  expect(hasUnsupportedIdentifiers("Pedido 99999",source)).toBe(true);
 });
 it("saída JSON reparada ou linha incorreta não é aplicada automaticamente",()=>{
  const fixed=parseGroundedFieldReply(answer({titulo:"Pedido 67866 bloqueado"},
   {titulo:evidence},true),source);
  expect(fixed.verifiedCount).toBe(0);
  expect(fixed.review[0].reason).toBe("json_repaired");
  const wrong=parseGroundedFieldReply(answer({titulo:"Pedido 67866 bloqueado"},
   {titulo:{...evidence,source_line:99}}),source);
  expect(wrong.verifiedCount).toBe(0);
 });
 it("rejeita campos extras, mensagens sem prova ou status adulterados",()=>{
  expect(()=>parseGroundedFieldReply(answer({titulo:"Pedido 67866"},{
   titulo:{...evidence,status:"approved"}
  }),source)).toThrow(/estrutura/);
  expect(()=>parseGroundedFieldReply(answer({codigo:"67866"},{
   codigo:evidence,token:{...evidence}
  }),source)).toThrow(/estrutura/);
  expect(()=>parseGroundedFieldReply(answer({codigo:"67866"},{}),source))
   .toThrow(/estrutura/);
 });
 it("cenários sem referência e versões inventadas nunca substituem os locais",()=>{
  const baseline={provider:"NVIDIA Build",stage:"scenarios",model:"glm",
   repaired:false,draft:{cenarios:[{
    source_index:0,titulo:"Validar pedido 99999",passos:"Abrir pedido 99999",
    esperado:"Desconto zerado",observacoes:"",evidence
   }]}};
  const rows=parseGroundedScenarioReply(baseline,source,[{source_index:0}]);
  expect(rows.accepted).toHaveLength(0);
  expect(rows.review[0].status).toBe("needs_review");
  expect(()=>parseGroundedScenarioReply(baseline,source,[{source_index:1}]))
   .toThrow(/índice fora/);
 });
 it("cenário com citação real e índice válido pode ser revisado antes de salvar",()=>{
  const draft={provider:"NVIDIA Build",stage:"scenarios",model:"glm",repaired:false,
   draft:{cenarios:[{source_index:0,titulo:"Validar pedido 67866",
    passos:"Abrir pedido 67866",esperado:"Resultado exibido na tela",
    observacoes:"",evidence}]}};
  const result=parseGroundedScenarioReply(draft,source,[{source_index:0}]);
  expect(result.accepted).toHaveLength(1);
  expect(result.review[0].sourceLine).toBe(2);
 });
});
