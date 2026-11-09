import { useEffect, useRef, useState } from "react";
import { Button } from "@heroui/react";
import { ArrowLeft, ArrowRight, FileText, Paperclip, Plus, Sparkles, Trash2 } from "lucide-react";
import { QAModal } from "../../components/ui/QAModal";
import { ToastNotice } from "../../components/ui/Toasts";
import { createTask, addExtractedScenarios } from "../../lib/data";
import { taskDraftSchema, scenarioDraftSchema } from "../../lib/contracts";
import type { TaskDraft } from "../../lib/contracts";
import { extractLocalDraft, normalizeDraft } from "../../lib/legacy/qa-assistant.mjs";
import { taskToGeneratorText, parseGeneratedCases } from "../../lib/legacy/qa-workspace.mjs";
import { sanitizeAiContext } from "../../lib/legacy/qa-test-context.mjs";
import {
  archiveTaskAiSource, freshTaskAiScenarios, generateTaskAiDraft,
  mergeTaskAiCreation, onlyNewTaskAiSelections, taskAiFieldValues
} from "./task-ai";
import type { SuggestedScenario } from "./task-ai";
import { generateWithNvidia } from "../generators/stream";
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
const TASK_LIMIT = 20000;
const CASE_TASK_LIMIT = 30000;
const REQUIREMENT_LIMIT = 20000;
const MAX_FILES = 6;

type Props = {
  open: boolean;
  userId: string;
  onClose: () => void;
  onCreated: (id: string, warning: string) => Promise<void>;
};

