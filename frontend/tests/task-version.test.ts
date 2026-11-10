import { describe, expect, it } from "vitest";
import { taskDraftSchema, taskSchema } from "../src/lib/contracts";
import { formatTaskVersionInput, normalizeTaskVersion } from "../src/lib/task-version";

describe("formato de versão da TF", () => {
  it("insere pontos durante a digitação e limita a dez dígitos", () => {
    expect(formatTaskVersionInput("1")).toBe("1");
    expect(formatTaskVersionInput("121")).toBe("12.1");
    expect(formatTaskVersionInput("121016")).toBe("12.10.16");
    expect(formatTaskVersionInput("1210160003")).toBe("12.10.16.0003");
    expect(formatTaskVersionInput("12.10.16.0003")).toBe("12.10.16.0003");
    expect(formatTaskVersionInput("121016000399")).toBe("12.10.16.0003");
  });

  it("completa zeros ao concluir o campo", () => {
    expect(normalizeTaskVersion("12.10.16.3")).toBe("12.10.16.0003");
    expect(normalizeTaskVersion("1.2.3.4")).toBe("01.02.03.0004");
    expect(normalizeTaskVersion("1210163")).toBe("12.10.16.0003");
    expect(normalizeTaskVersion("12.09")).toBe("12.09.00.0000");
    expect(normalizeTaskVersion("")).toBe("");
  });

  it("aplica a mesma normalização em dados salvos e carregados", () => {
    const draft = { titulo:"Versão da tarefa", descricao:"", tipo_teste:"BUILD",
      codigo:"", sistema:"", versao:"12.10.16.3" };
    expect(taskDraftSchema.parse(draft).versao).toBe("12.10.16.0003");
    const stored = { ...draft, id:"00000000-0000-4000-8000-000000000001",
      user_id:"00000000-0000-4000-8000-000000000002",
      status:"rascunho", versao:"12.09" };
    expect(taskSchema.parse(stored).versao).toBe("12.09.00.0000");
    expect(taskDraftSchema.safeParse({ ...draft, versao:"release-alpha" }).success).toBe(false);
  });
});
