// tickets.js — Ticket list, filters and new ticket logic
// absprinter | Inova+ Helpdesk

let currentTab = 'all';

window.onload = function () {
  checkAuth();
  updateCounts();
  renderTickets();
};

function updateCounts() {
  const counts = { all:TICKETS.length, open:0, progress:0, resolved:0, closed:0 };
  TICKETS.forEach(t => {
    if      (t.status==='Aberto')       counts.open++;
    else if (t.status==='Em andamento') counts.progress++;
    else if (t.status==='Resolvido')    counts.resolved++;
    else if (t.status==='Fechado')      counts.closed++;
  });
  const set = (id,v) => { const el=document.getElementById(id); if(el) el.textContent=v; };
  set('count-all',     counts.all);
  set('count-open',    counts.open);
  set('count-progress',counts.progress);
  set('count-resolved',counts.resolved);
  set('count-closed',  counts.closed);
}

function setTab(tab, btn) {
  document.querySelectorAll('.status-tabs .tab-btn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  currentTab = tab;
  const sf = document.getElementById('filter-status');
  if (sf) sf.value='';
  renderTickets();
}

function filterTickets() { renderTickets(); }

function clearFilters() {
  ['search-input','filter-status','filter-priority','filter-category'].forEach(id=>{
    const el=document.getElementById(id); if(el) el.value='';
  });
  renderTickets();
}

function renderTickets() {
  const search    = (document.getElementById('search-input')?.value||'').toLowerCase();
  const statusF   = document.getElementById('filter-status')?.value||'';
  const priorityF = document.getElementById('filter-priority')?.value||'';
  const categoryF = document.getElementById('filter-category')?.value||'';

  const data = TICKETS.filter(t => {
    if (currentTab!=='all' && t.status!==currentTab) return false;
    if (statusF   && t.status!==statusF)             return false;
    if (priorityF && t.priority!==priorityF)         return false;
    if (categoryF && t.category!==categoryF)         return false;
    if (search && !t.subject.toLowerCase().includes(search)
               && !t.id.includes(search)
               && !t.requester.toLowerCase().includes(search)) return false;
    return true;
  });

  const tbody = document.getElementById('tickets-body');
  if (!tbody) return;
  tbody.innerHTML = data.length
    ? data.map(t=>ticketRow(t,true)).join('')
    : '<tr><td colspan="10" class="empty-state">Nenhum ticket encontrado com os filtros selecionados</td></tr>';

  updateCounts();
}

// ========================= NEW TICKET =========================

function showCategoryFields() {
  const cat = document.getElementById('nt-category')?.value;
  const printerFields = document.getElementById('printer-fields');
  if (!printerFields) return;
  if (cat==='Impressora'||cat==='Suprimentos') printerFields.classList.remove('hidden');
  else                                          printerFields.classList.add('hidden');
  aiClassify();
  updateKBSuggestions();
}

let aiTimer;
function aiClassify() {
  clearTimeout(aiTimer);
  const subject = document.getElementById('nt-subject')?.value||'';
  const aiBox   = document.getElementById('ai-suggestion');
  const aiText  = document.getElementById('ai-suggestion-text');
  if (!subject.trim()||subject.length<8) { aiBox?.classList.add('hidden'); return; }

  aiTimer = setTimeout(()=>{
    let category='', priority='', suggestion='';
    const s = subject.toLowerCase();
    if      (s.includes('atol')||s.includes('papel'))                         { category='Impressora';  priority='Alta';    suggestion='Possível desgaste do rolete de alimentação. Consulte o artigo "Como limpar papel atolado".'; }
    else if (s.includes('toner')||s.includes('tinta')||s.includes('cartucho')){ category='Suprimentos'; priority='Alta';    suggestion='Solicitar reposição de suprimento. Verifique o nível atual e o modelo exato.'; }
    else if (s.includes('fusão')||s.includes('manchas')||s.includes('erro 9'))  { category='Impressora';  priority='Crítica'; suggestion='Possível falha na unidade de fusão. Requer intervenção técnica urgente.'; }
    else if (s.includes('rede')||s.includes('offline')||s.includes('conexão')) { category='Rede';        priority='Alta';    suggestion='Verificar IP da impressora e driver de rede. Reiniciar spooler de impressão.'; }
    else if (s.includes('vpn')||s.includes('senha')||s.includes('acesso'))    { category='TI';          priority='Média';   suggestion='Verificar credenciais e permissões. Encaminhar para administrador de TI.'; }
    else if (s.includes('financeiro')||s.includes('nf')||s.includes('nota'))   { category='Financeiro';  priority='Média';   suggestion='Encaminhar para equipe financeira com documentação necessária.'; }
    else                                                                        { category='TI';          priority='Média';   suggestion='Classificação automática. Analista irá revisar e reclassificar se necessário.'; }

    const catSel = document.getElementById('nt-category');
    if (catSel&&!catSel.value) { catSel.value=category; showCategoryFields(); }
    const priSel = document.getElementById('nt-priority');
    if (priSel) priSel.value=priority;

    if (aiText) aiText.innerHTML=`<strong>📂 Categoria detectada:</strong> ${category} &nbsp;|&nbsp; <strong>⚡ Prioridade sugerida:</strong> ${priority}<br><small style="color:var(--text3);margin-top:4px;display:block">💡 ${suggestion}</small>`;
    aiBox?.classList.remove('hidden');
    updateKBSuggestions();
  },600);
}

function updateKBSuggestions() {
  const subject   = document.getElementById('nt-subject')?.value?.toLowerCase()||'';
  const cat       = document.getElementById('nt-category')?.value||'';
  const container = document.getElementById('kb-suggestions');
  if (!container) return;
  const matches = KB.filter(a=>
    (cat&&a.cat===cat)||
    (subject.length>4&&(a.title.toLowerCase().includes(subject.substring(0,8))||a.cat.toLowerCase().includes(subject.substring(0,5))))
  ).slice(0,4);
  const hint = document.querySelector('.kb-suggest-hint');
  if (matches.length) {
    if (hint) hint.classList.add('hidden');
    container.innerHTML = matches.map(a=>`
      <div class="kb-suggest-item">
        <i class="fa fa-file-lines" style="color:var(--accent2);margin-right:6px"></i>${a.title}
        <span style="float:right;font-size:0.7rem;color:var(--text3)">${a.cat}</span>
      </div>`).join('');
  } else {
    if (hint) hint.classList.remove('hidden');
    container.innerHTML='';
  }
}

function submitTicket() {
  const subject  = document.getElementById('nt-subject')?.value.trim();
  const category = document.getElementById('nt-category')?.value;
  const desc     = document.getElementById('nt-desc')?.value.trim();

  if (!subject||!category||!desc) {
    showToast('Preencha todos os campos obrigatórios!','error');
    return;
  }

  const serial   = document.getElementById('nt-serial')?.value||'';
  const model    = document.getElementById('nt-printer-model')?.value||'';
  const priority = document.getElementById('nt-priority')?.value||'Média';
  const dept     = document.getElementById('nt-dept')?.value||'TI';
  const user     = JSON.parse(localStorage.getItem('inova_user')||'{}');

  // Generate next ID
  const maxId    = TICKETS.reduce((m,t)=>Math.max(m,parseInt(t.id.replace('#',''))||0),0);
  const newId    = `#${String(maxId+1).padStart(4,'0')}`;
  const today    = new Date().toISOString().split('T')[0];

  TICKETS.unshift({
    id:newId, subject, category,
    requester: user.name||'Cauan Gomes',
    assignee:  'Ana Lima',
    priority, status:'Aberto', sla:100,
    created:today, serial, model, dept, desc, comments:[]
  });

  showToast(`Chamado ${newId} aberto com sucesso! SLA iniciado.`,'success');
  setTimeout(()=>window.location.href='tickets.html',1800);
}
