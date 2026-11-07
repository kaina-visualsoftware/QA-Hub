import type { Scenario, ExecutionResult } from "../../lib/contracts";

export type QuickStatus = "aprovado" | "nao_executado";
type PreviousResult = Pick<Scenario, "status" | "obtido">;

// A passed or pending test must never inherit text describing an older failure.
// Preserve a manually written approved observation ONLY for an unchanged pass.
export function quickExecutionResult(
  previous: PreviousResult, status: QuickStatus
): ExecutionResult {
  return {
    status,
    obtido: status === "aprovado" && previous.status === "aprovado"
      ? previous.obtido : ""
  };
}

// Removing an existing explanation requires human confirmation. Do not
// silently discard evidence collected during a failed/blocked execution.
export function needsObservationResetConfirmation(
  previous: PreviousResult, status: QuickStatus
): boolean {
  return Boolean(previous.obtido.trim()) &&
    !(status === "aprovado" && previous.status === "aprovado");
}
