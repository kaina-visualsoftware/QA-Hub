import { useEffect, useRef, useState } from "react";
import { Check, Circle, LoaderCircle, Square } from "lucide-react";
import { Button } from "@heroui/react";

export type ActivityPhase = "connecting" | "receiving" | "organizing" | "cooldown";
export type JourneyStage = "configure" | "generate" | "review" | "complete";

const stages = [
  { key: "configure", label: "Configurar" },
  { key: "generate", label: "Gerar" },
  { key: "review", label: "Revisar e adicionar" }
] as const;

export function GeneratorSteps({ stage, postMode }: {
  stage: JourneyStage;
  postMode: boolean;
}) {
  const order = stage === "complete" ? 3 :
    stages.findIndex((item) => item.key === stage);
  return <ol className="qa-post-steps qa-generation-steps" aria-label={
    postMode ? "Etapas da publicação" : "Etapas da geração de casos"
  }>
    {stages.map((step, index) => {
      const done = index < order || stage === "complete";
      const current = index === order && stage !== "complete";
      return <li key={step.key} className={done ? "is-done" : current ? "is-current" : ""}
        aria-current={current ? "step" : undefined}>
        <span aria-hidden="true">{done ? <Check size={14}/> : index + 1}</span>
        {index === 2 && postMode ? "Revisar e salvar" : step.label}
      </li>;
    })}
  </ol>;
}

const phaseCopy = {
  cooldown:{
    title:"Aguardando liberação de cota",
    description:"A solicitação ainda não foi reiniciada. O contexto foi mantido."
  },
  connecting: {
    title: "Conectando à NVIDIA",
    description: "Aguardando o início da resposta do serviço."
  },
  receiving: {
    title: "Recebendo a resposta",
    description: "A geração está em andamento. O texto aparece conforme chega."
  },
  organizing: {
    title: "Preparando a revisão",
    description: "Organizando a resposta e identificando os casos disponíveis."
  }
} as const;

export function GeneratorActivity({ phase, raw, postMode, onCancel }: {
  phase: ActivityPhase;
  raw: string;
  postMode: boolean;
  onCancel: () => void;
}) {
  const status = phaseCopy[phase];
  // O tempo informa duração observada; nunca é tratado como percentual da API.
  const startedAt = useRef(Date.now());
  const lastChunkAt = useRef(Date.now());
  const lastLength = useRef(raw.length);
  const previewRef = useRef<HTMLPreElement>(null);
  const [elapsed, setElapsed] = useState(0);
  const [silentFor, setSilentFor] = useState(0);
  useEffect(() => {
    const interval = window.setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt.current) / 1000));
      setSilentFor(Math.floor((Date.now() - lastChunkAt.current) / 1000));
    }, 1000);
    return () => window.clearInterval(interval);
  }, []);
  useEffect(() => {
    if (raw.length > lastLength.current) {
      lastChunkAt.current = Date.now();
      setSilentFor(0);
    }
    lastLength.current = raw.length;
    const preview = previewRef.current;
    if (preview && preview.scrollHeight - preview.scrollTop - preview.clientHeight < 90)
      preview.scrollTop = preview.scrollHeight;
  }, [raw]);
  const elapsedText = `${Math.floor(elapsed / 60).toString().padStart(2, "0")}:${(elapsed % 60).toString().padStart(2, "0")}`;
  return <section className="qa-generation-activity" aria-label="Andamento da geração com IA">
    <div className="qa-generation-activity-head">
      <span className="qa-generation-activity-icon" aria-hidden="true">
        <LoaderCircle className="qa-ai-spinner" size={22}/>
      </span>
      <div className="qa-generation-activity-copy">
        <strong role="status" aria-live="polite" aria-atomic="true">{status.title}</strong>
        <p>{status.description}</p>
      </div>
    </div>
    <div className="qa-generation-telemetry" aria-label="Medições da solicitação">
      <span>Tempo decorrido <strong>{elapsedText}</strong></span>
      <span>Conteúdo recebido <strong>{raw.length.toLocaleString("pt-BR")} caracteres</strong></span>
      {phase === "receiving" && raw.length > 0 && silentFor >= 8 &&
        <span className="qa-generation-slow" role="status">
          Sem novos trechos há {silentFor} s. A solicitação continua ativa.
        </span>}
    </div>
    <div className="qa-generation-indeterminate" aria-hidden="true"><span/></div>
    <ol className="qa-generation-events" aria-label="Estados do processamento">
      {[
        { label: "Contexto preparado", done: true, active: false },
        { label: "Conexão estabelecida", done: phase !== "connecting" && phase !== "cooldown",
          active: phase === "connecting" || phase === "cooldown" },
        { label: "Resposta em streaming", done: phase === "organizing",
          active: phase === "receiving" },
        { label: "Revisão dos dados", done: false, active: phase === "organizing" }
      ].map((item,index) => <li key={item.label}
        className={item.done ? "is-done" : item.active ? "is-active" : ""}>
        <span aria-hidden="true">
          {item.done ? <Check size={14}/> : item.active
            ? <LoaderCircle size={14} className="qa-ai-spinner"/> : <Circle size={12}/>}
        </span>
        <span>{item.label}</span>
        {index === 2 && raw.length > 0 && <small>Resposta parcial</small>}
      </li>)}
    </ol>
    {raw.length ? <details className="qa-generation-live-text" open>
      <summary>Prévia do texto recebido</summary>
      <pre ref={previewRef} aria-label="Trecho recente da resposta da IA" aria-live="off">{
        raw.slice(-1800)
      }</pre>
      <p>Prévia parcial; os casos serão apresentados para revisão quando a geração terminar.</p>
    </details> : <div className="qa-generation-awaiting">
      <p>{elapsed < 12
        ? "Aguardando o primeiro trecho da NVIDIA. A solicitação continua ativa."
        : "O serviço ainda não enviou texto. Você pode continuar aguardando ou cancelar esta geração."}</p>
    </div>}
    <div className="qa-generation-activity-footer">
      <span>{postMode ? "O post não será salvo automaticamente." :
        "Nenhum caso será adicionado sem sua confirmação."}</span>
      <Button variant="secondary" onPress={onCancel}>
        <Square size={14} aria-hidden="true"/> Cancelar geração
      </Button>
    </div>
  </section>;
}
