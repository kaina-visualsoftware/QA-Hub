import { Check } from "lucide-react";
import "./ai-step-flow.css";

export type AiFlowStep = "prepare" | "processing" | "review" | "finalize" | "complete";

type Props = {
  step: AiFlowStep;
  label?: string;
  labels?: readonly [string, string, string];
};

/** Consistent, accessible journey used by AI features:
 * 1. Request generation, 2. Inspect a draft, 3. Explicitly finish.
 * The API progress belongs to step 1, not a fake completion percentage.
 */
export function AiStepFlow({
  step,
  label = "Etapas da assistência com IA",
  labels = ["Configurar e gerar", "Revisar resultado", "Finalizar"]
}: Props) {
  const active = step === "prepare" || step === "processing"
    ? 0 : step === "review" ? 1 : 2;
  return <ol className="qa-ai-step-flow" aria-label={label}>
    {labels.map((name, index) => <li key={name}
      className={step==="complete" || index < active ? "is-done" :
        index === active ? "is-current" : ""}
      aria-current={step!=="complete" && index === active ? "step" : undefined}>
      <span aria-hidden="true">{index < active || step === "complete" && index === 2
        ? <Check size={14}/> : index + 1}</span>
      <span>{name}</span>
    </li>)}
  </ol>;
}
