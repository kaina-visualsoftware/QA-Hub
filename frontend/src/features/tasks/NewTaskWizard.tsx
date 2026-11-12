import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@heroui/react";
import { ArrowLeft, ArrowRight, Check, CheckCircle2, ClipboardList, FileCheck2, FileText, LoaderCircle, Paperclip, Plus, ShieldCheck, Sparkles, Trash2 } from "lucide-react";
import { QAModal } from "../../components/ui/QAModal";
import { AiStepFlow } from "../../components/ui/AiStepFlow";
import { ToastNotice } from "../../components/ui/Toasts";
import { createTask, addExtractedScenarios } from "../../lib/data";
import { taskDraftSchema, scenarioDraftSchema } from "../../lib/contracts";
import type { TaskDraft } from "../../lib/contracts";
import { formatTaskVersionInput, normalizeTaskVersion } from "../../lib/task-version";
import { normalizeDraft } from "../../lib/legacy/qa-assistant.mjs";
import { taskToGeneratorText, parseGeneratedCases } from "../../lib/legacy/qa-workspace.mjs";
import { sanitizeAiContext } from "../../lib/legacy/qa-test-context.mjs";
import {
  archiveTaskAiSource, freshTaskAiScenarios,
  mergeTaskAiCreation, onlyNewTaskAiSelections, taskAiFieldValues
} from "./task-ai";
import type { SuggestedScenario } from "./task-ai";
import {generateTaskAiDraftPhased,pipelinePendingCount} from "./task-ai-phased";
import type {TaskPipelineCheckpoint} from "./task-ai-phased";
import {TaskFieldEvidenceReview,TaskScenarioEvidenceReview} from "./TaskEvidenceReview";
import type {FieldReview,ScenarioReview} from "./task-evidence";
import {generateBatchedWithNvidia,unfinishedGeneratorStages} from "../generators/batched-stream";
import type {GeneratorCheckpoint} from "../generators/batched-stream";
import {recoverInterruptedWizardCases} from "./wizard-case-recovery";
import {prepareQaContext,prepareGeneratorContext} from "../generators/context-preparation";
import type {ContextPreparation} from "../generators/context-preparation";
import {ContextPreparationPanel} from "../generators/ContextPreparationPanel";
import {AiBusyStatus} from "../../components/ui/AiBusyStatus";
import {AiQuotaWait} from "../../components/ui/AiQuotaWait";
import type {AiWaitState} from "../../lib/ai-retry";
import {SemanticPreparationPanel} from "../generators/SemanticPreparationPanel";
import {useSemanticContext} from "../generators/useSemanticContext";
import {
  prepareRequirementFile, registerRequirementFile
} from "../requirements/requirements-data";
import type { PreparedFile } from "../requirements/requirements-data";
import {
  discardNewTaskDraft, loadNewTaskDraft, saveNewTaskDraft
} from "./local-draft";

const blank = (): TaskDraft => ({
  titulo: "", descricao: "", codigo: "", tipo_teste: "BUILD", sistema: "",
  versao: "", ambiente: "", base_teste: "", empresa: "", testador: "",
  explicacao: "", causa: "", correcao: "", conclusao: "", observacoes: ""
});
const MAX_FILES = 6;

type WorkKind="files"|"task"|"cases"|"save";
type WorkStatus={
  kind:WorkKind; phase:number; detail:string;
  current?:number; total?:number;
};
const WORK_STEPS: Record<WorkKind,string[]>={
  files:["Conferir anexos","Extrair texto dos arquivos","Preparar documentos"],
  task:["Validar contexto","Extrair campos","Gerar cenários em lotes","Revisar resultados"],
  cases:["Organizar tarefa e requisitos","Consultar NVIDIA","Receber casos","Remover repetições"],
  save:["Criar registro da TF","Arquivar textos originais","Registrar anexos","Salvar casos de teste"]
};
const WORK_LABELS:Record<WorkKind,string>={
  files:"Lendo os documentos",task:"Interpretando a tarefa",
  cases:"Gerando cobertura de testes",save:"Finalizando a TF"
};

type Props = {
  open: boolean;
  userId: string;
  onClose: () => void;
  onCreated: (id: string, warning: string) => Promise<void>;
};

function combine(label: string, pasted: string, files: PreparedFile[]): string {
  return [
    pasted.trim() ? (label ? label + ":\n" : "") + pasted.trim() : "",
    ...files.filter(item => item.text.trim()).map(item =>
      "ARQUIVO: " + item.file.name + "\n" + item.text.trim()
    )
  ].filter(Boolean).join("\n\n");
}

function assertReadable(files: PreparedFile[]) {
  const unreadable = files.filter(item => !item.text.trim());
  if(unreadable.length) throw Error(
    "Não foi possível extrair texto de " + unreadable.map(item => item.file.name).join(", ") +
    ". Para incluir o conteúdo na análise da IA, cole o texto ou envie um arquivo com texto selecionável."
  );
}
function keyOf(item: Pick<SuggestedScenario,"titulo">) {
  return item.titulo.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR").replace(/^cen(?:ario|ário)\s*\d+\s*[-—–:.]?\s*/,"")
    .replace(/[^a-z0-9]+/g," ").trim();
}
function addUnique(previous: SuggestedScenario[], candidates: SuggestedScenario[]) {
  const existing = new Set(previous.map(keyOf));
  return [...previous, ...candidates.filter(item => {
    const key = keyOf(item);
    if(!key || existing.has(key)) return false;
    existing.add(key);
    return true;
  })].slice(0,50);
}

