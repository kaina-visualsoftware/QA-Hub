import { useEffect, useMemo, useRef, useState } from "react";
import "./ai-workflow.css";
import {ToastNotice} from "../../components/ui/Toasts";
import { Button } from "@heroui/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Clipboard, FileCheck2, Send, WandSparkles, RotateCcw, LoaderCircle, ShieldCheck, PenLine, CheckCircle2 } from "lucide-react";
import {combinedInstructions,generatorPresets} from "./ai-presets";
import type { Task, Scenario } from "../../lib/contracts";
import { supabase } from "../../lib/supabase";
import {
  composeFullTaskContext, fetchTaskSupport, sanitizeAiContext
} from "../../lib/legacy/qa-test-context.mjs";
import {
  composeRequirementContext, loadApprovedRequirements, recordRequirementUsage
} from "../../lib/legacy/qa-requirements-context.mjs";
import {
  attachReviewedCases, markScenarioDuplicates, onlyNewScenarioCandidates, parseGeneratedCases
} from "../../lib/legacy/qa-workspace.mjs";
import type { GeneratedCase } from "../../lib/legacy/qa-workspace.mjs";
import {
  formatGeneratedPost, validatePostStructure
} from "../../lib/legacy/qa-post-format.mjs";
import {
  saveTfDocument
} from "../../lib/legacy/qa-phase2.mjs";
import { generateWithNvidia } from "./stream";
import {prepareGeneratorContext} from "./context-preparation";
import {ContextPreparationPanel} from "./ContextPreparationPanel";
import {SemanticPreparationPanel} from "./SemanticPreparationPanel";
import {useSemanticContext} from "./useSemanticContext";
import {AuditTrailPanel} from "./AuditTrailPanel";
import {CoverageReviewPanel} from "./CoverageReviewPanel";
import {prepareFocusedCoverageTask} from "./coverage-f32";
import {recordConflictDecision,recordAppliedRevision,recordCoveragePreparation} from "./ai-audit";
import type {SemanticConflict,ConflictDecision} from "./semantic-conflicts";
import {applyCaseRevision,caseAsMarkdown,insertReviewedExcerpt,requestTargetedRevision,selectionFromText} from "./targeted-revision";
import type {PostSelection,ReviewOperation} from "./targeted-revision";
import { GeneratorActivity, GeneratorSteps } from "./GeneratorJourney";
import { renderPostFormat, validateBbcodePost } from "./post-format";
import type {PostOutputFormat} from "./post-format";
import type { ActivityPhase, JourneyStage } from "./GeneratorJourney";
import type { GeneratorMode } from "./stream";

type GeneratorAssembly =
  | { kind: "ready"; taskContext: ReturnType<typeof composeFullTaskContext>;
      approved: ReturnType<typeof composeRequirementContext>;
      prepared: ReturnType<typeof prepareGeneratorContext> }
  | { kind: "error"; error: string };

type Props = {
  task: Task;
  userId: string;
  scenarios: Scenario[];
  mode: GeneratorMode;
  onBusyChange?: (busy: boolean) => void;
};

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : "Falha ao executar a operação.";
}

function editableCopy(items: GeneratedCase[]) {
  return items.map((item) => ({
    ...item, selected: item.selected !== false,
    source_index: item.source_index || crypto.randomUUID()
  }));
}

