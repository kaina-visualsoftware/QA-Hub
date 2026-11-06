import { describe, expect, it } from "vitest";
import {
  validateEvidence, auditLabel, auditDetails
} from "../src/lib/legacy/qa-phase4.mjs";

describe("evidências e auditoria da fase 4", () => {
  it("exige resumo e recusa referência insegura", () => {
    expect(() => validateEvidence({ tipo: "observacao", resumo: "x" }))
      .toThrow(/3 a 2.000/);
    expect(() => validateEvidence({
      tipo: "captura", resumo: "Verificar comportamento", referencia: "http://localhost"
    })).toThrow(/HTTPS/);
  });
  it("associa somente identificador de cenário válido", () => {
    expect(() => validateEvidence({
      tipo: "observacao", resumo: "Fluxo bloqueado", cenario_id: "not-a-uuid"
    })).toThrow(/Cenário inválido/);
    const result = validateEvidence({
      tipo: "log", resumo: "Foi exibida mensagem de erro documentada."
    });
    expect(result.cenario_id).toBeNull();
    expect(result.referencia).toBe("");
  });
  it("traduz auditoria por metadados, sem inferir resultado", () => {
    expect(auditLabel({ acao: "cenario.status" })).toBe("Resultado de cenário registrado");
    expect(auditDetails({ acao: "cenario.status", detalhes: {
      anterior: "nao_executado", novo: "reprovado"
    } })).toContain("não").toBeDefined();
  });
});
