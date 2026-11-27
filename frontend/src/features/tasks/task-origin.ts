import type { Task } from "../../lib/contracts";

/** The task's company field identifies the internal Visual Software account. */
export function isInternalVisualTask(empresa: string | null | undefined): boolean {
  return /^6157\s*(?:[-–—]\s*)?visual\s+software\s*$/iu.test((empresa??"").trim());
}
export function taskOriginLabel(empresa: string | null | undefined): "INTERNA" | "EXTERNA" {
  return isInternalVisualTask(empresa) ? "INTERNA" : "EXTERNA";
}

/** Presentation only: never rewrite the task title stored in the database. */
export function taskListTitle(task: Pick<Task,"titulo"|"empresa">): string {
  const title=task.titulo.trim();
  const origin=taskOriginLabel(task.empresa);
  // Existing labels from imports must be recalculated from the company field.
  const normalized=title.replace(/\s*\((?:INTERNA|EXTERNA)\)/giu,"");
  // Typical task title: "#201632 — BUG — SEM SPRINT".
  const bug=normalized.match(/\bBUG\b/iu);
  if(bug && bug.index!==undefined) {
    const end=bug.index+bug[0].length;
    return normalized.slice(0,end)+" ("+origin+")"+normalized.slice(end);
  }
  // Do not invent a bug type or sprint if the title doesn't contain them.
  return normalized+" ("+origin+")";
}
