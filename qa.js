import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.119.0';
import Chart from 'https://esm.sh/chart.js@4.6.1/auto';
import { QA_CONFIG } from './qa-config.js';
import { parseReport } from './qa-parser.mjs';
import { extractLocalDraft } from './qa-assistant.mjs';
import { extractWithOpenModel } from './qa-ai-open.mjs';
import { extractWithNvidia } from './qa-nvidia.mjs';
import { collectTaskContext, cleanMermaid, requestAiDiagram } from './qa-mermaid-ai.mjs';
import { createDiagramViewer } from './qa-diagram-viewer.mjs';

// Capture Supabase Auth callback errors before the SDK processes the URL fragment.
const callbackErrorCode = location.hash.startsWith('#error=')
  ? new URLSearchParams(location.hash.slice(1)).get('error_code') : null;
const db = createClient(QA_CONFIG.url, QA_CONFIG.publishableKey);
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const state = { user: null, tasks: [], scenarioStats: [], scenarios: [], diagrams: [], currentId: null, chart: null, signingUp: false, isBusy: false, dirtyForms: new Set(), activeHash: null, assistDraft: null, pendingScenarios: [] };
const statuses = { rascunho: 'Rascunho', em_teste: 'Em teste', aprovado: 'Aprovado', reprovado: 'Reprovado', bloqueado: 'Bloqueado', nao_executado: 'Não executado' };
const taskFields = ['publica','codigo','titulo','tipo_teste','status','sistema','versao','ambiente','base_teste','empresa','testador','descricao','explicacao','causa','correcao','conclusao','observacoes','erro_reproduzido','funcionando','executado_em'];
const scenarioFields = ['titulo','status','ordem','passos','esperado','obtido','observacoes'];
const dateToday = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0,10); };
const esc = (v) => String(v ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const formatDate = (v) => v ? new Date(v + 'T12:00:00').toLocaleDateString('pt-BR') : '—';
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
  if (event === 'SIGNED_OUT') { state.user = null; state.tasks = []; state.scenarioStats = []; showAuth(); }
});

