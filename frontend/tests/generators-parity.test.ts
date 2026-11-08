import { describe, expect, it } from "vitest";
import { sanitizeAiContext, composeFullTaskContext } from "../src/lib/legacy/qa-test-context.mjs";
import { formatGeneratedPost, validatePostStructure } from "../src/lib/legacy/qa-post-format.mjs";
import { markScenarioDuplicates, validateReviewedCases } from "../src/lib/legacy/qa-workspace.mjs";

const task = {
  id: "75e95c7e-bc4a-43dc-90de-9ffddf249b11",
  user_id: "e1804d7f-03f4-4ba9-8755-476d1ac551ce",
  titulo: "Atualização do campo financeiro", codigo: "78912", sistema: "Financeiro",
  tipo_teste: "BUILD", descricao: "O valor deve ser atualizado na remoção do desconto.",
  causa: "Uma condição ignorava registros com desconto negativo",
  correcao: "Corrigido o processamento do desconto",
  conclusao: ""
};
describe("fidelidade e privacidade do contexto da TF", () => {
  it("não envia dados pessoais e segredos evidentes sem saneamento", () => {
    const cleaned = sanitizeAiContext("CPF 123.456.789-00 email teste@dominio.com senha: abc123");
    expect(cleaned).not.toContain("123.456.789-00");
    expect(cleaned).not.toContain("teste@dominio.com");
    expect(cleaned).not.toContain("abc123");
  });
  it("não confunde casos existentes com casos novos executados", () => {
    const result = composeFullTaskContext(task, {
      scenarios: [{
        tarefa_id: task.id, titulo: "Cenário de referência", status: "reprovado",
        passos: "Abrir pedido", esperado: "Saldo correto", obtido: "Saldo divergente"
      }], documents: [], evidence: [], events: [], failures: []
    });
    expect(result.sourceCounts.scenarios).toBe(1);
    expect(result.text).toContain("Situação real: reprovado");
    expect(result.text).toContain("Não considerar informações ausentes");
  });
  it("não elimina regras silenciosamente quando contexto excede limite", () => {
    expect(() => composeFullTaskContext(task, {
      scenarios: [], documents: [], evidence: [], events: [], failures: []
    }, { manual: "x".repeat(4500), limit: 1000 })).toThrow(/Nenhuma parte foi cortada/i);
  });
});
describe("post e revisão de casos", () => {
  it("aplica o padrão de post sem inventar percurso ou imagens reais", () => {
    const post = formatGeneratedPost("# Exibição do desconto\n\nFoi implementada a correção no pedido.", {
      taskText: "Código: 78912"
    });
    expect(validatePostStructure(post)).toEqual([]);
    expect(post).toContain("[Caminho a ser confirmado]");
    expect(post).toContain("[Imagem: captura-da-funcionalidade.png]");
    expect(post).toContain("**TAREFA:** 78912");
  });
  it("marca duplicações e exige passos + esperado em cada caso", () => {
    const first = { source_index: 1, titulo: "Validar pedido", passos: "Abrir pedido",
      esperado: "Valor certo", observacoes: "", selected: true };
    const rows = markScenarioDuplicates([first], [first]);
    expect(rows[0].duplicate).toBe(true);
    expect(rows[0].selected).toBe(false);
    expect(() => validateReviewedCases([{ ...first, esperado: "" }])).toThrow(/resultado esperado/i);
  });
});
