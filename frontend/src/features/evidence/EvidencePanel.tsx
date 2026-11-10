import { useEffect, useState } from "react";
import {ToastNotice} from "../../components/ui/Toasts";
import { Button } from "@heroui/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, ClipboardList, FilePlus2, Link2 } from "lucide-react";
import { z } from "zod";
import type { Task, Scenario } from "../../lib/contracts";
import { supabase } from "../../lib/supabase";
import { validateEvidence, auditDetails, auditLabel } from "../../lib/legacy/qa-phase4.mjs";
import { EvidenceFilesPanel } from "./EvidenceFilesPanel";

const uuid = z.uuid();
const evidenceType = z.enum(["observacao", "log", "captura", "referencia"]);
const evidenceSchema = z.object({
  id: uuid, tarefa_id: uuid, user_id: uuid,
  cenario_id: uuid.nullish(), tipo: evidenceType,
  resumo: z.string(), referencia: z.string(), created_at: z.string()
});
const eventSchema = z.object({
  id: uuid, acao: z.string(), detalhes: z.record(z.string(), z.unknown()),
  created_at: z.string()
});
type Evidence = z.infer<typeof evidenceSchema>;
type AuditEvent = z.infer<typeof eventSchema>;

async function listEvidence(taskId: string): Promise<Evidence[]> {
  uuid.parse(taskId);
  const { data, error } = await supabase.from("qa_evidencias")
    .select("id,tarefa_id,user_id,cenario_id,tipo,resumo,referencia,created_at")
    .eq("tarefa_id", taskId).order("created_at", { ascending: false }).limit(101);
  if (error) throw error;
  if ((data ?? []).length > 100) throw Error("Mais de 100 evidências. Consulte o histórico completo no legado.");
  return z.array(evidenceSchema).parse(data ?? []);
}
async function listAudit(taskId: string, page: number): Promise<AuditEvent[]> {
  uuid.parse(taskId);
  const { data, error } = await supabase.from("qa_eventos")
    .select("id,acao,detalhes,created_at").eq("tarefa_id", taskId)
    .order("created_at", { ascending: false }).range(0, 30 * (page + 1) - 1);
  if (error) throw error;
  return z.array(eventSchema).parse(data ?? []);
}

