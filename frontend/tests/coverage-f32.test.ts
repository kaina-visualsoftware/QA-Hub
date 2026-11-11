import {describe,it,expect} from "vitest";
import {candidatesForReview,prepareFocusedCoverageTask} from "../src/features/generators/coverage-f32";
const taskId="11111111-1111-4111-8111-111111111111";
const approved=[
 {id:"22222222-2222-4222-8222-222222222221",tarefa_id:taskId,estado:"aprovado",tipo:"RF",updated_at:"2026-11-11T09:00:00Z",
  codigo:"RF-001",titulo:"Valor mínimo",descricao:"Validar valor mínimo.",criterios_aceite:"Valor de R$ 25,00.",ordem:1},
 {id:"22222222-2222-4222-8222-222222222222",tarefa_id:taskId,estado:"aprovado",tipo:"RF",updated_at:"2026-11-11T09:00:00Z",
  codigo:"RF-002",titulo:"Bloqueio",descricao:"Bloquear alteração indevida.",criterios_aceite:"Acesso negado.",ordem:2},
 {id:"22222222-2222-4222-8222-222222222223",tarefa_id:taskId,estado:"rascunho",tipo:"RF",updated_at:"2026-11-11T09:00:00Z",
  codigo:"RF-003",titulo:"Em elaboração",descricao:"Ainda não aprovado.",criterios_aceite:"Nenhum",ordem:3}
];
const cases=[{id:"33333333-3333-4333-8333-333333333333",tarefa_id:taskId,
 titulo:"Bloquear alteração",status:"nao_executado"}];
const links=[{tarefa_id:taskId,requisito_id:approved[1].id,cenario_id:cases[0].id}];
describe("F3.2 — only saved links count as coverage",()=>{
 it("flags unlinked only; linked but unexecuted is not validated",()=>{
  const view=candidatesForReview(approved,cases,links,taskId);
  expect(view.matrix.totals.total).toBe(2);
  expect(view.matrix.totals.linked).toBe(1);
  expect(view.matrix.totals.validated).toBe(0);
  expect(view.candidates.map(x=>x.codigo)).toEqual(["RF-001"]);
 });
 it("flags a version-changed linked requirement without deleting its case",()=>{
  const view=candidatesForReview(approved,cases,links,taskId,["RF-002"]);
  expect(view.candidates.map(x=>x.reason)).toEqual(["unlinked","changed"]);
  expect(view.candidates.find(x=>x.codigo==="RF-002")?.linkedCount).toBe(1);
  expect(cases[0].status).toBe("nao_executado");
 });
 it("does not count a matching title as an explicit link",()=>{
  const view=candidatesForReview(approved,[{...cases[0],titulo:"Valor mínimo"}],[],taskId);
  expect(view.matrix.totals.linked).toBe(0);
  expect(view.candidates.map(x=>x.codigo)).toEqual(["RF-001","RF-002"]);
 });
 it("sends only approved selected requirements, never drafts or other TFs",()=>{
  const result=prepareFocusedCoverageTask(approved,[approved[0].id],taskId,
   "TF 1001: Cadastro de pedido com valor mínimo.");
  expect(result.requirements).toContain("RF-001");
  expect(result.requirements).not.toContain("[RF-002]");
  expect(result.requirements).toContain("NÃO EXECUTADAS");
  expect(()=>prepareFocusedCoverageTask(approved,[approved[2].id],taskId,"TF válida"))
   .toThrow(/indisponíveis/);
  expect(()=>prepareFocusedCoverageTask(approved,[approved[0].id],"44444444-4444-4444-8444-444444444444","TF válida"))
   .toThrow(/indisponíveis/);
 });
 it("never silently truncates a previously approved context or overflows request budget",()=>{
  expect(()=>prepareFocusedCoverageTask(approved,[approved[0].id],taskId,"x".repeat(30001)))
   .toThrow(/compactação/);
  expect(()=>prepareFocusedCoverageTask(approved,[],taskId,"TF válida"))
   .toThrow(/1 a 35/);
 });
});
