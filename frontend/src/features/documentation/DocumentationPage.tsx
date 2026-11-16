import {useState} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {Link,useNavigate,useSearch} from '@tanstack/react-router';
import {Button} from '@heroui/react';
import {BookOpenText,Eye,Globe,Link2,LockKeyhole,Pencil,Plus,Search,Trash2} from 'lucide-react';
import {useAuth} from '../auth/AuthProvider';
import {BrandLogo} from '../../components/ui/BrandLogo';
import {QAModal} from '../../components/ui/QAModal';
import {ToastNotice} from '../../components/ui/Toasts';
import DocumentationEditor from './DocumentationEditor';
import DocumentationFiles from './DocumentationFiles';
import DocumentationMarkdown from './DocumentationMarkdown';
import {deleteDocumentation,docTypes,listDocumentation,loadDocumentation} from './documentation-data';
import type {Documentation} from './documentation-data';
import './documentation.css';

export default function DocumentationPage(){
 const {user}=useAuth(),client=useQueryClient(),navigate=useNavigate();
 const {doc}=useSearch({from:'/documentacoes'});
 const [scope,setScope]=useState<'mine'|'public'>(user?'mine':'public');
 const [search,setSearch]=useState(''),[type,setType]=useState('all');
 const [editor,setEditor]=useState<Documentation|'new'|null>(null);
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('');
 const activeScope=user?scope:'public';
 const list=useQuery({queryKey:['documentations',activeScope,user?.id],queryFn:()=>listDocumentation(activeScope,user?.id)});
 const detail=useQuery({queryKey:['documentation',doc,user?.id],queryFn:()=>loadDocumentation(doc!,user?.id),enabled:!!doc,staleTime:0,refetchOnMount:'always'});
 const results=(list.data??[]).filter(item=>(type==='all'||item.tipo_documentacao===type)&&
  (item.titulo+' '+item.conteudo).toLocaleLowerCase('pt-BR').includes(search.trim().toLocaleLowerCase('pt-BR')));
 function closeDetail(){void navigate({to:'/documentacoes',search:{},replace:true});}
 async function refresh(){await Promise.all([client.invalidateQueries({queryKey:['documentations']}),client.invalidateQueries({queryKey:['documentation']}),client.invalidateQueries({queryKey:['documentation-files']}),client.invalidateQueries({queryKey:['qa-references']})]);}
 async function saved(record:Documentation){setEditor(null);setMessage('Documentação salva.');await refresh();void navigate({to:'/documentacoes',search:{doc:record.id}});}
 async function remove(record:Documentation){
  if(!user||busy||!window.confirm('Excluir “'+record.titulo+'” e todos os seus anexos? Esta ação não pode ser desfeita.'))return;
  setBusy(true);setError('');try{await deleteDocumentation(record,user.id);closeDetail();setMessage('Documentação excluída.');await refresh();}
  catch(reason){setError((reason as Error).message);}finally{setBusy(false);}
 }
 async function copyLink(record:Documentation){
  const url=new URL(window.location.href);url.hash='/documentacoes?doc='+record.id;
  try{await navigator.clipboard.writeText(url.href);setMessage(record.publica?'Link público copiado.':'Link copiado. A documentação continua privada para sua conta.');}catch{setError('Não foi possível copiar o link. Copie o endereço da página.');}
 }

 // Public documents use the same dedicated reader layout as published TFs.
 // Keep CRUD controls and the administrative document modal exclusive to authenticated users.
 if(!user) return <div className="public-react-shell">
  <button type="button" className="skip-link" onClick={()=>document.getElementById('public-content')?.focus()}>Pular para o conteúdo</button>
  <header className="public-react-header">
   <Link to="/publicas" search={{}} className="brand"><BrandLogo/><span><strong>QA Hub</strong><small>BIBLIOTECA PÚBLICA</small></span></Link>
   <div className="qa-public-header-links">
    <Link to="/publicas" search={{}} className="secondary-link">TFs públicas</Link>
    <Link to="/" className="secondary-link">Entrar no QA Hub</Link>
   </div>
  </header>
  <main id="public-content" tabIndex={-1} className="public-react-main">
   {!doc ? <>
    <div className="page-heading">
     <div><p className="eyebrow">ACESSO SEM LOGIN</p><h1>Documentações públicas</h1>
      <p className="text-muted">Manuais, procedimentos, SQL e arquivos publicados para consulta.</p></div>
     <span className="public-react-readonly"><Globe size={16}/> Somente leitura</span>
    </div>
    <div className="qa-doc-filters">
     <label className="field">Pesquisar por título ou conteúdo
      <span className="public-react-search"><Search size={18}/><input type="search" value={search} onChange={event=>setSearch(event.target.value)} placeholder="Buscar documentações públicas…"/></span>
     </label>
     <label className="field">Tipo de documentação
      <select value={type} onChange={event=>setType(event.target.value)}>
       <option value="all">Todos os tipos</option>
       {Object.entries(docTypes).map(([value,label])=><option value={value} key={value}>{label}</option>)}
      </select>
     </label>
    </div>
    {list.isPending&&<p role="status" className="notice mt-4">Carregando documentações públicas…</p>}
    {list.isError&&<div className="notice error mt-4" role="alert">{list.error.message} <Button variant="secondary" onPress={()=>void list.refetch()}>Tentar novamente</Button></div>}
    {list.isSuccess&&<p role="status" className="text-muted mt-4">{results.length} documentação(ões) pública(s)</p>}
    {list.isSuccess&&!results.length&&<p className="panel mt-4">Nenhuma documentação pública encontrada.</p>}
    <div className="public-react-list mt-4">
     {results.map(item=><Link key={item.id} to="/documentacoes" search={{doc:item.id}} className="task-row">
      <span className="task-initial"><BookOpenText size={20} aria-hidden="true"/></span>
      <span className="task-text"><strong>{item.titulo}</strong>
       <small>{docTypes[item.tipo_documentacao]||'Documento'} · {new Date(item.updated_at||item.created_at).toLocaleDateString('pt-BR')}</small>
      </span><span className="public-react-readonly">Pública</span>
     </Link>)}
    </div>
   </> : <>
    <Link to="/documentacoes" search={{}} className="back-link"><BookOpenText size={16}/> Todas as documentações públicas</Link>
    {detail.isPending&&<p role="status" className="notice mt-4">Carregando documentação pública…</p>}
    {detail.isError&&<p role="alert" className="notice error mt-4">{detail.error.message}</p>}
    {detail.isSuccess&&!detail.data&&<p role="alert" className="notice error mt-4">Esta documentação não é pública ou não existe.</p>}
    {detail.data&&<div className="stack mt-4">
     <div className="page-heading"><div>
      <p className="eyebrow">DOCUMENTAÇÃO PÚBLICA</p>
      <h1>{detail.data.titulo}</h1>
      <p className="text-muted">{docTypes[detail.data.tipo_documentacao]||'Documento'} · Atualizada em {new Date(detail.data.updated_at||detail.data.created_at).toLocaleDateString('pt-BR')}</p>
     </div><span className="public-react-readonly"><Globe size={16}/> Somente leitura</span></div>
     <div className="qa-doc-reader-actions">
      <Button variant="secondary" size="sm" onPress={()=>void copyLink(detail.data!)}><Link2 size={16}/> Copiar link</Button>
      {detail.data.tarefa_id&&<Link className="secondary-link" to="/publicas" search={{tf:detail.data.tarefa_id}}>Abrir TF pública</Link>}
     </div>
     <ToastNotice message={message} tone="success"/><ToastNotice message={error} tone="error"/>
     <section className="panel qa-doc-reader" aria-label="Conteúdo da documentação">
      <DocumentationMarkdown markdown={detail.data.conteudo} docId={detail.data.id}/>
      <DocumentationFiles docId={detail.data.id} owner={false}/>
     </section>
    </div>}
   </>}
  </main>
 </div>;

 const body=<div className="page qa-documentation-page">
  <header className="page-heading qa-doc-page-heading"><div><h1>Documentações</h1>
   <p>Manuais, procedimentos, SQL e anexos em páginas Markdown pesquisáveis.</p></div>
   {user&&<Button onPress={()=>{setMessage('');setError('');setEditor('new');}}><Plus size={18}/> Nova documentação</Button>}
  </header>
  <div className="qa-doc-catalog">
   <nav className="qa-doc-collections" aria-label="Coleções de documentações">
    <h2>Biblioteca</h2>
    {user&&<button type="button" aria-pressed={activeScope==='mine'} onClick={()=>setScope('mine')}><BookOpenText size={18}/> Minhas documentações</button>}
    <button type="button" aria-pressed={activeScope==='public'} onClick={()=>setScope('public')}><Globe size={18}/> Documentações públicas</button>
    <p>Documentações marcadas como públicas ficam acessíveis para qualquer visitante, assim como as TFs publicadas.</p>
   </nav>
   <section className="qa-doc-library" aria-label="Lista de documentações">
    <div className="qa-doc-library-heading"><h2>{activeScope==='mine'?'Minhas documentações':'Documentações públicas'}</h2><span className="count-pill">{results.length}</span></div>
    <div className="qa-doc-filters"><label className="field">Buscar documentação<span className="qa-doc-search"><Search size={18} aria-hidden="true"/><input type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Título ou conteúdo"/></span></label>
     <label className="field">Tipo de documentação<select value={type} onChange={e=>setType(e.target.value)}><option value="all">Todos os tipos</option>{Object.entries(docTypes).map(([value,label])=><option value={value} key={value}>{label}</option>)}</select></label>
    </div>
    <ToastNotice message={message} tone="success"/><ToastNotice message={error||list.error?.message} tone="error"/>
    {list.isError&&<Button variant="secondary" onPress={()=>void list.refetch()}>Tentar novamente</Button>}
    {list.isPending&&<p role="status" className="qa-doc-empty">Carregando documentações…</p>}
    {list.isSuccess&&!results.length&&<div className="qa-doc-empty"><BookOpenText size={28} aria-hidden="true"/>
     <h3>{search||type!=='all'?'Nenhuma documentação encontrada':'Sua próxima solução pode começar aqui'}</h3>
     <p>{search||type!=='all'?'Tente outro termo ou tipo de documentação.':activeScope==='mine'?'Crie um manual, registre uma solução recorrente ou documente uma TF.':'Ainda não há documentações públicas para consultar.'}</p></div>}
    <div className="qa-resource-list">{results.map(item=><article className="qa-resource-row qa-doc-row" key={item.id}>
     <span className="qa-doc-row-icon" aria-hidden="true"><BookOpenText size={22}/></span>
     <div className="qa-resource-copy"><strong>{item.titulo}</strong>
      <small>{docTypes[item.tipo_documentacao]||'Nota'} · {item.publica?'Pública':'Privada'} · {new Date(item.updated_at||item.created_at).toLocaleDateString('pt-BR')}</small>
      <p>{item.conteudo.slice(0,180)}{item.conteudo.length>180?'…':''}</p>
     </div>
     <div className="qa-resource-actions"><Link to="/documentacoes" search={{doc:item.id}} aria-label={'Visualizar '+item.titulo}><Eye size={16}/> Visualizar</Link>
      {item.user_id===user?.id&&user&&<button type="button" onClick={()=>setEditor(item)} aria-label={'Editar '+item.titulo}><Pencil size={16}/> Editar</button>}
     </div>
    </article>)}</div>
   </section>
  </div>
  {!!doc&&editor===null&&<QAModal open title={detail.data?.titulo??'Documentação'} size="lg" onClose={closeDetail} busy={busy}>
   {detail.isPending&&<p role="status">Carregando documentação…</p>}
   {detail.isError&&<p role="alert" className="notice error">{detail.error.message}</p>}
   {detail.isSuccess&&!detail.data&&<p role="alert">Esta documentação é privada, foi excluída ou não existe.</p>}
   {detail.data&&<div className="qa-doc-reader">
    <div className="qa-doc-reader-meta"><span>{detail.data.publica?<Globe size={16}/>:<LockKeyhole size={16}/>} {detail.data.publica?'Pública':'Privada'}</span><span>{docTypes[detail.data.tipo_documentacao]}</span></div>
    <div className="qa-doc-reader-actions">
     <Button variant="secondary" size="sm" onPress={()=>void copyLink(detail.data!)}><Link2 size={16}/> Copiar link</Button>
     {detail.data.tarefa_id&&(detail.data.user_id===user?.id?<Link className="secondary-link" to="/tarefa/$taskId" params={{taskId:detail.data.tarefa_id}}>Abrir TF vinculada</Link>:<Link className="secondary-link" to="/publicas" search={{tf:detail.data.tarefa_id}}>Abrir TF pública</Link>)}
     {user&&detail.data.user_id===user.id&&<>
      <Button variant="secondary" size="sm" onPress={()=>setEditor(detail.data!)}><Pencil size={16}/> Editar documentação</Button>
      <Button variant="secondary" size="sm" isDisabled={busy} onPress={()=>void remove(detail.data!)}><Trash2 size={16}/> Excluir documentação</Button>
     </>}
    </div>
    <ToastNotice message={message} tone="success"/><ToastNotice message={error} tone="error"/>
    <DocumentationMarkdown markdown={detail.data.conteudo} docId={detail.data.id}/>
    <DocumentationFiles docId={detail.data.id} owner={!!user&&detail.data.user_id===user.id}/>
   </div>}
  </QAModal>}
  {editor&&user&&<DocumentationEditor key={editor==='new'?'new':editor.id} initial={editor==='new'?undefined:editor} userId={user.id} onSaved={record=>void saved(record)} onClose={()=>{setEditor(null);void refresh();}}/>}
 </div>;
 return body;
}