export default function EvidencePanel({
  task, userId, scenarios, prefillScenarioId, prefillRequest, readOnly=false
}: { task: Task; userId: string; scenarios: Scenario[];
  prefillScenarioId?: string|null; prefillRequest?: number; readOnly?:boolean }) {
  const client = useQueryClient();
  const owner = task.user_id === userId;
  const [tab, setTab] = useState<"evidence" | "audit">("evidence");
  const [type, setType] = useState<"observacao"|"log"|"captura"|"referencia">("observacao");
  const [summary, setSummary] = useState("");
  const [url, setUrl] = useState("");
  const [scenarioId, setScenarioId] = useState("");
  useEffect(()=>{
    if(prefillScenarioId && scenarios.some(item=>item.id===prefillScenarioId)){
      setScenarioId(prefillScenarioId);
      setTab("evidence");
    }
  },[prefillScenarioId,prefillRequest,task.id]);
  const [page, setPage] = useState(0);
  const [message, setMessage] = useState("");
  const evidence = useQuery({
    queryKey: ["evidence", userId, task.id],
    queryFn: () => listEvidence(task.id), enabled: owner && tab === "evidence"
  });
  const audit = useQuery({
    queryKey: ["audit", userId, task.id, page],
    queryFn: () => listAudit(task.id, page), enabled: owner && tab === "audit"
  });
  const save = useMutation({
    mutationFn: async () => {
      if (!owner) throw Error("Somente o proprietário pode registrar evidências nesta TF.");
      if (/([?&](?:token|key|secret|password|auth)=|:\/\/[^/]+@)/i.test(url)) {
        throw Error("Remova credenciais ou tokens embutidos no link.");
      }
      const draft = validateEvidence({
        tipo: type, resumo: summary, referencia: url, cenario_id: scenarioId || null
      });
      if (draft.cenario_id && !scenarios.some((item) => item.id === draft.cenario_id))
        throw Error("Cenário não pertence à TF.");
      const { data, error } = await supabase.from("qa_evidencias")
        .insert({ ...draft, tarefa_id: task.id, user_id: userId })
        .select("id").single();
      if (error) throw error;
      if (!data?.id) throw Error("O banco não confirmou a evidência.");
    },
    onSuccess: async () => {
      setSummary(""); setUrl(""); setScenarioId(""); setMessage("Evidência registrada. O histórico é imutável.");
      await Promise.all([
        client.invalidateQueries({ queryKey: ["evidence", userId, task.id] }),
        client.invalidateQueries({ queryKey: ["audit", userId, task.id] }),
        client.invalidateQueries({ queryKey: ["gen-support", userId, task.id] })
      ]);
    }
  });
  const scenarioName = (id: string | null | undefined) =>
    scenarios.find((item) => item.id === id)?.titulo || "TF geral";
  return <section className="qa-evidence-workspace" aria-label="Evidências e auditoria da TF">
    {!owner ? <p role="alert" className="notice error mt-4">
      O registro de evidências está disponível somente para o proprietário da TF.
    </p> : <>
      <div role="tablist" aria-label="Registros da TF" className="requirements-tabs mt-5">
        <button role="tab" aria-selected={tab === "evidence"} onClick={() => setTab("evidence")}
          className={"filter-chip " + (tab === "evidence" ? "selected" : "")}>
          <ClipboardList size={16} /> Evidências
        </button>
        <button role="tab" aria-selected={tab === "audit"} onClick={() => setTab("audit")}
          className={"filter-chip " + (tab === "audit" ? "selected" : "")}>
          <Activity size={16} /> Auditoria
        </button>
      </div>
      {tab === "evidence" && <div role="tabpanel" className="stack mt-5">
        {!readOnly&&<label className="field qa-evidence-scenario-picker">Cenário relacionado (opcional)
          <select value={scenarioId} onChange={(event) => setScenarioId(event.target.value)}>
            <option value="">TF geral</option>
            {scenarios.map(item=><option value={item.id} key={item.id}>
              {item.titulo}
            </option>)}
          </select>
        </label>}
        <EvidenceFilesPanel task={task} userId={userId} scenarios={scenarios}
          scenarioId={scenarioId||null} readOnly={readOnly}/>
        {!readOnly&&<details className="qa-evidence-text-details">
          <summary>Adicionar observação ou link <span>Opcional</span></summary>
        <form className="generator-context stack" onSubmit={(event) => {
          event.preventDefault();
          void save.mutateAsync();
        }}>
          <h3 className="font-semibold">Adicionar evidência</h3>
          <div className="form-grid mt-3">
            <label className="field">Tipo<select value={type}
              onChange={(event) => setType(evidenceType.parse(event.target.value))}>
              <option value="observacao">Observação</option>
              <option value="log">Log (referência textual)</option>
              <option value="captura">Captura (link)</option>
              <option value="referencia">Referência</option>
            </select></label>

          </div>
          <label className="field mt-3">Resumo do que foi observado (3–2.000 caracteres)
            <textarea rows={3} maxLength={2000} value={summary}
              placeholder="Descreva o comportamento observado, sem senhas nem dados pessoais."
              onChange={(e) => setSummary(e.target.value)} />
          </label>
          <label className="field mt-3">Link HTTPS (opcional; não envie tokens na URL)
            <input type="url" maxLength={1500} value={url}
              placeholder="https://..."
              onChange={(e) => setUrl(e.target.value)} />
          </label>
          <div className="mt-3">
            <Button type="submit" isDisabled={save.isPending || summary.trim().length < 3}>
              <FilePlus2 size={16} /> Salvar evidência
            </Button>
          </div>
          <ToastNotice message={save.isError?save.error.message:null} tone="error"/>
          <ToastNotice message={message} tone="success"/>
        </form>
        </details>}
        <h3 className="font-semibold mt-4">Observações e referências anteriores</h3>
        {evidence.isPending && <p role="status">Carregando evidências…</p>}
        {evidence.isError && <p role="alert" className="notice error">{evidence.error.message}</p>}
        {evidence.isSuccess && !evidence.data.length &&
          <p className="text-muted text-sm">Esta TF não possui evidências registradas.</p>}
        {evidence.data?.map((item) => <article className="requirement-row" key={item.id}>
          <div className="section-heading">
            <strong>{item.tipo} · {scenarioName(item.cenario_id)}</strong>
            <small className="text-muted">{new Date(item.created_at).toLocaleString("pt-BR")}</small>
          </div>
          <p className="text-sm mt-3">{item.resumo}</p>
          {item.referencia && <a href={item.referencia} target="_blank"
            rel="noopener noreferrer" className="secondary-link mt-2">
            <Link2 size={15} /> Abrir referência externa
          </a>}
        </article>)}
      </div>}
      {tab === "audit" && <div role="tabpanel" className="stack mt-5">
        <p className="text-muted text-sm">
          Eventos criados por gatilhos do Supabase. Esta tela é somente leitura;
          textos confidenciais dos testes não fazem parte dos detalhes exibidos.
        </p>
        {audit.isPending && <p role="status">Carregando auditoria…</p>}
        {audit.isError && <p role="alert" className="notice error">{audit.error.message}</p>}
        {audit.isSuccess && !audit.data.length &&
          <p className="text-muted text-sm">Nenhum evento encontrado.</p>}
        {audit.data?.map((item) => <article className="requirement-row" key={item.id}>
          <div className="section-heading">
            <strong>{auditLabel(item)}</strong>
            <small className="text-muted">{new Date(item.created_at).toLocaleString("pt-BR")}</small>
          </div>
          {auditDetails(item) && <p className="text-sm mt-2">{auditDetails(item)}</p>}
        </article>)}
        {audit.data && audit.data.length >= 30 * (page + 1) &&
          <Button variant="secondary" onPress={() => setPage((v) => v + 1)}>
            Mostrar mais eventos
          </Button>}
      </div>}
    </>}
  </section>;
}
