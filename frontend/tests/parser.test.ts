import { describe, expect, it } from "vitest";
import { extractExplicitScenarios, parseReport } from "../src/lib/legacy-parser.mjs";

const report = [
  "TIPO DE TESTE: [X] BUILD [ ] RELEASE",
  "O QUE FOI TESTADO:",
  "VALIDAÇÃO DA ALTERAÇÃO DO CAMPO DESCONTO.",
  "CENÁRIOS TESTADOS:",
  "CENÁRIO 1 — VALIDAR REMOÇÃO DO DESCONTO",
  "- ACESSAR ABA DE PAGAMENTOS",
  "- REMOVER DESCONTO",
  "RESULTADO ESPERADO: DESCONTO DEVE SER REMOVIDO",
  "VALIDAÇÃO FINAL:",
  "FUNCIONANDO CORRETAMENTE? [X] SIM",
  "CONCLUSÃO: TESTE EXECUTADO"
].join("\n");

describe("importação local de relatórios existentes", () => {
  it("só extrai cenário explícito com passos", () => {
    const result = parseReport(report);
    expect(result.cenarios).toHaveLength(1);
    expect(result.cenarios[0].titulo).toBe("VALIDAR REMOÇÃO DO DESCONTO");
    expect(result.cenarios[0].status).toBe("nao_executado");
    expect(result.tipo_teste).toBe("BUILD");
  });

  it("não inventa casos a partir de narrativa livre", () => {
    expect(extractExplicitScenarios(
      "O sistema precisa validar uma nova regra de negócio. Não há casos descritos."
    )).toHaveLength(0);
  });
});
