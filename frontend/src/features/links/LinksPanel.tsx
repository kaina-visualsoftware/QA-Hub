import { useMemo, useState } from "react";
import {ToastNotice} from "../../components/ui/Toasts";
import { Button } from "@heroui/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Clipboard, GitCompareArrows, GitMerge, NotebookPen, Save, X } from "lucide-react";
import { z } from "zod";
import ComparisonTool from "./ComparisonTool";
import ReleaseOrganizer from "./ReleaseOrganizer";
import { supabase } from "../../lib/supabase";
import type { Task } from "../../lib/contracts";
import {
  createReference, linkTaskRelease, normalizeReleaseVersion, validateReference
} from "../../lib/legacy/qa-phase3.mjs";

const id = z.uuid();
const releaseSchema = z.object({ id, versao: z.string(), created_at: z.string() });
const releaseLinkSchema = z.object({ release_id: id, tarefa_id: id });
const referenceSchema = z.object({
  id, categoria: z.enum(["checklist", "regra", "nota"]),
  titulo: z.string(), conteudo: z.string(), created_at: z.string()
});
const comparisonSchema = z.object({
  id, tipo: z.enum(["diff_texto", "diff_xml"]),
  adicionados: z.number(), removidos: z.number(), alterados: z.number(),
  created_at: z.string()
});
type Reference = z.infer<typeof referenceSchema>;

async function fetchReleases(taskId: string, userId: string) {
  const [linked, registered] = await Promise.all([
    supabase.from("qa_release_tarefas").select("release_id,tarefa_id")
      .eq("tarefa_id", taskId).limit(100),
    supabase.from("qa_releases").select("id,versao,created_at")
      .eq("user_id", userId).order("created_at", { ascending: false }).limit(500)
  ]);
  if (linked.error) throw linked.error;
  if (registered.error) throw registered.error;
  const linkedIds = new Set(z.array(releaseLinkSchema).parse(linked.data ?? [])
    .filter((item) => item.tarefa_id === taskId).map((item) => item.release_id));
  return z.array(releaseSchema).parse(registered.data ?? [])
    .filter((release) => linkedIds.has(release.id));
}
async function fetchReferences(userId: string): Promise<Reference[]> {
  const { data, error } = await supabase.from("qa_referencias")
    .select("id,categoria,titulo,conteudo,created_at").eq("user_id", userId)
    .order("created_at", { ascending: false }).limit(101);
  if (error) throw error;
  if ((data ?? []).length > 100) throw Error("Mais de 100 referências. Consulte o histórico no legado.");
  return z.array(referenceSchema).parse(data ?? []);
}
async function fetchComparisons(taskId: string) {
  const { data, error } = await supabase.from("qa_artefatos")
    .select("id,tipo,adicionados,removidos,alterados,created_at")
    .eq("tarefa_id", taskId).order("created_at", { ascending: false }).limit(100);
  if (error) throw error;
  return z.array(comparisonSchema).parse(data ?? []);
}

