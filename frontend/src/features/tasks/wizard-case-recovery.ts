import {normalizeDraft} from "../../lib/legacy/qa-assistant.mjs";
import {parseGeneratedCases} from "../../lib/legacy/qa-workspace.mjs";
import {freshTaskAiScenarios} from "./task-ai";
import type {SuggestedScenario} from "./task-ai";
import type {GeneratorCheckpoint} from "../generators/batched-stream";

/** Interrupted SSE output is only a suggestion: never auto-select recovered cases.
 * The QA must check each title, steps and expected result before saving the TF.
 */
export function recoverInterruptedWizardCases(
 checkpoint:GeneratorCheckpoint,existing:SuggestedScenario[]=[]
):SuggestedScenario[]{
 const received=[...checkpoint.sections,checkpoint.partial].filter(Boolean).join("\n\n");
 if(!received.trim())return [];
 const parsed=parseGeneratedCases(received);
 return freshTaskAiScenarios(normalizeDraft({cenarios:parsed}),existing,false);
}
