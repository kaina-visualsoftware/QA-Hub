import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { Button } from "@heroui/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { ArrowRight, CheckCheck, Filter, Plus, Search, Sparkles } from "lucide-react";
import { useAuth } from "../features/auth/AuthProvider";
import { QAModal } from "../components/ui/QAModal";
import { createTask, getAdminRole, listTasks, addExtractedScenarios } from "../lib/data";
import { listTaskProgress } from "../lib/task-progress";
import { extractLocalDraft, normalizeDraft } from "../lib/legacy/qa-assistant.mjs";
import { supabase } from "../lib/supabase";
import type { LocalDraft } from "../lib/legacy/qa-assistant.mjs";
import type { LocalModelClient } from "../lib/legacy/qa-ai-open.mjs";
import { taskDraftSchema, taskStatusLabels } from "../lib/contracts";
import type { TaskDraft } from "../lib/contracts";
import { useFocus } from "../stores/focus";
import {
  discardNewTaskDraft, loadNewTaskDraft, saveNewTaskDraft
} from "../features/tasks/local-draft";
import type { StoredNewTaskDraft } from "../features/tasks/local-draft";

export function Workspace() {
  const { user } = useAuth();
  const userId = user?.id ?? "";
  const [showForm, setShowForm] = useState(false);
  const [rememberDraft, setRememberDraft] = useState(false);
  const [recoverableDraft, setRecoverableDraft] = useState<StoredNewTaskDraft | null>(null);
  const [draftStorageError, setDraftStorageError] = useState("");
  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previousDraftUserRef = useRef("");
  const [extracted, setExtracted] = useState<Array<{titulo:string;passos:string;esperado:string;observacoes:string;selected:boolean}>>([]);
  const [extractionNotice, setExtractionNotice] = useState("");
  const [localReview, setLocalReview] = useState<{source:string;draft:LocalDraft} | null>(null);
  const [allowModel, setAllowModel] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiProgress, setAiProgress] = useState("");
  const [onlineBusy, setOnlineBusy] = useState(false);
  const [onlineConsentText, setOnlineConsentText] = useState<string|null>(null);
  const [fileBusy, setFileBusy] = useState(false);
  const modelRef = useRef<LocalModelClient | null>(null);
  const aiRunRef = useRef(0);
  const { newTask } = useSearch({ from: "/" });
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [visibleCount, setVisibleCount] = useState(30);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const focusedId = useFocus((s) => s.taskId);
  const setFocused = useFocus((s) => s.setTask);
  const role = useQuery({ queryKey: ["role", userId], queryFn: () => getAdminRole(userId), enabled: !!userId });
  const tasks = useQuery({
    queryKey: ["tasks", userId, role.data],
    queryFn: () => listTasks(userId, role.data ?? false),
    enabled: !!userId && role.data !== undefined
  });
  useEffect(() => () => {
    aiRunRef.current++;
    modelRef.current?.dispose();
    modelRef.current = null;
  }, []);
  function showReview(source: string, draft: LocalDraft, viaModel: boolean | "online") {
    setLocalReview({ source, draft });
    setExtracted(draft.cenarios
      .filter((item) => item.titulo.trim().length >= 3 &&
        item.passos.trim().length > 0 && item.esperado.trim().length > 0)
      .map((item) => ({
        titulo: item.titulo.slice(0,240), passos: item.passos.slice(0,20000),
        esperado: item.esperado.slice(0,20000),
        observacoes: item.observacoes.slice(0,20000), selected: false
      })));
    setExtractionNotice(viaModel === "online"
      ? "Prévia da IA NVIDIA pronta para revisão. Confira cada campo: a IA pode errar ou inventar informações."
      : viaModel
        ? "Sugestão de IA preparada no seu dispositivo. Confira cada campo: a IA pode errar ou inventar informações."
        : "Prévia preparada localmente. Confirme os campos e selecione os cenários desejados.");
  }

  async function analyzeWithModel() {
    const source = form.getValues("descricao");
    if (!allowModel || aiBusy) return;
    if (!source.trim() || source.length > 6000) {
      setExtractionNotice("A IA local aceita entre 1 e 6.000 caracteres. Para textos maiores, use a extração sem IA.");
      return;
    }
    const run = ++aiRunRef.current;
    let activeClient: LocalModelClient | null = null;
    setAiBusy(true); setAiProgress("Preparando o worker local…");
    setLocalReview(null); setExtracted([]);
    try {
      const { createOpenModelClient } = await import("../lib/legacy/qa-ai-open.mjs");
      if (aiRunRef.current !== run) return;
      modelRef.current?.dispose();
      const client = createOpenModelClient();
      activeClient = client;
      modelRef.current = client;
      const draft = await client.extract(source, (message) => {
        if (aiRunRef.current === run) setAiProgress(message);
      });
      if (aiRunRef.current !== run) return;
      if (form.getValues("descricao") !== source) {
        setExtractionNotice("O texto mudou durante a análise. Execute a IA novamente para gerar uma prévia atualizada.");
        return;
      }
      showReview(source, draft, true);
    } catch (error) {
      if (aiRunRef.current === run) {
        setExtractionNotice(error instanceof Error ? error.message :
          "Não foi possível usar o modelo neste dispositivo. Use a extração sem IA.");
      }
    } finally {
      if (aiRunRef.current === run) {
        setAiBusy(false); setAiProgress("");
      }
      activeClient?.dispose();
      if (modelRef.current === activeClient) modelRef.current = null;
    }
  }

  async function importReport(file:File | undefined){
    if(!file)return;
    setFileBusy(true);setExtractionNotice("");
    try{
      if(file.size===0||file.size>10*1024*1024)
        throw Error("O arquivo deve ter até 10 MB e conter texto.");
      const extension=file.name.split(".").pop()?.toLowerCase();
      let extracted="";
      let warning="";
      if(extension==="txt"||extension==="md"){
        extracted=(await file.text()).replace(/\\r\\n?/g,"\\n").trim();
        if(extracted.length>30000){
          extracted=extracted.slice(0,30000);
          warning="Texto limitado a 30.000 caracteres; confira o trecho importado.";
        }
      }else if(extension==="pdf"||extension==="docx"){
        const {extractDocumentText}=await import("../features/requirements/read-document-text");
        const result=await extractDocumentText(new Uint8Array(await file.arrayBuffer()),extension);
        extracted=result.text;warning=result.warning;
      }else throw Error("Use um relatório TXT, MD, PDF ou DOCX.");
      if(!extracted)throw Error(warning||"O arquivo não contém texto selecionável.");
      if(form.getValues("descricao").trim() &&
         !window.confirm("Substituir a descrição existente pelo texto do arquivo?")) return;
      form.setValue("descricao",extracted,{shouldDirty:true,shouldValidate:true});
      setLocalReview(null);setExtracted([]);setOnlineConsentText(null);
      setExtractionNotice("Relatório carregado localmente. Revise antes de salvar. "+warning);
    }catch(reason){
      setExtractionNotice(reason instanceof Error?reason.message:"Não foi possível ler o relatório.");
    }finally{setFileBusy(false);}
  }

  async function analyzeOnline(){
    const source=form.getValues("descricao");
    if(!source.trim()||source.length>20000||onlineConsentText!==source||onlineBusy)return;
    setOnlineBusy(true);setExtractionNotice("");setLocalReview(null);setExtracted([]);
    try{
      const {data,error}=await supabase.functions.invoke("qa-ai",{
        body:{text:source},signal:AbortSignal.timeout(65000)
      });
      if(error){
        let detail: {message?:string}={};
        try{detail=await error.context?.json?.()??{};}catch{}
        throw Error(detail.message||"Falha ao analisar a TF com IA online.");
      }
      if(form.getValues("descricao")!==source){
        setExtractionNotice("O texto mudou durante a análise. Gere uma nova prévia antes de aplicar.");
        return;
      }
      const raw=data?.draft;
      const local=extractLocalDraft(source);
      const suggestion=raw&&typeof raw==="object"&&!Array.isArray(raw)
        ? normalizeDraft({...local.fields,...raw,
            cenarios:Array.isArray(raw.cenarios)?raw.cenarios:local.cenarios}) : local;
      showReview(source,suggestion,"online");
      if(data?.fallback||!raw||!Object.keys(raw).length)
        setExtractionNotice("A IA não retornou campos utilizáveis; foi preparada uma prévia local para revisão.");
    }catch(reason){
      setExtractionNotice(reason instanceof Error?reason.message:"A IA online está indisponível. Use a análise local.");
    }finally{setOnlineBusy(false);setOnlineConsentText(null);}
  }

  function cancelModel() {
    aiRunRef.current++;
    modelRef.current?.dispose();
    modelRef.current = null;
    setAiBusy(false); setAiProgress("");
    setExtractionNotice("Análise com modelo local cancelada. Você pode usar a extração sem IA.");
  }

  const form = useForm<TaskDraft>({
    resolver: zodResolver(taskDraftSchema),
    defaultValues: { titulo: "", descricao: "", codigo: "", tipo_teste: "BUILD", sistema: "", versao: "" }
  });
  const create = useMutation({
    mutationFn: async ({ draft, openScenario }: { draft: TaskDraft; openScenario: boolean }) => {
      const task = await createTask(userId, draft);
      let warning = "";
      const selected = extracted.filter((item) => item.selected);
      if (selected.length) {
        try { await addExtractedScenarios(task.id, userId, selected); }
        catch (error) { warning = error instanceof Error ? error.message : "Falha ao salvar cenários extraídos"; }
      }
      return { task, warning, openScenario };
    },
    onSuccess: async ({ task, warning, openScenario }) => {
      if (warning) {
        try { sessionStorage.setItem("qa-react-import-warning:" + task.id,
          "TF salva, mas os cenários extraídos não foram adicionados: " + warning); } catch {}
      }
      // A successfully persisted task is the only authoritative copy now.
      if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
      draftTimerRef.current = null;
      discardNewTaskDraft(userId);
      setRememberDraft(false); setRecoverableDraft(null); setDraftStorageError("");
      setExtracted([]); setExtractionNotice(""); setLocalReview(null);
      setFocused(task.id);
      await queryClient.invalidateQueries({ queryKey: ["tasks", userId] });
      setShowForm(false);
      form.reset();
      await navigate({
        to: "/tarefa/$taskId",
        params: { taskId: task.id },
        search: { newScenario: openScenario || undefined }
      });
    }
  });

  // Never recover another account's draft, even when the SPA is reused
  // without a full page load. Only the matching signed-in account can
  // explicitly restore the tab-scoped draft.
  useEffect(() => {
    if (!userId) return;
    if (previousDraftUserRef.current && previousDraftUserRef.current !== userId) {
      form.reset();
      setShowForm(false); setExtracted([]); setLocalReview(null);
    }
    previousDraftUserRef.current = userId;
    setRememberDraft(false);
    setDraftStorageError("");
    setRecoverableDraft(loadNewTaskDraft(userId));
  }, [userId]);

  useEffect(() => {
    if (!rememberDraft || !userId) return;
    const persist = () => {
      if (!saveNewTaskDraft(userId, form.getValues())) {
        setDraftStorageError("Não foi possível guardar o rascunho nesta aba. Copie seu texto antes de sair.");
      }
    };
    const subscription = form.watch(() => {
      if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
      draftTimerRef.current = setTimeout(() => {
        draftTimerRef.current = null;
        persist();
      }, 350);
    });
    const flush = () => {
      if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
      draftTimerRef.current = null;
      persist();
    };
    window.addEventListener("pagehide", flush);
    return () => {
      subscription.unsubscribe();
      window.removeEventListener("pagehide", flush);
      if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
      draftTimerRef.current = null;
    };
  }, [rememberDraft, userId, form.watch, form.getValues]);

  function closeDraft() {
    if (create.isPending) return;
    if (form.formState.isDirty && !rememberDraft &&
      !window.confirm("Descartar os campos não salvos desta TF?")) return;
    cancelModel();
    setShowForm(false); setLocalReview(null); setExtracted([]);
    setExtractionNotice("");
    if (!rememberDraft) form.reset();
  }

  useEffect(() => {
    if (newTask) setShowForm(true);
  }, [newTask]);

  useEffect(() => {
    if (focusedId && tasks.data && !tasks.data.some((task) => task.id === focusedId)) setFocused(null);
  }, [focusedId, tasks.data, setFocused]);

  const filtered = useMemo(() => (tasks.data ?? []).filter((task) => {
    const needle = search.toLocaleLowerCase("pt-BR").trim();
    const found = !needle || [task.titulo, task.codigo, task.sistema, task.versao, task.descricao]
      .some((value) => (value ?? "").toLocaleLowerCase("pt-BR").includes(needle));
    return found && (!status || task.status === status);
  }), [tasks.data, search, status]);
  const visibleTasks = filtered.slice(0, visibleCount);
  const progressIds = visibleTasks.map(item => item.id);
  const progress = useQuery({
    queryKey: ["task-progress", userId, progressIds.join(",")],
    queryFn: () => listTaskProgress(progressIds),
    enabled: tasks.isSuccess && progressIds.length > 0,
    staleTime: 30000
  });
  const pending = (tasks.data ?? []).filter((item) => item.status === "rascunho" || item.status === "em_teste").length;
  const approved = (tasks.data ?? []).filter((item) => item.status === "aprovado").length;

  return <div className="page">
    <div className="page-heading">
      <div><h1>Suas tarefas de teste</h1></div>
      <Button onPress={() => {
        if (showForm) closeDraft();
        else setShowForm(true);
      }}><Plus size={17} /> Nova TF</Button>
    </div>
    <section className="qa-home-metrics" aria-label="Resumo">
      <div><strong>{tasks.data?.length ?? 0}</strong><span>TFs</span></div>
      <div><strong>{pending}</strong><span>Em andamento</span></div>
      <div><strong>{approved}</strong><span>Aprovadas</span></div>
    </section>

    {recoverableDraft && <section className="panel mt-4" role="region"
      aria-label="Rascunho recuperável nesta aba">
      <div className="flex flex-wrap gap-3 items-center">
        <div className="grow">
          <strong>Rascunho não enviado</strong>
          <p className="text-muted text-sm mt-1">
            Você tem uma TF não salva nesta aba.
          </p>
        </div>
        <Button variant="secondary" onPress={() => {
          if (form.formState.isDirty &&
            !window.confirm("Substituir o formulário atual pelo rascunho guardado?")) return;
          form.reset(recoverableDraft.fields);
          setRememberDraft(true); setRecoverableDraft(null);
          setShowForm(true); setExtracted([]); setLocalReview(null);
          setExtractionNotice(""); setDraftStorageError("");
        }}>Recuperar rascunho</Button>
        <Button variant="secondary" onPress={() => {
          discardNewTaskDraft(userId);
          setRecoverableDraft(null);
        }}>Descartar rascunho</Button>
      </div>
    </section>}

    <QAModal open={showForm} title="Nova TF" eyebrow="CADASTRO RÁPIDO"
      description="Preencha o essencial, revise e continue para os cenários."
      onClose={closeDraft} busy={create.isPending} initialFocus={'input[name="titulo"]'}>
      <form onSubmit={form.handleSubmit((values, event) => {
        const submitter = (event?.nativeEvent as SubmitEvent | undefined)?.submitter;
        void create.mutateAsync({
          draft: values, openScenario: submitter?.getAttribute("data-next") === "scenario"
        });
      })} className="stack mt-5">
        <div className="form-grid">
          <label className="field grow-2">Título da tarefa
            <input placeholder="Ex.: Validar o desconto na devolução" {...form.register("titulo")} />
            {form.formState.errors.titulo && <small role="alert" className="text-error">{form.formState.errors.titulo.message}</small>}
          </label>
          <label className="field">Tipo
            <select {...form.register("tipo_teste")}><option>BUILD</option><option>RELEASE</option></select>
          </label>
        </div>
        <label className="field">Descrição / problema
          <textarea rows={6} placeholder="Cole um relatório completo ou descreva a TF. Não precisa preencher todos os campos."
            {...form.register("descricao")} />
        </label>
        <details className="qa-task-optional">
          <summary>Informações adicionais (opcional)</summary>
          <div className="form-grid mt-3">
            <label className="field">Código da TF<input placeholder="Opcional" {...form.register("codigo")} /></label>
            <label className="field">Sistema / módulo<input placeholder="Opcional" {...form.register("sistema")} /></label>
            <label className="field">Versão<input placeholder="Opcional" {...form.register("versao")} /></label>
          </div>
        </details>
        <label className="flex gap-2 items-start text-sm">
          <input type="checkbox" checked={rememberDraft} onChange={(event) => {
            if (event.target.checked) {
              if (!saveNewTaskDraft(userId, form.getValues())) {
                setDraftStorageError("O navegador não permitiu guardar o rascunho. Copie seu texto antes de sair.");
                return;
              }
              setRememberDraft(true); setRecoverableDraft(null);
              setDraftStorageError("");
            } else {
              setRememberDraft(false);
              discardNewTaskDraft(userId);
              setDraftStorageError("");
            }
          }} />
          <span>Guardar rascunho somente nesta aba (opcional).
            O texto fica neste navegador até salvar, descartar ou sair da conta.
            Evite usar em dispositivos compartilhados.</span>
        </label>
        {draftStorageError && <p role="alert" className="notice error">{draftStorageError}</p>}
        <div className="flex items-center gap-3 flex-wrap">
          <Button variant="secondary" type="button" onPress={() => {
            const source = form.getValues("descricao");
            try {
              const draft = extractLocalDraft(source);
              showReview(source, draft, false);
            } catch (error) {
              setLocalReview(null); setExtracted([]);
              setExtractionNotice(error instanceof Error ? error.message : "Falha na análise local.");
            }
          }}>Analisar texto localmente</Button>
          <span className="text-muted text-sm">Extração local sem envio externo.</span>
        </div>
        <details className="generator-context qa-task-assist">
          <summary>Importar relatório ou usar IA online (opcional)</summary>
          <div className="stack mt-3">
            <label className="field">Importar relatório (TXT, MD, PDF ou DOCX)
              <input type="file" accept=".txt,.md,.pdf,.docx"
                disabled={fileBusy||onlineBusy||create.isPending}
                onChange={event=>{
                  const file=event.target.files?.[0];
                  void importReport(file);
                  event.target.value="";
                }}/>
            </label>
            <p className="text-muted text-sm">O arquivo é lido somente neste navegador.
              Revise a descrição antes de extrair os campos.</p>
            <label className="flex gap-2 items-start text-sm">
              <input type="checkbox" checked={onlineConsentText!==null&&
                onlineConsentText===form.watch("descricao")}
                disabled={onlineBusy||!form.watch("descricao").trim()}
                onChange={event=>setOnlineConsentText(event.target.checked
                  ?form.getValues("descricao"):null)}/>
              Autorizo enviar o texto atual da TF à NVIDIA para gerar uma prévia de campos e cenários.
            </label>
            <details className="generator-context">
              <summary>Ver conteúdo que será enviado</summary>
              <textarea rows={4} readOnly aria-label="Texto enviado à IA online"
                value={form.watch("descricao")}/>
            </details>
            <div><Button type="button" variant="secondary"
              isDisabled={onlineBusy||onlineConsentText!==form.watch("descricao")||
                !form.watch("descricao").trim()||form.watch("descricao").length>20000}
              onPress={()=>void analyzeOnline()}>
              <Sparkles size={16}/> {onlineBusy?"Analisando…":"Gerar campos com IA online"}
            </Button></div>
          </div>
        </details>
        <details className="generator-context qa-task-assist">
          <summary>Assistente local avançado (opcional)</summary>
          <div className="stack mt-4" aria-label="Assistente generativo no navegador">
          <div>
            <h3 className="font-semibold">IA generativa local (opcional)</h3>
            <p className="text-muted text-sm mt-2">
              O modelo público é baixado sob demanda e pode usar bastante memória e espaço no navegador.
              O relatório é processado no próprio dispositivo, sem ser enviado ao provedor do modelo.
              Só use após revisar o texto para não incluir dados sensíveis desnecessários.
            </p>
          </div>
          <label className="flex gap-2 items-start text-sm">
            <input type="checkbox" checked={allowModel} onChange={(event) =>
              setAllowModel(event.target.checked)} disabled={aiBusy} />
            Autorizo baixar o modelo público e executar a análise localmente.
          </label>
          <div className="flex gap-2 flex-wrap items-center">
            <Button type="button" variant="secondary"
              isDisabled={!allowModel || aiBusy}
              onPress={() => void analyzeWithModel()}>
              <Sparkles size={16} /> {aiBusy ? "Analisando no dispositivo…" : "Analisar com IA local"}
            </Button>
            {aiBusy && <Button type="button" variant="secondary"
              onPress={cancelModel}>Cancelar análise</Button>}
          </div>
          {aiProgress && <p role="status" aria-live="polite" className="text-muted text-sm">
            {aiProgress}
          </p>}
          </div>
        </details>
        {extractionNotice && <p role="status" className="notice">{extractionNotice}</p>}
        {localReview && <section className="generator-context stack"
          aria-label="Prévia do preenchimento local">
          <h3 className="font-semibold">Conferir campos identificados</h3>
          <p className="text-muted text-sm">Nada será aplicado até você confirmar.
            Campos não identificados permanecem como estão.</p>
          <div className="local-preview-grid">
            {Object.entries(localReview.draft.fields)
              .filter(([key,value]) => key !== "descricao" && Boolean(value))
              .map(([key,value]) => <div key={key} className="local-preview-item">
                <strong>{key.replaceAll("_", " ")}</strong>
                <span>{value.slice(0,320)}</span>
              </div>)}
          </div>
          <p className="text-sm"><strong>{localReview.draft.cenarios.length}</strong> cenário(s)
            extraído(s), {extracted.length} com passos e resultado esperado suficientes.
            Os demais exigem preenchimento manual.</p>
          <div className="flex gap-2 flex-wrap">
            <Button variant="secondary" type="button" onPress={() => {
              if (form.getValues("descricao") !== localReview.source) {
                setExtractionNotice("O texto foi alterado. Analise novamente antes de preencher.");
                setLocalReview(null); setExtracted([]);
                return;
              }
              const textLimits: Record<string,number> = {
                titulo:240, descricao:30000, codigo:100, sistema:160, versao:100,
                ambiente:240, base_teste:240, empresa:240, testador:240,
                explicacao:30000, causa:30000, correcao:30000,
                conclusao:30000, observacoes:30000
              };
              const draft = localReview.draft;
              for (const [name,value] of Object.entries(draft.fields)) {
                if (!value || name === "tipo_teste" || !(name in textLimits)) continue;
                const key = name as Exclude<keyof TaskDraft,"tipo_teste">;
                form.setValue(key, value.slice(0,textLimits[name]), {
                  shouldValidate:true, shouldDirty:true
                });
              }
              if (draft.fields.tipo_teste === "BUILD" || draft.fields.tipo_teste === "RELEASE") {
                form.setValue("tipo_teste", draft.fields.tipo_teste, {
                  shouldValidate:true, shouldDirty:true
                });
              }
              setLocalReview(null);
              setExtractionNotice("Campos aplicados. Revise o formulário e selecione explicitamente os casos antes de salvar.");
            }}>Aplicar campos revisados</Button>
            <Button type="button" variant="secondary" onPress={() => {
              setLocalReview(null); setExtracted([]);
              setExtractionNotice("Análise descartada. O formulário não foi modificado.");
            }}>Descartar prévia</Button>
          </div>
        </section>}
        {extracted.length > 0 && <fieldset className="extracted-cases">
          <legend className="font-semibold">Cenários identificados — nenhum é anexado sem seleção</legend>
          {extracted.map((item, index) => <label key={index} className="extracted-case">
            <input type="checkbox" checked={item.selected} onChange={(e) =>
              setExtracted((items) => items.map((v, i) => i === index ? {...v, selected: e.target.checked} : v))} />
            <span><strong>{item.titulo}</strong><small>{item.passos.slice(0, 180)}</small></span>
          </label>)}
        </fieldset>}
        <div className="qa-modal-actions">
          <span className="text-muted text-sm mr-auto">O registro inicia como rascunho.</span>
          <Button type="button" variant="secondary" onPress={closeDraft}>Cancelar</Button>
          <Button type="submit" variant="secondary" data-next="task"
            isDisabled={create.isPending}>Salvar e abrir TF</Button>
          <Button type="submit" data-next="scenario"
            isDisabled={create.isPending}>Salvar e adicionar cenário</Button>
        </div>
        {create.isError && <p className="notice error" role="alert">{create.error.message}</p>}
      </form>
    </QAModal>

    <section className="panel task-panel">
      <div className="section-heading"><div><h2>TFs</h2></div>
        <span className="count-pill">{filtered.length} resultado(s)</span></div>
      <div className="filter-line">
        <label className="search-box"><Search size={18} aria-hidden="true" />
          <span className="sr-only">Pesquisar por título, código, módulo ou versão</span>
          <input type="search" value={search} onChange={(e) => {
            setSearch(e.target.value); setVisibleCount(30);
          }} placeholder="Buscar código, título, sistema, versão…" />
        </label>
        <label className="filter-select"><Filter size={17} aria-hidden="true" />
          <span className="sr-only">Filtrar situação</span>
          <select value={status} onChange={(e) => {
            setStatus(e.target.value); setVisibleCount(30);
          }}>
            <option value="">Todas as situações</option>
            {Object.entries(taskStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
      </div>
      {(role.isPending || tasks.isPending) && <p className="empty-state" role="status">Carregando tarefas…</p>}
      {(role.isError || tasks.isError) && <p className="notice error mt-4" role="alert">
        Não foi possível consultar o Supabase: {role.error?.message || tasks.error?.message}
      </p>}
      {tasks.isSuccess && filtered.length === 0 && <div className="empty-state">
        <CheckCheck size={28} /><strong>Nenhuma TF neste filtro</strong>
        <p>{search || status ? "Altere os filtros para consultar outras tarefas." : "Crie a primeira TF para começar."}</p>
      </div>}
      {progress.isError && <p className="notice error mt-3" role="alert">
        Progresso temporariamente indisponível. As TFs ainda podem ser abertas normalmente.
      </p>}
      <div className="task-rows">
        {visibleTasks.map((task) => {
          const stats = progress.data?.[task.id];
          const own = task.user_id === userId;
          return <div className="task-list-entry" key={task.id}>
            <Link to="/tarefa/$taskId" params={{ taskId: task.id }}
              className="task-row task-row-main" onClick={() => setFocused(task.id)}>
              <span className="task-initial">{(task.codigo || "TF").slice(0, 3).toUpperCase()}</span>
              <span className="task-text"><strong>{task.titulo}</strong>
                <small>{task.codigo || "Sem código"} · {task.tipo_teste} · {task.sistema || "Sem módulo"}
                  {task.versao ? " · " + task.versao : ""}</small>
                {stats && <small className="task-progress-meta">
                  {stats.executed}/{stats.total} executados · {stats.pending} pendente(s)
                </small>}
              </span>
              <span className={"status-chip " + task.status}>{taskStatusLabels[task.status]}</span>
              <ArrowRight className="row-arrow" size={18} />
            </Link>
            {own && stats && (stats.pending > 0 || stats.total === 0) &&
              <Link to="/tarefa/$taskId" params={{ taskId: task.id }}
                search={stats.total === 0 ? { newScenario: true } : { resume: true }}
                onClick={() => setFocused(task.id)}
                className="task-resume-link">
                {stats.total === 0 ? "Adicionar primeiro caso" : "Continuar testes"}
              </Link>}
          </div>;
        })}
      </div>
      {visibleCount < filtered.length && <div className="flex justify-center mt-4">
        <Button variant="secondary" onPress={() => setVisibleCount(value => value + 30)}>
          Mostrar mais TFs ({filtered.length - visibleCount} restantes)
        </Button>
      </div>}
    </section>
  </div>;
}
