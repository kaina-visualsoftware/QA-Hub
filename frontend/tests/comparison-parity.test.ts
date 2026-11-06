import { describe, expect, it } from "vitest";
import {
  compareTextLines, organizeRelease, reviewRelease
} from "../src/lib/legacy/qa-release-core.mjs";
import { comparisonCounters } from "../src/lib/legacy/qa-phase3.mjs";

describe("migração local dos geradores de comparação e release", () => {
  it("compara linhas literalmente e não interpreta tags HTML", () => {
    const result = compareTextLines("linha 1\n<img src=x>", "linha 1\n<script>texto</script>");
    expect(result.added).toBe(1);
    expect(result.removed).toBe(1);
    expect(result.changed).toBe(0);
    expect(result.changes).toEqual([
      [" ", "linha 1"], ["-", "<img src=x>"], ["+", "<script>texto</script>"]
    ]);
  });
  it("limita o algoritmo quadrático a 1.500 linhas", () => {
    expect(() => compareTextLines("texto\n".repeat(1501), "novo"))
      .toThrow(/1\.500 linhas/);
  });
  it("formata contagens sem nunca receber textos originais", () => {
    const report = compareTextLines("A\nB", "A\nC");
    const saved = comparisonCounters("diff_texto", {
      adicionados: report.added, removidos: report.removed, alterados: report.changed
    });
    expect(saved).toEqual({ tipo: "diff_texto", adicionados: 1, removidos: 1, alterados: 0 });
    expect(JSON.stringify(saved)).not.toContain("B");
    expect(JSON.stringify(saved)).not.toContain("C");
  });
  it("organiza a lista de releases sem perder os status de origem", () => {
    const source = "Status 12\n#67866 — BUG — Correção\nStatus 11\n#199727 — MELHORIA — Ajuste";
    const result = organizeRelease({ version: "12.10.06.0000", raw: source });
    expect(result.numbers).toEqual(["67866", "199727"]);
    expect(result.text).toMatch(/Status 12[\s\S]*#67866/);
    expect(result.text).toMatch(/Status 11[\s\S]*#199727/);
  });
  it("revisa comunicado removendo somente TF fora da lista autorizada", () => {
    const result = reviewRelease({
      raw: "#67866 — BUG — Desconto",
      announcement: "Correções:\n#67866 — BUG — Desconto\n#299999 — BUG — Outro",
      version: "12.10.06.0000"
    });
    expect(result.cleaned).toContain("#67866");
    expect(result.cleaned).not.toContain("#299999");
    expect(result.report).toContain("Removidas por não estarem na lista");
  });
});
