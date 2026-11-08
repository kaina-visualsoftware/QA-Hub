import type { Scenario } from "../../lib/contracts";

export type GuideScope = "pending" | "all";

/** Keep the recorded scenario order stable even when rows arrive unsorted. */
export function orderedGuideScenarios(scenarios: readonly Scenario[], scope: GuideScope) {
  return [...scenarios]
    .filter(item => scope === "all" || item.status === "nao_executado")
    .sort((a, b) => a.ordem - b.ordem || a.id.localeCompare(b.id));
}

export function nextAfterSaved(
  scenarios: readonly Scenario[],
  currentId: string,
  scope: GuideScope
): string | null {
  const ordered = orderedGuideScenarios(scenarios, "all");
  const currentIndex = ordered.findIndex(item => item.id === currentId);
  if (currentIndex < 0) return null;
  // After a successful save, pending scenarios become ineligible. Look ahead,
  // wrapping around to remaining pending cases. Never claim a new execution.
  if (scope === "pending") {
    const pending = ordered.filter(item => item.id !== currentId &&
      item.status === "nao_executado");
    return pending.find(item => item.ordem > ordered[currentIndex].ordem)?.id
      ?? pending[0]?.id ?? null;
  }
  // Reviewing all cases: continue to the next, but do not endlessly wrap.
  return ordered[currentIndex + 1]?.id ?? currentId;
}
