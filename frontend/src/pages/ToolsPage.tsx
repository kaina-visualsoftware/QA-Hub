import {useState} from 'react';
import type {KeyboardEvent} from 'react';
import {Link} from '@tanstack/react-router';
import {ArrowLeftRight,BookOpenText,PackageCheck,ShieldCheck} from 'lucide-react';
import {VersionInput} from '../components/ui/VersionInput';
import {normalizeTaskVersion} from '../lib/task-version';
import ComparisonTool from '../features/links/ComparisonTool';
import ReleaseOrganizer from '../features/links/ReleaseOrganizer';
import '../features/documentation/documentation.css';
const tools=[{id:'release',label:'Releases',description:'Organize a versão e revise o comunicado.',Icon:PackageCheck},
 {id:'comparison',label:'Comparações',description:'Compare textos e XML com clareza.',Icon:ArrowLeftRight}] as const;
type Tool=typeof tools[number]['id'];
export default function ToolsPage(){
 const [tab,setTab]=useState<Tool>('release'),[version,setVersion]=useState('');
 function keydown(event:KeyboardEvent<HTMLButtonElement>,index:number){
  const next=['ArrowRight','ArrowDown'].includes(event.key)?(index+1)%2:['ArrowLeft','ArrowUp'].includes(event.key)?(index+1)%2:event.key==='Home'?0:event.key==='End'?1:-1;
  if(next<0)return;event.preventDefault();setTab(tools[next].id);requestAnimationFrame(()=>document.getElementById('qa-tool-tab-'+tools[next].id)?.focus());
 }
 return <div className="page qa-tools-page qa-tools-redesign">
  <header className="page-heading"><div><h1>Ferramentas</h1><p>Prepare releases e confira alterações sem sair do seu fluxo de QA.</p></div>
   <Link to="/documentacoes" search={{}} className="secondary-link"><BookOpenText size={18}/> Abrir documentações</Link></header>
  <div className="qa-tools-choice" role="tablist" aria-label="Ferramentas disponíveis">
   {tools.map(({id,label,description,Icon},index)=><button type="button" role="tab" key={id} id={'qa-tool-tab-'+id} aria-controls={'qa-tool-panel-'+id}
    aria-selected={tab===id} tabIndex={tab===id?0:-1} onKeyDown={event=>keydown(event,index)} onClick={()=>setTab(id)}>
    <Icon size={23} aria-hidden="true"/><span><strong>{label}</strong><small>{description}</small></span>
   </button>)}
  </div>
  <div className="qa-tools-local"><ShieldCheck size={17} aria-hidden="true"/> Processamento local no navegador. Textos e XML não são enviados ao servidor.</div>
  <section role="tabpanel" id="qa-tool-panel-release" aria-labelledby="qa-tool-tab-release" hidden={tab!=='release'} className="qa-tools-surface">
   <header><h2>Organizar uma release</h2><p>Informe a versão, prepare a lista autorizada e confira o comunicado antes de copiar.</p></header>
   <div className="qa-tools-form-body">
    <div className="qa-tools-version-block"><div><h3>Versão da publicação</h3><p>A mesma versão será usada na lista e na revisão do comunicado.</p></div>
     <label className="field">Versão da release<VersionInput value={version} onValueChange={setVersion}/><small>Formato: 00.00.00.0000</small></label>
    </div>
    <ReleaseOrganizer version={normalizeTaskVersion(version)} expanded/>
   </div>
  </section>
  <section role="tabpanel" id="qa-tool-panel-comparison" aria-labelledby="qa-tool-tab-comparison" hidden={tab!=='comparison'} className="qa-tools-surface">
   <header><h2>Conferir alterações</h2><p>Escolha o formato e coloque as duas versões lado a lado. O resultado destaca o que foi adicionado, removido ou alterado.</p></header>
   <div className="qa-tools-form-body"><ComparisonTool initialMode="text" embedded/></div>
  </section>
 </div>;
}