function taskItem(task) {
  const scenarios = state.scenarioStats.filter(s => s.tarefa_id === task.id);
  const prefix = task.codigo ? task.codigo.slice(0,5) : 'TF';
  return '<div class="task-item"><a href="#/tarefa/' + encodeURIComponent(task.id) + '">' +
    '<span class="task-code">' + esc(prefix) + '</span><span class="task-title"><strong>' + esc(task.titulo) +
    '</strong><small>' + esc(task.codigo || 'Sem código') + ' · ' + esc(task.tipo_teste) + ' · ' +
    scenarios.length + ' cenário(s)' + (task.versao ? ' · v' + esc(task.versao) : '') +
    '</small></span></a>' + (task.publica ? '<span class="task-sharing">Pública</span>' : '') + statusBadge(task.status) + '<span class="task-date">' + formatDate(task.executado_em) + '</span></div>';
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
  $('#task-list').innerHTML = list.length ? list.map(taskItem).join('') :
    (hasFilters ? emptyWithFilters : emptyWithoutFilters);
  $('#task-count').textContent = list.length + ' tarefa(s) na lista' + (state.tasks.length >= 1000 ? ' · primeiros 1.000 registros' : '');
}
function renderDashboard() {
  const tasks = state.tasks, scenarios = state.scenarioStats;
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
function setView(name) {
  $$('.view').forEach(node => { node.hidden = node.id !== 'view-'+name; });
  $$('.navigation a[data-route]').forEach(node => node.classList.toggle('active',node.dataset.route===name));
  const crumbs = {dashboard:'Visão geral',tarefas:'Tarefas de teste',editor:'Detalhes da TF'};
  $('#breadcrumb').textContent = crumbs[name] || 'QA Hub';
  setSidebar(false);
}
function selectTab(name) {
  for (const tab of ['resumo','cenarios','diagramas']) {
    const selected = name === tab;
    $('#tab-'+tab).hidden = !selected;
    const button = $('[data-tab="'+tab+'"]');
    button.classList.toggle('active',selected);
    button.setAttribute('aria-selected',String(selected));
    button.tabIndex = selected ? 0 : -1;
  }
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
  if (hash === '#/tarefas') { setView('tarefas'); return; }
  if (hash === '#/nova') { openNewTask(); return; }
  if (hash.startsWith('#/tarefa/')) {
    const id = hash.slice('#/tarefa/'.length);
    if (id !== state.currentId || !state.tasks.some(t=>t.id===id)) {
      await openTask(id);
    } else setView('editor');
    return;
  }
  setView('dashboard');
}
function setTaskStep(step, focus=false) {
  const entering=step==='entry';
  $('#assist-panel').hidden=!entering;
  $('#editor-fields').hidden=entering;
  $('#save-task').hidden=entering;
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
  setTaskStep('entry');
  $('#assist-text').value='';
  $('#assist-error').hidden=true;
  $('#assist-error').textContent='';
  $('#assist-loading').hidden=true;
  $('#task-extra-details').open=false;
  $('#task-analysis-details').open=false;
  $('#task-validation-details').open=false;
  $('#assist-back').hidden=false;
  checkLocalAiAvailability();
  state.currentId = null;
  state.scenarios = []; state.diagrams = [];
  $('#task-form').reset();
  $('#task-form').elements.publica.value='false';
  $('#task-public-link').hidden=true;
  $('#task-form').elements.executado_em.value = dateToday();
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
  setTaskStep('review');
  const task = state.tasks.find(t=>t.id === id);
  if (!task) { toast('Tarefa não encontrada ou sem acesso.',true); location.hash = '#/tarefas'; return; }
  clearFormDirty();
  state.currentId = id;
  $('#task-form').reset();
  setForm($('#task-form'),taskFields,task);
  updatePublicLink(task);
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
  } catch(e) { toast('Não foi possível buscar os detalhes: '+errMessage(e),true); }
}
function updatePublicLink(task){
  const anchor=$('#task-public-link');
  anchor.hidden=!(task?.id&&task.publica);
  if(task?.id&&task.publica)anchor.href='./public.html?tf='+encodeURIComponent(task.id);
}
function renderScenarios() {
  $('#scenarios-number').textContent = state.scenarios.length;
  $('#scenarios-list').innerHTML = state.scenarios.length ? state.scenarios.map((s,i)=>
    '<article class="scenario-card"><header><div><p class="eyebrow">CENÁRIO '+(i+1).toString().padStart(2,'0')+'</p><h3>'+
    esc(s.titulo)+'</h3></div><div class="card-actions"><button data-edit-scenario="'+esc(s.id)+'" type="button">Editar</button><button data-delete-scenario="'+esc(s.id)+'" type="button">Excluir</button></div></header>'+
    '<div class="scenario-meta">'+statusBadge(s.status)+'</div>'+
    (s.passos?'<p class="field-label">Passos executados</p><p class="scenario-content">'+esc(s.passos)+'</p>':'')+
    (s.esperado?'<p class="field-label">Resultado esperado</p><p class="scenario-content">'+esc(s.esperado)+'</p>':'')+
    (s.obtido?'<p class="field-label">Resultado obtido</p><p class="scenario-content">'+esc(s.obtido)+'</p>':'')+
    (s.observacoes?'<p class="field-label">Observações</p><p class="scenario-content">'+esc(s.observacoes)+'</p>':'')+
    '</article>').join('') :
    '<div class="empty"><strong>Sem cenários cadastrados</strong>Adicione seus passos e resultados individualmente.</div>';
}
function renderDiagrams() {
  $('#diagrams-number').textContent = state.diagrams.length;
  $('#diagrams-list').innerHTML = state.diagrams.length ? state.diagrams.map(d=>
    '<article class="diagram-card"><header><h3>'+esc(d.titulo)+'</h3><div class="card-actions"><button type="button" data-show-diagram="'+esc(d.id)+'">Visualizar</button><button type="button" data-edit-diagram="'+esc(d.id)+'">Editar</button><button type="button" data-delete-diagram="'+esc(d.id)+'">Excluir</button></div></header><pre>'+esc(d.conteudo)+'</pre><div class="diagram-render" data-diagram-target="'+esc(d.id)+'"></div></article>').join('') :
    '<div class="empty"><strong>Nenhum diagrama por enquanto</strong>Use Mermaid para explicar processos, fluxos ou decisões.</div>';
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
  form.hidden=false; form.scrollIntoView({behavior:'smooth',block:'start'});
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
  form.elements.conteudo.value=d?.conteudo||'flowchart TD\n  A[Início] --> B{Condição}\n  B -->|Sim| C[Resultado]\n  B -->|Não| D[Alternativa]';
  $('#diagram-form-title').textContent=d?'Editar diagrama':'Novo diagrama';
  $('#diagram-preview').textContent='Clique em Visualizar para gerar o diagrama.';
  form.hidden=false; form.scrollIntoView({behavior:'smooth',block:'start'});
  form.elements.titulo.focus();
}
async function previewMermaid(text, target) {
  target.replaceChildren();
  if(!text.trim()){target.textContent='Informe o código do diagrama.';return;}
  if(text.length>16000){target.textContent='O diagrama excede 16.000 caracteres.';return;}
  try {
    const {default:mermaid} = await import('https://esm.sh/mermaid@12.3.0');
    mermaid.initialize({startOnLoad:false,securityLevel:'strict',theme:'neutral',maxTextSize:16000});
    const id='qa-diagram-'+crypto.randomUUID().replaceAll('-','');
    const {svg} = await mermaid.render(id,text);
    // Mermaid renderiza e sanitiza o SVG quando securityLevel = strict.
    target.innerHTML = svg;
  } catch(e) { target.textContent='Erro no diagrama: '+errMessage(e); }
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
$('#task-search').addEventListener('input',renderTasks);
$('#filter-status').addEventListener('change',renderTasks);
$('#filter-type').addEventListener('change',renderTasks);
window.addEventListener('hashchange',()=>route().catch(e=>toast(errMessage(e),true)));
$$('[data-tab]').forEach(button=>{
  button.addEventListener('click',()=>selectTab(button.dataset.tab));
  button.addEventListener('keydown',event=>{
    const keys=['ArrowLeft','ArrowRight','Home','End'];
    if(!keys.includes(event.key)) return;
    event.preventDefault();
    const tabs=$$('[data-tab]');
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
  const editScenario=target.dataset.editScenario, deleteScenario=target.dataset.deleteScenario;
  const editDiagram=target.dataset.editDiagram, deleteDiagram=target.dataset.deleteDiagram, showDiagram=target.dataset.showDiagram;
  if(editScenario) openScenario(state.scenarios.find(s=>s.id===editScenario));
  if(editDiagram) openDiagram(state.diagrams.find(d=>d.id===editDiagram));
  if(showDiagram) {
    const item=state.diagrams.find(d=>d.id===showDiagram);
    const region=$('[data-diagram-target="'+showDiagram+'"]');
    if(item && region) await previewMermaid(item.conteudo,region);
  }
  if(deleteScenario && confirm('Excluir este cenário?')) {
    const {error}=await db.from('qa_cenarios').delete().eq('id',deleteScenario).eq('tarefa_id',state.currentId);
    if(error)toast(errMessage(error),true);else{toast('Cenário excluído.');await refreshAfterSave(state.currentId);}
  }
  if(deleteDiagram && confirm('Excluir este diagrama?')) {
    const {error}=await db.from('qa_diagramas').delete().eq('id',deleteDiagram).eq('tarefa_id',state.currentId);
    if(error)toast(errMessage(error),true);else{toast('Diagrama excluído.');await refreshAfterSave(state.currentId);}
  }
});
$('#task-form').addEventListener('submit',async (event)=>{
  event.preventDefault(); if(state.isBusy || !state.user) return;
  const button=$('#save-task'),form=event.currentTarget;
  if(!form.reportValidity()) return;
  busy(button,true);
  try {
    const data=inputValues(form,taskFields);
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
    setFormDirty('task-form',false);
    setFormDirty('assist-text',false);
    let scenarioWarning='';
    if(state.pendingScenarios.length){
      const payload=state.pendingScenarios.map((scenario,index)=>({
        ...scenario,tarefa_id:id,user_id:state.user.id,ordem:index+1,status:'nao_executado'
      }));
      const {error:scenarioError}=await db.from('qa_cenarios').insert(payload);
      if(scenarioError){
        scenarioWarning='TF salva, mas os cenários não foram adicionados. Salve novamente para tentar: '+errMessage(scenarioError);
      }else {
        state.pendingScenarios=[];
      }
    }
    await refreshAfterSave(id);
    if(scenarioWarning)toast(scenarioWarning,true);
    location.hash='#/tarefa/'+id;
    if(!scenarioWarning)toast('Tarefa salva com sucesso.');
  }catch(e){toast('Falha ao salvar TF: '+errMessage(e),true)}finally{busy(button,false)}
});
$('#delete-task').addEventListener('click',async()=>{
  const id=state.currentId;if(!id) return;
  if(!confirm('Excluir esta TF e TODOS os seus cenários e diagramas? Esta ação não pode ser desfeita.'))return;
  const {error}=await db.from('qa_tarefas').delete().eq('id',id);
  if(error)return toast(errMessage(error),true);
  clearFormDirty();
  state.currentId=null;await refreshAfterSave(null);
  location.hash='#/tarefas';toast('Tarefa excluída.');
});
$('#add-scenario').addEventListener('click',()=>openScenario());
$('#cancel-scenario').addEventListener('click',()=>{
  if(!confirmDetailDiscard('scenario-form')) return;
  setFormDirty('scenario-form',false);
  $('#scenario-form').hidden=true;
});
$('#scenario-form').addEventListener('submit',async event=>{
  event.preventDefault();if(state.isBusy)return;
  const form=event.currentTarget;
  if(!form.reportValidity())return;
  const button=form.querySelector('[type=submit]');busy(button,true);
  try{
    const values=inputValues(form,scenarioFields);
    values.ordem=Math.max(0,Number(values.ordem)||0);
    values.updated_at=new Date().toISOString();
    const id=form.elements.id.value;
    const result=id?await db.from('qa_cenarios').update(values).eq('id',id).eq('tarefa_id',state.currentId):
      await db.from('qa_cenarios').insert({...values,tarefa_id:state.currentId,user_id:state.user.id});
    if(result.error)throw result.error;
    setFormDirty('scenario-form',false);
    await refreshAfterSave(state.currentId);
    selectTab('cenarios');toast('Cenário salvo.');
  }catch(e){toast(errMessage(e),true)}finally{busy(button,false)}
});
$('#add-diagram').addEventListener('click',()=>openDiagram());
$('#cancel-diagram').addEventListener('click',()=>{
  if(!confirmDetailDiscard('diagram-form')) return;
  setFormDirty('diagram-form',false);
  $('#diagram-form').hidden=true;
});
$('#preview-diagram').addEventListener('click',()=>previewMermaid($('#diagram-source').value,$('#diagram-preview')));
$('#diagram-form').addEventListener('submit',async event=>{
  event.preventDefault();if(state.isBusy)return;
  const form=event.currentTarget, button=form.querySelector('[type=submit]');
  if(!form.reportValidity())return;
  busy(button,true);
  try{
    const values={titulo:form.elements.titulo.value.trim(),conteudo:form.elements.conteudo.value.trim(),updated_at:new Date().toISOString()};
    const id=form.elements.id.value;
    const result=id?await db.from('qa_diagramas').update(values).eq('id',id).eq('tarefa_id',state.currentId):
      await db.from('qa_diagramas').insert({...values,user_id:state.user.id,tarefa_id:state.currentId});
    if(result.error)throw result.error;
    setFormDirty('diagram-form',false);
    await refreshAfterSave(state.currentId);
    selectTab('diagramas');toast('Diagrama salvo.');
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
  state.pendingScenarios=draft.cenarios.map(item=>({...item,status:'nao_executado'}));
  form.elements.namedItem('status').value='rascunho';
  if(total || state.pendingScenarios.length)setFormDirty('task-form');
  setFormDirty('assist-text',false);
  revealTaskDetails(draft.fields);
  setTaskStep('review',true);
  const count=state.pendingScenarios.length;
  $('#editor-caption').textContent=count
    ? count+' cenário(s) identificado(s). Eles serão adicionados ao salvar.'
    : 'Confira os campos antes de salvar.';
}

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
  const title=$('#assist-loading-title');
  const detail=$('#assist-loading-description');
  const names={nvidia:'IA NVIDIA',device:'IA no dispositivo',local:'Extração'};
  title.textContent=method==='local'?'Organizando os campos…':'Gerando com '+names[method]+'…';
  detail.textContent='Analisando o relatório.';
  $('#assist-error').hidden=true;
  $('#assist-error').textContent='';
  $('#assist-loading').hidden=false;
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
    $('#assist-loading').hidden=true;
    $('#assist-panel').setAttribute('aria-busy','false');
    busy(null,false);
    buttons.forEach(button=>{button.disabled=false;});
    checkLocalAiAvailability();
  }
}
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