import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.119.0';
import Chart from 'https://esm.sh/chart.js@4.6.1/auto';
import { QA_CONFIG } from './qa-config.js';
import { parseReport, extractExplicitScenarios } from './qa-parser.mjs';
import { extractLocalDraft } from './qa-assistant.mjs';
import { extractWithOpenModel } from './qa-ai-open.mjs';
import { extractWithNvidia } from './qa-nvidia.mjs';
import { collectTaskContext, cleanMermaid, horizontalFlowchart, requestAiDiagram } from './qa-mermaid-ai.mjs';
import { createDiagramViewer } from './qa-diagram-viewer.mjs';
import { createPhase2Ui } from './qa-phase2-ui.mjs';
import { selectedScenarioContext } from './qa-phase2.mjs';
import { coverageMetrics } from './qa-phase3.mjs';
import { createPhase3Ui } from './qa-phase3-ui.mjs';
import { slicePage } from './qa-phase4.mjs';
import { createNativeTools } from './qa-native-tools.mjs';
import { createPhase4Ui } from './qa-phase4-ui.mjs';
import { createRequirementsUi } from './qa-requirements-ui.mjs';
import { createRequirementPicker } from './qa-requirements-picker.mjs';
import { createRequirementUsageUi } from './qa-requirements-usage-ui.mjs';
import { createCoverageUi } from './qa-requirements-coverage-ui.mjs';
import {normalizeNarrative,normalizeNarrativeFields,TASK_NARRATIVE_FIELDS,SCENARIO_NARRATIVE_FIELDS} from './qa-narrative.mjs';
import {quickExecutionPayload,createCompletionDraft,progressForTask} from './qa-fast-execution.mjs';
import { combineDiagramContext,recordRequirementUsage } from './qa-requirements-context.mjs';

// Capture Supabase Auth callback errors before the SDK processes the URL fragment.
const callbackErrorCode = location.hash.startsWith('#error=')
  ? new URLSearchParams(location.hash.slice(1)).get('error_code') : null;
const db = createClient(QA_CONFIG.url, QA_CONFIG.publishableKey);
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const diagramViewer=createDiagramViewer($('#diagram-viewer'));
const diagramRequirementPicker=createRequirementPicker({
  root:$('#diagram-requirements-picker'),db,getUserId:()=>state.user?.id
});
const state = { selectedTaskId: null, draftFromGenerator: null, user: null, tasks: [], scenarioStats: [], scenarios: [], diagrams: [], currentId: null, chart: null, signingUp: false, isBusy: false, dirtyForms: new Set(), activeHash: null, assistDraft: null, pendingScenarios: [], diagramGenerationContext: null, toolMode: null, toolFrameContext: null, taskListPage:0 };
const statuses = { rascunho: 'Rascunho', em_teste: 'Em teste', aprovado: 'Aprovado', reprovado: 'Reprovado', bloqueado: 'Bloqueado', nao_executado: 'Não executado' };
const taskFields = ['publica','codigo','titulo','tipo_teste','status','sistema','versao','ambiente','base_teste','empresa','testador','descricao','explicacao','causa','correcao','conclusao','observacoes','erro_reproduzido','funcionando','executado_em'];
const scenarioFields = ['titulo','status','ordem','passos','esperado','obtido','observacoes'];
const dateToday = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0,10); };
const esc = (v) => String(v ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const formatDate = (v) => v ? new Date(v + 'T12:00:00').toLocaleDateString('pt-BR') : '—';
const phase2 = createPhase2Ui({
  db,
  getTask:()=>state.tasks.find(t=>t.id===state.currentId),
  getScenarios:()=>state.scenarios,
  getTaskId:()=>state.currentId,
  refreshScenarios:id=>refreshRecordList('scenario',id),
  onOpenDocuments:()=>selectTab('documentos'),
  markDirty:setFormDirty,
  toast
});
const phase3 = createPhase3Ui({
  db,getTask:()=>state.tasks.find(t=>t.id===state.currentId),
  getTaskId:()=>state.currentId,getUserId:()=>state.user?.id,
  onDocuments:()=>selectTab('documentos'),
  markDirty:setFormDirty,toast
});
const phase4=createPhase4Ui({
  db,getTask:()=>state.tasks.find(t=>t.id===state.currentId),
  getUserId:()=>state.user?.id,getScenarios:()=>state.scenarios,toast,
  onImported:async(kind,id)=>{
    if(kind==='teste')await refreshRecordList('scenario',id);
    else await phase2.loadDocuments(id);
    await loadData();
  }
});
const requirements=createRequirementsUi({
  db,getTask:()=>state.tasks.find(t=>t.id===state.currentId),
  getTaskId:()=>state.currentId,getUserId:()=>state.user?.id,toast,
  onDirty:value=>setFormDirty('requirements-source',value)
});
const requirementUsage=createRequirementUsageUi({db,getTaskId:()=>state.currentId});
const coverageUi=createCoverageUi({
  db,getTask:()=>state.tasks.find(t=>t.id===state.currentId),
  getTaskId:()=>state.currentId,getUserId:()=>state.user?.id,
  getScenarios:()=>state.scenarios,toast
});
const nativeTools=createNativeTools({
  root:$('#native-tools'),db,
  getTask:()=>state.tasks.find(t=>t.id===state.selectedTaskId),
  getUserId:()=>state.user?.id,toast,
  onSaved:id=>{
    if(state.currentId===id){
      phase3.load(id).catch(e=>toast(errMessage(e),true));
      phase4.refreshAudit().catch(e=>toast(errMessage(e),true));
    }
  }
});
const statusBadge = (v) => '<span class="status ' + esc(v) + '">' + esc(statuses[v] || v) + '</span>';
const errMessage = (err) => {
  if (!err) return 'Erro não identificado';
  if (err.code === '42P01' || err.code === 'PGRST205') return 'As tabelas do QA Hub ainda não foram criadas neste projeto Supabase. Execute supabase/schema.sql.';
  return err.message || String(err);
};
let toastTimeout;
function toast(message, error = false) {
  const node = $('#toast');
  node.textContent = message;
  node.classList.toggle('error', error);
  node.setAttribute('role', error ? 'alert' : 'status');
  node.setAttribute('aria-live', error ? 'assertive' : 'polite');
  node.hidden = false;
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => { node.hidden = true; }, 6500);
}
function busy(button, active) {
  state.isBusy = active;
  if (button) {
    button.disabled = active;
    button.setAttribute('aria-busy', String(active));
  }
}
function setFormDirty(formId, dirty = true) {
  if (dirty) state.dirtyForms.add(formId);
  else state.dirtyForms.delete(formId);
  $('#save-status').hidden = state.dirtyForms.size === 0 || $('#editor-fields').hidden;
}
function clearFormDirty() {
  state.dirtyForms.clear();
  $('#save-status').hidden = true;
}
function confirmDiscard(message = 'Você possui alterações não salvas. Deseja descartá-las?') {
  return state.dirtyForms.size === 0 || window.confirm(message);
}
function confirmDetailDiscard(formId) {
  return !state.dirtyForms.has(formId) || window.confirm('Há alterações não salvas neste formulário. Deseja descartá-las?');
}
function showAuth() {
  $('#shell').hidden = true;
  $('#auth-screen').hidden = false;
}
function showApp() {
  $('#auth-screen').hidden = true;
  $('#shell').hidden = false;
  $('#user-email').textContent = state.user?.email || 'Usuário';
}
function inputValues(form, fields) {
  const data = Object.fromEntries(new FormData(form));
  const values = {};
  for (const key of fields) {
    values[key] = typeof data[key] === 'string' ? data[key].trim() : '';
  }
  return values;
}
function setForm(form, fields, values) {
  for (const key of fields) {
    if (!form.elements.namedItem(key)) continue;
    let value = values[key] ?? '';
    if (value === true) value = 'true';
    if (value === false) value = 'false';
    form.elements.namedItem(key).value = String(value);
  }
}
function nullableBool(v) { return v === 'true' ? true : v === 'false' ? false : null; }
function escapeDownload(data, name) {
  const blob = new Blob([data], { type:'application/json;charset=utf-8' });
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = href; anchor.download = name; anchor.click();
  setTimeout(() => URL.revokeObjectURL(href), 500);
}

async function loadData() {
  const [tasksResult, scenariosResult, adminResult] = await Promise.all([
    db.from('qa_tarefas').select('*').order('executado_em', { ascending:false }).limit(1000),
    db.from('qa_cenarios').select('id,tarefa_id,status').limit(3000),
    db.from('qa_admins').select('user_id').eq('user_id',state.user.id).maybeSingle()
  ]);
  if (tasksResult.error) throw tasksResult.error;
  if (scenariosResult.error) throw scenariosResult.error;
  state.isAdmin = !adminResult.error && Boolean(adminResult.data);
  // Public records from other accounts are displayed in the read-only gallery,
  // never as editable records in this workspace.
  state.tasks = (tasksResult.data || []).filter(task =>
    state.isAdmin || task.user_id === state.user.id);
  const allowed = new Set(state.tasks.map(task=>task.id));
  state.scenarioStats = (scenariosResult.data || []).filter(item=>allowed.has(item.tarefa_id));
  restoreTaskFocus();
  $('#user-role').textContent = state.isAdmin ? 'Administrador' : 'Testador';
  renderDashboard();
  renderTasks();
}
async function start() {
  if (callbackErrorCode) {
    const message = callbackErrorCode === 'otp_expired'
      ? 'O link de confirmação expirou ou já foi utilizado. Se sua conta estiver confirmada, entre com email e senha. Caso contrário, solicite um novo link.'
      : 'Não foi possível concluir a confirmação pelo link. Solicite um novo email, se necessário.';
    const notice = $('#auth-warning');
    notice.textContent = message;
    notice.hidden = false;
    $('#resend-confirmation').hidden = false;
    history.replaceState(null, '', location.pathname + location.search);
  }
  try {
    const { data, error } = await db.auth.getSession();
    if (error) throw error;
    state.user = data.session?.user || null;
    if (!state.user) { showAuth(); return; }
    showApp();
    await loadData();
    await route();
  } catch(e) {
    console.error('QA Hub:', e);
    if (state.user) { showApp(); await route(); }
    else showAuth();
    toast(errMessage(e), true);
  }
}
db.auth.onAuthStateChange((event) => {
  if (event === 'SIGNED_OUT') {
    try { sessionStorage.removeItem('qa-focus:'+state.user?.id); } catch {}
    state.selectedTaskId=null; state.draftFromGenerator=null;
    state.currentId=null; state.scenarios=[]; state.diagrams=[];
    state.dirtyForms.clear();
    phase2.reset();
    phase3.reset();
    phase4.reset();
    requirements.reset();
    requirementUsage.reset();
    coverageUi.reset();
    diagramRequirementPicker.reset();
    nativeTools.reset();
    state.user = null; state.tasks = []; state.scenarioStats = [];
    const frame = $('#tool-frame');
    frame.removeAttribute('data-initialized'); frame.src = 'about:blank';
    state.toolMode = null; state.toolFrameContext = null;
    showAuth();
  }
});

