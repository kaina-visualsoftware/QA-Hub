import {describe,it,expect,vi} from "vitest";
vi.mock("../src/lib/supabase",()=>({supabase:{}}));
import {sha256,compareSourceVersions,validateAuditScope} from
 "../src/features/generators/ai-audit";
import type {AuditEvent} from "../src/features/generators/ai-audit";
const taskId="11111111-1111-4111-8111-111111111111";
const approval={
 id:"22222222-2222-4222-8222-222222222222",codigo:"RF-001",
 titulo:"Valor",descricao:"Valor deve ser R$ 25,00",
 criterios_aceite:"Mínimo de R$ 25,00",updated_at:"2026-11-11T09:00:00Z"
};
function event(part:Partial<AuditEvent>):AuditEvent{
 return {id:"33333333-3333-4333-8333-333333333333",
 tarefa_id:taskId,user_id:taskId,event_type:"source_snapshot",resource:"contexto",
 reference_hash:"0".repeat(64),source_hash:"0".repeat(64),
 before_hash:null,after_hash:null,requirement_code:null,decision:null,
 created_at:"2026-11-11T09:00:00Z",...part};
}
describe("F3.2 — hashes only, immutable private source comparison",()=>{
 it("computes deterministic SHA-256, not source text or weak non-cryptographic hashes",async()=>{
  const a=await sha256("RF-001: Não permitir desconto negativo.");
  const b=await sha256("RF-001: Não permitir desconto negativo.");
  const c=await sha256("RF-001: Permitir desconto negativo.");
  expect(a).toBe(b);expect(a).not.toBe(c);
  expect(a).toMatch(/^[a-f0-9]{64}$/);
  expect(a).not.toContain("desconto");
 });
 it("reports missing baselines, unchanged requirements and changed versions",async()=>{
  const source="Texto original da TF.";
  const reqText=[approval.codigo,approval.titulo,approval.descricao,
   approval.criterios_aceite].join("\n");
  const rows=[
   event({resource:"contexto",source_hash:await sha256(source)}),
   event({id:"33333333-3333-4333-8333-333333333334",resource:"requisito",
    requirement_code:"RF-001",source_hash:await sha256(reqText)})
  ];
  const clean=await compareSourceVersions(taskId,source,[approval],rows);
  expect(clean.map(x=>x.state)).toEqual(["same","same"]);
  const changed=await compareSourceVersions(taskId,source+" alterado",[
   {...approval,descricao:"Valor diferente"}],rows);
  expect(changed.map(x=>x.state)).toEqual(["changed","changed"]);
  expect((await compareSourceVersions(taskId,source,[approval],[]))
   .map(x=>x.state)).toEqual(["never","never"]);
 });
 it("ignores unrelated event types when comparing recorded versions",async()=>{
  const history=[event({event_type:"conflict_decision",source_hash:await sha256("text"),
   decision:"prefer_left"})];
  const result=await compareSourceVersions(taskId,"texto",[approval],history);
  expect(result.map(x=>x.state)).toEqual(["never","never"]);
 });
 it("rejects an invalid task/user scope before attempting an audit write",()=>{
  expect(()=>validateAuditScope("broken",taskId)).toThrow(/inválido/);
  expect(()=>validateAuditScope(taskId,"wrong")).toThrow(/inválido/);
 });
});
