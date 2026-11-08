import { describe, expect, it } from "vitest";
import {
  normalizeReleaseVersion, validateReference, comparisonCounters,
  exactTaskCodePresent
} from "../src/lib/legacy/qa-phase3.mjs";

describe("contratos de release, referências e diffs", () => {
  it("exige versão e código exatos sem inferir por similaridade", () => {
    expect(normalizeReleaseVersion("12.10.06.0000")).toBe("12.10.06.0000");
    expect(() => normalizeReleaseVersion("12.10")).toThrow(/formato/);
    expect(exactTaskCodePresent("12345", ["12345"])).toBe(true);
    expect(exactTaskCodePresent("12345", ["012345", "123456"])).toBe(false);
  });
  it("recusa segredos e dados identificáveis na biblioteca privada", () => {
    expect(validateReference({
      categoria: "checklist", titulo: "Passos de regressão",
      conteudo: "Confirmar descontos após salvar."
    }).categoria).toBe("checklist");
    expect(() => validateReference({
      categoria: "nota", titulo: "Acesso da aplicação",
      conteudo: "senha: segredo123"
    })).toThrow(/Não armazene/);
    expect(() => validateReference({
      categoria: "regra", titulo: "Cadastro da pessoa",
      conteudo: "CPF 123.456.789-00"
    })).toThrow(/Não armazene/);
  });
  it("armazena apenas contadores de comparação, sem payload bruto", () => {
    const stats = comparisonCounters("diff_xml", {
      adicionados: 3, removidos: 1, alterados: 0
    });
    expect(stats).toEqual({ tipo: "diff_xml", adicionados: 3, removidos: 1, alterados: 0 });
    expect(() => comparisonCounters("diff_texto", {
      adicionados: -1, removidos: 0, alterados: 0
    })).toThrow(/Contagem/);
  });
});
