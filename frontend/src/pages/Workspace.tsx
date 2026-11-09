import { useEffect, useMemo, useRef, useState } from "react";
import type {FormEvent} from "react";
import {ToastNotice,notify} from "../components/ui/Toasts";
import { useInfiniteQuery, useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { Button } from "@heroui/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { ArrowRight, CheckCheck, Filter, Paperclip, Plus, Search, Sparkles, Trash2 } from "lucide-react";
import { useAuth } from "../features/auth/AuthProvider";
import { QAModal } from "../components/ui/QAModal";
import { createTask, updateTask, getAdminRole, addExtractedScenarios, removeTask } from "../lib/data";
import {
  searchTasksPage,taskStatistics,listSavedFilters,saveFilter,
  deleteFilter,normalizeTaskFilters
} from "../features/tasks/task-search-data";
import { listTaskProgress } from "../lib/task-progress";
import { extractLocalDraft } from "../lib/legacy/qa-assistant.mjs";
import {
  archiveTaskAiSource,freshTaskAiScenarios,generateTaskAiDraft,mergeTaskAiCreation
} from "../features/tasks/task-ai";
import type {SuggestedScenario} from "../features/tasks/task-ai";
import type { LocalDraft } from "../lib/legacy/qa-assistant.mjs";
import { taskDraftSchema, taskStatusLabels } from "../lib/contracts";
import type { Task, TaskDraft } from "../lib/contracts";
import {DeleteTaskDialog} from "../features/tasks/DeleteTaskDialog";
import { useFocus } from "../stores/focus";
import {
  discardNewTaskDraft, loadNewTaskDraft, saveNewTaskDraft
} from "../features/tasks/local-draft";
import type { StoredNewTaskDraft } from "../features/tasks/local-draft";

export function Workspace() {
  const { user } = useAuth();
  const userId = user?.id ?? "";
  const [showForm, setShowForm] = useState(false);
  const [taskToDelete,setTaskToDelete]=useState<Pick<Task,"id"|"titulo"|"codigo">|null>(null);
  const [rememberDraft, setRememberDraft] = useState(false);
  const [recoverableDraft, setRecoverableDraft] = useState<StoredNewTaskDraft | null>(null);
  const [draftStorageError, setDraftStorageError] = useState("");
  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previousDraftUserRef = useRef("");
  const [extracted, setExtracted] = useState<SuggestedScenario[]>([]);
  const [extractionNotice, setExtractionNotice] = useState("");
  const [localReview, setLocalReview] = useState<{source:string;draft:LocalDraft;mode:"nvidia"|"manual"} | null>(null);
  const [analyzedSource,setAnalyzedSource]=useState<string|null>(null);
  const [submitBusy,setSubmitBusy]=useState(false);
  const submittingRef=useRef(false);
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
  const deleteSelectedTask=useMutation({
    mutationFn:(selected:Pick<Task,"id"|"titulo"|"codigo">)=>removeTask(selected.id),
    onSuccess:async()=>{
      setTaskToDelete(null);
      setFocused(null);
      await Promise.all([
        queryClient.invalidateQueries({queryKey:["task-search",userId]}),
        queryClient.invalidateQueries({queryKey:["task-stats",userId]}),
        queryClient.invalidateQueries({queryKey:["tasks",userId]}),
        queryClient.invalidateQueries({queryKey:["public-tasks"]})
      ]);
      notify.success("TF excluída.");
    }
  });
  const visibleTasks=useMemo(()=>
    tasks.data?.pages.flatMap(page=>page.items)??[],[tasks.data]);
  const total=tasks.data?.pages[0]?.total??0;
  function showReview(source: string, draft: LocalDraft, mode: "nvidia" | "manual") {
    // Apply NVIDIA results immediately: every submit action must persist the
    // fields shown in the form, even when the user skips the preview controls.
    if(mode==="nvidia"){
      const merged=mergeTaskAiCreation(form.getValues(),draft);
      for(const [name,value] of Object.entries(merged)){
        if((form.getValues() as Record<string,unknown>)[name]!==value)
          form.setValue(name as keyof TaskDraft,value as never,{
            shouldDirty:true,shouldTouch:true,shouldValidate:true
          });
      }
      setAnalyzedSource(source);
    }
    setLocalReview({source,draft,mode});
    const suggestions=freshTaskAiScenarios(draft,[],true);
    setExtracted(suggestions);
    setExtractionNotice(mode==="nvidia"
      ? "Prévia da NVIDIA pronta. Os campos foram preenchidos automaticamente."
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
      setLocalReview(null);setExtracted([]);setOnlineConsentText(null);setAnalyzedSource(null);
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
      const suggestion=await generateTaskAiDraft(source);
      if(form.getValues("descricao")!==source){
        setExtractionNotice("O texto mudou durante a análise. Gere uma nova prévia antes de aplicar.");
        return;
      }
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
  /**
   * The old creation form only imported explicit local scenarios on Save; it
   * never ran NVIDIA, while regeneration did. One submit now runs the same
   * NVIDIA extraction when the current text was authorized, then validates and
   * persists its structured fields and selected cases in the first TF save.
   * Without consent, only deterministic local extraction is used.
   */
  async function submitNewTask(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(submittingRef.current||create.isPending||onlineBusy||fileBusy)return;
    submittingRef.current=true;
    setSubmitBusy(true);
    const submitter=(event.nativeEvent as SubmitEvent).submitter;
    const openScenario=submitter?.getAttribute("data-next")==="scenario";
    try{
      const original=form.getValues();
      const text=original.descricao.trim();
      let candidate:TaskDraft={...original};
      let candidates:SuggestedScenario[]=[];
      let source=analyzedSource??undefined;
      const consented=Boolean(text&&text.length<=20000&&onlineConsentText===original.descricao);
      const currentReview=localReview && (
        localReview.mode==="nvidia" || localReview.source===original.descricao
      );

      if(consented){
        // No persisted TF is created if the provider fails. Avoid the previous
        // workaround: create an incomplete TF and regenerate it afterwards.
        const ai=await generateTaskAiDraft(original.descricao);
        if(form.getValues("descricao")!==original.descricao){
          setExtractionNotice("A descrição foi alterada durante a análise. Revise o texto e salve novamente.");
          return;
        }
        candidate=mergeTaskAiCreation(original,ai);
        candidates=freshTaskAiScenarios(ai,[],true);
        source=original.descricao;
        setLocalReview({source:original.descricao,draft:ai,mode:"nvidia"});
        setAnalyzedSource(original.descricao);
        setExtracted(candidates);
        setExtractionNotice("Campos e cenários identificados pela NVIDIA e preparados para salvar.");
        setOnlineConsentText(null);
      }else if(currentReview){
        // Respect the QA's selected scenarios rather than importing them again.
        candidates=extracted.filter(item=>item.selected);
        if(localReview.mode==="manual"){
          candidate=mergeTaskAiCreation(original,localReview.draft,{keepDescription:true});
        }
      }else if(analyzedSource){
        // The user may have hidden the AI review or applied local fields.
        // Keep the archived original and the reviewed scenario selections.
        candidates=extracted.filter(item=>item.selected);
      }else if(text){
        try{
          const local=extractLocalDraft(original.descricao);
          candidate=mergeTaskAiCreation(original,local,{keepDescription:true});
          candidates=freshTaskAiScenarios(local,[],true);
        }catch{
          // Unstructured descriptions are valid manual TFs; do not invent facts.
        }
      }

      form.clearErrors();
      const checked=taskDraftSchema.safeParse(candidate);
      if(!checked.success){
        for(const issue of checked.error.issues){
          const field=issue.path[0];
          if(typeof field==="string" && field in candidate){
            form.setError(field as keyof TaskDraft,{
              type:"manual",message:issue.message
            });
          }
        }
        setExtractionNotice(
          "Confira os campos indicados. Se a TF não tem título, cole o texto e use a NVIDIA para identificá-lo."
        );
        return;
      }
      // Show the exact structured values that are being saved, including on
      // database errors. Preserve any title/fields the QA typed manually.
      for(const [name,value] of Object.entries(checked.data)){
        if((original as Record<string,unknown>)[name]!==value)
          form.setValue(name as keyof TaskDraft,value as never,{
            shouldDirty:true,shouldTouch:true,shouldValidate:true
          });
      }
      await create.mutateAsync({
        draft:checked.data,openScenario,selected:candidates,source
      });
    }catch(reason){
      setExtractionNotice(reason instanceof Error?reason.message:
        "Não foi possível analisar e criar a TF. O texto foi preservado.");
    }finally{
      submittingRef.current=false;
      setSubmitBusy(false);
    }
  }

  const create = useMutation({
    mutationFn: async ({ draft, openScenario, selected, source }: {
      draft: TaskDraft; openScenario: boolean; selected: SuggestedScenario[]; source?: string
    }) => {
      const needsArchive=Boolean(source?.trim()&&source.trim()!==draft.descricao.trim());
      // Save the original first: never discard it if archiving fails.
      const task = await createTask(userId,needsArchive?{...draft,descricao:source!.trim()}:draft);
      let warning = "";
      if(needsArchive){
        try{
          await archiveTaskAiSource(task.id,userId,source!);
          await updateTask(task.id,draft);
        }catch(reason){
          warning="A TF manteve o texto original porque não foi possível arquivá-lo e aplicar o resumo: "+
            (reason instanceof Error?reason.message:"erro desconhecido");
        }
      }
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
      setExtracted([]); setExtractionNotice(""); setLocalReview(null);setAnalyzedSource(null);
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
      setShowForm(false); setExtracted([]); setLocalReview(null);setAnalyzedSource(null);
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
    if (create.isPending||submitBusy) return;
    if (form.formState.isDirty && !rememberDraft &&
      !window.confirm("Descartar os campos não salvos desta TF?")) return;
    setShowForm(false); setLocalReview(null); setExtracted([]);setAnalyzedSource(null);
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
          setShowForm(true); setExtracted([]); setLocalReview(null);setAnalyzedSource(null);
          setExtractionNotice(""); setDraftStorageError("");
        }}>Recuperar rascunho</Button>
        <Button variant="secondary" onPress={() => {
          discardNewTaskDraft(userId);
          setRecoverableDraft(null);
        }}>Descartar rascunho</Button>
      </div>
    </section>}

    <QAModal open={showForm} title="Nova TF"
      description="Cole a TF para preencher os campos e mapear os cenários, ou crie uma tarefa manualmente."
      onClose={closeDraft} busy={create.isPending||submitBusy}
      initialFocus={'input[name="titulo"]'}>
      <form onSubmit={event=>void submitNewTask(event)}
        className="stack mt-4 qa-tf-compact">
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
              disabled={fileBusy||onlineBusy||submitBusy||create.isPending}
              onChange={event=>{
                const file=event.target.files?.[0];
                void importReport(file);
                event.target.value="";
              }}/>
          </label>
          <Button variant="secondary" type="button" size="sm"
            isDisabled={fileBusy||onlineBusy||submitBusy||!form.watch("descricao").trim()}
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
          <div className="qa-tf-nvidia-heading">
            <strong><Sparkles size={17} aria-hidden="true"/> Gerar dados com IA</strong>
            <small>Autorize para analisar automaticamente ao salvar, ou gere uma prévia agora.</small>
          </div>
          <div className="qa-tf-nvidia-row">
            <label className="qa-tf-consent">
              <input type="checkbox" checked={onlineConsentText!==null&&
                onlineConsentText===form.watch("descricao")}
                disabled={fileBusy||onlineBusy||submitBusy||!form.watch("descricao").trim()||
                  form.watch("descricao").length>20000}
                onChange={event=>setOnlineConsentText(event.target.checked
                  ?form.getValues("descricao"):null)}/>
              <span>Autorizo enviar este texto à NVIDIA.</span>
            </label>
            <Button type="button" size="sm"
              isDisabled={fileBusy||onlineBusy||submitBusy||
                onlineConsentText!==form.watch("descricao")||
                !form.watch("descricao").trim()||form.watch("descricao").length>20000}
              onPress={()=>void analyzeOnline()}>
              <Sparkles size={16} aria-hidden="true"/>
              {onlineBusy?"Gerando…":"Gerar com IA NVIDIA"}
            </Button>
          </div>
          {onlineBusy&&<p className="qa-ai-run-status" role="status">
            Analisando o texto e preenchendo os dados da TF…
          </p>}
          {form.watch("descricao").length>20000&&
            <small role="status" className="text-error">
              A NVIDIA aceita até 20.000 caracteres. Reduza o texto para gerar.
            </small>}
        </div>
        <ToastNotice message={draftStorageError} tone="error"/>
        <ToastNotice message={extractionNotice} tone="info"/>
        {localReview&&<section className="generator-context qa-ai-draft-preview"
          aria-label="Prévia dos campos sugeridos">
          <h3>{localReview.mode==="nvidia"?"Sugestão da IA pronta":"Campos encontrados no texto"}</h3>
          <p className="qa-ai-preview-hint">{localReview.mode==="nvidia"
            ? "Os campos já foram preenchidos. Confira os dados e os cenários antes de salvar."
            : "Confira os campos e cenários; os selecionados serão salvos como pendentes."}</p>
          <details className="qa-ai-draft-fields">
            <summary>Ver {Object.entries(localReview.draft.fields)
              .filter(([key,value])=>key!=="descricao"&&Boolean(value)).length} campo(s) identificado(s)</summary>
            <div className="local-preview-grid">
              {Object.entries(localReview.draft.fields)
                .filter(([key,value])=>key!=="descricao"&&Boolean(value))
                .map(([key,value])=><div key={key} className="local-preview-item">
                  <strong>{key.replaceAll("_"," ")}</strong>
                  <span>{value.slice(0,320)}</span>
                </div>)}
            </div>
          </details>
          <div className="qa-ai-preview-actions">
            {localReview.mode==="manual"&&<Button variant="secondary" type="button" onPress={()=>{
              if(form.getValues("descricao")!==localReview.source){
                setExtractionNotice("O texto foi alterado. Analise novamente antes de preencher.");
                setLocalReview(null);setExtracted([]);
                return;
              }
              const merged=mergeTaskAiCreation(form.getValues(),localReview.draft,{
                keepDescription:true
              });
              for(const [name,value] of Object.entries(merged)){
                if((form.getValues() as Record<string,unknown>)[name]!==value)
                  form.setValue(name as keyof TaskDraft,value as never,{
                    shouldDirty:true,shouldTouch:true,shouldValidate:true
                  });
              }
              setAnalyzedSource(localReview.source);
              setLocalReview(null);
              setExtractionNotice("Campos aplicados. Confira os dados e selecione os cenários antes de salvar.");
            }}>Aplicar campos revisados</Button>}
            <Button type="button" variant="secondary" onPress={()=>{
              setLocalReview(null);
              if(localReview.mode!=="nvidia")setExtracted([]);
              setExtractionNotice(localReview.mode==="nvidia"
                ? "Resumo ocultado. Dados e cenários sugeridos permanecem prontos para salvar."
                : "Análise descartada. O formulário não foi modificado.");
            }}>{localReview.mode==="nvidia"?"Ocultar resumo":"Descartar prévia"}</Button>
          </div>
        </section>}
        {extracted.length>0&&<fieldset className="extracted-cases">
          <legend className="sr-only">Cenários sugeridos para esta TF</legend>
          <div className="qa-ai-selection-head">
            <strong>Cenários sugeridos — {extracted.filter(item=>item.selected).length} de {extracted.length} selecionado(s)</strong>
            <div className="qa-task-ai-select-actions" role="group" aria-label="Selecionar cenários sugeridos">
              <button type="button" onClick={()=>setExtracted(items=>items.map(item=>({...item,selected:true})))}>
                Selecionar todos
              </button>
              <button type="button" onClick={()=>setExtracted(items=>items.map(item=>({...item,selected:false})))}>
                Limpar seleção
              </button>
            </div>
          </div>
          {extracted.map((item,index)=><label key={index} className="extracted-case">
            <input type="checkbox" checked={item.selected}
              onChange={e=>setExtracted(items=>items.map((v,i)=>i===index?
                {...v,selected:e.target.checked}:v))}/>
            <span><strong>{item.titulo}</strong><small>{item.passos.slice(0,180)}</small></span>
          </label>)}
        </fieldset>}
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
            <details className="qa-tf-technical-fields">
              <summary>Análise técnica e informações adicionais</summary>
              <div className="form-grid mt-3">
                <label className="field">Ambiente<input {...form.register("ambiente")}/></label>
                <label className="field">Base de teste<input {...form.register("base_teste")}/></label>
                <label className="field">Empresa<input {...form.register("empresa")}/></label>
                <label className="field">Testador<input {...form.register("testador")}/></label>
              </div>
              <div className="stack mt-3">
                <label className="field">Análise / como funciona<textarea rows={3} {...form.register("explicacao")}/></label>
                <label className="field">Causa identificada<textarea rows={3} {...form.register("causa")}/></label>
                <label className="field">Correção realizada<textarea rows={3} {...form.register("correcao")}/></label>
                <label className="field">Conclusão<textarea rows={3} {...form.register("conclusao")}/></label>
                <label className="field">Observações<textarea rows={3} {...form.register("observacoes")}/></label>
              </div>
            </details>
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
        <div className="qa-modal-actions">
          <Button type="button" variant="secondary" onPress={closeDraft}>Cancelar</Button>
          <Button type="submit" variant="secondary" data-next="task"
            isDisabled={create.isPending||onlineBusy||fileBusy||submitBusy}>
            {submitBusy?"Preparando TF…":onlineConsentText===form.watch("descricao")&&
              !!onlineConsentText?"Gerar com IA e abrir TF":"Salvar e abrir TF"}
          </Button>
          <Button type="submit" data-next="scenario"
            isDisabled={create.isPending||onlineBusy||fileBusy||submitBusy}>
            {submitBusy?"Preparando TF…":onlineConsentText===form.watch("descricao")&&
              !!onlineConsentText?"Gerar com IA e adicionar cenário":"Salvar e adicionar cenário"}
          </Button>
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
            {own && <button type="button" className="qa-task-row-delete"
              aria-label={"Excluir TF: "+task.titulo} title="Excluir TF"
              disabled={deleteSelectedTask.isPending}
              onClick={()=>{
                deleteSelectedTask.reset();
                setTaskToDelete({id:task.id,titulo:task.titulo,codigo:task.codigo});
              }}>
              <Trash2 size={16} aria-hidden="true"/>
            </button>}
          </div>;
        })}
      </div>
      <DeleteTaskDialog task={taskToDelete} busy={deleteSelectedTask.isPending}
        error={deleteSelectedTask.error?.message}
        onClose={()=>{if(!deleteSelectedTask.isPending)setTaskToDelete(null);}}
        onConfirm={()=>{
          if(taskToDelete && !deleteSelectedTask.isPending)
            deleteSelectedTask.mutate(taskToDelete);
        }}/>
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