export default function LinksPanel({
  task, userId, onClose
}: { task: Task; userId: string; onClose?: () => void }) {
  const own = task.user_id === userId;
  const client = useQueryClient();
  const [tab, setTab] = useState<"releases" | "references" | "comparisons">("releases");
  const [version, setVersion] = useState("");
  const [category, setCategory] = useState<Reference["categoria"]>("checklist");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [message, setMessage] = useState("");
  const [failure, setFailure] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);
  const releases = useQuery({
    queryKey: ["qa-releases", userId, task.id],
    queryFn: () => fetchReleases(task.id, userId),
    enabled: own && tab === "releases"
  });
  const references = useQuery({
    queryKey: ["qa-references", userId],
    queryFn: () => fetchReferences(userId),
    enabled: own && tab === "references"
  });
  const comparisons = useQuery({
    queryKey: ["qa-comparisons", userId, task.id],
    queryFn: () => fetchComparisons(task.id),
    enabled: own && tab === "comparisons"
  });
  const saveRelease = useMutation({
    mutationFn: () => {
      if (!own) throw Error("Somente o proprietário pode vincular releases.");
      return linkTaskRelease(supabase, { taskId: task.id, version: normalizeReleaseVersion(version) });
    },
    onSuccess: async () => {
      setVersion(""); setFailure(""); setMessage("Release vinculada à TF sem alterar seus testes.");
      await client.invalidateQueries({ queryKey: ["qa-releases", userId, task.id] });
    },
    onError: (e) => setFailure(e.message)
  });
  const saveReference = useMutation({
    mutationFn: async () => {
      if (!own) throw Error("A referência pertence a outra conta.");
      const valid = validateReference({ titulo: title, conteudo: content, categoria: category });
      return createReference(supabase, { userId, ...valid });
    },
    onSuccess: async () => {
      setTitle(""); setContent(""); setFailure(""); setMessage("Referência privada salva.");
      await client.invalidateQueries({ queryKey: ["qa-references", userId] });
    },
    onError: (e) => setFailure(e.message)
  });
  async function removeReference(reference: Reference) {
    if (!window.confirm("Excluir a referência '" + reference.titulo + "'?")) return;
    setFailure(""); setMessage(""); setDeleting(reference.id);
    try {
      const { data, error } = await supabase.from("qa_referencias").delete()
        .eq("id", reference.id).eq("user_id", userId).select("id").maybeSingle();
      if (error) throw error;
      if (!data) throw Error("Referência indisponível ou sem permissão.");
      await client.invalidateQueries({ queryKey: ["qa-references", userId] });
      setMessage("Referência excluída.");
    } catch (reason) { setFailure((reason as Error).message); }
    finally { setDeleting(null); }
  }
  const tabLabels = useMemo(() => [
    {key:"releases" as const,label:"Releases",icon:GitMerge},
    {key:"references" as const,label:"Referências",icon:NotebookPen},
    {key:"comparisons" as const,label:"Comparações",icon:GitCompareArrows}
  ],[]);
  return <section className="panel mt-5" aria-labelledby="links-heading">
    <div className="section-heading">
      <div><p className="eyebrow">HISTÓRICO E CONTEXTO</p><h2 id="links-heading">Releases e referências</h2>
        <p className="text-muted">Vincule a TF a uma versão e consulte conhecimento técnico privado.</p>
      </div>
      {onClose&&<button type="button" aria-label="Fechar releases e referências" onClick={onClose}><X size={18}/></button>}
    </div>
    {!own ? <p className="notice error mt-4" role="alert">
      Os vínculos e referências desta TF estão disponíveis somente ao proprietário.
    </p> : <>
      <div role="tablist" className="requirements-tabs mt-5" aria-label="Releases, referências e comparações">
        {tabLabels.map((item) => {
          const Icon = item.icon;
          return <button key={item.key} role="tab" aria-selected={tab === item.key}
            className={"filter-chip " + (tab === item.key ? "selected" : "")}
            onClick={() => { setTab(item.key); setMessage(""); setFailure(""); }}>
            <Icon size={16}/> {item.label}</button>;
        })}
      </div>
      {tab === "releases" && <div className="stack mt-5" role="tabpanel">
        <form className="generator-context stack" onSubmit={(event) => {
          event.preventDefault(); void saveRelease.mutateAsync();
        }}>
          <h3 className="font-semibold">Vincular release</h3>
          <label className="field mt-3">Versão (ex.: 12.10.06.0000)
            <input value={version} maxLength={40}
              placeholder="12.10.06.0000" onChange={(e) => setVersion(e.target.value)}/>
          </label>
          <p className="text-muted text-sm mt-2">
            A associação não altera os resultados da TF nem infere uma release pelo título.
          </p>
          <div className="mt-3"><Button type="submit" isDisabled={saveRelease.isPending || !version.trim()}>
            <Save size={16}/> Vincular release
          </Button></div>
        </form>
        <ReleaseOrganizer task={task} version={version} />
        <h3 className="font-semibold">Releases vinculadas</h3>
        {releases.isPending && <p role="status">Carregando releases…</p>}
        {releases.isError && <p role="alert" className="notice error">{releases.error.message}</p>}
        {releases.isSuccess && !releases.data.length &&
          <p className="text-muted text-sm">Nenhuma release associada a esta TF.</p>}
        {releases.data?.map((item) => <article key={item.id} className="requirement-row">
          <strong>{item.versao}</strong>
          <p className="text-muted text-sm mt-2">
            {new Date(item.created_at).toLocaleString("pt-BR")}
          </p>
        </article>)}
      </div>}
      {tab === "references" && <div className="stack mt-5" role="tabpanel">
        <form className="generator-context stack" onSubmit={(event) => {
          event.preventDefault(); void saveReference.mutateAsync();
        }}>
          <h3 className="font-semibold">Criar referência privada</h3>
          <p className="text-muted text-sm mt-2">
            Anote checklists, regras ou orientações técnicas. Não salve senhas, tokens ou dados pessoais.
          </p>
          <div className="form-grid mt-3">
            <label className="field">Categoria<select value={category}
              onChange={(e) => setCategory(e.target.value as Reference["categoria"])}>
              <option value="checklist">Checklist</option>
              <option value="regra">Regra</option>
              <option value="nota">Nota</option>
            </select></label>
            <label className="field grow-2">Título<input maxLength={160} value={title}
              onChange={(e) => setTitle(e.target.value)} placeholder="Ex.: Conferência de descontos"/></label>
          </div>
          <label className="field mt-3">Conteúdo<textarea rows={5} maxLength={2000} value={content}
            onChange={(e) => setContent(e.target.value)}/></label>
          <div className="mt-3"><Button type="submit" isDisabled={saveReference.isPending ||
            title.trim().length < 3 || content.trim().length < 3}>
            <Save size={16}/> Salvar referência
          </Button></div>
        </form>
        <h3 className="font-semibold mt-3">Referências da conta</h3>
        {references.isPending && <p role="status">Carregando referências…</p>}
        {references.isError && <p role="alert" className="notice error">{references.error.message}</p>}
        {references.isSuccess && !references.data.length &&
          <p className="text-muted text-sm">Nenhuma referência privada registrada.</p>}
        {references.data?.map((item) => <article key={item.id} className="requirement-row">
          <div className="section-heading">
            <div><strong>{item.titulo}</strong><p className="text-muted text-sm">{item.categoria}</p></div>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" size="sm"
                onPress={() => void navigator.clipboard.writeText(item.conteudo)}>
                <Clipboard size={14}/> Copiar</Button>
              <Button variant="secondary" size="sm" isDisabled={deleting === item.id}
                onPress={() => void removeReference(item)}>Excluir</Button>
            </div>
          </div>
          <p className="text-sm mt-3">{item.conteudo}</p>
        </article>)}
      </div>}
      {tab === "comparisons" && <div className="stack mt-5" role="tabpanel">
        <ComparisonTool task={task} userId={userId} />
        <div className="divider mt-4" />
        <p className="text-muted text-sm">
          Somente os contadores de comparações são persistidos. Textos e XML originais
          permanecem fora da base de dados e desta tela.
        </p>
        {comparisons.isPending && <p role="status">Carregando comparações…</p>}
        {comparisons.isError && <p role="alert" className="notice error">{comparisons.error.message}</p>}
        {comparisons.isSuccess && !comparisons.data.length &&
          <p className="text-muted text-sm">Sem comparações registradas nesta TF.</p>}
        {comparisons.data?.map((item) => <article className="requirement-row" key={item.id}>
          <strong>{item.tipo === "diff_xml" ? "Comparação XML" : "Comparação de texto"}</strong>
          <p className="text-muted text-sm mt-2">
            Adicionados: {item.adicionados} · Removidos: {item.removidos} · Alterados: {item.alterados}
          </p>
          <small className="text-muted">{new Date(item.created_at).toLocaleString("pt-BR")}</small>
        </article>)}
      </div>}
    </>}
    <ToastNotice message={message} tone="success"/>
    <ToastNotice message={failure} tone="error"/>
  </section>;
}