function combine(label: string, pasted: string, files: PreparedFile[]): string {
  return [
    pasted.trim() ? label + ":\n" + pasted.trim() : "",
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
function validateContext(text: string, limit: number, name: string) {
  if(!text.trim()) throw Error("Informe " + name + " antes de gerar.");
  if(text.length > limit) throw Error(
    name + " possui " + text.length.toLocaleString("pt-BR") + " caracteres. " +
    "O limite desta geração é " + limit.toLocaleString("pt-BR") +
    ". Remova ou divida os documentos; o sistema não descarta trechos silenciosamente."
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
  const [sourceText,setSourceText] = useState("");
  const [taskFiles,setTaskFiles] = useState<PreparedFile[]>([]);
  const [requirementText,setRequirementText] = useState("");
  const [requirementFiles,setRequirementFiles] = useState<PreparedFile[]>([]);
  const [draft,setDraft] = useState<TaskDraft>(blank);
  const [cases,setCases] = useState<SuggestedScenario[]>([]);
  const [consentTask,setConsentTask] = useState(false);
  const [consentCases,setConsentCases] = useState(false);
  const [aiUsed,setAiUsed] = useState(false);
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
  const controller=useRef<AbortController|null>(null);
  const wasOpen=useRef(false);
  const automaticallyFilled=useRef<Partial<TaskDraft>>({});
  const busy=reading||analyzing||generating||finishing;

  useEffect(()=>{
    if(open && !wasOpen.current) setRecoverable(loadNewTaskDraft(userId));
    if(!open && wasOpen.current) {
      controller.current?.abort();
      setStep(1);setSourceText("");setTaskFiles([]);setRequirementFiles([]);
      setRequirementText("");setDraft(blank());setCases([]);
      setConsentTask(false);setConsentCases(false);setAiUsed(false);
      setError("");setNotice("");setDraftErrors({});setStreamText("");
      setRemember(false);setRecoverable(null);automaticallyFilled.current={};
    }
    wasOpen.current=open;
  },[open,userId]);

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
    setDraft(current=>({...current,[name]:value}));
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
    setConsentTask(false);setConsentCases(false);setAiUsed(false);setCases([]);
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
    try{
      const prepared:PreparedFile[]=[];
      for(const file of chosen)prepared.push(await prepareRequirementFile(file));
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
    finally{setReading(false);}
  }

  async function generateTask(){
    if(busy||!consentTask)return;
    setAnalyzing(true);setError("");setNotice("");
    const snapshot=combine("TEXTO DA TAREFA",sourceText,taskFiles);
    try{
      assertReadable(taskFiles);
      validateContext(snapshot,TASK_LIMIT,"O texto da tarefa e seus arquivos");
      const response=await generateTaskAiDraft(snapshot);
      if(snapshot!==combine("TEXTO DA TAREFA",sourceText,taskFiles)){
        throw Error("O conteúdo da TF mudou durante a geração. Analise novamente.");
      }
      const initial={...draft,descricao:sourceText};
      const merged=mergeTaskAiCreation(initial,response);
      automaticallyFilled.current=taskAiFieldValues(response);
      setDraft(merged);
      setCases(freshTaskAiScenarios(response,[],true));
      setAiUsed(true);
      setStep(2);
      setNotice("Campos identificados pela NVIDIA. Revise os valores antes de avançar.");
    }catch(reason){setError(reason instanceof Error?reason.message:"Falha ao analisar a TF.");}
    finally{setAnalyzing(false);}
  }
  function continueManual(){
    if(busy)return;
    try{
      const all=combine("TEXTO DA TAREFA",sourceText,taskFiles);
      const extracted=all.trim()?extractLocalDraft(all):null;
      if(extracted){
        const merged=mergeTaskAiCreation({...draft,descricao:sourceText},extracted,{keepDescription:true});
        automaticallyFilled.current={...taskAiFieldValues(extracted),descricao:sourceText};
        setDraft(merged);
        setCases(freshTaskAiScenarios(extracted,[],true));
      }else{
        automaticallyFilled.current={};
        setDraft(current=>({...current,descricao:sourceText}));
      }
    }catch{
      setDraft(current=>({...current,descricao:sourceText}));
    }
    setAiUsed(false);setError("");setNotice("");
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
    setStep(3);
  }
  async function generateCases(){
    if(busy||!consentCases)return;
    setGenerating(true);setError("");setNotice("");setStreamText("");
    const abort=new AbortController();
    controller.current=abort;
    try{
      assertReadable(taskFiles);assertReadable(requirementFiles);
      const fullSource=combine("TEXTO ORIGINAL",sourceText,taskFiles);
      const context=sanitizeAiContext([
        taskToGeneratorText(draft),fullSource,
        cases.length?"CASOS JÁ IDENTIFICADOS (não repetir):\n"+
          cases.map(item=>"- "+item.titulo).join("\n"):""
      ].filter(Boolean).join("\n\n"));
      const requirements=sanitizeAiContext(
        combine("REQUISITOS",requirementText,requirementFiles)
      );
      validateContext(context,CASE_TASK_LIMIT,"O contexto completo da TF");
      if(requirements.length>REQUIREMENT_LIMIT)
        throw Error("Os requisitos excedem 20.000 caracteres. Remova ou divida os arquivos.");
      const response=await generateWithNvidia(
        "teste",context,requirements,chunk=>setStreamText(previous=>previous+chunk),
        abort.signal
      );
      const parsed=parseGeneratedCases(response.text);
      const normalized=normalizeDraft({cenarios:parsed});
      const fresh=freshTaskAiScenarios(normalized,cases,true);
      const combined=addUnique(cases,fresh);
      setCases(combined);
      setNotice(response.truncated
        ? "A resposta da NVIDIA foi interrompida pelo limite do modelo. Confira a lista antes de finalizar."
        : fresh.length
          ? fresh.length+" caso(s) novo(s) identificados. Revise antes de finalizar."
          : "Nenhum caso novo e válido foi encontrado. Revise os requisitos ou tente novamente.");
    }catch(reason){setError(abort.signal.aborted?"Geração cancelada. Os casos anteriores foram preservados.":
      reason instanceof Error?reason.message:"Não foi possível gerar os casos de teste.");}
    finally{setGenerating(false);controller.current=null;}
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
    try{
      // The TF is created once, only at the final step.
      const created=await createTask(userId,checked.data);
      const warnings:string[]=[];
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
      for(const item of [...taskFiles,...requirementFiles]){
        try{await registerRequirementFile(created.id,userId,item);}
        catch(reason){warnings.push("Arquivo "+item.file.name+": "+(reason as Error).message);}
      }
      if(selected.length){
        try{await addExtractedScenarios(created.id,userId,selected);}
        catch(reason){warnings.push("Casos de teste: "+(reason as Error).message);}
      }
      if(remember)discardNewTaskDraft(userId);
      await onCreated(created.id,warnings.join(" | "));
    }catch(reason){setError(reason instanceof Error?reason.message:"Não foi possível salvar a TF.");}
    finally{setFinishing(false);}
  }

  const totalSelected=cases.filter(item=>item.selected).length;
  const taskContextLength=combine("TEXTO DA TAREFA",sourceText,taskFiles).length;
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
    {long?<textarea rows={name==="descricao"?4:3} value={draft[name]||""}
      maxLength={30000} disabled={busy}
      onChange={event=>update(name,event.target.value)}/>:
      <input value={draft[name]||""} disabled={busy}
        onChange={event=>update(name,event.target.value)}/>}
    {draftErrors[name]&&<small className="text-error" role="alert">{draftErrors[name]}</small>}
  </label>;

  return <QAModal open={open} size="lg" title={"Nova TF — etapa "+step+" de 3"}
    eyebrow="CRIAÇÃO DE TAREFA"
    description={step===1?"Cole a tarefa e anexe os documentos de apoio.":
      step===2?"Revise os dados identificados antes de avançar.":
        "Gere casos para a maior cobertura possível ou finalize sem casos."}
    initialFocus={step===1?"#qa-wizard-source":step===2?"#qa-wizard-title":"#qa-wizard-requirement"}
    busy={busy} onClose={close}>
    <div className="qa-wizard-progress" role="group" aria-label="Etapas da criação">
      {["Conteúdo","Dados da TF","Casos de teste"].map((title,index)=>
        <span key={title} className={step===index+1?"is-current":step>index+1?"is-done":""}
          aria-current={step===index+1?"step":undefined}>
          <b>{index+1}</b> {title}
        </span>)}
    </div>
    {step===1&&<section className="qa-wizard-step stack">
      <label className="field">Informações da tarefa
        <textarea id="qa-wizard-source" rows={9} maxLength={30000} disabled={busy}
          value={sourceText} onChange={event=>alterSource(event.target.value)}
          placeholder="Cole aqui o problema, a análise de viabilidade, a correção, os testes realizados e demais informações da TF."/>
      </label>
      {filePicker(false)}
      <p className="text-muted text-sm">TXT, MD, PDF ou DOCX (até 10 MB por arquivo).
        Os arquivos serão registrados de forma privada na TF ao finalizar.</p>
      {!!taskContextLength&&<p className="qa-wizard-size">
        {taskContextLength.toLocaleString("pt-BR")} / {TASK_LIMIT.toLocaleString("pt-BR")} caracteres
        para a análise da NVIDIA
      </p>}
      {taskContextLength>TASK_LIMIT&&<p role="alert" className="text-error text-sm">
        O texto e os arquivos ultrapassam 20.000 caracteres. Remova ou divida os documentos
        para analisar todo o conteúdo, sem perder partes silenciosamente.
      </p>}
      <label className="qa-wizard-consent">
        <input type="checkbox" checked={consentTask} disabled={busy||!taskContextLength}
          onChange={event=>setConsentTask(event.target.checked)}/>
        Autorizo enviar o texto colado e o conteúdo extraído dos arquivos à NVIDIA.
      </label>
      <Button isDisabled={busy||!consentTask||!taskContextLength||taskContextLength>TASK_LIMIT}
        onPress={()=>void generateTask()}>
        <Sparkles size={17}/>{analyzing?"Analisando tarefa…":"Gerar tarefa com IA"}
      </Button>
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
      <div className="qa-wizard-step-heading">
        <strong>{aiUsed?"Campos preenchidos com IA":"Dados preenchidos manualmente"}</strong>
        <p>Você pode editar qualquer campo antes de continuar.</p>
      </div>
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
      {field("descricao","Resumo do problema / descrição",true)}
      <details className="qa-wizard-more" open={false}>
        <summary>Análise técnica e demais informações</summary>
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
      <div className="qa-wizard-task-summary">
        <strong>{draft.titulo}</strong>
        <span>{draft.codigo?draft.codigo+" · ":""}{draft.tipo_teste}
          {draft.versao?" · v"+draft.versao:""}{draft.sistema?" · "+draft.sistema:""}</span>
        <p>{draft.descricao||"Sem resumo informado."}</p>
        <details><summary>Conferir todos os dados da tarefa</summary>
          <pre>{taskToGeneratorText(draft)}</pre>
        </details>
      </div>
      {cases.length>0&&<p className="qa-wizard-existing">
        <FileText size={16}/> {cases.length} cenário(s) já identificado(s) na tarefa.
        A geração buscará novos casos sem repetir os existentes.
      </p>}
      <label className="field">Requisitos e critérios de aceite (opcional)
        <textarea id="qa-wizard-requirement" rows={5} maxLength={20000}
          value={requirementText} disabled={busy}
          onChange={event=>{setRequirementText(event.target.value);setConsentCases(false);}}
          placeholder="Cole os requisitos funcionais, regras de negócio, exceções e critérios de aceite."/>
      </label>
      {filePicker(true)}
      <label className="qa-wizard-consent">
        <input type="checkbox" checked={consentCases} disabled={busy}
          onChange={event=>setConsentCases(event.target.checked)}/>
        Autorizo enviar o contexto da TF e os requisitos à NVIDIA para gerar casos.
      </label>
      <Button variant="secondary" isDisabled={busy||!consentCases}
        onPress={()=>void generateCases()}>
        <Sparkles size={17}/>{generating?"Gerando casos…":
          cases.length?"Ampliar cobertura com IA":"Gerar casos de teste com IA"}
      </Button>
      {generating&&<div role="status" className="qa-wizard-generating">
        A NVIDIA está analisando regras, exceções, fluxos alternativos e regressões…
        {streamText&&<small>Resposta recebida: {streamText.length.toLocaleString("pt-BR")} caracteres</small>}
        <button type="button" onClick={()=>controller.current?.abort()}>Cancelar geração</button>
      </div>}
      {cases.length>0&&<div className="qa-wizard-case-review">
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
      <div className="qa-wizard-actions">
        <Button variant="secondary" isDisabled={busy}
          onPress={()=>{setStep(2);setError("");}}><ArrowLeft size={16}/> Voltar</Button>
        <button type="button" className="qa-wizard-skip" disabled={busy}
          onClick={()=>void finish(false)}>Pular e finalizar sem casos</button>
        <Button isDisabled={busy||totalSelected===0} onPress={()=>void finish(true)}>
          <Plus size={17}/>{finishing?"Salvando TF…":"Finalizar com "+totalSelected+" caso(s)"}
        </Button>
      </div>
    </section>}
    {notice&&<ToastNotice message={notice} tone="info"/>}
    {error&&<ToastNotice message={error} tone="error"/>}
    {busy&&<p className="qa-wizard-busy" role="status">
      {finishing?"Salvando a tarefa, os anexos e os casos de teste…":
        reading?"Lendo documentos localmente…":analyzing?"Interpretando a tarefa com NVIDIA…":
          generating?"Gerando casos de teste…":""}
    </p>}
  </QAModal>;
}
