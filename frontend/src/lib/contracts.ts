import { z } from "zod";

export const taskStatuses = ["rascunho", "em_teste", "aprovado", "reprovado", "bloqueado"] as const;
export const scenarioStatuses = ["nao_executado", "aprovado", "reprovado", "bloqueado"] as const;
export const taskStatusLabels: Record<(typeof taskStatuses)[number], string> = {
  rascunho: "Rascunho",
  em_teste: "Em teste",
  aprovado: "Aprovada",
  reprovado: "Reprovada",
  bloqueado: "Bloqueada"
};
export const scenarioStatusLabels: Record<(typeof scenarioStatuses)[number], string> = {
  nao_executado: "Pendente",
  aprovado: "Aprovado",
  reprovado: "Reprovado",
  bloqueado: "Bloqueado"
};

export const taskSchema = z.object({
  id: z.uuid(),
  user_id: z.uuid(),
  titulo: z.string(),
  codigo: z.string().nullish(),
  descricao: z.string().nullish(),
  tipo_teste: z.enum(["BUILD", "RELEASE"]),
  status: z.enum(taskStatuses),
  sistema: z.string().nullish(),
  versao: z.string().nullish(),
  executado_em: z.string().nullish(),
  publica: z.boolean().nullish()
});
export type Task = z.infer<typeof taskSchema>;

export const scenarioSchema = z.object({
  id: z.uuid(),
  tarefa_id: z.uuid(),
  user_id: z.uuid(),
  titulo: z.string(),
  ordem: z.number(),
  passos: z.string(),
  esperado: z.string(),
  obtido: z.string(),
  observacoes: z.string(),
  status: z.enum(scenarioStatuses)
});
export type Scenario = z.infer<typeof scenarioSchema>;

export const taskDraftSchema = z.object({
  titulo: z.string().trim().min(3, "Informe ao menos 3 caracteres.").max(240),
  descricao: z.string().trim().max(30000),
  tipo_teste: z.enum(["BUILD", "RELEASE"]),
  codigo: z.string().trim().max(100),
  sistema: z.string().trim().max(160),
  versao: z.string().trim().max(100)
});
export type TaskDraft = z.infer<typeof taskDraftSchema>;

export const scenarioDraftSchema = z.object({
  titulo: z.string().trim().min(3).max(240),
  passos: z.string().trim().min(1, "Informe os passos.").max(20000),
  esperado: z.string().trim().min(1, "Informe o esperado.").max(20000),
  observacoes: z.string().trim().max(20000)
});
export type ScenarioDraft = z.infer<typeof scenarioDraftSchema>;

export const resultSchema = z.object({
  status: z.enum(scenarioStatuses),
  obtido: z.string().trim().max(20000)
}).superRefine((value, ctx) => {
  if (["reprovado", "bloqueado"].includes(value.status) && !value.obtido) {
    ctx.addIssue({ code: "custom", path: ["obtido"], message: "Descreva o resultado observado." });
  }
});
export type ExecutionResult = z.infer<typeof resultSchema>;

export const isExecuted = (scenario: Pick<Scenario, "status">) =>
  scenario.status !== "nao_executado";

export function progressOf(scenarios: Pick<Scenario, "status">[]) {
  return { total: scenarios.length, executed: scenarios.filter(isExecuted).length };
}