function taskItem(task) {
  const scenarios = state.scenarioStats.filter(s => s.tarefa_id === task.id);
  const progress=progressForTask(scenarios);
  const prefix = task.codigo ? task.codigo.slice(0,5) : 'TF';
  return '<div class="task-item"><a href="#/tarefa/' + encodeURIComponent(task.id) + '">' +
    '<span class="task-code">' + esc(prefix) + '</span><span class="task-title"><strong>' + esc(task.titulo) +
    '</strong><small>' + esc(task.codigo || 'Sem código') + ' · ' + esc(task.tipo_teste) + ' · ' +
    scenarios.length + ' cenário(s)' + (task.versao ? ' · v' + esc(task.versao) : '') +
    '</small><small class="qa-task-progress">' + progress.done + '/' + progress.total + ' executados</small></span></a>' +
    (progress.pending?'<a class="qa-task-continue" href="#/tarefa/' + encodeURIComponent(task.id) +
      '?tab=cenarios">Continuar testes</a>':'') +
    (task.publica ? '<span class="task-sharing">Pública</span>' : '') + statusBadge(task.status) +
    '<span class="task-date">' + formatDate(task.executado_em) + '</span></div>';
}
function renderTasks() {
  const query = $('#task-search').value.toLocaleLowerCase('pt-BR').trim();
  const status = $('#filter-status').value;
  const type = $('#filter-type').value;
  const list = state.tasks.filter(t =>
    (!query || [t.titulo,t.codigo,t.sistema,t.versao,t.descricao].some(v => String(v ?? '').toLocaleLowerCase('pt-BR').includes(query))) &&
    (!status || t.status === status) && (!type || t.tipo_teste === type)
  );
  const hasFilters = Boolean(query || status || type);
  const emptyWithFilters = '<div class="empty"><strong>Nenhum resultado para estes filtros</strong>' +
    '<p>Altere a pesquisa ou limpe os filtros para ver outras TFs.</p>' +
    '<button type="button" class="btn soft" data-clear-filters>Limpar filtros</button></div>';
  const emptyWithoutFilters = '<div class="empty"><strong>Nenhuma TF cadastrada</strong>' +
    '<p>Cadastre seu primeiro teste ou importe um relatório existente.</p>' +
    '<button type="button" class="btn primary" data-new-task>Criar primeira TF</button></div>';
  const page=slicePage(list,state.taskListPage);
  $('#task-list').innerHTML = list.length ? page.rows.map(taskItem).join('') :
    (hasFilters ? emptyWithFilters : emptyWithoutFilters);
  $('#tasks-load-more').hidden=!page.hasMore;
  $('#task-count').textContent = page.visible+' de '+page.total+' tarefa(s) nesta consulta'+
    (state.tasks.length >= 1000 ? ' · limite de carregamento: 1.000 TFs' : '');
}
function renderDashboard() {
  const tasks = state.tasks, scenarios = state.scenarioStats;
  const coverage=coverageMetrics(tasks,scenarios);
  $('#coverage-percent').textContent=coverage.coveragePct+'%';
  $('#coverage-progress').setAttribute('aria-valuenow',String(coverage.coveragePct));
  $('#coverage-bar').style.width=coverage.coveragePct+'%';
  $('#coverage-detail').textContent=coverage.executed+' de '+coverage.totalCases+' cenários com execução registrada · '+coverage.withCases+' de '+coverage.totalTasks+' TFs possuem cenários.';
  const breakdown=$('#coverage-breakdown');breakdown.replaceChildren();
  for(const [title,n] of [
    ['Não executados',coverage.unexecuted],['Aprovados',coverage.approved],
    ['Reprovados',coverage.failed],['Bloqueados',coverage.blocked],
    ['TFs sem cenários',coverage.withoutCases]
  ]) {
    const pill=document.createElement('span');pill.className='qa-coverage-stat';
    pill.textContent=title+': '+n;breakdown.append(pill);
  }
  $('#stat-tasks').textContent = tasks.length;
  $('#stat-scenarios').textContent = scenarios.length;
  $('#stat-approved').textContent = tasks.filter(t => t.status === 'aprovado').length;
  $('#stat-failed').textContent = tasks.filter(t => t.status === 'reprovado' || t.status === 'bloqueado').length;
  $('#dashboard-date').textContent = new Date().toLocaleDateString('pt-BR',{day:'2-digit',month:'long',year:'numeric'});
  $('#recent-list').innerHTML = tasks.length ? tasks.slice(0,5).map(taskItem).join('') :
    '<div class="empty"><strong>Ainda não há tarefas registradas</strong>Cadastre uma TF ou importe um relatório para começar.<br><button type="button" class="btn soft" data-new-task>Cadastrar primeira TF</button></div>';

  const keys = ['aprovado','em_teste','rascunho','reprovado','bloqueado'];
  const values = keys.map(key => tasks.filter(t => t.status === key).length);
  const colors = ['#159879','#4488ba','#aab4bb','#d25b67','#d7a14c'];
  if (state.chart) state.chart.destroy();
  const ctx = $('#status-chart').getContext('2d');
  state.chart = new Chart(ctx,{type:'doughnut',
    data:{ labels:keys.map(k=>statuses[k]), datasets:[{data:values,backgroundColor:colors,borderWidth:4,borderColor:'#fff',hoverOffset:4}]},
    options:{responsive:true,maintainAspectRatio:false,cutout:'72%',plugins:{legend:{position:'right',labels:{boxWidth:10,boxHeight:10,padding:16,font:{size:12}}}}}
  });
  const passed = state.scenarioStats.filter(s=>s.status==='aprovado').length;
  const failed = state.scenarioStats.filter(s=>s.status==='reprovado').length;
  $('#chart-summary').textContent = scenarios.length + ' cenários registrados · ' + passed + ' aprovados · ' + failed + ' reprovados.';
  const types = {BUILD:tasks.filter(t=>t.tipo_teste==='BUILD').length,RELEASE:tasks.filter(t=>t.tipo_teste==='RELEASE').length};
  $('#types-chart').innerHTML = Object.entries(types).map(([key,n]) =>
    '<div class="type-row"><div class="type-label"><span>'+key+'</span><span>'+n+' TF(s)</span></div><div class="type-track"><span style="width:'+
    (tasks.length ? Math.round(n/tasks.length*100) : 0)+'%"></span></div></div>').join('');
}
function restoreTaskFocus() {
  if (!state.user) return;
  const available = new Set(state.tasks.map(task=>task.id));
  if (!state.selectedTaskId) {
    try { const remembered=sessionStorage.getItem('qa-focus:'+state.user.id); if (available.has(remembered)) state.selectedTaskId=remembered; } catch {}
  }
  if (!available.has(state.selectedTaskId)) state.selectedTaskId=null;
  const select=$('#context-task-select');
  select.replaceChildren(new Option('Nenhuma TF selecionada',''));
  for (const task of state.tasks) {
    const title=(task.codigo ? '#'+task.codigo+' · ' : '')+task.titulo+(task.versao?' · '+task.versao:'');
    select.add(new Option(title.slice(0,140),task.id));
  }
  select.value=state.selectedTaskId||'';
  const link=$('#context-task-open');
  link.hidden=!state.selectedTaskId;
  link.href=state.selectedTaskId?'#/tarefa/'+encodeURIComponent(state.selectedTaskId):'#/tarefas';
}
function focusTask(taskId) {
  if (taskId && !state.tasks.some(task=>task.id===taskId)) return false;
  state.selectedTaskId=taskId||null;
  try {
    if (state.selectedTaskId) sessionStorage.setItem('qa-focus:'+state.user.id,state.selectedTaskId);
    else sessionStorage.removeItem('qa-focus:'+state.user.id);
  } catch {}
  restoreTaskFocus();
  nativeTools.refresh();
  return true;
}
$('#context-task-select').addEventListener('change',event=>{
  if (state.isBusy || !confirmDiscard('Existem alterações não salvas. Trocar a TF em foco?')) {
    event.target.value=state.selectedTaskId||'';return;
  }
  const taskId=event.target.value;
  if (!focusTask(taskId)) return;
  const match=location.hash.match(/^#\/ferramentas\/(post|teste|release|lib|diff|xml)/);
  if (match) location.hash='#/ferramentas/'+match[1]+(taskId?'?tf='+encodeURIComponent(taskId):'');
});
const toolPages = {
  post: { title:'Posts do fórum', description:'Gere e revise comunicados com IA.' },
  teste: { title:'Roteiros de teste', description:'Crie cenários e acompanhe a execução dos testes.' },
  release: { title:'Lista e comunicado', description:'Organize releases e compare alterações localmente.' },
  lib: { title:'Informações importantes', description:'Consulte e organize seus registros.' },
  diff: { title:'Comparar textos', description:'Identifique diferenças entre versões de textos.' },
  xml: { title:'Comparar XML', description:'Compare estruturas e conteúdos XML.' }
};
function setView(name) {
  $$('.view').forEach(node => { node.hidden = node.id !== 'view-'+name; });
  const activeRoute = name === 'ferramentas' ? 'ferramentas/' + state.toolMode : name;
  $$('.navigation a[data-route]').forEach(node => {
    const active = node.dataset.route === activeRoute;
    node.classList.toggle('active', active);
    if (active) node.setAttribute('aria-current', 'page');
    else node.removeAttribute('aria-current');
  });
  const crumbs = {dashboard:'Visão geral',tarefas:'Tarefas de teste',editor:'Detalhes da TF'};
  $('#breadcrumb').textContent = name === 'ferramentas' ? toolPages[state.toolMode]?.title || 'Ferramentas' : crumbs[name] || 'QA Hub';
  setSidebar(false);
}
function selectTab(name) {
  if($('#tab-btn-'+name)?.disabled)return;
  for (const tab of ['resumo','requisitos','cobertura','cenarios','execucao','diagramas','vinculos','documentos','historico','auditoria']) {
    const selected = name === tab;
    $('#tab-'+tab).hidden = !selected;
    const button = $('[data-tab="'+tab+'"]');
    button.classList.toggle('active',selected);
    button.setAttribute('aria-selected',String(selected));
    button.tabIndex = selected ? 0 : -1;
  }
  if(name==='execucao')phase2.renderExecution();
  if(name==='cobertura'&&state.currentId)coverageUi.load(state.currentId,{keepFocus:true}).catch(e=>toast(errMessage(e),true));
  // Keep the active tab visible in the horizontally scrollable mobile tab bar,
  // without scrolling the entire document away from the current form.
  requestAnimationFrame(()=>{
    const bar=$('#task-detail-tabs'),active=bar?.querySelector('.tab.active');
    if(!bar||!active||bar.hidden||!bar.clientWidth)return;
    const viewport=bar.getBoundingClientRect(),item=active.getBoundingClientRect();
    const inset=8;
    if(item.left<viewport.left+inset)
      bar.scrollLeft-=viewport.left+inset-item.left;
    else if(item.right>viewport.right-inset)
      bar.scrollLeft+=item.right-viewport.right+inset;
  });
}
const toolFrame = $('#tool-frame');
toolFrame.addEventListener('load', () => {
  if (toolFrame.dataset.initialized === 'true' && state.toolMode && !['release','diff','xml'].includes(state.toolMode)) {
    toolFrame.contentWindow?.postMessage({ type:'qa-hub:navigate-tool', mode:state.toolMode }, location.origin);
  }
});
window.addEventListener('message', event => {
  if (event.origin !== location.origin || event.source !== toolFrame.contentWindow) return;
  if (event.data?.type === 'qa-hub:cases-attached') {
    if (!state.tasks.some(task=>task.id===event.data.taskId)) return;
    if(state.currentId===event.data.taskId)
      refreshRecordList('scenario',event.data.taskId).catch(error=>toast(errMessage(error),true));
    else loadData().catch(error=>toast(errMessage(error),true));
    toast((Number(event.data.inserted)||0)+' cenário(s) adicionados à TF.');
    return;
  }
  if (event.data?.type === 'qa-hub:create-draft') {
    state.draftFromGenerator={title:String(event.data.title||'').slice(0,240),description:String(event.data.description||'').slice(0,4000),
      cases:Array.isArray(event.data.cases)?event.data.cases.slice(0,100):[]};
    location.hash='#/nova';
    return;
  }
  if (event.data?.type === 'qa-hub:phase3-changed') {
    const id=event.data.taskId;
    if(state.currentId===id)
      phase3.load(id).catch(error=>toast(errMessage(error),true));
    return;
  }
  if (event.data?.type === 'qa-hub:requirements-used') {
    const id=event.data.taskId;
    if(state.currentId===id && state.tasks.some(task=>task.id===id))
      requirementUsage.load(id).catch(error=>toast(errMessage(error),true));
    return;
  }
  if (event.data?.type === 'qa-hub:document-saved') {
    if (!state.tasks.some(t=>t.id===event.data.taskId)) return;
    if(state.currentId===event.data.taskId)
      phase2.loadDocuments(event.data.taskId).catch(error=>toast(errMessage(error),true));
    toast('Post registrado como documento da TF · versão '+String(event.data.version||'1')+'.');
    return;
  }
  if (event.data?.type === 'qa-hub:open-execution') {
    const id=event.data.taskId;
    if(state.tasks.some(task=>task.id===id))
      location.hash='#/tarefa/'+encodeURIComponent(id)+'?tab=execucao';
    return;
  }
  if (event.data?.type === 'qa-hub:open-documents') {
    const id=event.data.taskId;
    if (state.tasks.some(task=>task.id===id))
      location.hash='#/tarefa/'+encodeURIComponent(id)+'?tab=documentos';
    return;
  }
  if (event.data?.type === 'qa-hub:open-task') {
    if (state.tasks.some(task=>task.id===event.data.taskId)) location.hash='#/tarefa/'+event.data.taskId+'?tab=cenarios';
    return;
  }
  if (event.data?.type === 'qa-hub:tool-height') {
    const height = Number(event.data.height);
    if (Number.isFinite(height) && height > 0) {
      toolFrame.style.height = Math.max(520, Math.min(50000, Math.ceil(height) + 12)) + 'px';
    }
  }
});
function openTool(mode, taskId = '') {
  const info = toolPages[mode];
  if (!info) return;
  // Preserve the selected TF while switching tools through the sidebar.
  // A new TF context replaces the prior one; the iframe is never reloaded on a simple tool switch.
  const tf = taskId && state.tasks.some(task=>task.id===taskId)
    ? taskId : (state.selectedTaskId || '');
  if (taskId && !state.tasks.some(task=>task.id===taskId)) toast('TF indisponível ou sem permissão.',true);
  state.toolMode = mode;
  $('#tool-view-title').textContent = info.title;
  $('#tool-view-description').textContent = info.description;
  if(['release','diff','xml'].includes(mode)){
    toolFrame.hidden=true;
    nativeTools.open(mode);
    setView('ferramentas');
    return;
  }
  nativeTools.hide();
  toolFrame.hidden=false;
  toolFrame.title = info.title + ' · QA Hub';
  if (toolFrame.dataset.initialized !== 'true' || state.toolFrameContext !== tf) {
    state.toolFrameContext = tf;
    toolFrame.dataset.initialized = 'true';
    toolFrame.style.height = '740px';
    const url = new URL('./geradores.html', location.href);
    url.searchParams.set('embedded', '1');
    url.searchParams.set('mode', mode);
    if (tf) url.searchParams.set('tf', tf);
    toolFrame.src = url.href;
  } else {
    toolFrame.contentWindow?.postMessage({ type:'qa-hub:navigate-tool', mode }, location.origin);
  }
  setView('ferramentas');
}
async function route() {
  if (!state.user) return;
  const hash = decodeURIComponent(location.hash || '#/dashboard');
  if (hash !== state.activeHash && !confirmDiscard()) {
    history.replaceState(null, '', location.pathname + location.search + (state.activeHash || '#/dashboard'));
    return;
  }
  if (hash !== state.activeHash) clearFormDirty();
  state.activeHash = hash;
  const toolRoute = hash.match(/^#\/ferramentas\/(post|teste|release|lib|diff|xml)(?:\?([^#]*))?$/);
  if (toolRoute) {
    const requestedTask=new URLSearchParams(toolRoute[2] || '').get('tf');
    if (requestedTask && state.tasks.some(task=>task.id===requestedTask)) focusTask(requestedTask);
    openTool(toolRoute[1], requestedTask);
    return;
  }
  if (hash === '#/tarefas') { setView('tarefas'); return; }
  if (hash === '#/nova') { openNewTask(); return; }
  if (hash.startsWith('#/tarefa/')) {
    const [id,query=''] = hash.slice('#/tarefa/'.length).split('?');
    if (id !== state.currentId || !state.tasks.some(t=>t.id===id)) {
      await openTask(id);
    } else setView('editor');
    const requestedTab=new URLSearchParams(query).get('tab');
    if (state.currentId===id && ['requisitos','cobertura','cenarios','execucao','diagramas','vinculos','documentos','historico','auditoria'].includes(requestedTab))
      selectTab(requestedTab);
    return;
  }
  setView('dashboard');
}
function setTaskStep(step, focus=false) {
  const entering=step==='entry';
  $('#assist-panel').hidden=!entering;
  $('#editor-fields').hidden=entering;
  $('#save-task').hidden=entering;
  $('#task-detail-tabs').hidden=entering;
  // New TFs can prepare an in-memory requirements preview; other dependent
  // tabs remain disabled until the task is saved.
  for(const tab of ['cobertura','cenarios','execucao','diagramas','vinculos','documentos','historico','auditoria'])
    $('#tab-btn-'+tab).disabled=!state.currentId;
  $('#editor-caption').hidden=entering;
  $('#save-status').hidden=entering || state.dirtyForms.size===0;
  if(focus){
    const target=entering?$('#assist-text'):$('#task-form input[name="titulo"]');
    target.focus();
  }
}
function revealTaskDetails(task) {
  $('#task-extra-details').open=Boolean(task.ambiente||task.base_teste||task.empresa||task.testador);
  $('#task-analysis-details').open=Boolean(task.explicacao||task.causa||task.correcao);
  $('#task-validation-details').open=Boolean(task.observacoes||task.erro_reproduzido!==null&&task.erro_reproduzido!==undefined||task.funcionando!==null&&task.funcionando!==undefined);
}
function openNewTask() {
  clearFormDirty();
  state.assistDraft=null;
  state.pendingScenarios=[];
  state.currentId=null;
  phase2.reset();
  phase4.reset();
  requirementUsage.reset();
  coverageUi.reset();
  diagramRequirementPicker.reset();
  requirements.startNew();
  setTaskStep('entry');
  $('#assist-text').value='';
  $('#assist-error').hidden=true;
  $('#assist-error').textContent='';
  if($('#ai-loading-modal').open)$('#ai-loading-modal').close();
  $('#draft-scenario-review').hidden=true;
  $('#draft-scenario-list').replaceChildren();
  $('#task-extra-details').open=false;
  $('#task-analysis-details').open=false;
  $('#task-validation-details').open=false;
  $('#assist-back').hidden=false;
  checkLocalAiAvailability();
  state.currentId = null;
  state.scenarios = []; state.diagrams = [];
  $('#task-form').reset();
  $('#task-form').elements.publica.value='false';
  $('#task-visibility').dispatchEvent(new Event('change'));
  $('#task-public-link').hidden=true;
  $('#task-generator-links').hidden=true;
  $('#task-form').elements.executado_em.value = dateToday();
  if (state.draftFromGenerator) {
    $('#task-form').elements.titulo.value=state.draftFromGenerator.title||'Nova tarefa de teste';
    $('#task-form').elements.descricao.value=state.draftFromGenerator.description||'';
    state.pendingScenarios=state.draftFromGenerator.cases
      .filter(item=>item&&typeof item.titulo==='string'&&item.titulo.trim().length>=3)
      .map(item=>({titulo:item.titulo.slice(0,240),passos:String(item.passos||''),
        esperado:String(item.esperado||''),obtido:'',observacoes:String(item.observacoes||''),selected:true}));
    state.draftFromGenerator=null;
    renderPendingScenarios();
    setTaskStep('review');
    setFormDirty('task-form');
  }
  $('#editor-kicker').textContent = 'NOVO REGISTRO';
  $('#editor-title').textContent = 'Nova tarefa de teste';
  $('#editor-caption').textContent = 'Salve a TF para habilitar o cadastro de cenários e diagramas.';
  $('#delete-task').hidden = true;
  $('#scenario-form').hidden = true;
  $('#diagram-form').hidden = true;
  $('#scenarios-list').innerHTML = '<div class="empty">Salve a TF antes de cadastrar cenários.</div>';
  $('#diagrams-list').innerHTML = '<div class="empty">Salve a TF antes de cadastrar diagramas.</div>';
  $('#scenarios-number').textContent = '0'; $('#diagrams-number').textContent = '0';
  selectTab('resumo'); setView('editor');
}
async function openTask(id) {
  const task = state.tasks.find(t=>t.id === id);
  if (!task) { toast('Tarefa não encontrada ou sem acesso.',true); location.hash = '#/tarefas'; return; }
  clearFormDirty();
  state.currentId = id;
  focusTask(id);
  setTaskStep('review');
  $('#draft-scenario-review').hidden=true;
  $('#draft-scenario-list').replaceChildren();
  $('#task-form').reset();
  setForm($('#task-form'),taskFields,task);
  $('#task-visibility').dispatchEvent(new Event('change'));
  updatePublicLink(task);
  const generatorLinks=$('#task-generator-links');
  generatorLinks.hidden=false;
  $('#task-post-link').href='#/ferramentas/post?tf='+encodeURIComponent(task.id);
  $('#task-testplan-link').href='#/ferramentas/teste?tf='+encodeURIComponent(task.id);
  $('#editor-kicker').textContent = task.codigo ? 'TF · '+task.codigo : 'REGISTRO DE TESTE';
  $('#assist-back').hidden=true;
  revealTaskDetails(task);
  $('#editor-title').textContent = task.titulo;
  $('#editor-caption').textContent = (task.tipo_teste||'') + ' · ' + (task.versao||'Sem versão') + ' · Atualizada ' + formatDate(task.executado_em);
  $('#delete-task').hidden = false;
  $('#scenario-form').hidden = true; $('#diagram-form').hidden = true;
  selectTab('resumo'); setView('editor');
  try {
    const [s,d] = await Promise.all([
      db.from('qa_cenarios').select('*').eq('tarefa_id',id).order('ordem',{ascending:true}),
      db.from('qa_diagramas').select('*').eq('tarefa_id',id).order('created_at',{ascending:true})
    ]);
    if(s.error) throw s.error;
    if(d.error) throw d.error;
    if (state.currentId !== id) return;
    state.scenarios=s.data||[]; state.diagrams=d.data||[];
    renderScenarios(); renderDiagrams();
    await phase2.loadDocuments(id);
    await phase3.load(id);
    await phase4.load(id);
    await requirements.load(id);
    await requirementUsage.load(id);
    await coverageUi.load(id);
  } catch(e) { toast('Não foi possível buscar os detalhes: '+errMessage(e),true); }
}
function updatePublicLink(task){
  const anchor=$('#task-public-link');
  anchor.hidden=!(task?.id&&task.publica);
  if(task?.id&&task.publica)anchor.href='./public.html?tf='+encodeURIComponent(task.id);
}
function renderTaskNextActions(){
  const id=state.currentId,task=state.tasks.find(t=>t.id===id);
  const box=$('#qa-next-actions');
  box.hidden=!task;
  if(!task)return;
  const progress=progressForTask(state.scenarios.filter(s=>s.tarefa_id===id));
  $('#qa-next-progress').textContent=progress.done+'/'+progress.total+' executados';
  $('#qa-next-caption').textContent=progress.total
    ?progress.pending+' cenário(s) pendente(s) · '+progress.failed+' com falha · '+progress.blocked+' bloqueado(s).'
    :'Esta TF ainda não tem casos. Gere um roteiro ou adicione o primeiro cenário.';
  $('#qa-next-test').href='#/ferramentas/teste?tf='+encodeURIComponent(id);
  $('#qa-next-post').href='#/ferramentas/post?tf='+encodeURIComponent(id);
  $('#qa-scenario-generator').href='#/ferramentas/teste?tf='+encodeURIComponent(id);
  $('#qa-next-derive').disabled=!progress.done;
  $('#qa-next-report').disabled=!progress.total;
  $('#qa-next-message').textContent='';
}
function renderScenarios() {
  const progress=progressForTask(state.scenarios);
  $('#scenarios-number').textContent=state.scenarios.length;
  $('#qa-scenario-progress').textContent=progress.done+'/'+progress.total+
    ' executados · '+progress.failed+' com falha · '+progress.blocked+' bloqueado(s)';
  $('#qa-scenario-next').disabled=!progress.pending;
  const filter=$('#qa-scenario-filter').value;
  const filtered=state.scenarios.filter(s=>filter==='all'||
    filter==='pending'&&s.status==='nao_executado'||
    filter==='failed'&&s.status==='reprovado'||
    filter==='blocked'&&s.status==='bloqueado');
  $('#scenarios-list').innerHTML=filtered.length ? filtered.map((s)=>{
    const i=state.scenarios.indexOf(s);
    const quick=(status,title,extra='')=>
      '<button type="button" class="btn soft qa-quick-choice '+extra+
      '" data-quick-id="'+esc(s.id)+'" data-quick-status="'+status+
      '" aria-label="'+esc(title)+' — '+esc(s.titulo)+'">'+esc(title)+'</button>';
    const details=[
      s.passos?'<p class="field-label">Passos</p><p class="scenario-content">'+esc(s.passos)+'</p>':'',
      s.esperado?'<p class="field-label">Resultado esperado</p><p class="scenario-content">'+esc(s.esperado)+'</p>':'',
      s.obtido?'<p class="field-label">Resultado observado</p><p class="scenario-content">'+esc(s.obtido)+'</p>':'',
      s.observacoes?'<p class="field-label">Observações</p><p class="scenario-content">'+esc(s.observacoes)+'</p>':''
    ].join('');
    return '<article class="scenario-card qa-fast-card" data-quick-card="'+esc(s.id)+'"><header><div><p class="eyebrow">CENÁRIO '+(i+1).toString().padStart(2,'0')+'</p><h3>'+
      esc(s.titulo)+'</h3></div><div class="card-actions"><button data-edit-scenario="'+esc(s.id)+
      '" type="button">Editar</button><button data-delete-scenario="'+esc(s.id)+'" type="button">Excluir</button>'+
      '<button data-scenario-coverage="'+esc(s.id)+'" type="button">Cobertura</button></div></header>'+
      '<div class="scenario-meta">'+statusBadge(s.status)+'</div>'+
      '<div class="qa-quick-results" role="group" aria-label="Resultado de '+esc(s.titulo)+'">'+
      quick('aprovado','Funcionou','qa-quick-success')+
      quick('reprovado','Não funcionou','qa-quick-fail')+
      quick('bloqueado','Bloqueado')+
      quick('nao_executado','Não executado')+
      '<button type="button" class="btn soft" data-quick-evidence="'+esc(s.id)+'">Evidência</button></div>'+
      '<details class="qa-quick-details"><summary>Ver passos, esperado e observações</summary>'+details+
      '</details></article>';
  }).join('') :
    (state.scenarios.length?
      '<div class="empty"><strong>Sem cenários neste filtro</strong>Selecione Todos para exibir outros resultados.</div>':
      '<div class="empty"><strong>Sem cenários cadastrados</strong>Gere casos de teste ou adicione um cenário manualmente.</div>');
  renderTaskNextActions();
}
function renderDiagrams() {
  $('#diagrams-number').textContent = state.diagrams.length;
  $('#diagrams-list').innerHTML = state.diagrams.length ? state.diagrams.map(d=>
    '<article class="diagram-card"><header><h3>'+esc(d.titulo)+'</h3><div class="card-actions">'+
    '<button type="button" data-show-diagram="'+esc(d.id)+'">Visualizar</button>'+
    '<button type="button" data-zoom-diagram="'+esc(d.id)+'">Ampliar</button>'+
    '<button type="button" data-edit-diagram="'+esc(d.id)+'">Editar</button>'+
    '<button type="button" data-delete-diagram="'+esc(d.id)+'">Excluir</button></div></header>'+
    '<details class="diagram-code-details"><summary>Ver código Mermaid</summary><pre>'+esc(d.conteudo)+'</pre></details>'+
    '<div class="diagram-render" data-diagram-target="'+esc(d.id)+'"></div></article>').join('') :
    '<div class="empty"><strong>Nenhum diagrama ainda</strong>Crie um fluxo manualmente ou gere com IA usando os dados desta TF.</div>';
}

function openScenario(s=null) {
  if (!state.currentId) return toast('Salve a TF primeiro.',true);
  if(!confirmDetailDiscard('scenario-form')) return;
  setFormDirty('scenario-form', false);
  const form=$('#scenario-form');
  form.reset();
  form.elements.id.value=s?.id||'';
  if(s) setForm(form,scenarioFields,s);
  else form.elements.ordem.value=(Math.max(0,...state.scenarios.map(item=>item.ordem))+1).toString();
  $('#scenario-form-title').textContent=s?'Editar cenário':'Novo cenário';
  form.hidden=false;
  const dialog=$('#scenario-dialog');
  if(!dialog.open)dialog.showModal();
  form.elements.titulo.focus();
}
function openDiagram(d=null) {
  if (!state.currentId) return toast('Salve a TF primeiro.',true);
  if(!confirmDetailDiscard('diagram-form')) return;
  setFormDirty('diagram-form', false);
  const form=$('#diagram-form');
  form.reset();
  form.elements.id.value=d?.id||'';
  form.elements.titulo.value=d?.titulo||'';
  form.elements.conteudo.value=d?.conteudo||'flowchart LR\n  A[Início] --> B{Condição}\n  B -->|Sim| C[Resultado]\n  B -->|Não| D[Alternativa]';
  $('#diagram-form-title').textContent=d?'Editar diagrama':'Novo diagrama';
  $('#diagram-ai-error').hidden=true;
  $('#diagram-ai-text').value='';
  form.querySelector('[name="diagram-ai-origin"][value="task"]').checked=true;
  $('#diagram-ai-text-wrap').hidden=true;
  $('#diagram-scenario-wrap').hidden=false;
  const selected=new Set(Array.isArray(d?.origem_cenarios)&&d.origem_cenarios.length
    ? d.origem_cenarios : state.scenarios.map(item=>item.id));
  const group=$('#diagram-scenario-list');group.replaceChildren();
  if(!state.scenarios.length){
    const hint=document.createElement('p');hint.className='muted fine';
    hint.textContent='Nenhum cenário cadastrado nesta TF.';group.append(hint);
  }
  for(const scenario of state.scenarios){
    const label=document.createElement('label'),check=document.createElement('input');
    check.type='checkbox';check.name='diagram-scenario';check.value=scenario.id;
    check.checked=selected.has(scenario.id);
    label.append(check,document.createTextNode(scenario.titulo));group.append(label);
  }
  state.diagramGenerationContext=d?{
    kind:d.origem_tipo||'manual',ids:Array.isArray(d.origem_cenarios)?d.origem_cenarios:[]
  }:null;
  const focused=state.tasks.find(t=>t.id===state.currentId);
  diagramRequirementPicker.load(focused).catch(error=>{
    const message=$('#diagram-ai-error');
    message.hidden=false;message.textContent='Falha ao carregar requisitos: '+errMessage(error);
  });
  $('#diagram-ai-progress').hidden=true;
  $('#diagram-preview').textContent='Clique em Prévia para visualizar o diagrama.';
  form.hidden=false;
  const dialog=$('#diagram-dialog');
  if(!dialog.open)dialog.showModal();
  form.elements.titulo.focus();
}
async function previewMermaid(text, target) {
  target.replaceChildren();
  if(!text.trim()){target.textContent='Informe o código do diagrama.';return null;}
  if(text.length>16000){target.textContent='O diagrama excede 16.000 caracteres.';return null;}
  try {
    const {default:mermaid} = await import('https://esm.sh/mermaid@12.3.0');
    mermaid.initialize({startOnLoad:false,securityLevel:'strict',theme:'neutral',maxTextSize:16000});
    const id='qa-diagram-'+crypto.randomUUID().replaceAll('-','');
    const displayCode=horizontalFlowchart(text);
    if(mermaid.parse)await mermaid.parse(displayCode);
    const {svg} = await mermaid.render(id,displayCode);
    // Mermaid renderiza e sanitiza o SVG quando securityLevel = strict.
    target.innerHTML = svg;
    return svg;
  } catch(e) { target.textContent='Erro no diagrama: '+errMessage(e); return null; }
}
// Record CRUD refreshes its own list. Do not reopen the TF: openTask resets
// the active tab to Resumo and takes keyboard/scroll focus away from the user.
async function refreshRecordList(kind,taskId){
  const scenario=kind==='scenario';
  const table=scenario?'qa_cenarios':'qa_diagramas';
  const sort=scenario?'ordem':'created_at';
  const {data,error}=await db.from(table).select('*').eq('tarefa_id',taskId)
    .order(sort,{ascending:true});
  if(error)throw error;
  if(state.currentId!==taskId)return;
  if(scenario){
    state.scenarios=data||[];
    renderScenarios();
    phase2.renderExecution();
    await coverageUi.load(taskId,{keepFocus:true});
    // Keep dashboard/list counters up to date without re-opening the editor.
    await loadData();
  }else{
    state.diagrams=data||[];
    renderDiagrams();
  }
}

// One consistent, accessible confirmation for record deletion and discarding
// changes. Modal focus and Escape are handled by native <dialog>.
function askRecordConfirmation({title,description,confirmText='Excluir',danger=true}){
  return new Promise(resolve=>{
    const dialog=$('#record-confirm-dialog');
    if(dialog.open){resolve(false);return;}
    $('#record-confirm-title').textContent=title;
    $('#record-confirm-description').textContent=description;
    const accept=$('#record-confirm-accept');
    const cancel=$('#record-confirm-cancel');
    accept.textContent=confirmText;
    accept.className='btn '+(danger?'danger':'primary');
    const finish=answer=>{
      cancel.removeEventListener('click',onCancel);
      accept.removeEventListener('click',onAccept);
      dialog.removeEventListener('cancel',onEscape);
      if(dialog.open)dialog.close();
      resolve(answer);
    };
    const onCancel=()=>finish(false);
    const onAccept=()=>finish(true);
    const onEscape=event=>{event.preventDefault();finish(false);};
    cancel.addEventListener('click',onCancel);
    accept.addEventListener('click',onAccept);
    dialog.addEventListener('cancel',onEscape);
    dialog.showModal();
    cancel.focus();
  });
}
async function closeRecordEditor(kind){
  if(state.isBusy)return;
  const scenario=kind==='scenario';
  const formId=scenario?'scenario-form':'diagram-form';
  const dialog=$('#'+(scenario?'scenario-dialog':'diagram-dialog'));
  if(!dialog.open)return;
  if(state.dirtyForms.has(formId)){
    const allowed=await askRecordConfirmation({
      title:'Descartar alterações?',
      description:'As alterações neste '+(scenario?'cenário':'diagrama')+' não foram salvas.',
      confirmText:'Descartar'
    });
    if(!allowed)return;
  }
  setFormDirty(formId,false);
  if(dialog.open)dialog.close();
  $('#'+formId).hidden=true;
}
for(const kind of ['scenario','diagram']){
  $('#'+kind+'-dialog').addEventListener('cancel',event=>{
    event.preventDefault();
    void closeRecordEditor(kind);
  });
}

async function refreshAfterSave(id) {
  await loadData();
  if(id) await openTask(id);
  else renderTasks();
}

$('#auth-toggle').addEventListener('click',()=>{
  state.signingUp=!state.signingUp;
  $('#auth-title').textContent=state.signingUp?'Criar uma conta':'Entrar na plataforma';
  $('#auth-submit').textContent=state.signingUp?'Criar conta':'Entrar';
  $('#auth-toggle').textContent=state.signingUp?'Já tenho uma conta':'Criar uma conta';
  $('#auth-warning').hidden=true;
  $('#resend-confirmation').hidden=true;
});
$('#auth-form').addEventListener('submit',async (event)=>{
  event.preventDefault();
  const button=$('#auth-submit'); busy(button,true);
  try {
    const email=$('#auth-email').value.trim(), password=$('#auth-password').value;
    const result=state.signingUp
      ? await db.auth.signUp({email,password,options:{emailRedirectTo:QA_CONFIG.authRedirectUrl}})
      : await db.auth.signInWithPassword({email,password});
    if(result.error) throw result.error;
    if(state.signingUp && !result.data.session) {
      const warning=$('#auth-warning');warning.hidden=false;warning.textContent='Conta criada. Verifique seu email e confirme pelo link enviado. O link retornará ao QA Hub.';
      $('#resend-confirmation').hidden = false;
      return;
    }
    state.user=result.data.user;
    $('#auth-password').value='';
    showApp();
    await loadData(); location.hash='#/dashboard'; await route();
  }catch(e){
    if (e?.code === 'email_not_confirmed') $('#resend-confirmation').hidden = false;
    toast(errMessage(e),true);
  }finally{busy(button,false)}
});
$('#resend-confirmation').addEventListener('click', async () => {
  const email = $('#auth-email').value.trim();
  if (!$('#auth-email').checkValidity() || !email) {
    $('#auth-email').focus();
    toast('Informe um email válido para reenviar a confirmação.',true);
    return;
  }
  const button = $('#resend-confirmation');
  busy(button,true);
  try {
    const {error} = await db.auth.resend({
      type:'signup', email, options:{emailRedirectTo:QA_CONFIG.authRedirectUrl}
    });
    if (error) throw error;
    toast('Se o cadastro estiver pendente de confirmação, um novo email será enviado.');
  } catch(e) { toast(errMessage(e),true); }
  finally { busy(button,false); }
});
$('#logout').addEventListener('click',async()=>{
  if (!confirmDiscard('Existem alterações não salvas. Deseja sair mesmo assim?')) return;
  clearFormDirty();
  const {error}=await db.auth.signOut();
  if(error)toast(errMessage(error),true);else location.hash='#/dashboard';
});
const mobileMenu = window.matchMedia('(max-width: 800px)');
function setSidebar(open) {
  const expanded = mobileMenu.matches && open;
  $('#sidebar').classList.toggle('open', expanded);
  $('#sidebar').inert = mobileMenu.matches && !expanded;
  $('#sidebar-backdrop').hidden = !expanded;
  $('#menu-button').setAttribute('aria-expanded', String(expanded));
  $('#menu-button').setAttribute('aria-label', expanded ? 'Fechar menu' : 'Abrir menu');
  document.body.classList.toggle('mobile-nav-open', expanded);
}
$('#menu-button').addEventListener('click',()=>{
  const open = $('#menu-button').getAttribute('aria-expanded') !== 'true';
  setSidebar(open);
  if(open) $('#sidebar .navigation a').focus();
});
$('#sidebar-backdrop').addEventListener('click',()=>{
  setSidebar(false);
  $('#menu-button').focus();
});
document.addEventListener('keydown',event=>{
  if(event.key === 'Escape' && $('#menu-button').getAttribute('aria-expanded') === 'true'){
    setSidebar(false);
    $('#menu-button').focus();
  }
});
mobileMenu.addEventListener('change',()=>setSidebar(false));
setSidebar(false);
function navigateNewTask() {
  if(location.hash === '#/nova') {
    if(!confirmDiscard()) return;
    clearFormDirty();
    openNewTask();
  } else location.hash = '#/nova';
}
$('#new-task').addEventListener('click',navigateNewTask);
function resetTaskListPage(){state.taskListPage=0;renderTasks();}
$('#task-search').addEventListener('input',resetTaskListPage);
$('#filter-status').addEventListener('change',resetTaskListPage);
$('#filter-type').addEventListener('change',resetTaskListPage);
$('#tasks-load-more').addEventListener('click',()=>{state.taskListPage++;renderTasks();});
window.addEventListener('hashchange',()=>route().catch(e=>toast(errMessage(e),true)));
$$('[data-tab]').forEach(button=>{
  button.addEventListener('click',()=>selectTab(button.dataset.tab));
  button.addEventListener('keydown',event=>{
    const keys=['ArrowLeft','ArrowRight','Home','End'];
    if(!keys.includes(event.key)||button.disabled) return;
    event.preventDefault();
    const tabs=$$('[data-tab]').filter(tab=>!tab.disabled);
    const position=tabs.indexOf(button);
    const next=event.key==='Home' ? 0 : event.key==='End' ? tabs.length-1 :
      (position + (event.key==='ArrowRight'?1:-1) + tabs.length) % tabs.length;
    selectTab(tabs[next].dataset.tab);
    tabs[next].focus();
  });
});
for(const id of ['task-form','scenario-form','diagram-form']){
  const form=$('#'+id);
  form.addEventListener('input',()=>setFormDirty(id));
  form.addEventListener('change',()=>setFormDirty(id));
}
window.addEventListener('beforeunload',event=>{
  if(state.dirtyForms.size===0) return;
  event.preventDefault();
  event.returnValue='';
});
// Issue #33 — single-screen human execution, bound to the existing scenario ID.
// No AI result can invoke this path. Errors leave stored data unchanged.
let quickResultBusy=false,quickPending=null;
async function commitQuickResult(scenario,status,observed=''){
  if(quickResultBusy||state.isBusy||!state.currentId||!scenario||
    scenario.tarefa_id!==state.currentId)return false;
  const taskId=state.currentId;
  if(scenario.status===status){
    toast('Este cenário já possui essa situação. Edite o registro se precisar acrescentar observações.');
    return true;
  }
  if(scenario.status!=='nao_executado'){
    const confirmed=await askRecordConfirmation({
      title:'Alterar o resultado deste cenário?',
      description:'A execução atual de “'+scenario.titulo+'” já está registrada. O resultado anterior será preservado nas observações. Confirma uma nova execução?',
      confirmText:'Atualizar resultado',danger:false
    });
    if(!confirmed||taskId!==state.currentId)return false;
  }
  let payload;
  try{payload=quickExecutionPayload(scenario,status,observed);}
  catch(error){toast(errMessage(error),true);return false;}
  if(scenario.obtido&&scenario.status!=='nao_executado'){
    const note='Execução anterior ('+(statuses[scenario.status]||scenario.status)+
      '): '+scenario.obtido;
    payload.observacoes=[scenario.observacoes||'',note].filter(Boolean).join('\n');
  }
  quickResultBusy=true;
  $$('#scenarios-list [data-quick-status]').forEach(button=>button.disabled=true);
  try{
    const {data,error}=await db.from('qa_cenarios')
      .update(payload).eq('id',scenario.id).eq('tarefa_id',taskId)
      .select('id').maybeSingle();
    if(error)throw error;
    if(!data?.id)throw Error('O banco não confirmou o resultado do cenário.');
    await refreshRecordList('scenario',taskId);
    toast('Resultado salvo neste cenário. A situação geral da TF permanece inalterada.');
    return true;
  }catch(error){
    toast('Falha ao registrar resultado: '+errMessage(error),true);
    return false;
  }finally{
    quickResultBusy=false;
    $$('#scenarios-list [data-quick-status]').forEach(button=>button.disabled=false);
  }
}
function showQuickResultDialog(scenario,status){
  if(!scenario||!['reprovado','bloqueado'].includes(status))return;
  const dialog=$('#qa-quick-result-dialog');
  if(dialog.open)return;
  quickPending={scenarioId:scenario.id,status,taskId:state.currentId};
  $('#qa-quick-title').textContent=status==='reprovado'?'Registrar falha':'Registrar bloqueio';
  $('#qa-quick-intro').textContent=scenario.titulo+
    ' · informe o comportamento observado para registrar a execução.';
  $('#qa-quick-observed').value=scenario.status===status?scenario.obtido||'':'';
  dialog.showModal();$('#qa-quick-observed').focus();
}
$('#qa-quick-cancel').addEventListener('click',()=>{
  quickPending=null;$('#qa-quick-result-dialog').close();
});
$('#qa-quick-result-dialog').addEventListener('close',()=>{quickPending=null});
$('#qa-quick-result-form').addEventListener('submit',async event=>{
  event.preventDefault();
  if(!quickPending||quickResultBusy)return;
  const item=state.scenarios.find(s=>s.id===quickPending.scenarioId);
  if(!item||state.currentId!==quickPending.taskId)return;
  const input=$('#qa-quick-observed');
  if(!input.reportValidity())return;
  const button=$('#qa-quick-confirm');
  button.disabled=true;
  const ok=await commitQuickResult(item,quickPending.status,input.value);
  button.disabled=false;
  if(ok&&$('#qa-quick-result-dialog').open)$('#qa-quick-result-dialog').close();
});
$('#qa-scenario-filter').addEventListener('change',renderScenarios);
$('#qa-scenario-next').addEventListener('click',()=>{
  const pending=state.scenarios.find(s=>s.status==='nao_executado');
  if(!pending)return toast('Nenhum cenário pendente nesta TF.');
  $('#qa-scenario-filter').value='pending';
  renderScenarios();
  const card=document.querySelector('[data-quick-card="'+pending.id+'"]');
  card?.scrollIntoView({behavior:'smooth',block:'nearest'});
  card?.querySelector('[data-quick-status="aprovado"]')?.focus({preventScroll:true});
});
$('#qa-next-execute').addEventListener('click',()=>{
  selectTab('cenarios');
  if(state.scenarios.some(s=>s.status==='nao_executado'))
    $('#qa-scenario-next').click();
});
$('#qa-next-derive').addEventListener('click',()=>{
  const task=state.tasks.find(t=>t.id===state.currentId);
  if(!task)return;
  const {tested,conclusion,summary}=createCompletionDraft(task,state.scenarios);
  if(!summary.finalizados)return toast('Execute ao menos um cenário antes de compor os resultados.',true);
  const form=$('#task-form');
  if((form.elements.descricao.value.trim()||form.elements.conclusao.value.trim())&&
     !confirm('O formulário já contém descrição ou conclusão. Substituir pelos textos derivados dos cenários executados? Os dados somente serão salvos ao clicar em Salvar TF.'))
    return;
  form.elements.descricao.value=tested;
  form.elements.conclusao.value=conclusion;
  setFormDirty('task-form');
  $('#qa-next-message').textContent='Resumo e conclusão sugeridos a partir dos resultados reais. Revise e clique Salvar TF; nada foi gravado automaticamente.';
  form.elements.descricao.scrollIntoView({behavior:'smooth',block:'center'});
  toast('Proposta preenchida para revisão. Não houve salvamento automático.');
});
$('#qa-next-report').addEventListener('click',()=>{
  selectTab('documentos');
  $('#document-generate-report').click();
});
$('#qa-next-diagram').addEventListener('click',()=>{
  selectTab('diagramas');$('#add-diagram').click();
});
$('#qa-next-evidence').addEventListener('click',()=>{
  selectTab('auditoria');$('#evidence-summary').focus();
});
document.addEventListener('click',async (event)=>{
  const target=event.target.closest('button');
  if(!target) return;
  if(target.matches('[data-new-task]')) navigateNewTask();
  if(target.matches('[data-clear-filters]')){
    $('#task-search').value='';
    $('#filter-status').value='';
    $('#filter-type').value='';
    renderTasks();
    $('#task-search').focus();
  }
  const focusCoverage=target.dataset.scenarioCoverage;
  if(focusCoverage&&state.scenarios.some(s=>s.id===focusCoverage)){
    selectTab('cobertura');
    await coverageUi.load(state.currentId,{keepFocus:true});
    coverageUi.focusScenario(focusCoverage);
  }
  const editScenario=target.dataset.editScenario, deleteScenario=target.dataset.deleteScenario;
  const editDiagram=target.dataset.editDiagram, deleteDiagram=target.dataset.deleteDiagram, showDiagram=target.dataset.showDiagram, zoomDiagram=target.dataset.zoomDiagram;
  if(editScenario) openScenario(state.scenarios.find(s=>s.id===editScenario));
  if(editDiagram) openDiagram(state.diagrams.find(d=>d.id===editDiagram));
  if(showDiagram || zoomDiagram) {
    const id=showDiagram||zoomDiagram;
    const item=state.diagrams.find(d=>d.id===id);
    const region=$('[data-diagram-target="'+id+'"]');
    if(item && region){
      const svg=await previewMermaid(item.conteudo,region);
      if(svg && zoomDiagram)diagramViewer.open(svg,item.titulo);
    }
  }
  if(deleteScenario||deleteDiagram){
    if(state.isBusy)return;
    const scenario=Boolean(deleteScenario);
    const taskId=state.currentId;
    const id=deleteScenario||deleteDiagram;
    const current=scenario?state.scenarios:state.diagrams;
    const item=current.find(record=>record.id===id);
    if(!item||!taskId)return;
    const type=scenario?'cenário':'diagrama';
    const confirmed=await askRecordConfirmation({
      title:'Excluir '+type+'?',
      description:'“'+item.titulo+'” será excluído permanentemente. Esta ação não pode ser desfeita.'
    });
    if(!confirmed||state.currentId!==taskId)return;
    busy(null,true);
    try{
      const table=scenario?'qa_cenarios':'qa_diagramas';
      const {error}=await db.from(table).delete().eq('id',id).eq('tarefa_id',taskId);
      if(error)throw error;
      await refreshRecordList(scenario?'scenario':'diagram',taskId);
      toast(scenario?'Cenário excluído.':'Diagrama excluído.');
    }catch(error){toast(errMessage(error),true)}
    finally{busy(null,false)}
  }
});
$('#task-form').addEventListener('submit',async (event)=>{
  event.preventDefault(); if(state.isBusy || !state.user) return;
  const button=$('#save-task'),form=event.currentTarget;
  if(!form.reportValidity()) return;
  busy(button,true);
  try {
    const data=normalizeNarrativeFields(inputValues(form,taskFields),TASK_NARRATIVE_FIELDS);
    data.erro_reproduzido=nullableBool(data.erro_reproduzido);
    data.funcionando=nullableBool(data.funcionando);
    data.publica=data.publica==='true';
    data.executado_em ||= dateToday();
    data.updated_at=new Date().toISOString();
    let result;
    if(state.currentId){
      result=await db.from('qa_tarefas').update(data).eq('id',state.currentId).select().single();
    }else{
      result=await db.from('qa_tarefas').insert({...data,user_id:state.user.id}).select().single();
    }
    if(result.error) throw result.error;
    const id=result.data.id;
    // Mark this TF as existing immediately. If an associated requirement
    // import fails, a retry must UPDATE the same TF rather than INSERT anew.
    if(!state.currentId){state.currentId=id;requirements.attachTask(id);}
    focusTask(id);
    setFormDirty('task-form',false);
    setFormDirty('assist-text',false);
    let scenarioWarning='';
    const confirmedScenarios=state.pendingScenarios.filter(scenario=>scenario.selected!==false);
    if(confirmedScenarios.length){
      const payload=confirmedScenarios.map((scenario,index)=>({
        ...normalizeNarrativeFields({
          titulo:scenario.titulo,passos:scenario.passos,esperado:scenario.esperado,
          obtido:scenario.obtido,observacoes:scenario.observacoes
        },SCENARIO_NARRATIVE_FIELDS),
        tarefa_id:id,user_id:state.user.id,ordem:index+1,status:'nao_executado'
      }));
      const {error:scenarioError}=await db.from('qa_cenarios').insert(payload);
      if(scenarioError){
        scenarioWarning='TF salva, mas os cenários não foram adicionados. Salve novamente para tentar: '+errMessage(scenarioError);
      }else {
        state.pendingScenarios=[];
      }
    }
    if(!scenarioWarning)state.pendingScenarios=[];
    let requirementWarning='';
    try{
      await requirements.onTaskSaved(id);
    }catch(error){
      requirementWarning='TF salva, mas não foi possível adicionar os requisitos. Abra Requisitos e tente salvar novamente: '+errMessage(error);
    }
    await refreshAfterSave(id);
    if(scenarioWarning)toast(scenarioWarning,true);
    if(requirementWarning)toast(requirementWarning,true);
    // The TF is persisted even if a secondary batch fails; opening its details
    // must not prompt to discard the already-confirmed task save.
    setFormDirty('requirements-source',false);
    location.hash='#/tarefa/'+id;
    if(!scenarioWarning&&!requirementWarning)toast('Tarefa salva com sucesso.');
  }catch(e){toast('Falha ao salvar TF: '+errMessage(e),true)}finally{busy(button,false)}
});
$('#delete-task').addEventListener('click',async()=>{
  const id=state.currentId;if(!id) return;
  if(state.isBusy)return;
  const confirmed=await askRecordConfirmation({
    title:'Excluir esta TF?',
    description:'A TF e todos os seus cenários e diagramas serão excluídos permanentemente. Esta ação não pode ser desfeita.'
  });
  if(!confirmed||state.currentId!==id)return;
  const {error}=await db.from('qa_tarefas').delete().eq('id',id);
  if(error)return toast(errMessage(error),true);
  clearFormDirty();
  state.currentId=null;await refreshAfterSave(null);
  location.hash='#/tarefas';toast('Tarefa excluída.');
});
$('#add-scenario').addEventListener('click',()=>openScenario());
$('#cancel-scenario').addEventListener('click',()=>void closeRecordEditor('scenario'));
$('#scenario-form').addEventListener('submit',async event=>{
  event.preventDefault();if(state.isBusy)return;
  const form=event.currentTarget;
  if(!form.reportValidity())return;
  const button=form.querySelector('[type=submit]');busy(button,true);
  try{
    const values=normalizeNarrativeFields(inputValues(form,scenarioFields),SCENARIO_NARRATIVE_FIELDS);
    values.ordem=Math.max(0,Number(values.ordem)||0);
    values.updated_at=new Date().toISOString();
    const id=form.elements.id.value;
    const result=id?await db.from('qa_cenarios').update(values).eq('id',id).eq('tarefa_id',state.currentId):
      await db.from('qa_cenarios').insert({...values,tarefa_id:state.currentId,user_id:state.user.id});
    if(result.error)throw result.error;
    setFormDirty('scenario-form',false);
    $('#scenario-dialog').close();
    form.hidden=true;
    await refreshRecordList('scenario',state.currentId);
    toast(id?'Cenário atualizado.':'Cenário criado.');
  }catch(e){toast(errMessage(e),true)}finally{busy(button,false)}
});
$$('input[name="diagram-ai-origin"]').forEach(input=>input.addEventListener('change',()=>{
  const custom=$('input[name="diagram-ai-origin"]:checked').value==='text';
  $('#diagram-ai-text-wrap').hidden=!custom;
  $('#diagram-scenario-wrap').hidden=custom;
}));
$('#task-visibility').addEventListener('change',()=>{
  const publicChoice=$('#task-visibility').value==='true';
  $('#visibility-hint').textContent=publicChoice
    ? 'Atenção: título, descrição, cenários, diagramas e dados informados nesta TF poderão ser vistos por qualquer pessoa com o link. Revise informações internas antes de publicar.'
    : 'Somente sua conta e administradores podem consultar esta TF.';
});
$('#diagram-generate').addEventListener('click',async()=>{
  if(state.isBusy || !state.currentId)return;
  const custom=$('input[name="diagram-ai-origin"]:checked')?.value==='text';
  const currentTask=state.tasks.find(t=>t.id===state.currentId);
  const picked=[...document.querySelectorAll('input[name="diagram-scenario"]:checked')].map(input=>input.value);
  const chosen=selectedScenarioContext(currentTask||{},state.scenarios,picked);
  const error=$('#diagram-ai-error'),progress=$('#diagram-ai-progress');
  error.hidden=true;error.textContent='';
  let source,selectedRequirements;
  try{
    if(diagramRequirementPicker.taskId!==state.currentId)
      throw Error('Os requisitos desta TF ainda não foram carregados. Atualize antes de gerar.');
    selectedRequirements=diagramRequirementPicker.getContext('');
    const taskText=custom ? $('#diagram-ai-text').value.trim() :
      collectTaskContext(currentTask||{},chosen.selected);
    source=combineDiagramContext(taskText,selectedRequirements.text);
  }catch(contextError){
    error.textContent=errMessage(contextError);error.hidden=false;return;
  }
  if(!source.trim()){
    error.textContent=custom?'Descreva o processo para gerar o diagrama.':'Esta TF ainda não tem informações suficientes.';
    error.hidden=false;
    return;
  }
  const button=$('#diagram-generate');
  busy(button,true);
  progress.hidden=false;
  progress.textContent='Gerando diagrama…';
  try{
    const result=await requestAiDiagram({
      db,text:source,
      onProgress:message=>{progress.textContent=message;}
    });
    const code=cleanMermaid(result.code);
    state.diagramGenerationContext={
      kind:custom?'texto':'tf',ids:custom?[]:chosen.ids,
      generationId:crypto.randomUUID(),
      requirementsSnapshot:selectedRequirements.snapshots
    };
    $('#diagram-source').value=code;
    setFormDirty('diagram-form');
    if(!$('#diagram-form').elements.titulo.value.trim()){
      $('#diagram-form').elements.titulo.value=currentTask?.titulo
        ? 'Fluxo — '+currentTask.titulo.slice(0,125):'Fluxo do processo';
    }
    const svg=await previewMermaid(code,$('#diagram-preview'));
    if(!svg){
      error.textContent='O diagrama precisa de ajustes. Edite o código e clique em Prévia.';
      error.hidden=false;
    }else if(result.fallback){
      error.textContent='O modelo não respondeu corretamente. Gerei um fluxo básico a partir do texto para revisão.';
      error.hidden=false;
    }
  }catch(e){
    error.textContent=e?.message||'Não foi possível gerar o diagrama.';
    error.hidden=false;
  }finally{progress.hidden=true;busy(button,false);}
});
$('#add-diagram').addEventListener('click',()=>openDiagram());
$('#cancel-diagram').addEventListener('click',()=>void closeRecordEditor('diagram'));
$('#preview-diagram').addEventListener('click',()=>previewMermaid($('#diagram-source').value,$('#diagram-preview')));
$('#zoom-diagram-preview').addEventListener('click',async()=>{
  const code=$('#diagram-source').value;
  const svg=await previewMermaid(code,$('#diagram-preview'));
  if(svg)diagramViewer.open(svg,$('#diagram-form').elements.titulo.value||'Diagrama');
});
$('#diagram-form').addEventListener('submit',async event=>{
  event.preventDefault();if(state.isBusy)return;
  const form=event.currentTarget, button=form.querySelector('[type=submit]');
  if(!form.reportValidity())return;
  busy(button,true);
  try{
    const values={titulo:form.elements.titulo.value.trim(),conteudo:horizontalFlowchart(form.elements.conteudo.value.trim()),updated_at:new Date().toISOString(),
      origem_tipo:state.diagramGenerationContext?.kind||'manual',
      origem_cenarios:state.diagramGenerationContext?.ids||[]};
    const id=form.elements.id.value;
    const result=id?await db.from('qa_diagramas').update(values).eq('id',id).eq('tarefa_id',state.currentId):
      await db.from('qa_diagramas').insert({...values,user_id:state.user.id,tarefa_id:state.currentId});
    if(result.error)throw result.error;
    if(state.diagramGenerationContext?.requirementsSnapshot?.length){
      try{
        await recordRequirementUsage(db,{
          taskId:state.currentId,uid:state.user.id,type:'diagrama',
          artifactRef:id||state.diagramGenerationContext.generationId,
          snapshots:state.diagramGenerationContext.requirementsSnapshot
        });
      }catch(error){
        toast('Diagrama salvo, mas não foi possível registrar os requisitos utilizados: '+errMessage(error),true);
      }
    }
    setFormDirty('diagram-form',false);
    $('#diagram-dialog').close();
    form.hidden=true;
    await refreshRecordList('diagram',state.currentId);
    toast(id?'Diagrama atualizado.':'Diagrama criado.');
  }catch(e){toast(errMessage(e),true)}finally{busy(button,false)}
});


function checkLocalAiAvailability(){
  const supported=typeof Worker!=='undefined' && typeof WebAssembly!=='undefined';
  $('#assist-device').disabled=!supported;
  $('#assist-capability').hidden=supported;
  $('#assist-capability').textContent=supported?'':'IA no dispositivo indisponível neste navegador.';
}

function showAssistDraft(draft){
  state.assistDraft=draft;
}

function applyAssistDraft(){
  const draft=state.assistDraft;
  if(!draft)return;
  const form=$('#task-form');
  // This workflow creates a new TF, so regenerating explicitly updates draft fields.
  let total=0;
  for(const [key,value] of Object.entries(draft.fields)){
    const field=form.elements.namedItem(key);
    if(!field || !value)continue;
    field.value=value;
    total++;
  }
  // The AI may invent cases from descriptive text. Only evidence of an explicitly
  // numbered scenario with executable steps in the ORIGINAL report can be saved.
  state.pendingScenarios=extractExplicitScenarios($('#assist-text').value)
    .map(item=>({...item,status:'nao_executado',selected:true}));
  renderPendingScenarios();
  form.elements.namedItem('status').value='rascunho';
  if(total || state.pendingScenarios.length)setFormDirty('task-form');
  setFormDirty('assist-text',false);
  revealTaskDetails(draft.fields);
  setTaskStep('review',true);
  const count=state.pendingScenarios.length;
  $('#editor-caption').textContent=count
    ? count+' caso(s) de teste identificado(s). Confirme antes de salvar.'
    : '';
}

function renderPendingScenarios(){
  const box=$('#draft-scenario-review'),list=$('#draft-scenario-list');
  list.replaceChildren();
  const isNew=!state.currentId;
  const entries=state.pendingScenarios;
  box.hidden=!isNew || entries.length===0;
  entries.forEach((scenario,index)=>{
    const row=document.createElement('label');
    row.className='draft-scenario-item';
    const checkbox=document.createElement('input');
    checkbox.type='checkbox';
    checkbox.checked=scenario.selected!==false;
    checkbox.dataset.scenarioIndex=String(index);
    const body=document.createElement('span');
    const title=document.createElement('strong');
    title.textContent=scenario.titulo;
    const detail=document.createElement('small');
    detail.textContent=scenario.passos.replace(/\s+/g,' ').slice(0,210);
    body.append(title,detail);row.append(checkbox,body);list.append(row);
  });
  updatePendingScenarioCount();
}
function updatePendingScenarioCount(){
  const count=state.pendingScenarios.filter(s=>s.selected!==false).length;
  $('#draft-scenario-count').textContent=count+' de '+state.pendingScenarios.length+' selecionado(s) para salvar.';
}
$('#draft-scenario-list').addEventListener('change',event=>{
  const checkbox=event.target.closest('input[data-scenario-index]');
  if(!checkbox)return;
  const item=state.pendingScenarios[Number(checkbox.dataset.scenarioIndex)];
  if(!item)return;
  item.selected=checkbox.checked;
  setFormDirty('task-form');
  updatePendingScenarioCount();
});

function showAssistError(message){
  const feedback=$('#assist-error');
  feedback.textContent=message;
  feedback.hidden=false;
}

async function runAssistExtraction(method){
  if(state.isBusy)return;
  const raw=$('#assist-text').value;
  if(!raw.trim()){
    showAssistError('Cole o texto da tarefa para continuar.');
    $('#assist-text').focus();
    return;
  }
  const startHash=location.hash;
  const startUser=state.user?.id;
  const buttons=['assist-ai','assist-device','assist-local','assist-manual'].map(id=>$('#'+id));
  const modal=$('#ai-loading-modal');
  const title=$('#assist-loading-title');
  const detail=$('#assist-loading-description');
  const names={nvidia:'IA NVIDIA',device:'IA no dispositivo',local:'Extração'};
  title.textContent=method==='local'?'Organizando os campos…':'Gerando com '+names[method]+'…';
  detail.textContent='Analisando o relatório.';
  $('#assist-error').hidden=true;
  $('#assist-error').textContent='';
  if(!modal.open)modal.showModal();
  $('#assist-panel').setAttribute('aria-busy','true');
  busy(null,true); // The loading panel is the only spinner.
  buttons.forEach(button=>{button.disabled=true;});
  state.assistDraft=null;
  try{
    let draft,usedFallback=false;
    if(method==='nvidia'){
      const result=await extractWithNvidia(raw,db,progress=>{
        detail.textContent=progress||'Analisando o relatório.';
      });
      draft=result.draft;
      usedFallback=Boolean(result.fallback);
    }else if(method==='device'){
      draft=await extractWithOpenModel(raw,progress=>{
        detail.textContent=progress||'Analisando o relatório.';
      });
    }else{
      draft=extractLocalDraft(raw);
    }
    if(location.hash!==startHash || state.user?.id!==startUser || state.currentId!==null)return;
    // Close the modal before moving focus to the now-visible review form.
    if(modal.open)modal.close();
    showAssistDraft(draft);
    applyAssistDraft();
    if(usedFallback){
      // The single caption in the review step conveys the fallback,
      // without another toast on top of the generated form.
      $('#editor-caption').textContent='A resposta da IA foi complementada pela extração local. Revise os campos.';
    }
  }catch(error){
    if(location.hash!==startHash || state.user?.id!==startUser)return;
    showAssistError(error?.name==='TimeoutError'
      ?'A IA demorou demais. Tente novamente ou use Extrair sem IA.'
      :error?.message||'Não foi possível gerar. Tente Extrair sem IA.');
  }finally{
    if(modal.open)modal.close();
    $('#assist-panel').setAttribute('aria-busy','false');
    busy(null,false);
    buttons.forEach(button=>{button.disabled=false;});
    checkLocalAiAvailability();
  }
}
$('#ai-loading-modal').addEventListener('cancel',event=>{
  if(state.isBusy)event.preventDefault();
});
$('#assist-local').addEventListener('click',()=>runAssistExtraction('local'));
$('#assist-ai').addEventListener('click',()=>runAssistExtraction('nvidia'));
$('#assist-device').addEventListener('click',()=>runAssistExtraction('device'));
$('#assist-manual').addEventListener('click',()=>{
  if(state.isBusy)return;
  setTaskStep('review',true);
  $('#editor-caption').textContent='';
});
$('#assist-back').addEventListener('click',()=>{
  if(state.isBusy)return;
  setTaskStep('entry',true);
});
$('#assist-text').addEventListener('input',()=>{
  setFormDirty('assist-text');
  state.assistDraft=null;
  // Cases extracted from an older version of the report must not be saved
  // if the pasted text is changed and the user proceeds manually.
  state.pendingScenarios=[];
  renderPendingScenarios();
  $('#assist-error').hidden=true;
  $('#assist-error').textContent='';
});

// O importador analisa o texto localmente, sem inferir aprovação de cenários.
$('#import-open').addEventListener('click',()=>$('#import-dialog').showModal());
$('#import-cancel').addEventListener('click',()=>$('#import-dialog').close());
$('#import-confirm').addEventListener('click',async()=>{
  if(state.isBusy)return;
  const button=$('#import-confirm');busy(button,true);
  try {
    const parsed=parseReport($('#import-text').value);
    const taskData={titulo:parsed.titulo,tipo_teste:parsed.tipo_teste,status:'rascunho',descricao:parsed.descricao,
      conclusao:parsed.conclusao,observacoes:parsed.observacoes,funcionando:parsed.funcionando,erro_reproduzido:parsed.erro_reproduzido,
      user_id:state.user.id,executado_em:dateToday()};
    const {data,error}=await db.from('qa_tarefas').insert(taskData).select().single();
    if(error)throw error;
    if(parsed.cenarios.length){
      const input=parsed.cenarios.map(s=>({user_id:state.user.id,tarefa_id:data.id,ordem:s.ordem,titulo:s.titulo,passos:s.passos,status:'nao_executado'}));
      const {error:scenariosError}=await db.from('qa_cenarios').insert(input);
      if(scenariosError){
        toast('A TF foi criada, mas a importação dos cenários falhou: '+errMessage(scenariosError),true);
        await refreshAfterSave(data.id);location.hash='#/tarefa/'+data.id;return;
      }
    }
    $('#import-dialog').close();$('#import-text').value='';
    await refreshAfterSave(data.id);location.hash='#/tarefa/'+data.id;
    toast('Relatório importado. Revise os '+parsed.cenarios.length+' cenários antes de concluir a TF.');
  }catch(e){toast(errMessage(e),true)}finally{busy(button,false)}
});
start();