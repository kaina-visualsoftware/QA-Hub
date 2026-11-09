import { useEffect, useMemo, useRef, useState } from "react";
import {ToastNotice,notify} from "../components/ui/Toasts";
import { useInfiniteQuery, useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { Button } from "@heroui/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { ArrowRight, CheckCheck, Filter, Paperclip, Plus, Search, Sparkles } from "lucide-react";
import { useAuth } from "../features/auth/AuthProvider";
import { QAModal } from "../components/ui/QAModal";
import { createTask, getAdminRole, addExtractedScenarios } from "../lib/data";
import {
  searchTasksPage,taskStatistics,listSavedFilters,saveFilter,
  deleteFilter,normalizeTaskFilters
} from "../features/tasks/task-search-data";
import { listTaskProgress } from "../lib/task-progress";
import { extractLocalDraft, normalizeDraft } from "../lib/legacy/qa-assistant.mjs";
import { supabase } from "../lib/supabase";
import type { LocalDraft } from "../lib/legacy/qa-assistant.mjs";
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
  const [onlineBusy, setOnlineBusy] = useState(false);
  const [onlineConsentText, setOnlineConsentText] = useState<string|null>(null);
  const [fileBusy, setFileBusy] = useState(false);
  const { newTask } = useSearch({ from: "/" });
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [type,setType]=useState("");
  const [debouncedSearch,setDebouncedSearch]=useState("");
  const [filterName,setFilterName]=useState("");
  const [filterNotice,setFilterNotice]=useState("");
  useEffect(()=>{
    const timeout=setTimeout(()=>setDebouncedSearch(search),280);
    return ()=>clearTimeout(timeout);
  },[search]);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const setFocused = useFocus((s) => s.setTask);
  const role = useQuery({ queryKey: ["role", userId], queryFn: () => getAdminRole(userId), enabled: !!userId });
  const filters=useMemo(()=>normalizeTaskFilters({
    search:debouncedSearch,status,type
  }),[debouncedSearch,status,type]);
  const tasks=useInfiniteQuery({
    queryKey:["task-search",userId,role.data,filters],
    queryFn:({pageParam})=>searchTasksPage(filters,pageParam),
    initialPageParam:0,
    getNextPageParam:(last,all)=>{
      const loaded=all.reduce((count,page)=>count+page.items.length,0);
      return loaded<last.total ? all.length : undefined;
    },
    enabled:!!userId && role.data!==undefined,
    staleTime:20000
  });
  const stats=useQuery({
    queryKey:["task-stats",userId,role.data],
    queryFn:taskStatistics,
    enabled:!!userId && role.data!==undefined,
    staleTime:20000
  });
  const savedFilters=useQuery({
    queryKey:["task-saved-filters",userId],
    queryFn:()=>listSavedFilters(userId),
    enabled:!!userId
  });
  const saveSavedFilter=useMutation({
    mutationFn:()=>saveFilter(userId,filterName,{search,status,type}),
    onSuccess:async()=>{
      setFilterName("");setFilterNotice("Filtro salvo para esta conta.");
      await queryClient.invalidateQueries({queryKey:["task-saved-filters",userId]});
    },
    onError:(err)=>notify.error(err.message)
  });
  const removeSavedFilter=useMutation({
    mutationFn:(id:string)=>deleteFilter(userId,id),
    onSuccess:async()=>{
      setFilterNotice("Filtro removido.");
      await queryClient.invalidateQueries({queryKey:["task-saved-filters",userId]});
    },
    onError:(err)=>notify.error(err.message)
  });
  const visibleTasks=useMemo(()=>
    tasks.data?.pages.flatMap(page=>page.items)??[],[tasks.data]);
  const total=tasks.data?.pages[0]?.total??0;
  function showReview(source: string, draft: LocalDraft, mode: "nvidia" | "manual") {
    setLocalReview({ source, draft });
    setExtracted(draft.cenarios
      .filter((item) => item.titulo.trim().length >= 3 &&
        item.passos.trim().length > 0 && item.esperado.trim().length > 0)
      .map((item) => ({
        titulo: item.titulo.slice(0,240), passos: item.passos.slice(0,20000),
        esperado: item.esperado.slice(0,20000),
        observacoes: item.observacoes.slice(0,20000), selected: false
      })));
    setExtractionNotice(mode === "nvidia"
      ? "Prévia da NVIDIA pronta. Revise os campos e cenários antes de aplicar."
      : "Campos extraídos sem IA. Confira o resultado antes de aplicar.");
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
      if(extracted.length>30000){
        extracted=extracted.slice(0,30000);
        warning="Texto limitado a 30.000 caracteres; confira o trecho importado. "+warning;
      }
      if(form.getValues("descricao").trim() &&
         !window.confirm("Substituir o texto colado pelo conteúdo do arquivo?")) return;
      form.setValue("descricao",extracted,{shouldDirty:true,shouldValidate:true});
      setLocalReview(null);setExtracted([]);setOnlineConsentText(null);
      setExtractionNotice("Arquivo lido e texto inserido. Você pode gerar com NVIDIA ou preencher sem IA. "+warning);
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
        let detail: {message?:string;error?:string}={};
        try{detail=await error.context?.json?.()??{};}catch{}
        if(detail.error==="nvidia_not_configured")
          throw Error("A NVIDIA ainda não está configurada. Preencha manualmente ou extraia sem IA.");
        throw Error(detail.message||"Falha ao analisar a TF com IA NVIDIA.");
      }
      if(form.getValues("descricao")!==source){
        setExtractionNotice("O texto mudou durante a análise. Gere uma nova prévia antes de aplicar.");
        return;
      }
      const raw=data?.draft;
      if(data?.fallback || data?.provider!=="NVIDIA Build" ||
         !raw || typeof raw!=="object" || Array.isArray(raw) ||
         !Object.keys(raw).length)
        throw Error("A NVIDIA não retornou campos válidos. Tente novamente ou use a extração sem IA.");
      const suggestion=normalizeDraft(raw);
      if(!Object.keys(suggestion.fields).length && !suggestion.cenarios.length)
        throw Error("A NVIDIA não identificou dados suficientes. Preencha manualmente ou extraia sem IA.");
      showReview(source,suggestion,"nvidia");
    }catch(reason){
      setExtractionNotice(reason instanceof Error?reason.message:
        "A NVIDIA está indisponível. Você pode preencher manualmente ou extrair sem IA.");
    }finally{setOnlineBusy(false);setOnlineConsentText(null);}
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
      await Promise.all([
        queryClient.invalidateQueries({queryKey:["task-search",userId]}),
        queryClient.invalidateQueries({queryKey:["task-stats",userId]})
      ]);
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
    setShowForm(false); setLocalReview(null); setExtracted([]);
    setExtractionNotice("");
    if (!rememberDraft) form.reset();
  }

  useEffect(() => {
    if (newTask) setShowForm(true);
  }, [newTask]);

  // Do not clear a focused task simply because it is on a different page.
  // One independent progress query per fetched page. Loading page 4
  // never refetches earlier pages or crosses listTaskProgress's 80-ID cap.
  const progressPages=useQueries({
    queries:(tasks.data?.pages??[]).map(page=>{
      const ids=page.items.map(task=>task.id);
      return {
        queryKey:["task-progress",userId,ids.join(",")],
        queryFn:()=>listTaskProgress(ids),
        enabled:ids.length>0,
        staleTime:30000
      };
    })
  });
  const progress=Object.assign({},...progressPages.map(page=>page.data??{}));
  const progressError=progressPages.find(page=>page.isError);
  const pending=stats.data?.pending??0;
  const approved=stats.data?.approved??0;

  return <div className="page">
    <div className="page-heading">
      <div><h1>Suas tarefas de teste</h1></div>
      <Button onPress={() => {
        if (showForm) closeDraft();
        else setShowForm(true);
      }}><Plus size={17} /> Nova TF</Button>
    </div>
    <section className="qa-home-metrics" aria-label="Resumo">
      <div><strong>{stats.data?.total??0}</strong><span>TFs</span></div>
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

    <QAModal open={showForm} title="Nova TF"
      description="Preencha o título. O restante é opcional."
      onClose={closeDraft} busy={create.isPending} initialFocus={'input[name="titulo"]'}>
      <form onSubmit={form.handleSubmit((values, event) => {
        const submitter = (event?.nativeEvent as SubmitEvent | undefined)?.submitter;
        void create.mutateAsync({
          draft: values, openScenario: submitter?.getAttribute("data-next") === "scenario"
        });
      })} className="stack mt-4 qa-tf-compact">
        <div className="qa-tf-primary-row">
          <label className="field grow-2">Título da tarefa
            <input placeholder="Ex.: Validar desconto na devolução"
              {...form.register("titulo")}/>
            {form.formState.errors.titulo &&
              <small role="alert" className="text-error">{form.formState.errors.titulo.message}</small>}
          </label>
          <label className="field">Tipo
            <select {...form.register("tipo_teste")}>
              <option>BUILD</option><option>RELEASE</option>
            </select>
          </label>
        </div>
        <label className="field">Descrição / problema
          <textarea rows={5} maxLength={30000}
            placeholder="Cole o texto da TF aqui, ou preencha apenas o título."
            {...form.register("descricao")}/>
        </label>
        <div className="qa-tf-compact-tools" role="group" aria-label="Importar ou extrair texto">
          <label className="qa-tf-attach">
            <Paperclip size={16} aria-hidden="true"/>
            {fileBusy?"Lendo arquivo…":"Importar arquivo"}
            <input type="file" aria-label="Importar arquivo opcional (TXT, MD, PDF ou DOCX)"
              accept=".txt,.md,.pdf,.docx"
              disabled={fileBusy||onlineBusy||create.isPending}
              onChange={event=>{
                const file=event.target.files?.[0];
                void importReport(file);
                event.target.value="";
              }}/>
          </label>
          <Button variant="secondary" type="button" size="sm"
            isDisabled={fileBusy||onlineBusy||!form.watch("descricao").trim()}
            onPress={()=>{
              const source=form.getValues("descricao");
              try{
                showReview(source,extractLocalDraft(source),"manual");
              }catch(error){
                setLocalReview(null);setExtracted([]);
                setExtractionNotice(error instanceof Error?error.message:
                  "Não foi possível extrair os campos sem IA.");
              }
            }}>Extrair sem IA</Button>
        </div>
        <div className="qa-tf-nvidia-compact" role="group" aria-label="Preenchimento com NVIDIA">
          <label className="qa-tf-consent">
            <input type="checkbox" checked={onlineConsentText!==null&&
              onlineConsentText===form.watch("descricao")}
              disabled={fileBusy||onlineBusy||!form.watch("descricao").trim()||
                form.watch("descricao").length>20000}
              onChange={event=>setOnlineConsentText(event.target.checked
                ?form.getValues("descricao"):null)}/>
            <span>Autorizo enviar este texto à NVIDIA.</span>
          </label>
          <Button type="button" size="sm"
            isDisabled={fileBusy||onlineBusy||
              onlineConsentText!==form.watch("descricao")||
              !form.watch("descricao").trim()||form.watch("descricao").length>20000}
            onPress={()=>void analyzeOnline()}>
            <Sparkles size={16} aria-hidden="true"/>
            {onlineBusy?"Gerando…":"Gerar com IA NVIDIA"}
          </Button>
          {form.watch("descricao").length>20000&&
            <small role="status" className="text-error">
              A NVIDIA aceita até 20.000 caracteres. Reduza o texto para gerar.
            </small>}
        </div>
        <details className="qa-task-optional">
          <summary>Mais opções</summary>
          <div className="qa-tf-more">
            <div className="form-grid">
              <label className="field">Código da TF
                <input placeholder="Opcional" {...form.register("codigo")}/>
              </label>
              <label className="field">Sistema / módulo
                <input placeholder="Opcional" {...form.register("sistema")}/>
              </label>
              <label className="field">Versão
                <input placeholder="Opcional" {...form.register("versao")}/>
              </label>
            </div>
            <label className="qa-tf-draft-option">
              <input type="checkbox" checked={rememberDraft} onChange={(event)=>{
                if(event.target.checked){
                  if(!saveNewTaskDraft(userId,form.getValues())){
                    setDraftStorageError("Não foi possível guardar o rascunho neste navegador.");
                    return;
                  }
                  setRememberDraft(true);setRecoverableDraft(null);setDraftStorageError("");
                }else{
                  setRememberDraft(false);discardNewTaskDraft(userId);
                  setDraftStorageError("");
                }
              }}/>
              <span>Guardar rascunho nesta aba</span>
            </label>
          </div>
        </details>
        <ToastNotice message={draftStorageError} tone="error"/>
        <ToastNotice message={extractionNotice} tone="info"/>
        {localReview && <section className="generator-context stack"
          aria-label="Prévia dos campos sugeridos">
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
                if (!value || name === "tipo_teste" || name === "descricao" || !(name in textLimits)) continue;
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
          <Button type="button" variant="secondary" onPress={closeDraft}>Cancelar</Button>
          <Button type="submit" variant="secondary" data-next="task"
            isDisabled={create.isPending}>Salvar e abrir TF</Button>
          <Button type="submit" data-next="scenario"
            isDisabled={create.isPending}>Salvar e adicionar cenário</Button>
        </div>
        <ToastNotice message={create.isError?create.error.message:null} tone="error"/>
      </form>
    </QAModal>

    <section className="panel task-panel">
      <div className="section-heading"><div><h2>TFs</h2></div>
        <span className="count-pill">{total} resultado(s)</span></div>
      <div className="filter-line">
        <label className="search-box"><Search size={18} aria-hidden="true" />
          <span className="sr-only">Pesquisar por título, código, módulo ou versão</span>
          <input type="search" value={search} onChange={(e) => {
            setSearch(e.target.value);
          }} placeholder="Buscar código, título, sistema, versão…" />
        </label>
        <label className="filter-select"><Filter size={17} aria-hidden="true" />
          <span className="sr-only">Filtrar situação</span>
          <select value={status} onChange={(e) => {
            setStatus(e.target.value);
          }}>
            <option value="">Todas as situações</option>
            {Object.entries(taskStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label className="filter-select">
          <span className="sr-only">Filtrar tipo</span>
          <select value={type} onChange={e=>setType(e.target.value)}
            aria-label="Filtrar tipo">
            <option value="">Todos os tipos</option>
            <option value="BUILD">BUILD</option>
            <option value="RELEASE">RELEASE</option>
          </select>
        </label>
      </div>
      <details className="qa-saved-filter-controls">
        <summary>Filtros salvos</summary>
        <div className="qa-saved-filters-content">
          <div className="qa-saved-filter-input">
            <label className="field">Nome do filtro
              <input value={filterName} maxLength={60}
                placeholder="Ex.: Releases do financeiro"
                onChange={e=>setFilterName(e.target.value)}/>
            </label>
            <Button variant="secondary" isDisabled={saveSavedFilter.isPending||
              filterName.trim().length<2}
              onPress={()=>saveSavedFilter.mutate()}>Salvar filtro atual</Button>
          </div>
          {savedFilters.isPending&&<p role="status" className="text-muted text-sm">Carregando filtros…</p>}
          {savedFilters.isError&&<p role="alert" className="notice error">
            {savedFilters.error.message}</p>}
          {savedFilters.data?.length===0&&<p className="text-muted text-sm">
            Nenhum filtro salvo nesta conta.</p>}
          {savedFilters.data?.map(saved=><div className="qa-saved-filter-item" key={saved.id}>
            <button type="button" onClick={()=>{
              setSearch(saved.pesquisa);setDebouncedSearch(saved.pesquisa);
              setStatus(saved.situacao);setType(saved.tipo);
              setFilterNotice("Filtro aplicado: "+saved.nome);
            }}>{saved.nome}</button>
            <button type="button" className="qa-saved-filter-remove"
              disabled={removeSavedFilter.isPending}
              onClick={()=>{
                if(window.confirm("Excluir este filtro salvo?"))
                  removeSavedFilter.mutate(saved.id);
              }}>Excluir</button>
          </div>)}
          <ToastNotice message={filterNotice} tone="success"/>
        </div>
      </details>
      {(role.isPending || tasks.isPending) && <p className="empty-state" role="status">Carregando tarefas…</p>}
      {(role.isError || tasks.isError) && <p className="notice error mt-4" role="alert">
        Não foi possível consultar o Supabase: {role.error?.message || tasks.error?.message}
      </p>}
      {tasks.isSuccess && total === 0 && <div className="empty-state">
        <CheckCheck size={28} /><strong>Nenhuma TF neste filtro</strong>
        <p>{search || status || type ? "Altere os filtros para consultar outras tarefas." : "Crie a primeira TF para começar."}</p>
      </div>}
      {progressError && <p className="notice error mt-3" role="alert">
        Progresso temporariamente indisponível. As TFs ainda podem ser abertas normalmente.
      </p>}
      <div className="task-rows">
        {visibleTasks.map((task) => {
          const stats = progress[task.id];
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
      {tasks.hasNextPage&&<div className="qa-task-more">
        <p className="text-muted text-sm">Exibindo {visibleTasks.length} de {total} TFs</p>
        <Button variant="secondary" isDisabled={tasks.isFetchingNextPage}
          onPress={()=>void tasks.fetchNextPage()}>
          {tasks.isFetchingNextPage?"Carregando…":
            "Mostrar mais TFs ("+(total-visibleTasks.length)+" restantes)"}
        </Button>
      </div>}
      {tasks.isFetchNextPageError&&<p role="alert" className="notice error">
        Falha ao carregar mais TFs. Tente novamente.</p>}
    </section>
  </div>;
}
