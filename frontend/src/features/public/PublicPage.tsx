import {BrandLogo} from "../../components/ui/BrandLogo";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useSearch } from "@tanstack/react-router";
import { ArrowLeft, BookOpenText, ExternalLink, Eye, Search, ShieldCheck } from "lucide-react";
import { Button } from "@heroui/react";
import { z } from "zod";
import { listPublishedTasks, loadPublishedTask, publicEvidenceImageUrl } from "./public-data";
import {QAModal} from "../../components/ui/QAModal";
import {DiagramViewer} from "../diagrams/DiagramViewer";
import {PublicResources} from "./PublicResources";
import {docTypes,listDocumentation} from "../documentation/documentation-data";
import type { PublicDiagram, PublicTaskDetail } from "./public-data";

const facts: Array<[keyof PublicTaskDetail, string]> = [
  ["codigo", "Código"], ["tipo_teste", "Tipo"], ["status", "Situação"],
  ["sistema", "Sistema"], ["versao", "Versão"],
  ["descricao", "O que foi testado"], ["explicacao", "Como funciona"],
  ["causa", "Problema e causa"], ["correcao", "O que foi alterado"],
  ["conclusao", "Conclusão"], ["observacoes", "Observações"]
];
const fields = (values: Array<[string, string]>) => values
  .filter(([, value]) => value.trim())
  .map(([label, value]) => <div key={label} className="public-react-fact">
    <strong>{label}</strong><p>{value}</p>
  </div>);

function MermaidPublicPreview({ diagram }: { diagram: PublicDiagram }) {
  const [svg, setSvg] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(false);
  async function render() {
    if (busy) return;
    setExpanded(true);
    if (svg) { setExpanded(true); return; }
    if (diagram.conteudo.length > 16000) {
      setError("Diagrama excede o tamanho permitido."); return;
    }
    setBusy(true); setError("");
    try {
      const { default: mermaid } = await import("mermaid");
      mermaid.initialize({
        startOnLoad: false, securityLevel: "strict", theme: "neutral", maxTextSize: 16000
      });
      await mermaid.parse(diagram.conteudo);
      const result = await mermaid.render("qa-public-" +
        crypto.randomUUID().replaceAll("-", ""), diagram.conteudo);
      setSvg(result.svg);
    } catch {
      setError("O diagrama publicado não pôde ser renderizado.");
    } finally { setBusy(false); }
  }
  return <article className="requirement-row">
    <div className="section-heading">
      <strong>{diagram.titulo}</strong>
      <Button size="sm" variant="secondary" aria-disabled={busy} onPress={() => void render()}>
        <Eye size={15} /> {busy ? "Renderizando…" : "Visualizar"}
      </Button>
    </div>
    {expanded && <QAModal open title={"Visualizar diagrama — "+diagram.titulo}
      size="full" onClose={()=>setExpanded(false)}>
        {busy&&<p role="status">Preparando diagrama…</p>}
        {error&&<div role="alert" className="notice error">{error}
          <Button variant="secondary" onPress={()=>void render()}>Tentar novamente</Button></div>}
        {svg&&<DiagramViewer svg={svg} title={diagram.titulo}/>}
        <details className="generator-context">
          <summary>Consultar texto do diagrama</summary>
          <pre className="diagram-source">{diagram.conteudo}</pre>
        </details>
    </QAModal>}
  </article>;
}

