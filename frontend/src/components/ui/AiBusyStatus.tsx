import { useEffect, useState } from "react";
import { LoaderCircle } from "lucide-react";
import "./ai-busy-status.css";

export function AiBusyStatus({ title, detail }: {
  title: string;
  detail: string;
}) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const started = Date.now();
    const timer = window.setInterval(() => setSeconds(
      Math.floor((Date.now() - started) / 1000)
    ), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const clock = Math.floor(seconds / 60).toString().padStart(2, "0") + ":" +
    (seconds % 60).toString().padStart(2, "0");
  return <div className="qa-ai-busy-status" aria-label="Solicitação à IA em andamento">
    <div className="qa-ai-busy-main">
      <LoaderCircle className="qa-ai-spinner" size={19} aria-hidden="true"/>
      <div>
        <strong role="status" aria-live="polite">{title}</strong>
        <p>{detail}</p>
      </div>
    </div>
    <span className="qa-ai-busy-clock" aria-live="off">
      Tempo decorrido <strong>{clock}</strong>
    </span>
    <div className="qa-ai-busy-track" aria-hidden="true"><span/></div>
  </div>;
}
