import { describe, expect, it } from "vitest";
import {
  parseRequirements, prepareImport, normalizeRequirement
} from "../src/lib/legacy/qa-requirements.mjs";
import {
  calculateRequirementCoverage, coverageCsv
} from "../src/lib/legacy/qa-requirements-coverage.mjs";
import {
  validateRequirementFile, storagePathForFile
} from "../src/lib/legacy/qa-requirements-files.mjs";
import {
  approvedRequirementRows, composeRequirementContext
} from "../src/lib/legacy/qa-requirements-context.mjs";

const taskId = "11111111-1111-4111-8111-111111111111";
const otherId = "22222222-2222-4222-8222-222222222222";
const reqId = "33333333-3333-4333-8333-333333333333";
const caseId = "44444444-4444-4444-8444-444444444444";
const base = {
  id: reqId, tarefa_id: taskId, estado: "aprovado",
  codigo: "RF-001", tipo: "RF", titulo: "Atualização de valores",
  descricao: "A tela deve recalcular os totais.",
  criterios_aceite: "O saldo deve corresponder ao valor calculado.",
  ordem: 1, updated_at: "2026-11-06T12:00:00.000Z"
};
const testCase = { id: caseId, tarefa_id: taskId, titulo: "Atualizar desconto", status: "nao_executado" as const };
const link = { id: "55555555-5555-4555-8555-555555555555",
  tarefa_id: taskId, requisito_id: reqId, cenario_id: caseId };
describe("migração de requisitos R1-R4", () => {
  it("organiza requisitos sem aprovar automaticamente", () => {
    const source = "RF001: O sistema deve recalcular o pedido.";
    const items = parseRequirements(source);
    expect(items).toHaveLength(1);
    expect(items[0].codigo).toBe("RF-001");
    expect(items[0].estado).toBe("rascunho");
    const batch = prepareImport(source, items);
    expect(batch.items[0].estado).toBe("rascunho");
    expect(batch.items[0]).not.toHaveProperty("selected");
  });
  it("exige revisão e rejeita duplicações sem ação do QA", () => {
    const source = "RF001: O sistema deve recalcular o pedido.";
    const existing = [{ codigo: "RF-001", descricao: "O sistema deve recalcular o pedido.",
      estado: "aprovado" }];
    const items = parseRequirements(source, { existing });
    expect(items[0].duplicate).toBe(true);
    expect(items[0].selected).toBe(false);
    expect(() => prepareImport(source, items)).toThrow("Selecione");
    expect(() => normalizeRequirement({
      ...items[0], codigo: "INVÁLIDO", estado: "aprovado"
    })).toThrow("Código inválido");
  });
  it("não confunde vínculo com validação, e respeita a TF", () => {
    const r = calculateRequirementCoverage([base, { ...base, id: otherId, tarefa_id: otherId }],
      [testCase], [link], taskId);
    expect(r.totals.total).toBe(1);
    expect(r.totals.coveragePercent).toBe(100);
    expect(r.totals.validationPercent).toBe(0);
    expect(r.items[0].coverage).toBe("nao_executado");
    const approved = calculateRequirementCoverage([base],
      [{ ...testCase, status: "aprovado" as const }], [link], taskId);
    expect(approved.items[0].coverage).toBe("validado");
  });
  it("exporta cobertura CSV protegendo células de fórmula", () => {
    const result = calculateRequirementCoverage(
      [{ ...base, titulo: "=HYPERLINK(\"example\")" }], [testCase], [link], taskId);
    expect(coverageCsv(result.items)).toContain("'=HYPERLINK");
  });
  it("valida assinatura do documento e limita o caminho privado", () => {
    const header = new TextEncoder().encode("%PDF-1.7");
    expect(validateRequirementFile({
      name: "requisitos.pdf", size: header.length, type: "application/pdf"
    }, header).extension).toBe("pdf");
    expect(() => validateRequirementFile({
      name: "requisitos.pdf", size: 3, type: "application/pdf"
    }, new Uint8Array([1, 2, 3]))).toThrow("PDF válido");
    expect(storagePathForFile(taskId, otherId, reqId, "pdf"))
      .toBe(taskId + "/" + otherId + "/" + reqId + ".pdf");
    expect(() => storagePathForFile("not-a-user", otherId, reqId, "pdf"))
      .toThrow("Identificador");
  });
  it("somente requisitos aprovados e da TF entram na geração", () => {
    const rows = approvedRequirementRows([base,
      { ...base, id: otherId, tarefa_id: otherId },
      { ...base, id: "66666666-6666-4666-8666-666666666666", estado: "rascunho" }],
      taskId);
    expect(rows).toHaveLength(1);
    const selected = composeRequirementContext(rows, [reqId], "", { taskId });
    expect(selected.selectedCount).toBe(1);
    expect(selected.snapshots[0].codigo).toBe("RF-001");
    expect(() => composeRequirementContext(rows, [otherId], "", { taskId }))
      .toThrow("indisponíveis");
  });
});