export default function GeneratorPanel({ task, userId, scenarios, mode, onBusyChange }: Props) {
  const client = useQueryClient();
  const [extra, setExtra] = useState("");
  const [postFormat, setPostFormat] = useState<PostOutputFormat>("markdown");
  const [canonicalPost, setCanonicalPost] = useState("");
  const [preset, setPreset] = useState("essencial");
  const [selected, setSelected] = useState<string[]>([]);
  const [consent, setConsent] = useState(false);
  const [partialConsent, setPartialConsent] = useState(false);
  const [compactApproved, setCompactApproved] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [activityPhase, setActivityPhase] = useState<ActivityPhase>("connecting");
  const [showSetup, setShowSetup] = useState(true);
  const [completed, setCompleted] = useState(false);
  const [raw, setRaw] = useState("");
  const [content, setContent] = useState("");
  const [cases, setCases] = useState<GeneratedCase[]>([]);
  const [generatedCount, setGeneratedCount] = useState(0);
  const [truncated, setTruncated] = useState(false);
  const [dirtyOutput, setDirtyOutput] = useState(false);
  const [busySave, setBusySave] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [generationId, setGenerationId] = useState(() => crypto.randomUUID());
  const controller = useRef<AbortController | null>(null);
  const revisionController=useRef<AbortController|null>(null);
  const [revisionBusy,setRevisionBusy]=useState(false);
  const [auditBusy,setAuditBusy]=useState(false);
  const [changedCodes,setChangedCodes]=useState<string[]>([]);
  const [revisionInstructions,setRevisionInstructions]=useState("");
  const [revisionConsent,setRevisionConsent]=useState(false);
  const [postSelection,setPostSelection]=useState<PostSelection|null>(null);
  const [revisionProposal,setRevisionProposal]=useState<{
    operation:ReviewOperation;before:string;after:string;
    postSource?:string;selection?:PostSelection;caseIndex?:number;caseFingerprint?:string
  }|null>(null);
  const [revisionHistory,setRevisionHistory]=useState<{target:string;time:string}[]>([]);
  const lastGenerationInput=useRef<{task:string;requirements:string}|null>(null);
  const formOwn = task.user_id === userId;

  const requirements = useQuery({
    queryKey: ["gen-requirements", userId, task.id],
    queryFn: () => loadApprovedRequirements(supabase, task, userId),
    enabled: formOwn
  });
  const support = useQuery({
    queryKey: ["gen-support", userId, task.id],
    queryFn: () => fetchTaskSupport(supabase, task, userId),
    enabled: formOwn
  });
  useEffect(() => {
    if (requirements.data) setSelected(requirements.data.map((item) => item.id));
  }, [requirements.data]);
  useEffect(() => {
    return () => {controller.current?.abort();revisionController.current?.abort();};
  }, []);

  useEffect(() => {
    setRaw(""); setContent(""); setCases([]); setGeneratedCount(0); setConsent(false);
    setPreset("essencial");setExtra("");setPostFormat("markdown");setCanonicalPost("");
    setMessage(""); setError(""); setDirtyOutput(false);
    setShowSetup(true); setCompleted(false);
    revisionController.current?.abort();setRevisionBusy(false);
    setRevisionProposal(null);setPostSelection(null);
    setRevisionConsent(false);setRevisionInstructions("");setRevisionHistory([]);
    setChangedCodes([]);
    lastGenerationInput.current=null;
  }, [task.id, mode]);

  const assembly = useMemo<GeneratorAssembly | null>(() => {
    if (!support.data || !requirements.data) return null;
    try {
      const taskContext = composeFullTaskContext(task, support.data, { limit: 250000 });
      const approved = composeRequirementContext(
        requirements.data, selected, sanitizeAiContext(combinedInstructions(mode,preset,extra)),
        { taskId: task.id, limit: 250000 }
      );
      const prepared=prepareGeneratorContext(taskContext.text,approved.text);
      return { kind: "ready", taskContext, approved, prepared };
    } catch (reason) {
      return { kind: "error", error: messageOf(reason) };
    }
  }, [support.data, requirements.data, task, selected, extra, mode, preset]);
  const generationError = assembly?.kind === "error" ? assembly.error : "";
  const context = assembly?.kind === "ready" ? assembly : null;
  const missingSources = context?.taskContext.failedSources ?? [];
  const semantic=useSemanticContext(context?.taskContext.text??"",
    context?.approved.text??"",mode);
  useEffect(() => {
    onBusyChange?.(generating || busySave || semantic.working || revisionBusy || auditBusy);
  }, [generating, busySave, semantic.working, revisionBusy, auditBusy, onBusyChange]);
  const needsCompactReview=Boolean(context&&(context.prepared.task.needsReview||
    context.prepared.requirements?.needsReview));
  useEffect(()=>{
    setConsent(false);
    setPartialConsent(false);
    setCompactApproved(false);
  },[context?.taskContext.text,context?.approved.text]);
  const canSend = formOwn && !generating && !busySave && !revisionBusy && !auditBusy && !!context &&
    !requirements.isLoading && !support.isLoading &&
    !requirements.isError && !support.isError && consent &&
    (!missingSources.length || partialConsent) &&
    (!needsCompactReview || (semantic.enabled?semantic.ready:compactApproved)) &&
    !semantic.working;

  const available = useMemo(() =>
    markScenarioDuplicates(cases, scenarios)
      .flatMap((item, caseIndex) => item.duplicate ? [] : [{...item, caseIndex}]),
    [cases, scenarios]);
  const chosen = available.filter(item => item.selected);
  const invalidSelection = chosen.length > 100 || chosen.some(item =>
    item.titulo.trim().length < 3 || !item.passos.trim() || !item.esperado.trim());
  const allSelected = available.length > 0 && chosen.length === available.length;
  const postIssues = mode === "post" && content
    ? postFormat === "bbcode" ? validateBbcodePost(content) : validatePostStructure(content) : [];

  function choosePostFormat(next:PostOutputFormat) {
    if(next===postFormat)return;
    if(content.trim()&&dirtyOutput&&
      !window.confirm("Trocar o formato substituirá as edições manuais do post. Continuar?"))return;
    setPostFormat(next);
    if(canonicalPost){
      setContent(renderPostFormat(canonicalPost,next));
      setDirtyOutput(false);setCompleted(false);setMessage("");setError("");
    }
  }

  function replaceCase(index: number, patch: Partial<GeneratedCase>) {
    if (Object.keys(patch).some(key => key !== "selected")) setDirtyOutput(true);
    setCompleted(false);
    setCases(current => current.map((item, i) => i === index ? {...item,...patch} : item));
  }
  function selectAllVisible(value: boolean) {
    setCompleted(false);
    const visibleIndices = new Set(available.map(item => item.caseIndex));
    setCases(current => current.map((item,index)=>
      visibleIndices.has(index) ? {...item,selected:value} : item));
  }

  async function requestRevision(operation:ReviewOperation,caseIndex?:number){
    if(!revisionConsent||generating||busySave||revisionBusy||!context||!formOwn)return;
    const input=lastGenerationInput.current??{
      task:context.prepared.task.text,requirements:context.prepared.requirements?.text??""
    };
    const source=operation==="post_excerpt"?content:null;
    const selected=operation==="post_excerpt"?postSelection:null;
    const candidate=operation==="test_case"&&caseIndex!==undefined?cases[caseIndex]:null;
    const current=operation==="post_excerpt"&&selected?selected.oldText:
      candidate?caseAsMarkdown(candidate):"";
    if(!current.trim()){setError("Selecione um trecho ou caso válido antes de revisar.");return;}
    if(operation==="post_excerpt"&&selected&&content.slice(selected.start,selected.end)!==selected.oldText){
      setError("A seleção mudou. Escolha novamente o trecho.");return;
    }
    const abort=new AbortController();revisionController.current=abort;
    setRevisionBusy(true);setRevisionProposal(null);setError("");setMessage("");
    try{
      const proposal=await requestTargetedRevision({
        operation,task:input.task,requirements:input.requirements,
        current,format:operation==="post_excerpt"?postFormat:"markdown",
        instructions:revisionInstructions
      },abort.signal);
      if(abort.signal.aborted)throw Error("A revisão foi cancelada.");
      if(operation==="post_excerpt"&&selected){
        // Validate against the latest content when accepting; never overwrite other edits.
        setRevisionProposal({operation,before:current,after:proposal,
          postSource:source??"",selection:selected});
      }else if(candidate&&caseIndex!==undefined){
        setRevisionProposal({operation,before:current,after:proposal,
          caseIndex,caseFingerprint:JSON.stringify(candidate)});
      }
      setMessage("Proposta pronta. Compare as versões e aplique somente se estiver correta.");
    }catch(reason){setError(abort.signal.aborted?
      "Revisão cancelada. O rascunho anterior continua intacto.":
      messageOf(reason)+" Nenhum conteúdo foi substituído.");}
    finally{setRevisionBusy(false);revisionController.current=null;}
  }
  async function applyRevision(){
    const item=revisionProposal;
    if(!item||generating||busySave||revisionBusy||auditBusy||!formOwn||!context)return;
    try{
      // Validate before recording an append-only event. No content changes
      // are allowed while the hash-only audit write is pending.
      const nextPost=item.operation==="post_excerpt"&&item.selection?
        insertReviewedExcerpt(content,item.selection,item.after):null;
      const currentCase=item.operation==="test_case"&&item.caseIndex!==undefined?
        cases[item.caseIndex]:null;
      if(currentCase&&JSON.stringify(currentCase)!==item.caseFingerprint)
        throw Error("O caso mudou durante a revisão. Faça uma nova solicitação.");
      const nextCase=currentCase?applyCaseRevision(currentCase,item.after):null;
      if(!nextPost&&!nextCase)throw Error("Proposta de revisão inválida.");
      setAuditBusy(true);setError("");
      await recordAppliedRevision(task.id,userId,context.taskContext.text,
        item.operation,item.before,item.after);
      if(nextPost!==null){
        setContent(nextPost);setPostSelection(null);
      }else if(nextCase&&item.caseIndex!==undefined){
        const at=item.caseIndex;
        setCases(list=>list.map((value,index)=>index===at?nextCase:value));
      }
      setDirtyOutput(true);setCompleted(false);
      setRevisionHistory(current=>[...current.slice(-19),{
        target:item.operation==="post_excerpt"?"Trecho do post":
          "Caso "+String((item.caseIndex??0)+1),
        time:new Date().toLocaleString("pt-BR")
      }]);
      setRevisionProposal(null);
      setMessage("Revisão aprovada e registrada na auditoria privada; somente o trecho selecionado foi alterado.");
    }catch(reason){setError(messageOf(reason)+" A proposta continua disponível, sem alterações aplicadas.");}
    finally{setAuditBusy(false);}
  }
  async function saveConflictDecision(item:SemanticConflict,decision:ConflictDecision){
    if(auditBusy||!formOwn||!context||generating||busySave)return;
    if(decision==="pending"){
      semantic.setConflictDecision(item.id,decision);return;
    }
    setAuditBusy(true);setError("");
    try{
      await recordConflictDecision(task.id,userId,
        context.taskContext.text+"\n"+context.approved.text,item,decision);
      semantic.setConflictDecision(item.id,decision);
      setMessage("Decisão registrada na auditoria privada. O texto original não foi alterado.");
    }catch(reason){
      setError(messageOf(reason));throw reason;
    }finally{setAuditBusy(false);}
  }

  async function generate() {
    if (!canSend || !context) return;
    // Never discard human-edited drafts just because the user requests another answer.
    if (dirtyOutput && (content.trim() || cases.length) &&
      !window.confirm("Substituir a versão editada? As alterações manuais serão perdidas se a nova geração for concluída.")) return;
    const nextId = crypto.randomUUID();
    const previousRaw = raw;
    const previousTruncated=truncated;
    onBusyChange?.(true);
    setGenerating(true); setError(""); setMessage("");
    setRaw(""); setTruncated(false); setCompleted(false);
    setActivityPhase("connecting");
    const abort = new AbortController();
    controller.current = abort;
    try {
      // All identity, support and approved requirements are scoped to this TF.
      // The full redacted payload is inspectable on screen before consent.
      const sentTask=needsCompactReview&&semantic.enabled&&semantic.ready&&semantic.digest
        ?semantic.digest.task:context.prepared.task.text;
      const sentRequirements=needsCompactReview&&semantic.enabled&&semantic.ready&&semantic.digest
        ?semantic.digest.requirements:context.prepared.requirements?.text??"";
      const response = await generateWithNvidia(
        mode, sentTask, sentRequirements,
        (chunk) => {
          setActivityPhase("receiving");
          setRaw((previous) => previous + chunk);
        }, abort.signal
      );
      setActivityPhase("organizing");
      lastGenerationInput.current={task:sentTask,requirements:sentRequirements};
      setGenerationId(nextId);
      setTruncated(response.truncated);
      setDirtyOutput(false);
      let newCases = 0;
      if (mode === "post") {
        const formatted = formatGeneratedPost(response.text, {
          taskText: sentTask
        });
        setCanonicalPost(formatted);
        setContent(renderPostFormat(formatted,postFormat));
      } else {
        const candidates = parseGeneratedCases(response.text);
        const fresh = onlyNewScenarioCandidates(candidates, scenarios);
        newCases = fresh.length;
        setGeneratedCount(candidates.length);
        setCases(editableCopy(fresh));
        setContent(response.text);
      }
      setShowSetup(false);
      setMessage(response.truncated
        ? "Resposta interrompida pelo limite do modelo. Revise antes de usar."
        : mode === "teste"
          ? newCases ? "Casos novos preparados. Revise a seleção antes de adicionar."
            : "Nenhum caso novo encontrado nesta geração."
          : "Post gerado e formatado. Revise os campos antes de salvar.");
    } catch (cause) {
      setRaw(previousRaw);setTruncated(previousTruncated);
      setShowSetup(true);
      setError(abort.signal.aborted
        ? "Geração cancelada. A versão anterior foi preservada."
        : messageOf(cause) + " A versão anterior foi preservada; tente novamente.");
    } finally {
      setGenerating(false); controller.current = null;
      onBusyChange?.(false);
    }
  }

  async function generateFocusedCases(ids:string[]){
    if(mode!=="teste"||!context||!formOwn||generating||busySave||auditBusy||
       revisionBusy)throw Error("Finalizar a operação atual antes de gerar novos casos.");
    const source=lastGenerationInput.current?.task??context.prepared.task.text;
    const prepared=prepareFocusedCoverageTask(
      requirements.data??[],ids,task.id,source);
    if(!window.confirm("Gerar sugestões somente para "+prepared.codes.join(", ")+
       "? A execução, a cobertura e o salvamento continuarão pendentes de sua revisão."))
      return;
    const abort=new AbortController();
    controller.current=abort;
    setGenerating(true);setActivityPhase("connecting");
    setError("");setMessage("");setCompleted(false);
    onBusyChange?.(true);
    try{
      await recordCoveragePreparation(task.id,userId,context.taskContext.text,
        prepared.codes);
      const response=await generateWithNvidia("teste",prepared.task,prepared.requirements,
        (chunk)=>{setActivityPhase("receiving");setRaw(prev=>prev+chunk);},abort.signal);
      if(abort.signal.aborted)throw Error("Geração incremental cancelada.");
      setActivityPhase("organizing");
      const candidates=parseGeneratedCases(response.text);
      const fresh=onlyNewScenarioCandidates(candidates,[...scenarios,...cases]);
      if(fresh.length){
        setCases(prev=>[...prev,...editableCopy(fresh)]);
        setContent(prev=>[prev,response.text].filter(Boolean).join("\n\n---\n\n"));
        setGeneratedCount(prev=>prev+candidates.length);
        setDirtyOutput(true);
      }
      setTruncated(response.truncated);
      setMessage(response.truncated?
        "Parte da geração foi interrompida. Verifique os cenários antes de usar.":
        fresh.length?
          fresh.length+" caso(s) candidato(s) adicionados à revisão, sem alterar os anteriores. Vincule-os aos requisitos depois de salvar.":
          "A IA não retornou casos novos distintos para esta seleção.");
    }catch(reason){
      const error=abort.signal.aborted?"Operação cancelada. Os casos anteriores foram preservados.":
        messageOf(reason)+" Nenhum caso existente foi modificado.";
      setError(error);throw Error(error);
    }finally{
      setGenerating(false);controller.current=null;
      onBusyChange?.(false);
    }
  }

  async function savePost() {
    if (mode !== "post" || !content.trim() || !context || !formOwn) return;
    if (postIssues.length) {
      setError("Revise o formato obrigatório: " + postIssues.join(", ")); return;
    }
    onBusyChange?.(true);
    setBusySave(true); setError(""); setMessage("");
    try {
      const title = (postFormat === "bbcode"
        ? content.match(/^\[size=\d+\]\[b\](.+)\[\/b\]\[\/size\]/m)?.[1]
        : content.match(/^#\s+(.+)$/m)?.[1])?.trim().slice(0,240) || "Post da TF";
      const saved = await saveTfDocument(supabase, {
        taskId: task.id, type: "post", title, content,
        source: dirtyOutput ? "manual" : "gerado"
      });
      await client.invalidateQueries({ queryKey: ["documents", userId, task.id] });
      const warnings: string[] = [];
      try {
        const { error: historyError } = await supabase.from("qa_generator_posts").insert({
          user_id: userId, ts: Date.now(), titulo: title,
          tarefa: lastGenerationInput.current?.task??context.prepared.task.text,
          requisito: lastGenerationInput.current?.requirements??context.prepared.requirements?.text??"", md: content
        });
        if (historyError) throw historyError;
      } catch (reason) { warnings.push("Histórico do gerador: " + messageOf(reason)); }
      if (context.approved.snapshots.length) {
        try {
          await recordRequirementUsage(supabase, {
            taskId: task.id, uid: userId, type: "post",
            artifactRef: saved.id, snapshots: context.approved.snapshots
          });
        } catch (reason) { warnings.push("Rastreabilidade: " + messageOf(reason)); }
      }
      setCompleted(true);
      setMessage("Post salvo em Documentos · versão " + saved.versao +
        (warnings.length ? ". Atenção: " + warnings.join(" | ") : "."));
    } catch (reason) { setError(messageOf(reason)); }
    finally { setBusySave(false); onBusyChange?.(false); }
  }

  async function attachCases() {
    if (mode !== "teste" || !chosen.length || invalidSelection || !context || !formOwn) return;
    onBusyChange?.(true);
    setBusySave(true); setError(""); setMessage("");
    try {
      // The RPC is atomic, checks RLS, prevents duplicates and never marks tests approved.
      const saved = await attachReviewedCases(supabase, {
        taskId: task.id, generationId, items: chosen
      });
      const warnings: string[] = [];
      await client.invalidateQueries({ queryKey: ["scenarios", userId, task.id] });
      try {
        const { error: historyError } = await supabase.from("qa_generator_tests").upsert({
          id: generationId, user_id: userId, ts: Date.now(),
          titulo: task.titulo,
          tarefa: lastGenerationInput.current?.task??context.prepared.task.text,
          requisito: lastGenerationInput.current?.requirements??context.prepared.requirements?.text??"",
          md: revisionHistory.some(item=>item.target.startsWith("Caso "))?
            chosen.map(caseAsMarkdown).join("\n\n---\n\n"):content,
          exec: {}
        }, { onConflict: "id" });
        if (historyError) throw historyError;
      } catch (reason) { warnings.push("Histórico do gerador: " + messageOf(reason)); }
      if (context.approved.snapshots.length) {
        try {
          await recordRequirementUsage(supabase, {
            taskId: task.id, uid: userId, type: "teste", artifactRef: generationId,
            snapshots: context.approved.snapshots
          });
        } catch (reason) { warnings.push("Rastreabilidade: " + messageOf(reason)); }
      }
      setCompleted(true);
      setMessage(saved.inserted + " cenário(s) anexado(s) à TF. Todos começam não executados." +
        (warnings.length ? " Atenção: " + warnings.join(" | ") : ""));
    } catch (reason) { setError(messageOf(reason)); }
    finally { setBusySave(false); onBusyChange?.(false); }
  }

  const postMode=mode==="post";
  const hasOutput=Boolean(raw || content || cases.length);
  const stage: JourneyStage = generating ? "generate" :
    !showSetup && completed ? "complete" :
    hasOutput && !showSetup ? "review" : "configure";
  const showConfiguration = !generating && (!hasOutput || showSetup);
  return <section className={postMode ? "qa-post-composer panel mt-5" :
    "qa-case-composer panel mt-5"}
    aria-labelledby="generator-title">
    <div className="qa-ai-generator-intro">
      <div className="qa-generator-intro-icon" aria-hidden="true">
        {postMode?<PenLine size={20}/>:<WandSparkles size={20}/>}
      </div>
      <div>
        <p className="qa-generator-eyebrow">{postMode?"PUBLICAÇÃO DA TF":"GERAÇÃO ASSISTIDA"}</p>
        <h2 id="generator-title">
          {postMode ? "Gerar post técnico" : "Gerar casos de teste"}
        </h2>
        <p>{postMode?
          "Gere um texto estruturado a partir da tarefa. Confira, ajuste e salve somente quando estiver pronto.":
          "Escolha um modelo, revise os dados e confirme quais casos deseja adicionar."}</p>
      </div>
    </div>
    <GeneratorSteps stage={stage} postMode={postMode}/>
    {showSetup && hasOutput && !generating && <div className="qa-ai-prior-result">
      <span><CheckCircle2 size={16} aria-hidden="true"/>
        O rascunho anterior foi preservado.</span>
      <button type="button" onClick={()=>setShowSetup(false)}>
        Voltar ao resultado anterior
      </button>
    </div>}
    {completed && <div className="qa-generator-complete" role="status">
      <CheckCircle2 size={20} aria-hidden="true"/>
      <div>
        <strong>{postMode ? "Post salvo na TF" : "Casos adicionados à TF"}</strong>
        <p>{postMode ? "O documento está disponível na área de relatórios." :
          "Os casos foram registrados como não executados. Você pode iniciar os testes na aba Cenários."}</p>
      </div>
    </div>}
    {!generating && hasOutput && !showSetup && <div className="qa-generator-setup-toggle">
      <span><CheckCircle2 size={16} aria-hidden="true"/>
        Conteúdo gerado. Revise antes de confirmar.</span>
      <button type="button" onClick={()=>setShowSetup(true)}>
        Alterar modelo ou gerar novamente
      </button>
    </div>}
    {!formOwn && <p className="notice error mt-4" role="alert">
      Gere conteúdo somente a partir de TFs pertencentes à sua conta. A consulta administrativa de outras contas é somente leitura neste fluxo.
    </p>}
    {(support.isLoading || requirements.isLoading) && !postMode &&
      <p role="status" className="mt-4">Carregando o contexto da TF…</p>}
    {(support.isError || requirements.isError || generationError) &&
      <p className="notice error mt-4" role="alert">
        {messageOf(support.error || requirements.error) !== "Falha ao executar a operação."
          ? messageOf(support.error || requirements.error) : generationError}
      </p>}
    {context&&formOwn&&<AuditTrailPanel key={task.id} taskId={task.id} userId={userId}
      taskText={context.taskContext.text}
      approved={requirements.data??[]} onChangedCodes={setChangedCodes}/>}
    <div className={(postMode ? "qa-post-workspace" : "qa-generator-workspace") +
      (generating ? " is-processing" : "") +
      (!showConfiguration && !generating ? " is-review-only" : "")}>
    {(showConfiguration||generating||support.isLoading||requirements.isLoading) &&
      <div className={postMode?"qa-post-configuration":"qa-generator-configuration"}>
    {postMode&&(support.isLoading||requirements.isLoading)&&
      <div className="qa-post-context-loading" role="status">
        <LoaderCircle size={19} className="qa-ai-spinner" aria-hidden="true"/>
        <div><strong>Preparando informações da TF</strong>
          <p>Carregando documentos, cenários e requisitos para a geração.</p></div>
      </div>}
    {context && showConfiguration && <div className="stack qa-generator-setup-body">
      <div className="qa-ai-setup">
        <label className="field">Modelo de geração
          <select value={preset} disabled={generating||busySave}
            onChange={event=>setPreset(event.target.value)}>
            {generatorPresets[mode].map(option=>
              <option key={option.id} value={option.id}>{option.label}</option>)}
          </select>
        </label>
        <details className="qa-ai-extra-options">
          <summary>Personalizar dados e instruções <span>Opcional</span></summary>
          <div className="qa-ai-options-content">
            <div className="generator-stats" aria-label="Fontes no contexto">
              <span>Cenários: <strong>{context.taskContext.sourceCounts.scenarios}</strong></span>
              <span>Documentos: <strong>{context.taskContext.sourceCounts.documents}</strong></span>
              <span>Evidências: <strong>{context.taskContext.sourceCounts.evidence}</strong></span>
              <span>Eventos: <strong>{context.taskContext.sourceCounts.events}</strong></span>
              <span>Requisitos: <strong>{selected.length}</strong></span>
            </div>
            {requirements.data && requirements.data.length > 0 && <fieldset className="extracted-cases">
              <legend className="font-semibold">Requisitos aprovados para incluir</legend>
              {requirements.data.map(item=><label className="extracted-case" key={item.id}>
                <input type="checkbox" checked={selected.includes(item.id)}
                  disabled={generating||busySave}
                  onChange={event=>setSelected(prev=>event.target.checked
                    ? [...prev,item.id] : prev.filter(id=>id!==item.id))}/>
                <span><strong>{item.codigo} · {item.titulo}</strong>
                  <small>{item.descricao.slice(0,180)}</small></span>
              </label>)}
            </fieldset>}
            <label className="field">Instruções adicionais (opcional)
              <textarea rows={3} value={extra} maxLength={18000}
                disabled={generating||busySave}
                onChange={event=>setExtra(event.target.value)}
                placeholder="Ex.: cobrir o cenário de estorno ou destacar o antes/depois"/>
            </label>
          </div>
        </details>
      </div>
      {postMode && <fieldset className="qa-post-format">
        <legend>Formato do post</legend>
        <div className="qa-post-format-choices">
          <label><input type="radio" name="post-output-format"
            value="markdown" checked={postFormat==="markdown"}
            disabled={generating||busySave}
            onChange={()=>choosePostFormat("markdown")}/>
            <span><strong>Markdown</strong><small>Para editores com # e **negrito**</small></span>
          </label>
          <label><input type="radio" name="post-output-format"
            value="bbcode" checked={postFormat==="bbcode"}
            disabled={generating||busySave}
            onChange={()=>choosePostFormat("bbcode")}/>
            <span><strong>BBCode</strong><small>Para fóruns com [b] e [size]</small></span>
          </label>
        </div>
        <p>O formato selecionado será usado na prévia, ao copiar e ao salvar.
          Imagens permanecem como marcadores para você substituir.</p>
      </fieldset>}
      {needsCompactReview&&<SemanticPreparationPanel semantic={semantic} authorized={consent}
        onConflictDecision={saveConflictDecision}
        disabled={generating||busySave||auditBusy}/>}
      {!semantic.enabled&&<ContextPreparationPanel
        items={[
          {label:"TF",result:context.prepared.task,original:context.taskContext.text},
          ...(context.prepared.requirements?[{label:"Requisitos e complemento",
            result:context.prepared.requirements,original:context.approved.text}]:[])
        ]}
        acknowledged={compactApproved} onAcknowledge={setCompactApproved}
        disabled={generating||busySave}/>}
      {missingSources.length > 0 && <div className="notice error">
        <strong>Fontes indisponíveis:</strong>
        <p className="mt-2">{missingSources.join(" · ")}</p>
        <label className="flex items-start gap-2 mt-3">
          <input type="checkbox" checked={partialConsent} onChange={(e) => setPartialConsent(e.target.checked)} />
          Estou ciente de que este contexto está incompleto e desejo continuar.
        </label>
      </div>}
      <details className="generator-context">
        <summary>Ver dados enviados à IA</summary>
        <label className="field mt-3">Contexto da TF enviado<textarea readOnly rows={9} value={semantic.enabled&&semantic.ready&&semantic.digest?
          semantic.digest.task:context.prepared.task.text} /></label>
        <label className="field mt-3">Requisitos e complemento enviados<textarea readOnly rows={5} value={semantic.enabled&&semantic.ready&&semantic.digest?
          semantic.digest.requirements:context.prepared.requirements?.text??""} /></label>
      </details>
      <div className="qa-ai-submit-row">
        <label className="qa-ai-consent-compact">
          <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
          <span>Autorizo enviar os textos exibidos à NVIDIA.</span>
        </label>
        <div className="qa-ai-submit-actions">
          <Button isDisabled={!canSend} onPress={() => void generate()}>
            {generating?<LoaderCircle size={17} className="qa-ai-spinner" aria-hidden="true"/>:
              raw||content||cases.length?<RotateCcw size={16}/>:<WandSparkles size={16}/>}
            {generating ? "Gerando…" : raw||content||cases.length ? "Gerar novamente"
              : mode === "post" ? "Gerar post" : "Gerar casos"}
          </Button>
          {generating && <Button variant="secondary" onPress={() => controller.current?.abort()}>
            Cancelar geração
          </Button>}
        </div>
      </div>
      <p className="qa-ai-privacy-note">
        <ShieldCheck size={15} aria-hidden="true"/>
        Revise os dados antes do envio: a ocultação automática de informações sensíveis pode falhar.
      </p>
    </div>}
    {generating && <GeneratorActivity
      phase={activityPhase} raw={raw} postMode={postMode}
      onCancel={()=>controller.current?.abort()}
    />}
    </div>}
    {!generating && hasOutput && !showSetup && <section className="qa-generator-result" aria-label="Resultado da IA">
      <div className="qa-generator-result-heading">
        <div><p className="eyebrow">REVISÃO</p>
          <h3>{postMode?"Rascunho do post":"Conteúdo produzido"}</h3>
          <p>{postMode?"Revise o texto antes de registrar uma nova versão na TF.":
            "Confira os casos sugeridos antes de adicioná-los."}</p></div>
        {postMode&&content&&<span className="qa-generator-result-size">
          {content.length.toLocaleString("pt-BR")} caracteres
        </span>}
      </div>
      {truncated && <p className="notice error mt-3">Resposta parcial: verifique os itens incompletos antes de usar.</p>}
      {mode === "post" ? <div className="qa-post-output stack mt-3">
        <label className="field">Post em {postFormat==="bbcode"?"BBCode":"Markdown"} (edite antes de salvar)
          <textarea rows={15} maxLength={80000} value={content} disabled={busySave||revisionBusy||auditBusy}
            onSelect={(event)=>setPostSelection(selectionFromText(
              event.currentTarget.value,event.currentTarget.selectionStart,
              event.currentTarget.selectionEnd))}
            onChange={(event) => { setContent(event.target.value);setPostSelection(null);
              setDirtyOutput(true); setCompleted(false); setMessage(""); }} />
        </label>
        <div className="qa-targeted-revision">
          <strong>Revisar somente um trecho com IA</strong>
          <p>Selecione no próprio texto um parágrafo ou uma seção do post.
            O restante será preservado, inclusive suas edições e o formato BBCode.</p>
          <small>{postSelection?postSelection.oldText.length+" caracteres selecionados":
            "Selecione de 12 a 9.000 caracteres para revisar."}</small>
          <label className="field">Orientação para esta revisão (opcional)
            <textarea rows={2} maxLength={1200} value={revisionInstructions}
              onChange={e=>setRevisionInstructions(e.target.value)}
              disabled={revisionBusy||busySave}
              placeholder="Ex.: esclarecer as permissões sem inventar novos comportamentos."/>
          </label>
          <label className="qa-revision-consent">
            <input type="checkbox" checked={revisionConsent} disabled={revisionBusy||busySave}
              onChange={e=>setRevisionConsent(e.target.checked)}/>
            Autorizo enviar o contexto da geração e o trecho selecionado à NVIDIA.
          </label>
          <button type="button" disabled={!postSelection||!revisionConsent||revisionBusy||busySave||
            generating||!!revisionProposal} onClick={()=>void requestRevision("post_excerpt")}>
            {revisionBusy?"Revisando trecho…":"Sugerir revisão do trecho"}
          </button>
        </div>
        {postIssues.length > 0 && <p className="notice error" role="alert">
          Estrutura a revisar: {postIssues.join(", ")}.
        </p>}
        {!postIssues.length&&content&&<p className="qa-post-valid">
          <CheckCircle2 size={16} aria-hidden="true"/>
          Estrutura pronta para revisão final.
        </p>}
        <div className="qa-post-output-actions">
          <Button type="button" variant="secondary" onPress={() => void navigator.clipboard.writeText(content || raw)}
            isDisabled={!content}><Clipboard size={16} /> Copiar</Button>
          <Button onPress={() => void savePost()} isDisabled={!content || !!postIssues.length || busySave || generating || revisionBusy || completed}>
            {busySave?<LoaderCircle className="qa-ai-spinner" size={16} aria-hidden="true"/>:
              <FileCheck2 size={16}/>}
            {busySave?"Salvando post…":completed?"Post salvo":"Salvar post na TF"}
          </Button>
        </div>
      </div> : <div className="qa-ai-review mt-4" aria-label="Revisão dos casos gerados">
        {context&&formOwn&&<CoverageReviewPanel
          taskId={task.id} userId={userId} approved={requirements.data??[]}
          cases={scenarios} changedCodes={changedCodes}
          taskText={lastGenerationInput.current?.task??context.prepared.task.text}
          busy={generating||busySave||revisionBusy||auditBusy}
          onGenerate={generateFocusedCases}/>} 
        {available.length > 0 ? <>
          <div className="qa-ai-review-heading">
            <div>
              <p className="eyebrow">REVISÃO DOS CASOS</p>
              <h3>Casos novos para esta TF</h3>
              <p>Selecione os que deseja adicionar. Você pode ajustar cada caso antes de salvar.</p>
            </div>
            <div className="qa-ai-review-bulk" role="group" aria-label="Seleção de casos">
              <button type="button" disabled={generating || busySave || allSelected}
                onClick={() => selectAllVisible(true)}>Selecionar todos</button>
              <button type="button" disabled={generating || busySave || chosen.length===0}
                onClick={() => selectAllVisible(false)}>Limpar seleção</button>
            </div>
          </div>
          <div className="qa-targeted-revision">
            <strong>Revisar somente um caso com IA</strong>
            <p>Cada caso pode ser regenerado individualmente, sem alterar os demais.
              A proposta só é aplicada após comparação e confirmação.</p>
            <label className="field">Orientação para esta revisão (opcional)
              <textarea rows={2} maxLength={1200} value={revisionInstructions}
                onChange={e=>setRevisionInstructions(e.target.value)}
                disabled={revisionBusy||busySave}/>
            </label>
            <label className="qa-revision-consent">
              <input type="checkbox" checked={revisionConsent} disabled={revisionBusy||busySave}
                onChange={e=>setRevisionConsent(e.target.checked)}/>
              Autorizo enviar à NVIDIA o contexto da geração e o caso escolhido.
            </label>
          </div>
          <div className="qa-ai-review-list" aria-label="Casos disponíveis">
            {available.map((item,index) => <article
              key={String(item.source_index)+"-"+item.caseIndex}
              className={"generator-case qa-ai-case-review"+(item.selected?" is-selected":"")}>
              <div className="qa-ai-case-header">
                <label className="qa-ai-case-selector">
                  <input type="checkbox" checked={item.selected}
                    aria-label={"Selecionar "+item.titulo}
                    disabled={generating || busySave}
                    onChange={event=>replaceCase(item.caseIndex,{selected:event.target.checked})}/>
                  <span>
                    <small>Caso {index+1}</small>
                    <strong>{item.titulo || "Caso sem título"}</strong>
                  </span>
                </label>
              </div>
              <button type="button" className="qa-revision-case-btn"
                disabled={revisionBusy||busySave||auditBusy||generating||!revisionConsent||!!revisionProposal}
                onClick={()=>void requestRevision("test_case",item.caseIndex)}>
                {revisionBusy?"Revisando…":"Regerar apenas este caso"}
              </button>
              <div className="qa-ai-case-preview">
                <p><b>Passos</b> {item.passos.slice(0,230)}{item.passos.length>230?"…":""}</p>
                <p><b>Esperado</b> {item.esperado.slice(0,230)}{item.esperado.length>230?"…":""}</p>
              </div>
              <details className="qa-ai-case-edit">
                <summary>Editar cenário</summary>
                <div className="stack mt-3">
                  <label className="field">Título<input value={item.titulo} maxLength={240}
                    onChange={e=>replaceCase(item.caseIndex,{titulo:e.target.value})}/></label>
                  <label className="field">Passos<textarea rows={3} value={item.passos} maxLength={20000}
                    onChange={e=>replaceCase(item.caseIndex,{passos:e.target.value})}/></label>
                  <label className="field">Resultado esperado<textarea rows={3} value={item.esperado} maxLength={20000}
                    onChange={e=>replaceCase(item.caseIndex,{esperado:e.target.value})}/></label>
                  <label className="field">Observações<textarea rows={2} value={item.observacoes} maxLength={20000}
                    onChange={e=>replaceCase(item.caseIndex,{observacoes:e.target.value})}/></label>
                </div>
              </details>
            </article>)}
          </div>
          <div className="qa-ai-review-footer">
            <div>
              <strong>{chosen.length} de {available.length} selecionados</strong>
              <small>Os casos serão cadastrados como não executados.</small>
              {invalidSelection&&<p role="status">
                Revise título, passos e resultado esperado dos casos selecionados.</p>}
            </div>
            <Button isDisabled={!chosen.length || invalidSelection || busySave || generating || revisionBusy || completed}
              onPress={() => void attachCases()}>
              <Send size={16} /> {completed ? "Casos adicionados" : chosen.length === 0 ? "Selecione casos" : `Anexar ${chosen.length} ${chosen.length === 1 ? "caso" : "casos"} à TF`}
            </Button>
          </div>
        </> : !generating && (generatedCount > 0
          ? <div className="qa-ai-review-empty" role="status">
              <FileCheck2 size={22} aria-hidden="true"/>
              <strong>Nenhum caso novo para adicionar</strong>
              <p>Os cenários encontrados já estão contemplados nesta TF. Experimente outro modelo de geração para explorar novas situações.</p>
            </div>
          : <div className="qa-ai-review-empty" role="status">
              <strong>Nenhum caso de teste identificável</strong>
              <p>A resposta não trouxe casos no formato esperado. Tente gerar novamente.</p>
            </div>)}
      </div>}
      {revisionBusy&&<div className="qa-revision-inflight" role="status">
        Reescrevendo apenas o trecho selecionado…
        <button type="button" onClick={()=>revisionController.current?.abort()}>
          Cancelar revisão</button>
      </div>}
      {revisionProposal&&<section className="qa-revision-preview" aria-label="Comparação da revisão proposta">
        <div>
          <strong>Prévia da alteração — nenhuma edição aplicada ainda</strong>
          <p>Compare o trecho anterior com a sugestão. O restante do conteúdo permanece intacto.</p>
        </div>
        <div className="qa-revision-diff">
          <label>Antes<textarea readOnly rows={8} value={revisionProposal.before}/></label>
          <label>Proposta da IA<textarea readOnly rows={8} value={revisionProposal.after}/></label>
        </div>
        <div className="qa-revision-preview-actions">
          <button type="button" disabled={revisionBusy||busySave}
            onClick={()=>setRevisionProposal(null)}>Descartar proposta</button>
          <button type="button" disabled={revisionBusy||busySave}
            onClick={()=>void applyRevision()} disabled={auditBusy}>Aplicar somente neste trecho</button>
        </div>
      </section>}
      {!!revisionHistory.length&&<details className="qa-revision-history">
        <summary>Histórico de revisões nesta sessão ({revisionHistory.length})</summary>
        <ol>{revisionHistory.map((event,index)=>
          <li key={index}>{event.time} — {event.target} aprovado pelo QA</li>)}</ol>
      </details>}
    </section>}

    </div>
    <ToastNotice message={message} tone="success"/>
    <ToastNotice message={error} tone="error"/>
  </section>;
}