export function NewTaskWizard({open,userId,onClose,onCreated}:Props) {
  const [step,setStep] = useState<1|2|3>(1);
  const [caseReview,setCaseReview] = useState(false);
  const [sourceText,setSourceText] = useState("");
  const [taskFiles,setTaskFiles] = useState<PreparedFile[]>([]);
  const [requirementText,setRequirementText] = useState("");
  const [requirementFiles,setRequirementFiles] = useState<PreparedFile[]>([]);
  const [draft,setDraft] = useState<TaskDraft>(blank);
  const [cases,setCases] = useState<SuggestedScenario[]>([]);
  const [consentTask,setConsentTask] = useState(false);
  const [consentCases,setConsentCases] = useState(false);
  const [compactApprovedTask,setCompactApprovedTask] = useState(false);
  const [compactApprovedCases,setCompactApprovedCases] = useState(false);
  const [aiUsed,setAiUsed] = useState(false);
  const [localFallback,setLocalFallback] = useState(false);
  const [reading,setReading] = useState(false);
  const [analyzing,setAnalyzing] = useState(false);
  const [generating,setGenerating] = useState(false);
  const [finishing,setFinishing] = useState(false);
  const [error,setError] = useState("");
  const [notice,setNotice] = useState("");
  const [draftErrors,setDraftErrors] = useState<Record<string,string>>({});
  const [remember,setRemember] = useState(false);
  const [recoverable,setRecoverable] = useState<ReturnType<typeof loadNewTaskDraft>>(null);
  const [streamText,setStreamText] = useState("");
  const [casePending,setCasePending] = useState(0);
  const [work,setWork]=useState<WorkStatus|null>(null);
  const [quotaWait,setQuotaWait]=useState<AiWaitState|null>(null);
  const [taskPending,setTaskPending]=useState(0);
  const [taskPartial,setTaskPartial]=useState(false);
  const [fieldEvidence,setFieldEvidence]=useState<FieldReview[]>([]);
  const [scenarioEvidence,setScenarioEvidence]=useState<ScenarioReview[]>([]);
  const [fieldEvidenceApproved,setFieldEvidenceApproved]=useState<Record<string,boolean>>({});
  const taskCheckpoint=useRef<TaskPipelineCheckpoint|null>(null);
  const caseCheckpoint=useRef<GeneratorCheckpoint|null>(null);
  const caseSourceKey=useRef<string|null>(null);
  const recoveredSnapshots=useRef<Map<string,string>>(new Map());
  // Recovered proposals do not change the fingerprint of the approved input.
  const caseInputKey=JSON.stringify([draft,sourceText,taskFiles.map(f=>f.hash),
    requirementText,requirementFiles.map(f=>f.hash)]);
  const controller=useRef<AbortController|null>(null);
  const stepperRef=useRef<HTMLDivElement|null>(null);
  const wasOpen=useRef(false);
  const automaticallyFilled=useRef<Partial<TaskDraft>>({});
  type SourcePreparation={original:string;prepared:ContextPreparation}|{error:string};
  const sourcePreparation=useMemo<SourcePreparation|null>(()=>{
    const original=combine("",sourceText,taskFiles);
    if(!original.trim())return null;
    try{
      return {original,prepared:prepareQaContext(sanitizeAiContext(original),{
        limit:28000,description:"criação de TF"
      })};
    }catch(reason){return {error:reason instanceof Error?reason.message:String(reason)};}
  },[sourceText,taskFiles]);
  type CasePreparation={
    originalTask:string;originalRequirements:string;
    prepared:ReturnType<typeof prepareGeneratorContext>
  }|{error:string};
  const casePreparation=useMemo<CasePreparation|null>(()=>{
    if(step!==3)return null;
    try{
      const fullSource=combine("TEXTO ORIGINAL",sourceText,taskFiles);
      const additionalFacts=[
        draft.conclusao?"Conclusão registrada: "+draft.conclusao:"",
        draft.observacoes?"Observações registradas: "+draft.observacoes:""
      ].filter(Boolean).join("\n\n");
      const taskText=sanitizeAiContext([
        taskToGeneratorText(draft),additionalFacts,fullSource,
        cases.length?"CASOS JÁ IDENTIFICADOS (não repetir):\n"+
          cases.map(item=>"- "+item.titulo).join("\n"):""
      ].filter(Boolean).join("\n\n"));
      const requirements=sanitizeAiContext(
        combine("REQUISITOS",requirementText,requirementFiles));
      if(!taskText.trim())throw Error("Informe o contexto da TF antes de gerar.");
      return {originalTask:taskText,originalRequirements:requirements,
        prepared:prepareGeneratorContext(taskText,requirements)};
    }catch(reason){return {error:reason instanceof Error?reason.message:String(reason)};}
  },[step,draft,sourceText,taskFiles,cases,requirementText,requirementFiles]);
  const semanticTask=useSemanticContext(sourcePreparation&&"prepared" in sourcePreparation?
    sanitizeAiContext(sourcePreparation.original):"","","task",
    Boolean(sourcePreparation&&"prepared" in sourcePreparation&&sourcePreparation.prepared.needsReview));
  const semanticCases=useSemanticContext(casePreparation&&"prepared" in casePreparation?
    casePreparation.originalTask:"",casePreparation&&"prepared" in casePreparation?
    casePreparation.originalRequirements:"","teste",
    Boolean(casePreparation&&"prepared" in casePreparation&&
      (casePreparation.prepared.task.needsReview||casePreparation.prepared.requirements?.needsReview)));
  const busy=reading||analyzing||generating||finishing||
    semanticTask.working||semanticCases.working;
  useEffect(()=>setCompactApprovedTask(false),[sourceText,taskFiles]);
  useEffect(()=>setCompactApprovedCases(false),[casePreparation]);


  useEffect(()=>{
    if(open && !wasOpen.current) setRecoverable(loadNewTaskDraft(userId));
    if(!open && wasOpen.current) {
      controller.current?.abort();
      setStep(1);setCaseReview(false);setSourceText("");setTaskFiles([]);setRequirementFiles([]);
      setRequirementText("");setDraft(blank());setCases([]);
      setConsentTask(false);setConsentCases(false);setAiUsed(false);setLocalFallback(false);
      setError("");setNotice("");setDraftErrors({});setStreamText("");setWork(null);setQuotaWait(null);
      setRemember(false);setRecoverable(null);automaticallyFilled.current={};
      taskCheckpoint.current=null;setTaskPending(0);setTaskPartial(false);
      caseCheckpoint.current=null;caseSourceKey.current=null;
      recoveredSnapshots.current.clear();setCasePending(0);
      setFieldEvidence([]);setScenarioEvidence([]);setFieldEvidenceApproved({});
    }
    wasOpen.current=open;
  },[open,userId]);

  // Every transition starts at the top of the modal; keyboard and screen-reader
  // users land on the new step's heading instead of staying on an old footer.
  useEffect(()=>{
    if(!open || step===1)return;
    const frame=requestAnimationFrame(()=>{
      const content=stepperRef.current?.closest<HTMLElement>(".qa-modal-content");
      content?.scrollTo({top:0,behavior:"auto"});
      content?.querySelector<HTMLElement>("#qa-wizard-stage-heading")
        ?.focus({preventScroll:true});
    });
    return ()=>cancelAnimationFrame(frame);
  },[open,step]);

  useEffect(()=>{
    if(!open || !remember || !userId)return;
    const id=setTimeout(()=>{
      saveNewTaskDraft(userId,{...draft,descricao:sourceText});
    },350);
    return ()=>clearTimeout(id);
  },[open,remember,userId,draft,sourceText]);

  useEffect(()=>{
    if(!open||!remember||!userId)return;
    const flush=()=>saveNewTaskDraft(userId,{...draft,descricao:sourceText});
    window.addEventListener("pagehide",flush);
    return ()=>window.removeEventListener("pagehide",flush);
  },[open,remember,userId,draft,sourceText]);

  function close(){
    if(busy)return;
    if((sourceText.trim() || taskFiles.length || draft.titulo.trim() ||
      requirementText.trim() || requirementFiles.length) &&
      !window.confirm("Fechar a criação? Textos e arquivos ainda não salvos serão descartados."))return;
    onClose();
  }
  function update(name:keyof TaskDraft,value:string){
    setDraft(current=>({...current,[name]:name==="versao"?formatTaskVersionInput(value):value}));
    setDraftErrors(current=>({...current,[name]:""}));
    setConsentCases(false);
  }
  function invalidateSource(){
    const previouslyFilled=automaticallyFilled.current;
    if(Object.keys(previouslyFilled).length){
      setDraft(current=>{
        const next={...current};
        const defaults=blank();
        for(const [name,value] of Object.entries(previouslyFilled)){
          const key=name as keyof TaskDraft;
          // Preserve anything the QA has manually changed since analysis.
          if(next[key]===value) (next as Record<string,string>)[key]=defaults[key]??"";
        }
        return next;
      });
      setNotice("A origem da TF mudou. Gere a análise novamente ou revise os campos na etapa 2.");
    }else setNotice("");
    automaticallyFilled.current={};
    taskCheckpoint.current=null;setTaskPending(0);setTaskPartial(false);
    caseCheckpoint.current=null;caseSourceKey.current=null;
    recoveredSnapshots.current.clear();setCasePending(0);
      setFieldEvidence([]);setScenarioEvidence([]);setFieldEvidenceApproved({});
    setConsentTask(false);setConsentCases(false);setAiUsed(false);setLocalFallback(false);setCases([]);
  }
  function alterSource(value:string){
    setSourceText(value);invalidateSource();setError("");
  }
  async function addFiles(list: FileList | null, requirement:boolean){
    if(!list?.length)return;
    const existing=requirement?requirementFiles:taskFiles;
    const chosen=Array.from(list);
    if(chosen.length+existing.length>MAX_FILES){
      setError("Anexe no máximo "+MAX_FILES+" arquivos por etapa.");return;
    }
    setReading(true);setError("");setNotice("");
    setWork({kind:"files",phase:0,detail:"Conferindo tipos e tamanhos dos arquivos.",total:chosen.length,current:0});
    try{
      const prepared:PreparedFile[]=[];
      for(const [index,file] of chosen.entries()){
        setWork({kind:"files",phase:1,detail:"Lendo "+file.name,current:index+1,total:chosen.length});
        prepared.push(await prepareRequirementFile(file));
      }
      setWork({kind:"files",phase:2,detail:"Verificando arquivos repetidos e preparando os textos.",current:chosen.length,total:chosen.length});
      const known=new Set(existing.map(item=>item.hash));
      for(const item of prepared){
        if(known.has(item.hash))throw Error("Arquivo repetido: "+item.file.name);
        known.add(item.hash);
      }
      if(requirement){
        setRequirementFiles(current=>[...current,...prepared]);
        setConsentCases(false);
      }else{
        setTaskFiles(current=>[...current,...prepared]);
        invalidateSource();
      }
      const warnings=prepared.filter(item=>item.warning).map(item=>item.file.name+": "+item.warning);
      setNotice(warnings.length?warnings.join(" "):
        prepared.length+" arquivo(s) preparado(s). Serão anexados à TF na finalização.");
    }catch(reason){setError(reason instanceof Error?reason.message:"Não foi possível ler o arquivo.");}
    finally{setReading(false);setWork(null);}
  }

  async function generateTask(){
    if(busy||!consentTask)return;
    setAnalyzing(true);setError("");setNotice("");setQuotaWait(null);
    const abort=new AbortController();controller.current=abort;
    setWork({kind:"task",phase:0,detail:"Conferindo o conteúdo e os anexos selecionados."});
    // Avoid artificial headings in the content submitted to the model.
    const snapshot=combine("",sourceText,taskFiles);
    try{
      if(!sourcePreparation||!("prepared" in sourcePreparation))throw Error(
        sourcePreparation&&"error" in sourcePreparation?sourcePreparation.error:
          "Não foi possível preparar o contexto.");
      if(sourcePreparation.prepared.needsReview&&
        (semanticTask.enabled?!semanticTask.ready:!compactApprovedTask))
        throw Error("Revise e autorize o contexto preparado antes de enviar.");
      assertReadable(taskFiles);
      if(!snapshot.trim())throw Error("Informe o conteúdo da tarefa.");
      const response=await generateTaskAiDraftPhased(snapshot,{
        aiText:sourcePreparation.prepared.mode==="integral"?undefined:
          semanticTask.enabled&&semanticTask.ready&&semanticTask.digest?
            semanticTask.digest.task:sourcePreparation.prepared.text,
        checkpoint:taskPending>0?taskCheckpoint.current:null,
        onCheckpoint:checkpoint=>{taskCheckpoint.current=checkpoint;
          setTaskPending(pipelinePendingCount(checkpoint));
          setFieldEvidence([...checkpoint.fieldReview]);
          setScenarioEvidence(Object.values(checkpoint.scenarioReview).flat());},
        onProgress:progress=>setWork({kind:"task",
          phase:progress.stage==="fields"?1:progress.stage==="scenarios"?2:3,
          detail:progress.detail,
          current:progress.current,total:progress.total}),
        signal:abort.signal,onWait:setQuotaWait
      });
      setTaskPending(response.pendingBatches+(response.fieldsPending?1:0));
      setTaskPartial(response.partial);
      setFieldEvidence(response.fieldReview);setScenarioEvidence(response.scenarioReview);
      setWork({kind:"task",phase:3,detail:"Organizando o resultado para revisão humana."});
      if(snapshot!==combine("",sourceText,taskFiles)){
        throw Error("O conteúdo da TF mudou durante a geração. Analise novamente.");
      }
      // In old versions, the pasted source was installed as 'descricao'
      // before merging. If the AI omitted that field, the entire unprocessed
      // report was persisted instead of an actual problem summary.
      const initial={...draft,descricao:draft.descricao.trim()===sourceText.trim()?"":draft.descricao};
      const previousAiValues=automaticallyFilled.current;
      const merged=mergeTaskAiCreation(initial,response,{previousAiValues});
      const generated=taskAiFieldValues(response);
      // Track only values actually applied by AI; user-edited values must
      // survive a second analysis and must not be erased on source changes.
      const applied=Object.fromEntries(Object.entries(generated).filter(([name,value])=>{
        const key=name as keyof TaskDraft;
        return merged[key]===value&&(
          !String(initial[key]??"").trim()||
          previousAiValues[key]!==undefined&&initial[key]===previousAiValues[key]||
          name==="tipo_teste"&&initial.tipo_teste==="BUILD"&&value==="RELEASE"
        );
      })) as Partial<TaskDraft>;
      automaticallyFilled.current=applied;
      setDraft(merged);
      // Cases are suggestions only. The QA must opt in per scenario to save.
      setCases(current=>addUnique(current,freshTaskAiScenarios(response,current,false)));
      setAiUsed(true);
      setLocalFallback(response.extractionSource==="local");
      setStep(2);
      const missing=([
        "titulo","descricao","sistema","versao","ambiente","base_teste",
        "empresa","explicacao","causa","correcao","conclusao"
      ] as const).filter(field=>!String(merged[field]??"").trim()).length;
      const missingHint=missing?` ${missing} campo(s) sem informação identificada; complete apenas com dados da TF.`:"";
      setNotice((response.partial
        ? "A análise ficou parcial. "+response.pendingBatches+" lote(s) de cenários pendente(s)"+
          (response.fieldsPending?" e campos ainda não concluídos":"")+
          ". Os resultados já recebidos foram preservados. "+
          (response.pendingBatches||response.fieldsPending
            ?"Você pode retomar sem reenviar os lotes concluídos. ":"")+
          (response.extractionReason??"")
        : response.extractionSource==="local"
          ? "Extração local utilizada; confira os campos e cenários antes de salvar."
          : sourcePreparation.prepared.needsReview
            ? "Campos extraídos da seleção compactada. Compare com a fonte integral antes de salvar."
            : "Campos e cenários organizados pela NVIDIA. Revise antes de avançar.")+missingHint);
    }catch(reason){
      if(abort.signal.aborted&&taskCheckpoint.current)
        setTaskPending(pipelinePendingCount(taskCheckpoint.current));
      setError(abort.signal.aborted
        ? "Análise cancelada. Campos e lotes concluídos foram preservados nesta sessão; clique em retomar."
        :reason instanceof Error?reason.message:"Falha ao analisar a TF.");
    }
    finally{setAnalyzing(false);setWork(null);setQuotaWait(null);controller.current=null;}
  }
  function continueManual(){
    if(busy)return;
    // Manual entry must not trigger a hidden deterministic extraction.
    // The QA enters the fields intentionally; the source is archived as-is.
    automaticallyFilled.current={};
    setDraft(current=>({...current,descricao:current.descricao||sourceText}));
    setAiUsed(false);setLocalFallback(false);setError("");setNotice(
      "Preenchimento manual: nenhum campo ou cenário foi interpretado sem IA.");
    setStep(2);
  }
  function nextStep(){
    const result=taskDraftSchema.safeParse(draft);
    if(!result.success){
      const entries:Record<string,string>={};
      for(const issue of result.error.issues){
        const name=String(issue.path[0]||"");
        if(!entries[name])entries[name]=issue.message;
      }
      setDraftErrors(entries);
      setError("Revise os campos indicados antes de avançar.");
      return;
    }
    setDraft(result.data);
    setDraftErrors({});
    setError("");setNotice("");
    setCaseReview(cases.length>0);
    setStep(3);
  }
  async function generateCases(){
    if(busy||!consentCases)return;
    setGenerating(true);setError("");setNotice("");setStreamText("");setQuotaWait(null);
    const abort=new AbortController();controller.current=abort;
    setWork({kind:"cases",phase:0,detail:"Preparando TF e requisitos."});
    try{
      assertReadable(taskFiles);assertReadable(requirementFiles);
      const previous=caseSourceKey.current===caseInputKey?caseCheckpoint.current:null;
      const resume=previous?.mode==="teste"&&unfinishedGeneratorStages(previous)>0?previous:null;
      if(!resume){
        if(!casePreparation||!("prepared" in casePreparation))
          throw Error(casePreparation&&"error" in casePreparation?casePreparation.error:
            "Não foi possível preparar os casos.");
        const packed=casePreparation.prepared;
        if((packed.task.needsReview||packed.requirements?.needsReview)&&
          (semanticCases.enabled?!semanticCases.ready:!compactApprovedCases))
          throw Error("Revise e autorize os contextos preparados antes de enviar.");
      }
      const packed=casePreparation&&"prepared" in casePreparation?
        casePreparation.prepared:null;
      const sentTask=resume?.task??(semanticCases.enabled&&semanticCases.ready&&semanticCases.digest?
        semanticCases.digest.task:packed?.task.text??"");
      const sentRequirements=resume?.requirements??(semanticCases.enabled&&semanticCases.ready&&semanticCases.digest?
        semanticCases.digest.requirements:packed?.requirements?.text??"");
      if(!resume){caseSourceKey.current=caseInputKey;caseCheckpoint.current=null;setCasePending(0);}
      setCaseReview(false);
      setWork({kind:"cases",phase:1,detail:resume?
        "Retomando as etapas pendentes sem reenviar as concluídas.":
        "Aguardando a NVIDIA elaborar novos cenários, variações e regressões por etapas."});
      const response=await generateBatchedWithNvidia("teste",sentTask,sentRequirements,{
        checkpoint:resume,signal:abort.signal,onWait:setQuotaWait,
        onCheckpoint:cp=>{caseCheckpoint.current=cp;setCasePending(unfinishedGeneratorStages(cp));},
        onPreview:preview=>{
          setStreamText(preview);
          if(preview.trim())setWork(current=>current?.kind==="cases"?
            {...current,phase:2,detail:"Recebendo e preservando os cenários gerados."}:current);
        },
        onProgress:progress=>setWork({kind:"cases",phase:progress.continuation?2:1,
          detail:(progress.continuation?"Continuando trecho da etapa ":"Aguardando a NVIDIA elaborar novos cenários. Etapa ")+
            (progress.index+1)+" de "+progress.total+" — "+progress.stage+".",
          current:progress.completed,total:progress.total})
      });
      setWork({kind:"cases",phase:3,detail:"Validando títulos, passos, resultados e repetições."});
      const generated=normalizeDraft({cenarios:parseGeneratedCases(response.text)});
      const full=freshTaskAiScenarios(generated,[],true);
      const fresh=freshTaskAiScenarios(generated,cases,true);
      const recoverySnapshots=new Map(recoveredSnapshots.current);
      setCases(current=>{
        const byTitle=new Map(full.map(item=>[keyOf(item),item]));
        const upgraded=current.map(item=>{
          const key=keyOf(item),complete=byTitle.get(key);
          // Never overwrite a recovered proposal edited by the QA.
          return complete&&recoverySnapshots.get(key)===JSON.stringify(item)?
            {...complete,selected:item.selected}:item;
        });
        return addUnique(upgraded,full);
      });
      recoveredSnapshots.current.clear();
      caseCheckpoint.current=null;caseSourceKey.current=null;setCasePending(0);
      setCaseReview(Boolean(cases.length||full.length));
      setNotice(fresh.length?
        fresh.length+" caso(s) novo(s) identificados. Revise antes de finalizar.":
        full.length?"Geração concluída. Revise os casos recuperados antes de salvar.":
        "Nenhum caso novo e válido foi encontrado. Revise os requisitos.");
    }catch(reason){
      const cp=caseSourceKey.current===caseInputKey?caseCheckpoint.current:null;
      const recovered=cp?recoverInterruptedWizardCases(cp,cases):[];
      if(recovered.length){
        const alreadyKnown=new Set(cases.map(keyOf));
        for(const item of recovered)
          if(!alreadyKnown.has(keyOf(item)))
            recoveredSnapshots.current.set(keyOf(item),JSON.stringify(item));
        setCases(current=>addUnique(current,recovered));
        setCaseReview(true);
        setNotice(recovered.length+" caso(s) recuperado(s) da resposta interrompida, "+
          "desmarcados para revisão. Nada será salvo automaticamente.");
      }
      const pending=cp?unfinishedGeneratorStages(cp):0;setCasePending(pending);
      setError((abort.signal.aborted?"Geração cancelada.":
        reason instanceof Error?reason.message:"Não foi possível gerar os casos.")+
        (pending?" O texto recebido foi preservado nesta sessão. "+
          "Retome as "+pending+" etapa(s) pendentes sem repetir as concluídas.":""));
    }finally{setGenerating(false);controller.current=null;setWork(null);setQuotaWait(null);}
  }
  function editCase(index:number,patch:Partial<SuggestedScenario>){
    setCases(current=>current.map((item,i)=>i===index?{...item,...patch}:item));
  }
  async function finish(includeCases:boolean){
    if(busy)return;
    const checked=taskDraftSchema.safeParse(draft);
    if(!checked.success){setStep(2);setError("Revise os dados da TF.");return;}
    const selected=includeCases
      ?onlyNewTaskAiSelections(cases.filter(item=>item.selected),[]):[];
    if(includeCases&&!selected.length)return;
    for(const [index,item] of selected.entries()){
      const valid=scenarioDraftSchema.safeParse(item);
      if(!valid.success){setError("Revise os passos e o resultado esperado do caso "+(index+1)+".");return;}
    }
    setFinishing(true);setError("");setNotice("");
    setWork({kind:"save",phase:0,detail:"Gravando a TF com os dados revisados."});
    try{
      // The TF is created once, only at the final step.
      const created=await createTask(userId,checked.data);
      const warnings:string[]=[];
      setWork({kind:"save",phase:1,detail:"Registrando o documento original e os requisitos."});
      if(sourceText.trim()){
        try{await archiveTaskAiSource(created.id,userId,sourceText);}
        catch(reason){warnings.push("Texto original: "+(reason as Error).message);}
      }
      if(requirementText.trim()){
        try{
          const {error:sourceError}=await (await import("../../lib/supabase")).supabase
            .from("qa_requisito_fontes").insert({
              tarefa_id:created.id,user_id:userId,tipo_fonte:"texto",
              nome_arquivo:"Requisito da criação",texto_extraido:requirementText.trim()
            });
          if(sourceError)throw sourceError;
        }catch(reason){warnings.push("Requisito colado: "+(reason as Error).message);}
      }
      const toUpload=[...taskFiles,...requirementFiles];
      setWork({kind:"save",phase:2,
        detail:toUpload.length?"Preparando envio seguro dos anexos.":"Nenhum arquivo adicional para anexar.",
        current:0,total:toUpload.length});
      for(const [index,item] of toUpload.entries()){
        setWork({kind:"save",phase:2,detail:"Enviando "+item.file.name,
          current:index+1,total:toUpload.length});
        try{await registerRequirementFile(created.id,userId,item);}
        catch(reason){warnings.push("Arquivo "+item.file.name+": "+(reason as Error).message);}
      }
      setWork({kind:"save",phase:3,detail:selected.length
        ?"Salvando "+selected.length+" caso(s) de teste como não executados."
        :"Concluindo a TF sem casos de teste."});
      if(selected.length){
        try{await addExtractedScenarios(created.id,userId,selected);}
        catch(reason){warnings.push("Casos de teste: "+(reason as Error).message);}
      }
      if(remember)discardNewTaskDraft(userId);
      await onCreated(created.id,warnings.join(" | "));
    }catch(reason){setError(reason instanceof Error?reason.message:"Não foi possível salvar a TF.");}
    finally{setFinishing(false);setWork(null);}
  }

  const totalSelected=cases.filter(item=>item.selected).length;
  const caseHeadingsReceived=(streamText.match(/^##\s+Cen[áa]rio\b/gim)||[]).length;
  const canResumeCases=step===3&&casePending>0&&caseSourceKey.current===caseInputKey;
  // BUILD is a default choice, not a field identified by the AI.
  const filledFields=Object.entries(draft)
    .filter(([name,value])=>name!=="tipo_teste"&&typeof value==="string"&&value.trim()).length;
  const missingFields=([
    ["descricao","Descrição do problema"],
    ["explicacao","Como funciona"],
    ["causa","Causa identificada"],
    ["correcao","Correção realizada"],
    ["conclusao","Conclusão"]
  ] as const).filter(([key])=>!draft[key]?.trim()).map(([,label])=>label);
  const taskContextLength=combine("",sourceText,taskFiles).length;
  const fullTaskReview=Object.entries(draft)
    .filter(([,value])=>Boolean(value?.trim()))
    .map(([name,value])=>name.replaceAll("_"," ")+": "+value).join("\n\n");
  const filePicker=(requirement:boolean)=>(
    <div className="qa-wizard-attachments">
      <label className="qa-wizard-attach-button">
        <Paperclip size={16} aria-hidden="true"/>
        {requirement?"Anexar requisito":"Adicionar arquivos"}
        <input type="file" multiple accept=".txt,.md,.pdf,.docx"
          disabled={busy} aria-label={requirement?"Anexar arquivos de requisito":"Adicionar arquivos da tarefa"}
          onChange={event=>{
            void addFiles(event.currentTarget.files,requirement);
            event.currentTarget.value="";
          }}/>
      </label>
      <div className="qa-wizard-file-list">
        {(requirement?requirementFiles:taskFiles).map(item=><div className="qa-wizard-file" key={item.hash}>
          <FileText size={16}/>
          <div><strong>{item.file.name}</strong><small>{item.text.length.toLocaleString("pt-BR")} caracteres extraídos
            {item.warning?" · "+item.warning:""}</small></div>
          <button type="button" disabled={busy} aria-label={"Remover "+item.file.name}
            onClick={()=>{
              if(requirement){setRequirementFiles(files=>files.filter(x=>x.hash!==item.hash));setConsentCases(false);}
              else{setTaskFiles(files=>files.filter(x=>x.hash!==item.hash));invalidateSource();}
            }}><Trash2 size={16}/></button>
        </div>)}
      </div>
    </div>
  );
  const field=(name:keyof TaskDraft,label:string,long=false)=><label className="field" key={name}>
    {label}
    {long?<textarea aria-label={label} rows={name==="descricao"?4:3}
      value={draft[name]||""} maxLength={30000} disabled={busy}
      onChange={event=>update(name,event.target.value)}/>:
      <input aria-label={label} value={draft[name]||""} disabled={busy}
        inputMode={name==="versao"?"numeric":undefined}
        maxLength={name==="versao"?13:undefined}
        placeholder={name==="versao"?"00.00.00.0000":undefined}
        onChange={event=>update(name,event.target.value)}
        onBlur={name==="versao"?()=>update(name,normalizeTaskVersion(draft.versao)):undefined}/>}
    {draftErrors[name]&&<small className="text-error" role="alert">{draftErrors[name]}</small>}
  </label>;

  return <QAModal open={open} size="lg" title={"Nova TF — etapa "+step+" de 3"}
    eyebrow="CRIAÇÃO DE TAREFA"
    description={step===1?"Cole a tarefa e anexe os documentos de apoio.":
      step===2?"Revise os dados identificados antes de avançar.":
        "Gere casos para a maior cobertura possível ou finalize sem casos."}
    initialFocus={step===1?"#qa-wizard-source":step===2?"#qa-wizard-title":"#qa-wizard-requirement"}
    busy={busy} onClose={close}>
    <div ref={stepperRef} className="qa-wizard-progress" role="group" aria-label="Etapas da criação">
      {["Conteúdo","Dados da TF","Casos de teste"].map((title,index)=>
        <span key={title} className={step===index+1?"is-current":step>index+1?"is-done":""}
          aria-current={step===index+1?"step":undefined}>
          <b>{step>index+1?<Check size={14} aria-hidden="true"/>:index+1}</b>
          <span>{title}</span>
        </span>)}
    </div>
    <div className="qa-wizard-save-hint"><ShieldCheck size={15} aria-hidden="true"/>
      A TF será salva somente após a finalização.
    </div>
    {work&&<section className="qa-wizard-work" data-process={work.kind}>
      <div className="qa-wizard-work-heading">
        <span className="qa-wizard-work-icon"><LoaderCircle aria-hidden="true" size={20}/></span>
        <div role="status" aria-live="polite" aria-atomic="true">
          <strong>{WORK_LABELS[work.kind]}</strong>
          <p>{work.detail}</p>
        </div>
        {(work.kind==="cases"||work.kind==="task")&&<button type="button" className="qa-wizard-work-cancel"
          onClick={()=>controller.current?.abort()}>Cancelar</button>}
      </div>
      <AiQuotaWait state={quotaWait} onCancel={()=>controller.current?.abort()}/>
      {work.kind==="task"&&<AiBusyStatus
        title={work.phase===1?"NVIDIA: extraindo campos":
          work.phase===2?"NVIDIA: processando cenários por lotes":"NVIDIA: preparando revisão"}
        detail="Acompanhe o progresso. Se uma etapa falhar, o documento e os lotes concluídos continuam disponíveis."/>}
      <div className="qa-wizard-activity-track" aria-hidden="true"><span/></div>
      <ol className="qa-wizard-work-steps" aria-label="Etapas do processamento">
        {WORK_STEPS[work.kind].map((label,index)=><li key={label}
          className={index<work.phase?"is-complete":index===work.phase?"is-active":""}>
          {index<work.phase?<CheckCircle2 size={15} aria-hidden="true"/>:
            index===work.phase?<LoaderCircle size={15} aria-hidden="true"/>:
              <span className="qa-wizard-work-dot" aria-hidden="true"/>}
          <span>{label}</span>
        </li>)}
      </ol>
      {work.total!==undefined&&work.total>0&&
        <p className="qa-wizard-work-metric">
          {work.kind==="task"?(work.phase===1?"Extração de campos":"Lotes de cenários"):
            work.kind==="cases"?"Etapas da geração":
            (work.kind==="files"?"Lendo":"Registrando")+" arquivo"+(work.total>1?"s":"")} ·
          {" "+Math.min(work.current??0,work.total)+" de "+work.total}
        </p>}
      {work.kind==="cases"&&streamText.length>0&&<p className="qa-wizard-work-metric">
        {streamText.length.toLocaleString("pt-BR")} caracteres recebidos
        {caseHeadingsReceived>0?" · "+caseHeadingsReceived+" cenário(s) encontrados no texto recebido":""}
      </p>}
    </section>}
    {error&&<ToastNotice message={error} tone="error"/>}
    {step===1&&<section className="qa-wizard-step stack">
      <div className="qa-wizard-section-intro">
        <span className="qa-wizard-section-mark"><FileText size={18} aria-hidden="true"/></span>
        <div><span className="qa-wizard-kicker">01 · ORIGEM</span>
          <h3 id="qa-wizard-stage-heading" tabIndex={-1}>Conteúdo da tarefa</h3>
          <p>Cole o chamado completo e adicione os documentos que a IA deve considerar.</p>
        </div>
      </div>
      <div className="qa-wizard-source-panel">
        <label className="field">Informações da tarefa
          <textarea id="qa-wizard-source" rows={8} disabled={busy}
            value={sourceText} onChange={event=>alterSource(event.target.value)}
            placeholder="Cole o problema, a análise de viabilidade, a correção e demais informações da TF."/>
        </label>
        <div className="qa-wizard-attachment-line">
          {filePicker(false)}
          <p>TXT, MD, PDF ou DOCX · até 10 MB por arquivo</p>
        </div>
      </div>
      {!!taskContextLength&&<p className="qa-wizard-size">
        {taskContextLength.toLocaleString("pt-BR")} caracteres no contexto da tarefa
      </p>}
      {sourcePreparation&&"error" in sourcePreparation&&<p role="alert" className="notice error">{sourcePreparation.error}</p>}
      {sourcePreparation&&"prepared" in sourcePreparation&&sourcePreparation.prepared.needsReview&&
        <SemanticPreparationPanel semantic={semanticTask} authorized={consentTask} disabled={busy}/>}
      {!semanticTask.enabled&&sourcePreparation&&"prepared" in sourcePreparation&&
        <ContextPreparationPanel
          items={[{label:"TF",result:sourcePreparation.prepared,original:sourcePreparation.original}]}
          acknowledged={compactApprovedTask} onAcknowledge={setCompactApprovedTask} disabled={busy}/>}
      <div className="qa-wizard-ai-panel">
        <div className="qa-wizard-ai-panel-title">
          <Sparkles size={17} aria-hidden="true"/>
          <div><strong>Preenchimento inteligente</strong>
            <p>A NVIDIA organiza os campos para você revisar na próxima etapa.</p>
          </div>
        </div>
        <label className="qa-wizard-consent">
          <input type="checkbox" checked={consentTask} disabled={busy||!taskContextLength}
            onChange={event=>setConsentTask(event.target.checked)}/>
          Autorizo enviar o texto colado e o conteúdo extraído dos arquivos à NVIDIA.
        </label>
        <Button className="qa-wizard-primary" isDisabled={busy||!consentTask||
          !taskContextLength||!sourcePreparation||!("prepared" in sourcePreparation)||
          (sourcePreparation.prepared.needsReview&&
            (semanticTask.enabled?!semanticTask.ready:!compactApprovedTask))}
          onPress={()=>void generateTask()}>
          {analyzing?<LoaderCircle size={17} className="qa-wizard-spinner" aria-hidden="true"/>:
            <Sparkles size={17} aria-hidden="true"/>}
          {analyzing?"Analisando tarefa…":taskPending?
  "Retomar análise ("+taskPending+" etapa(s) pendentes)":"Gerar tarefa com IA"}
          {!analyzing&&<ArrowRight size={17} aria-hidden="true"/>}
        </Button>
      </div>
      <div className="qa-wizard-manual">
        <span>ou</span>
        <button type="button" disabled={busy} onClick={continueManual}>Continuar manualmente</button>
      </div>
      {recoverable&&<div className="qa-wizard-recover">
        <strong>Rascunho da sessão anterior</strong>
        <p>Você pode recuperar o texto e os campos guardados nesta aba. Os arquivos devem ser selecionados novamente.</p>
        <Button size="sm" variant="secondary" isDisabled={busy}
          onPress={()=>{
            setSourceText(recoverable.fields.descricao);
            setDraft(current=>({...current,...recoverable.fields,descricao:recoverable.fields.descricao}));
            setRemember(true);setRecoverable(null);setConsentTask(false);
          }}>Recuperar rascunho</Button>
        <Button size="sm" variant="secondary" onPress={()=>{discardNewTaskDraft(userId);setRecoverable(null);}}>
          Descartar
        </Button>
      </div>}
      <label className="qa-wizard-draft">
        <input type="checkbox" checked={remember} onChange={event=>{
          setRemember(event.target.checked);
          if(!event.target.checked)discardNewTaskDraft(userId);
        }}/> Guardar rascunho nesta aba (somente textos, sem arquivos)
      </label>
    </section>}
    {step===2&&<section className="qa-wizard-step stack">
      <div className="qa-wizard-section-intro">
        <span className="qa-wizard-section-mark"><ClipboardList size={18} aria-hidden="true"/></span>
        <div><span className="qa-wizard-kicker">02 · CONFERÊNCIA</span>
          <h3 id="qa-wizard-stage-heading" tabIndex={-1}>Revise os dados da TF</h3>
          <p>Confira e ajuste as informações antes de criar os casos de teste.</p>
        </div>
      </div>
      <div className="qa-wizard-review-indicator">
        <CheckCircle2 size={17} aria-hidden="true"/>
        <span>{aiUsed?(taskPartial?"Análise parcial — confira as pendências":
  localFallback?"Extração local de segurança":"Análise concluída com IA"):"Preenchimento manual"}</span>
        <b>{filledFields} campo(s) preenchido(s)</b>
      </div>
      <TaskFieldEvidenceReview fields={fieldEvidence}
        confirmed={fieldEvidenceApproved}
        disabled={busy}
        onConfirm={(field,checked)=>setFieldEvidenceApproved(old=>({...old,[field]:checked}))}
        onApply={(field,value)=>{
          update(field as keyof TaskDraft,value);
          delete automaticallyFilled.current[field as keyof TaskDraft];
          setFieldEvidenceApproved(old=>({...old,[field]:false}));
        }}/>
      {aiUsed&&<div className="qa-wizard-ai-review">
        <div>
          <strong>{missingFields.length?
            "Confira os campos não identificados":"Campos principais identificados"}</strong>
          <p>{missingFields.length?
            "Sem informações confirmadas para: "+missingFields.join(", ")+
            ". Revise o texto ou preencha manualmente; a IA não deve inventar dados.":
            "Confira o resultado antes de avançar. Você pode analisar novamente sem perder suas edições."}</p>
        </div>
        <Button variant="secondary" isDisabled={busy||!consentTask} onPress={()=>void generateTask()}>
          {analyzing?<LoaderCircle size={16} className="qa-wizard-spinner" aria-hidden="true"/>:
            <Sparkles size={16} aria-hidden="true"/>}
          {analyzing?"Analisando…":taskPending?
  "Retomar "+taskPending+" etapa(s) pendentes":"Analisar novamente"}
        </Button>
      </div>}
      <div className="qa-wizard-fields-panel">
        <h4>Identificação</h4>
        <div className="qa-wizard-form-grid">
        <label className="field" style={{gridColumn:"1/-1"}}>Título da tarefa
          <input id="qa-wizard-title" value={draft.titulo} maxLength={240}
            disabled={busy} onChange={event=>update("titulo",event.target.value)}/>
          {draftErrors.titulo&&<small role="alert" className="text-error">{draftErrors.titulo}</small>}
        </label>
        {field("codigo","Código da TF")}
        <label className="field">Tipo de teste
          <select value={draft.tipo_teste} disabled={busy}
            onChange={event=>{
            setDraft(current=>({...current,tipo_teste:event.target.value as "BUILD"|"RELEASE"}));
            setConsentCases(false);
          }}>
            <option value="BUILD">BUILD</option><option value="RELEASE">RELEASE</option>
          </select>
        </label>
        {field("versao","Versão")}
        {field("sistema","Sistema / módulo")}
        </div>
      </div>
      <div className="qa-wizard-fields-panel">
        <h4>Descrição do problema</h4>
        {field("descricao","Resumo do problema / descrição",true)}
      </div>
      <details className="qa-wizard-more" key={aiUsed?"ai":"manual"} open={aiUsed}>
        <summary>Análise técnica e demais informações {aiUsed?"· revisar dados da IA":""}</summary>
        <div className="stack mt-3">
          {field("explicacao","Como funciona",true)}
          {field("causa","Causa identificada",true)}
          {field("correcao","Correção realizada",true)}
          {field("conclusao","Conclusão",true)}
          <div className="qa-wizard-form-grid">
            {field("ambiente","Ambiente")}
            {field("base_teste","Base de teste")}
            {field("empresa","Empresa")}
            {field("testador","Testador")}
          </div>
          {field("observacoes","Observações",true)}
        </div>
      </details>
      <div className="qa-wizard-actions">
        <Button variant="secondary" isDisabled={busy} onPress={()=>{setStep(1);setError("");}}>
          <ArrowLeft size={16}/> Voltar
        </Button>
        <Button isDisabled={busy} onPress={nextStep}>Avançar <ArrowRight size={17}/></Button>
      </div>
    </section>}
    {step===3&&<section className="qa-wizard-step stack">
      <div className="qa-wizard-section-intro">
        <span className="qa-wizard-section-mark"><FileCheck2 size={18} aria-hidden="true"/></span>
        <div><span className="qa-wizard-kicker">03 · COBERTURA</span>
          <h3 id="qa-wizard-stage-heading" tabIndex={-1}>
            {caseReview?"Revisar casos sugeridos":"Gerar casos de teste"}</h3>
          <p>{caseReview
            ?"Confira o que a IA criou, ajuste e selecione os casos antes de gravar."
            :"Gere casos fundamentados na TF e nos requisitos, sem repetir cenários."}</p>
        </div>
      </div>
      {canResumeCases&&!generating&&<div className="qa-wizard-existing" role="status">
        <FileText size={16} aria-hidden="true"/>
        <span>{caseHeadingsReceived} cenário(s) identificados no texto recebido.
          {casePending} etapa(s) pendentes. Os casos recuperados exigem revisão.</span>
        <Button variant="secondary" isDisabled={busy||!consentCases}
          onPress={()=>void generateCases()}>Retomar geração</Button>
      </div>}
      <AiStepFlow step={finishing?"finalize":generating?"processing":caseReview?"review":"prepare"}
        label="Etapas da geração de casos para uma nova TF"
        labels={["Configurar e gerar","Revisar casos","Finalizar TF"]}/>
      {!generating&&!caseReview&&<>
      <div className="qa-wizard-task-summary">
        <strong>{draft.titulo}</strong>
        <span>{draft.codigo?draft.codigo+" · ":""}{draft.tipo_teste}
          {draft.versao?" · v"+draft.versao:""}{draft.sistema?" · "+draft.sistema:""}</span>
        <p>{draft.descricao||"Sem resumo informado."}</p>
        <details><summary>Conferir todos os dados da tarefa</summary>
          <pre>{fullTaskReview}</pre>
        </details>
      </div>
      {cases.length>0&&<p className="qa-wizard-existing">
        <FileText size={16}/> {cases.length} cenário(s) já identificado(s) na tarefa.
        A geração buscará novos casos sem repetir os existentes.
      </p>}
      <div className="qa-wizard-source-panel">
        <label className="field">Requisitos e critérios de aceite (opcional)
          <textarea id="qa-wizard-requirement" rows={5} maxLength={250000}
            value={requirementText} disabled={busy}
            onChange={event=>{setRequirementText(event.target.value);setConsentCases(false);}}
            placeholder="Cole os requisitos funcionais, regras de negócio, exceções e critérios de aceite."/>
        </label>
        <div className="qa-wizard-attachment-line">
          {filePicker(true)}
          <p>Anexe PDFs, DOCX, TXT ou MD com regras complementares.</p>
        </div>
      </div>
      {casePreparation&&"error" in casePreparation&&<p role="alert" className="notice error">{casePreparation.error}</p>}
      {casePreparation&&"prepared" in casePreparation&&
        (casePreparation.prepared.task.needsReview||casePreparation.prepared.requirements?.needsReview)&&
        <SemanticPreparationPanel semantic={semanticCases} authorized={consentCases} disabled={busy}/>}
      {!semanticCases.enabled&&casePreparation&&"prepared" in casePreparation&&<ContextPreparationPanel
        items={[
          {label:"TF",result:casePreparation.prepared.task,original:casePreparation.originalTask},
          ...(casePreparation.prepared.requirements?[{label:"Requisitos",
            result:casePreparation.prepared.requirements,original:casePreparation.originalRequirements}]:[])
        ]}
        acknowledged={compactApprovedCases} onAcknowledge={setCompactApprovedCases} disabled={busy}/>}
      <div className="qa-wizard-ai-panel">
        <div className="qa-wizard-ai-panel-title">
          <Sparkles size={17} aria-hidden="true"/>
          <div><strong>Cobertura sugerida pela IA</strong>
            <p>Fluxos positivos, negativos, alternativos e regressões quando previstos nos documentos.</p>
          </div>
        </div>
        <label className="qa-wizard-consent">
          <input type="checkbox" checked={consentCases} disabled={busy}
            onChange={event=>setConsentCases(event.target.checked)}/>
          Autorizo enviar o contexto da TF e os requisitos à NVIDIA para gerar casos.
        </label>
        <Button className="qa-wizard-primary" isDisabled={busy||!consentCases||
          !casePreparation||!("prepared" in casePreparation)||
          ((casePreparation.prepared.task.needsReview||
            casePreparation.prepared.requirements?.needsReview)&&
            (semanticCases.enabled?!semanticCases.ready:!compactApprovedCases))}
          onPress={()=>void generateCases()}>
          {generating?<LoaderCircle size={17} className="qa-wizard-spinner" aria-hidden="true"/>:
            <Sparkles size={17} aria-hidden="true"/>}
          {generating?"Gerando casos…":
            cases.length?"Ampliar cobertura com IA":"Gerar casos de teste com IA"}
        </Button>
      </div>
      </>}
      <TaskScenarioEvidenceReview rows={scenarioEvidence}/>
      {caseReview&&cases.length>0&&<div className="qa-wizard-case-review">
        <div className="qa-wizard-case-head">
          <strong>{totalSelected} de {cases.length} casos selecionados</strong>
          <div>
            <button type="button" disabled={busy} onClick={()=>setCases(current=>current.map(x=>({...x,selected:true})))}>
              Selecionar todos
            </button>
            <button type="button" disabled={busy} onClick={()=>setCases(current=>current.map(x=>({...x,selected:false})))}>
              Limpar seleção
            </button>
          </div>
        </div>
        <div className="qa-wizard-cases">
          {cases.map((item,index)=><article className="qa-wizard-case" key={index}>
            <label>
              <input type="checkbox" checked={item.selected} disabled={busy}
                onChange={event=>editCase(index,{selected:event.target.checked})}/>
              <strong>{index+1}. {item.titulo}</strong>
            </label>
            <p>{item.esperado.slice(0,220)}</p>
            <details>
              <summary>Revisar e editar</summary>
              <label className="field">Título<input value={item.titulo} maxLength={240}
                disabled={busy} onChange={event=>editCase(index,{titulo:event.target.value})}/></label>
              <label className="field">Passos<textarea rows={4} maxLength={20000}
                disabled={busy} value={item.passos}
                onChange={event=>editCase(index,{passos:event.target.value})}/></label>
              <label className="field">Resultado esperado<textarea rows={3} maxLength={20000}
                disabled={busy} value={item.esperado}
                onChange={event=>editCase(index,{esperado:event.target.value})}/></label>
              <label className="field">Objetivo e observações<textarea rows={3} maxLength={20000}
                disabled={busy} value={item.observacoes}
                onChange={event=>editCase(index,{observacoes:event.target.value})}/></label>
            </details>
          </article>)}
        </div>
      </div>}
      {!generating&&<div className="qa-wizard-actions">
        <Button variant="secondary" isDisabled={busy}
          onPress={()=>{if(caseReview)setCaseReview(false);else setStep(2);setError("");}}>
          <ArrowLeft size={16}/> {caseReview?"Voltar à geração":"Voltar"}
        </Button>
        <button type="button" className="qa-wizard-skip" disabled={busy}
          onClick={()=>void finish(false)}>Finalizar sem casos</button>
        {!caseReview&&cases.length>0&&<Button isDisabled={busy}
          onPress={()=>{setCaseReview(true);setError("");}}>
          <ArrowRight size={17}/> Revisar {cases.length} caso(s)
        </Button>}
        {caseReview&&<Button isDisabled={busy||totalSelected===0}
          onPress={()=>void finish(true)}>
          <Plus size={17}/>{finishing?"Salvando TF…":"Finalizar com "+totalSelected+" caso(s)"}
        </Button>}
      </div>}
    </section>}
    {notice&&<ToastNotice message={notice} tone="info"/>}
  </QAModal>;
}
