import { describe, expect, it } from "vitest";
import {
  extractLocalDraft, normalizeDraft, ASSIST_SCENARIO_LIMIT
} from "../src/lib/legacy/qa-assistant.mjs";

const report = [
  "TF #67866",
  "TÍTULO: Atualização de descontos negativos",
  "TIPO DE TESTE: [X] BUILD [ ] RELEASE",
  "VERSÃO: 12.08.08.0000",
  "",
  "O QUE FOI TESTADO:",
  "Remover desconto gravado em pedido.",
  "",
  "CENÁRIO 1 — Remover desconto do pedido",
  "PASSOS:",
  "- Abrir pedido 67866",
  "- Pressionar o botão remover",
  "RESULTADO ESPERADO: O campo desconto deve zerar."
].join("\n");
describe("extração local de TF (sem IA ou tráfego de rede)", () => {
  it("identifica campos comprováveis e cenários sem aprová-los", () => {
    const result = extractLocalDraft(report);
    expect(result.fields.codigo).toBe("67866");
    expect(result.fields.titulo).toBe("Atualização de descontos negativos");
    expect(result.fields.versao).toBe("12.08.08.0000");
    expect(result.fields.descricao).toMatch(/Remover desconto/);
    expect(result.cenarios).toHaveLength(1);
    expect(result.cenarios[0].status).toBe("nao_executado");
    expect(result.cenarios[0].passos).toMatch(/Abrir pedido/);
    expect(result.cenarios[0].esperado).toMatch(/deve zerar/);
  });
  it("não confia em status nem campos arbitrários devolvidos por uma análise", () => {
    const result=normalizeDraft({
      titulo:"TF sem aprovação automática", segredo:"não armazenar",
      cenarios:[{titulo:"Primeiro cenário",passos:"Abrir",esperado:"Sucesso",
        status:"aprovado",obtido:"aprovado",user_id:"outro autor"}]
    });
    expect(result.fields).not.toHaveProperty("segredo");
    expect(result.cenarios[0].status).toBe("nao_executado");
    expect(result.cenarios[0]).not.toHaveProperty("user_id");
  });
  it("limita o volume e não gera cenários por inferência de narrativa solta", () => {
    expect(ASSIST_SCENARIO_LIMIT).toBe(50);
    expect(extractLocalDraft("O QUE FOI TESTADO:\nUm texto explicativo sem passos.")
      .cenarios).toHaveLength(0);
    expect(() => extractLocalDraft("X".repeat(30001))).toThrow(/30.000/);
  });
});
