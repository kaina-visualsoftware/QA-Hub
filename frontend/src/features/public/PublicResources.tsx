import {useState} from "react";
import {Download,Eye} from "lucide-react";
import {QAModal} from "../../components/ui/QAModal";
import {publicAttachmentUrl} from "./public-data";
import type {loadPublishedTask} from "./public-data";

type Detail=NonNullable<Awaited<ReturnType<typeof loadPublishedTask>>>;
export function PublicResources({detail}:{detail:Detail}){
  const [preview,setPreview]=useState<{title:string;text:string}|null>(null);
  return <>
    <section className="panel qa-artifact-browser" aria-labelledby="public-files">
      <header className="qa-artifact-browser-head"><h2 id="public-files">Arquivos e documentos</h2>
        <p>Os anexos acompanham a visibilidade desta TF.</p></header>
      {!detail.evidencias.length&&!detail.sources.length&&!detail.documents.length&&
        <p className="qa-artifact-empty">Nenhum arquivo ou documento anexado.</p>}
      <div className="qa-resource-list">
        {detail.evidencias.map(file=><article className="qa-resource-row" key={file.id}>
          <div className="qa-resource-copy"><strong>{file.nome_original}</strong>
            {file.descricao&&<p>{file.descricao}</p>}</div>
          <div className="qa-resource-actions"><a className="secondary-link"
            href={publicAttachmentUrl(file.id)} target="_blank" rel="noopener noreferrer">
            <Download size={16} aria-hidden="true"/> {file.mime_type.startsWith("image/")?"Abrir imagem":"Baixar arquivo"}
          </a></div>
        </article>)}
        {detail.sources.map(source=><article className="qa-resource-row" key={source.id}>
          <div className="qa-resource-copy"><strong>{source.nome_arquivo||"Texto importado da TF"}</strong>
            <small>Fonte de requisitos · versão {source.versao}</small></div>
          <div className="qa-resource-actions">
            {source.texto_extraido&&<button type="button" onClick={()=>setPreview({
              title:source.nome_arquivo||"Texto importado",text:source.texto_extraido})}>
              <Eye size={16} aria-hidden="true"/> Visualizar texto</button>}
            {source.tipo_fonte==="arquivo"&&<a className="secondary-link" target="_blank" rel="noopener noreferrer"
              href={publicAttachmentUrl(source.id,"source")}><Download size={16} aria-hidden="true"/> Baixar original</a>}
          </div>
        </article>)}
        {detail.documents.map(document=><article className="qa-resource-row" key={document.id}>
          <div className="qa-resource-copy"><strong>{document.titulo}</strong>
            <small>{document.tipo==="post"?"Post":"Relatório"} · versão {document.versao}</small></div>
          <div className="qa-resource-actions"><button type="button" onClick={()=>setPreview({
            title:document.titulo,text:document.conteudo})}><Eye size={16} aria-hidden="true"/> Visualizar</button></div>
        </article>)}
      </div>
    </section>
    <section className="panel" aria-labelledby="public-requirements">
      <h2 id="public-requirements">Requisitos e cobertura</h2>
      {!detail.requirements.length&&<p className="qa-artifact-empty">Nenhum requisito registrado.</p>}
      <div className="qa-resource-list">{detail.requirements.map(item=><article className="qa-resource-row" key={item.id}>
        <div className="qa-resource-copy"><strong>{item.codigo} · {item.titulo}</strong>
          <small>{item.estado} · {detail.coverage.filter(link=>link.requisito_id===item.id).length} cenário(s) vinculado(s)</small>
          <p>{item.descricao}</p>{item.criterios_aceite&&<p>Critérios de aceite: {item.criterios_aceite}</p>}
        </div>
      </article>)}</div>
    </section>
    {!!detail.notes.length&&<section className="panel" aria-labelledby="public-notes">
      <h2 id="public-notes">Registros de evidência</h2>
      <div className="qa-resource-list">{detail.notes.map(note=><article className="qa-resource-row" key={note.id}>
        <div className="qa-resource-copy"><p>{note.resumo}</p>
          {/^https:\/\//i.test(note.referencia)&&<a className="secondary-link" href={note.referencia}
            target="_blank" rel="noopener noreferrer">Abrir referência</a>}
        </div>
      </article>)}</div>
    </section>}
    {(!!detail.releases.length||!!detail.comparisons.length)&&<section className="panel" aria-labelledby="public-links">
      <h2 id="public-links">Releases e comparações</h2>
      {detail.releases.map(item=><p key={item.id}>Release {item.versao}</p>)}
      {detail.comparisons.map(item=><p key={item.id}>{item.tipo}: {item.adicionados} adições,
        {" "+item.removidos} remoções, {item.alterados} alterações</p>)}
    </section>}
    {preview&&<QAModal open title={"Visualizar documento — "+preview.title} size="lg"
      onClose={()=>setPreview(null)}><pre className="qa-resource-text">{preview.text}</pre></QAModal>}
  </>;
}
