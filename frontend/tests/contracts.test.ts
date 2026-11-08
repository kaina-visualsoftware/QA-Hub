import { describe, expect, it } from "vitest";
import { taskDraftSchema, resultSchema, progressOf } from "../src/lib/contracts";

describe("regras de QA", () => {
  it("cria TF somente como rascunho após validar os campos", () => {
    const record = taskDraftSchema.parse({
      titulo: "  Conferir pagamento  ", descricao: "  Testar valores  ",
      tipo_teste: "BUILD", codigo: "", sistema: "", versao: ""
    });
    expect(record.titulo).toBe("Conferir pagamento");
    expect(record.descricao).toBe("Testar valores");
    expect("status" in record).toBe(false);
  });

  it("requer descrição objetiva quando reprova ou bloqueia", () => {
    expect(resultSchema.safeParse({ status: "reprovado", obtido: " " }).success).toBe(false);
    expect(resultSchema.safeParse({ status: "bloqueado", obtido: "Impedido por acesso" }).success).toBe(true);
    expect(resultSchema.safeParse({ status: "aprovado", obtido: "" }).success).toBe(true);
  });

  it("não confunde cadastro de caso com sua execução", () => {
    expect(progressOf([
      { status: "nao_executado" }, { status: "aprovado" }, { status: "reprovado" }
    ])).toEqual({ total: 3, executed: 2 });
  });
});
