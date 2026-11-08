import { describe, expect, it } from "vitest";
import { summarizeTaskProgress } from "../src/lib/task-progress";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

describe("progresso real por TF", () => {
  it("contabiliza aprovados, reprovados e bloqueados como executados", () => {
    const rows = [
      { tarefa_id: A, status: "aprovado" },
      { tarefa_id: A, status: "reprovado" },
      { tarefa_id: A, status: "bloqueado" },
      { tarefa_id: A, status: "nao_executado" }
    ] as const;
    const result = summarizeTaskProgress([A], [...rows]);
    expect(result[A]).toEqual({ total: 4, executed: 3, pending: 1 });
    expect(result[A].executed).not.toBe(4);
  });

  it("mostra 0/0 para TF sem cenários, sem fabricar conclusão", () => {
    const result = summarizeTaskProgress([A, B], [
      { tarefa_id: B, status: "aprovado" }
    ]);
    expect(result[A]).toEqual({ total: 0, executed: 0, pending: 0 });
    expect(result[B]).toEqual({ total: 1, executed: 1, pending: 0 });
  });

  it("não mistura dados de TF fora do escopo e não altera a entrada", () => {
    const rows = [
      { tarefa_id: B, status: "reprovado" as const },
      { tarefa_id: A, status: "nao_executado" as const }
    ];
    const snapshot = structuredClone(rows);
    const result = summarizeTaskProgress([A], rows);
    expect(result[B]).toBeUndefined();
    expect(result[A]).toEqual({ total: 1, executed: 0, pending: 1 });
    expect(rows).toEqual(snapshot);
  });

  it("desduplica IDs solicitados sem duplicar contagens", () => {
    const result = summarizeTaskProgress([A, A], [{ tarefa_id: A, status: "aprovado" }]);
    expect(result[A]).toEqual({ total: 1, executed: 1, pending: 0 });
    expect(Object.keys(result)).toEqual([A]);
  });
});