export default function PublicPage() {
  const { tf } = useSearch({ from: "/publicas" });
  const [search, setSearch] = useState("");
  const chosen = tf && z.uuid().safeParse(tf).success ? tf : null;
  const list = useQuery({
    queryKey: ["public-tasks"], queryFn: listPublishedTasks, enabled: !tf
  });
  const publicDocs=useQuery({queryKey:["public-documentations"],queryFn:()=>listDocumentation('public'),enabled:!tf});
  const detail = useQuery({
    queryKey: ["public-task", chosen], queryFn: () => loadPublishedTask(chosen!),
    staleTime:0, refetchOnMount:"always", refetchOnWindowFocus:"always",
    enabled: Boolean(chosen)
  });
  const results = (list.data ?? []).filter((task) => {
    const needle = search.trim().toLocaleLowerCase("pt-BR");
    return !needle || [task.titulo, task.codigo, task.sistema, task.versao]
      .some((value) => (value ?? "").toLocaleLowerCase("pt-BR").includes(needle));
  });

  return <div className="public-react-shell">
    <button type="button" className="skip-link"
      onClick={() => document.getElementById("public-content")?.focus()}>
      Pular para o conteúdo
    </button>
    <header className="public-react-header">
      <Link to="/publicas" search={{}} className="brand">
        <BrandLogo/>
        <span><strong>QA Hub</strong><small>BIBLIOTECA PÚBLICA</small></span>
      </Link>
      <div className="qa-public-header-links">
       <Link to="/documentacoes" search={{}} className="secondary-link"><BookOpenText size={16}/> Documentações públicas</Link>
       <Link to="/" className="secondary-link"><ExternalLink size={16} /> Entrar no QA Hub</Link>
      </div>
    </header>
    <main id="public-content" tabIndex={-1} className="public-react-main">
      {!tf && <>
        <div className="page-heading">
          <div><p className="eyebrow">ACESSO SEM LOGIN</p>
            <h1>TFs públicas</h1>
            <p className="text-muted">Somente tarefas que os autores escolheram publicar.</p>
          </div>
          <span className="public-react-readonly"><ShieldCheck size={16} /> Somente leitura</span>
        </div>
        <label className="field">Pesquisar por código, título, sistema ou versão
          <span className="public-react-search">
            <Search size={18}/><input type="search" value={search}
              placeholder="Buscar tarefas públicas…" onChange={(e) => setSearch(e.target.value)} />
          </span>
        </label>
        {list.isPending && <p role="status" className="notice mt-4">Carregando biblioteca pública…</p>}
        {list.isError && <p role="alert" className="notice error mt-4">{list.error.message}</p>}
        {list.isSuccess && <p role="status" className="text-muted mt-4">{results.length} TF(s) públicas</p>}
        {list.isSuccess && !results.length &&
          <p className="panel mt-4">Nenhuma TF pública encontrada.</p>}
        <div className="public-react-list mt-4">
          {results.map((task) => <Link key={task.id} to="/publicas"
            search={{ tf: task.id }} className="task-row">
            <span className="task-initial">{(task.codigo || "TF").slice(0,3).toUpperCase()}</span>
            <span className="task-text"><strong>{task.titulo}</strong>
              <small>{task.codigo || "Sem código"} · {task.sistema || "Módulo não informado"} · {task.tipo_teste}</small>
            </span><span className="public-react-readonly">Pública</span>
          </Link>)}
        </div>
        <section className="qa-public-documents mt-5" aria-label="Documentações públicas">
          <div className="section-heading">
           <div><p className="eyebrow">CONHECIMENTO COMPARTILHADO</p><h2>Documentações públicas</h2>
            <p className="text-muted">Manuais, SQL, procedimentos e arquivos disponíveis sem login.</p>
           </div>
           <Link to="/documentacoes" search={{}} className="secondary-link">Ver biblioteca completa</Link>
          </div>
          {publicDocs.isPending&&<p role="status">Carregando documentações públicas…</p>}
          {publicDocs.isError&&<p role="alert" className="notice error">{publicDocs.error.message}</p>}
          {publicDocs.isSuccess&&!publicDocs.data.length&&<p className="text-muted">Ainda não há documentações públicas.</p>}
          <div className="public-react-list mt-4">
           {publicDocs.data?.slice(0,8).map(doc=><Link key={doc.id} to="/documentacoes"
             search={{doc:doc.id}} className="task-row">
             <span className="task-initial"><BookOpenText size={20} aria-hidden="true"/></span>
             <span className="task-text"><strong>{doc.titulo}</strong>
              <small>{docTypes[doc.tipo_documentacao]??'Documento'} · {new Date(doc.updated_at??doc.created_at).toLocaleDateString('pt-BR')}</small>
             </span><span className="public-react-readonly">Pública</span>
           </Link>)}
          </div>
        </section>
      </>}
      {tf && <>
        <Link to="/publicas" search={{}} className="back-link">
          <ArrowLeft size={16} /> Todas as TFs públicas
        </Link>
        {!chosen && <p role="alert" className="notice error mt-4">Link de TF inválido.</p>}
        {chosen && detail.isPending && <p role="status" className="notice mt-4">Carregando TF pública…</p>}
        {chosen && detail.isError && <p role="alert" className="notice error mt-4">{detail.error.message}</p>}
        {chosen && detail.isSuccess && !detail.data &&
          <p role="alert" className="notice error mt-4">Esta TF não é pública ou não existe.</p>}
        {detail.data && <div className="stack mt-4">
          <div className="page-heading">
            <div><p className="eyebrow">TF PÚBLICA · SOMENTE LEITURA</p>
              <h1>{detail.data.task.titulo}</h1>
              <p className="text-muted">
                {detail.data.task.codigo || "TF"} · {detail.data.task.sistema || "Sem módulo"}
              </p>
            </div>
          </div>
            <div className="qa-public-test-summary" role="group" aria-label="Resumo dos resultados publicados">
              {([
                ["aprovado","Aprovados"],["reprovado","Reprovados"],
                ["bloqueado","Bloqueados"],["nao_executado","Pendentes"]
              ] as const).map(([status,label])=>
                <span key={status} className={"qa-public-test-count "+status}>
                  <strong>{detail.data!.scenarios.filter(s=>s.status===status).length}</strong>
                  {label}
                </span>)}
            </div>
          <section className="panel" aria-labelledby="public-summary">
            <h2 id="public-summary" className="font-semibold">Resumo</h2>
            <div className="public-react-facts mt-4">
              {fields(facts.map(([key, label]): [string, string] => [label, key==="status" ? ({em_teste:"Em teste",rascunho:"Rascunho",concluida:"Concluída",finalizada:"Finalizada"} as Record<string,string>)[String(detail.data!.task[key])]||String(detail.data!.task[key]??"") : String(detail.data!.task[key] ?? "")]))}
            </div>
          </section>
          <section className="panel" aria-labelledby="public-scenarios">
            <h2 id="public-scenarios" className="font-semibold">Cenários de teste</h2>
            {detail.data.scenarios.length === 0 &&
              <p className="text-muted mt-3">Nenhum cenário publicado.</p>}
            <div className="stack mt-4">
              {detail.data.scenarios.map((scenario, index) => <article className="requirement-row" key={scenario.id}>
                <div className="qa-public-scenario-heading">
                  <h3 className="font-semibold">{index+1}. {scenario.titulo}</h3>
                  <span className={"status-chip "+(scenario.status||"nao_executado")}>
                    {({
                      aprovado:"Aprovado",reprovado:"Reprovado",
                      bloqueado:"Bloqueado",nao_executado:"Não executado"
                    } as Record<string,string>)[scenario.status||""]||"Situação não informada"}
                  </span>
                </div>
                <div className="public-react-facts mt-3">
                  {fields([
                    ["Passos", scenario.passos ?? ""],
                    ["Resultado esperado", scenario.esperado ?? ""],
                    ["Resultado observado", scenario.obtido ?? ""],
                    ["Observações", scenario.observacoes ?? ""]
                  ])}
                </div>
                {detail.data!.evidencias.filter(file=>file.cenario_id===scenario.id&&file.mime_type.startsWith("image/")).length>0&&
                  <div className="qa-public-case-images" aria-label={"Capturas publicadas de "+scenario.titulo}>
                    <h4>Capturas do teste</h4>
                    <div className="qa-public-case-gallery">
                      {detail.data!.evidencias.filter(file=>file.cenario_id===scenario.id&&file.mime_type.startsWith("image/"))
                        .map(file=><figure key={file.id}>
                          <a href={publicEvidenceImageUrl(file.id)} target="_blank"
                            rel="noopener noreferrer" aria-label={"Ampliar "+file.nome_original}>
                            <img loading="lazy" referrerPolicy="no-referrer"
                              src={publicEvidenceImageUrl(file.id)}
                              alt={file.descricao||"Evidência: "+file.nome_original}/>
                          </a>
                          <figcaption>{file.descricao||file.nome_original}</figcaption>
                        </figure>)}
                    </div>
                  </div>}
              </article>)}
            </div>
          </section>
          <PublicResources detail={detail.data}/>
          <section className="panel" aria-labelledby="public-diagrams">
            <h2 id="public-diagrams" className="font-semibold">Diagramas</h2>
            {detail.data.diagrams.length === 0 &&
              <p className="text-muted mt-3">Nenhum diagrama publicado.</p>}
            <div className="stack mt-4">
              {detail.data.diagrams.map((diagram) => <MermaidPublicPreview
                diagram={diagram} key={diagram.id}/>)}
            </div>
          </section>
        </div>}
      </>}
    </main>
  </div>;
}
