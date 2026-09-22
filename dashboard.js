// dashboard.js — Dashboard Inteligente Inova+
// absprinter © 2025

'use strict';

// ── Chart.js global defaults ──────────────────────────────────────────────────
Chart.defaults.color          = '#3d5470';
Chart.defaults.font.family    = 'DM Sans';
Chart.defaults.font.size      = 11;
Chart.defaults.plugins.legend.display = false;

const GRID_COLOR = 'rgba(255,255,255,0.04)';

// ── Palette ───────────────────────────────────────────────────────────────────
const C = {
  indigo: '#5b63f5', indigo2: '#7c83f7',
  teal: '#00d4aa', amber: '#f5a623',
  red: '#f5476b', green: '#22d47a',
  text3: '#3d5470',
};

// ── Init ──────────────────────────────────────────────────────────────────────
window.onload = () => {
  checkAuth();
  renderAll();
  updateTopbarAlerts();
  startLiveFeed();
  setInterval(renderAll, 60_000);
};

function renderAll() {
  computeKPIs();
  renderSparklines();
  renderVolumeChart();
  renderStatusDonut();
  renderCatBreakdown();
  renderSLARiskList();
  renderRecentTickets();
  renderTeamGrid();
  renderAIInsight();
  updateNavBadges();
}

// ── COMPUTED STATS ────────────────────────────────────────────────────────────
function stats() {
  const open     = TICKETS.filter(t => t.status === 'Aberto' || t.status === 'Em andamento');
  const resolved = TICKETS.filter(t => t.status === 'Resolvido' || t.status === 'Fechado');
  const critical = open.filter(t => t.priority === 'Crítica');
  const slaOk    = TICKETS.filter(t => t.sla >= 80).length;
  const slaAvg   = Math.round(TICKETS.reduce((s,t) => s + t.sla, 0) / TICKETS.length);

  const avgHours = (() => {
    const resolved_ts = resolved.filter(t => t.created);
    if (!resolved_ts.length) return 4.5;
    return 4.5; // simulated — real data would diff timestamps
  })();

  const cats = {};
  TICKETS.forEach(t => { cats[t.category] = (cats[t.category] || 0) + 1; });

  return { open, resolved, critical, slaOk, slaAvg, avgHours, cats, all: TICKETS };
}

// ── KPI CARDS ─────────────────────────────────────────────────────────────────
function computeKPIs() {
  const s = stats();

  animCount('kpi-open',     s.open.length);
  animCount('kpi-resolved', s.resolved.length);
  setText('kpi-sla',        s.slaAvg + '%');
  setText('kpi-time',       avgTimeLabel(s.avgHours));

  setText('kpi-open-sub',   `${s.critical.length} crítico${s.critical.length !== 1 ? 's' : ''} · ${s.open.filter(t=>t.status==='Em andamento').length} em atendimento`);
  setText('kpi-res-sub',    `${s.resolved.filter(t=>t.status==='Fechado').length} fechados definitivamente`);
  setText('kpi-sla-sub',    `Meta: 90% · ${s.slaOk} tickets OK`);
  setText('kpi-time-sub',   '-18min vs semana passada');

  // Deltas
  setDelta('kpi-open-delta',  '+8%', 'up');
  setDelta('kpi-res-delta',   '+12%', 'up');
  setDelta('kpi-sla-delta',   s.slaAvg >= 90 ? '+' + (s.slaAvg - 87) + '%' : '-3%', s.slaAvg >= 90 ? 'up' : 'warn');
  setDelta('kpi-time-delta',  '-18m', 'up');
}

function avgTimeLabel(hours) {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return `${h}h${m > 0 ? ' ' + m + 'm' : ''}`;
}

function animCount(id, target) {
  const el = document.getElementById(id);
  if (!el) return;
  const cur = parseInt(el.textContent) || 0;
  let n = cur;
  const step = Math.ceil(Math.abs(target - cur) / 20) || 1;
  clearInterval(el._t);
  el._t = setInterval(() => {
    if (n < target) n = Math.min(n + step, target);
    else if (n > target) n = Math.max(n - step, target);
    el.textContent = n;
    if (n === target) clearInterval(el._t);
  }, 35);
}

function setText(id, val)  { const el = document.getElementById(id); if (el) el.textContent = val; }
function setDelta(id, val, type) {
  const el = document.getElementById(id);
  if (!el) return;
  el.className = `kpi-delta ${type}`;
  const icons = { up: 'fa-arrow-trend-up', down: 'fa-arrow-trend-down', warn: 'fa-minus' };
  el.innerHTML = `<i class="fa ${icons[type] || 'fa-minus'}"></i> ${val}`;
}

// ── SPARKLINES ────────────────────────────────────────────────────────────────
const sparkInstances = {};

function renderSparklines() {
  const sparkData = {
    'spark-open':     { data: [5,8,6,12,9,11,7], color: C.indigo2 },
    'spark-resolved': { data: [4,6,9,7,11,13,10], color: C.green },
    'spark-sla':      { data: [85,82,88,84,87,89,87], color: C.amber },
    'spark-time':     { data: [5.2,4.8,5.5,4.1,4.7,4.3,4.5], color: C.teal },
  };

  Object.entries(sparkData).forEach(([id, cfg]) => {
    const canvas = document.getElementById(id);
    if (!canvas) return;

    if (sparkInstances[id]) sparkInstances[id].destroy();

    sparkInstances[id] = new Chart(canvas, {
      type: 'line',
      data: {
        labels: ['','','','','','',''],
        datasets: [{
          data: cfg.data,
          borderColor: cfg.color,
          borderWidth: 1.5,
          fill: true,
          backgroundColor: cfg.color + '18',
          tension: 0.45,
          pointRadius: 0,
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
        scales: { x: { display: false }, y: { display: false } },
        animation: { duration: 600 },
      }
    });
  });
}

// ── VOLUME CHART ──────────────────────────────────────────────────────────────
let volumeChart;
function renderVolumeChart() {
  const ctx = document.getElementById('chart-volume');
  if (!ctx) return;

  const days = ['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'];
  const opened = [8,12,7,15,10,4,3];
  const closed  = [6,9,10,12,8,3,2];

  if (volumeChart) { volumeChart.destroy(); }

  volumeChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: days,
      datasets: [
        {
          label: 'Abertos',
          data: opened,
          backgroundColor: C.indigo + 'bb',
          borderRadius: { topLeft:5, topRight:5 },
          borderSkipped: 'bottom',
        },
        {
          label: 'Fechados',
          data: closed,
          backgroundColor: C.green + 'bb',
          borderRadius: { topLeft:5, topRight:5 },
          borderSkipped: 'bottom',
        },
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true,
          position: 'top',
          align: 'end',
          labels: { color: C.text3, boxWidth: 10, font: { size: 11 }, usePointStyle: true, pointStyleWidth: 10 },
        },
        tooltip: {
          backgroundColor: '#0f2035',
          borderColor: 'rgba(255,255,255,0.08)',
          borderWidth: 1,
          titleColor: '#e8f0fe',
          bodyColor: '#7a93b0',
          padding: 10,
        },
      },
      scales: {
        x: { grid: { color: GRID_COLOR }, ticks: { color: C.text3 } },
        y: { grid: { color: GRID_COLOR }, ticks: { color: C.text3 }, beginAtZero: true },
      },
      animation: { duration: 700, easing: 'easeOutQuart' },
    }
  });
}

// ── STATUS DONUT ──────────────────────────────────────────────────────────────
let statusDonut;
function renderStatusDonut() {
  const ctx = document.getElementById('chart-status');
  if (!ctx) return;

  const counts = { Aberto:0, 'Em andamento':0, Resolvido:0, Fechado:0 };
  TICKETS.forEach(t => { if (counts[t.status] !== undefined) counts[t.status]++; });

  const labels = Object.keys(counts);
  const data   = Object.values(counts);
  const colors = [C.indigo2, C.amber, C.green, C.text3];

  if (statusDonut) statusDonut.destroy();

  statusDonut = new Chart(ctx, {
    type: 'doughnut',
    data: { labels, datasets: [{ data, backgroundColor: colors, borderWidth: 0, hoverOffset: 4 }] },
    options: {
      responsive: true, maintainAspectRatio: true,
      cutout: '68%',
      plugins: { legend: { display: false }, tooltip: { enabled: false } },
      animation: { duration: 600 },
    }
  });

  const legend = document.getElementById('status-legend');
  if (legend) {
    legend.innerHTML = labels.map((l, i) => `
      <div style="display:flex;align-items:center;gap:6px">
        <div style="width:8px;height:8px;border-radius:50%;background:${colors[i]};flex-shrink:0"></div>
        <span style="color:var(--text2)">${l}</span>
        <span style="font-family:'JetBrains Mono',monospace;font-size:0.68rem;color:var(--text1);margin-left:auto">${data[i]}</span>
      </div>`).join('');
  }
}

// ── CATEGORY BREAKDOWN ────────────────────────────────────────────────────────
function renderCatBreakdown() {
  const el = document.getElementById('cat-breakdown');
  if (!el) return;

  const cats = {};
  TICKETS.forEach(t => { cats[t.category] = (cats[t.category] || 0) + 1; });
  const total  = TICKETS.length;
  const sorted = Object.entries(cats).sort((a,b) => b[1]-a[1]);
  const catColors = { 'Impressora':C.indigo2,'Suprimentos':C.amber,'TI':C.teal,'Rede':C.green,'Financeiro':C.red,'RH':'#8b5cf6' };

  el.innerHTML = sorted.map(([name, count]) => {
    const pct   = Math.round((count / total) * 100);
    const color = catColors[name] || C.indigo2;
    return `
      <div class="cat-row">
        <div class="cat-top">
          <span class="cat-name">${name}</span>
          <span class="cat-count">${count} · ${pct}%</span>
        </div>
        <div class="cat-track">
          <div class="cat-fill" style="width:${pct}%;background:${color}"></div>
        </div>
      </div>`;
  }).join('');
}

// ── SLA RISK LIST ─────────────────────────────────────────────────────────────
function renderSLARiskList() {
  const el = document.getElementById('sla-risk-list');
  if (!el) return;

  const atRisk = TICKETS
    .filter(t => (t.status === 'Aberto' || t.status === 'Em andamento') && t.sla < 70)
    .sort((a,b) => a.sla - b.sla)
    .slice(0, 5);

  if (!atRisk.length) {
    el.innerHTML = `<div style="padding:1.5rem;text-align:center;color:var(--text3);font-size:0.8rem"><i class="fa fa-circle-check" style="color:var(--green);display:block;font-size:1.5rem;margin-bottom:6px"></i>Todos os chamados estão dentro do SLA ✅</div>`;
    return;
  }

  el.innerHTML = atRisk.map(t => {
    const pct    = t.sla;
    const color  = pct <= 20 ? C.red : C.amber;
    const level  = pct <= 20 ? 'crit' : 'warn';
    const label  = pct <= 20 ? 'Crítico' : 'Atenção';
    const r      = 16, c = 2 * Math.PI * r;
    const offset = c - (pct / 100) * c;

    return `
      <div class="sla-risk-item" onclick="openTicketDetail('${t.id}')">
        <div class="sla-ring">
          <svg width="36" height="36" viewBox="0 0 36 36">
            <circle cx="18" cy="18" r="${r}" fill="none" stroke="rgba(255,255,255,0.05)" stroke-width="3"/>
            <circle cx="18" cy="18" r="${r}" fill="none" stroke="${color}" stroke-width="3"
              stroke-dasharray="${c}" stroke-dashoffset="${offset}" stroke-linecap="round"/>
          </svg>
          <span class="sla-ring-pct" style="color:${color}">${pct}%</span>
        </div>
        <div class="sla-info">
          <div class="sla-id">${t.id}</div>
          <div class="sla-subj">${t.subject}</div>
          <div class="sla-who"><i class="fa fa-user" style="margin-right:4px"></i>${t.assignee || '—'}</div>
        </div>
        <div class="sla-level lvl-${level}">${label}</div>
      </div>`;
  }).join('');
}

// ── RECENT TICKETS ────────────────────────────────────────────────────────────
function renderRecentTickets() {
  const el = document.getElementById('recent-list');
  if (!el) return;

  const recent = TICKETS.slice(0, 7);
  const statusMap = { 'Aberto':'aberto','Em andamento':'andamento','Resolvido':'resolvido','Fechado':'fechado' };
  const dotMap    = { 'Crítica':'critica','Alta':'alta','Média':'media','Baixa':'baixa' };

  el.innerHTML = recent.map(t => {
    const slaColor = t.sla <= 20 ? C.red : t.sla <= 50 ? C.amber : C.green;
    return `
      <div class="ticket-row" onclick="openTicketDetail('${t.id}')">
        <div class="tr-priority-dot dot-${dotMap[t.priority]||'media'}"></div>
        <div class="tr-body">
          <div class="tr-id">${t.id}</div>
          <div class="tr-subj">${t.subject}</div>
          <div class="tr-meta">${t.category} · ${t.assignee || '—'}</div>
        </div>
        <span class="badge-status bs-${statusMap[t.status]||'aberto'}">${t.status}</span>
        <div class="tr-sla">
          <span class="tr-sla-pct" style="color:${slaColor}">${t.sla}%</span>
          <div class="tr-sla-bar"><div class="tr-sla-fill" style="width:${t.sla}%;background:${slaColor}"></div></div>
        </div>
      </div>`;
  }).join('');
}

// ── ACTIVITY FEED ─────────────────────────────────────────────────────────────
const FEED_EVENTS = [];

function buildInitialFeed() {
  const events = [];
  TICKETS.slice(0,5).forEach(t => {
    events.push({ type:'open', ticket:t, time: relTime(t.created) });
    t.comments.forEach(c => {
      events.push({ type:'comment', ticket:t, author:c.author, text:c.text, time:c.time });
    });
    if (t.status === 'Resolvido') events.push({ type:'resolve', ticket:t, time:t.created });
  });
  return events.slice(0,10);
}

function renderActivityFeed(events) {
  const el = document.getElementById('activity-feed');
  if (!el) return;

  const typeCfg = {
    open:    { cls:'fd-open',    icon:'fa-plus-circle', label:'Aberto' },
    resolve: { cls:'fd-resolve', icon:'fa-circle-check', label:'Resolvido' },
    alert:   { cls:'fd-alert',   icon:'fa-triangle-exclamation', label:'Alerta' },
    comment: { cls:'fd-comment', icon:'fa-comment', label:'Comentário' },
  };

  el.innerHTML = events.map(e => {
    const cfg = typeCfg[e.type] || typeCfg.open;
    const text = e.type === 'comment'
      ? `<strong>${e.author}</strong> comentou em ${e.ticket?.id || ''}`
      : `Chamado ${e.ticket?.id || ''} ${cfg.label.toLowerCase()}`;
    const sub  = e.type === 'comment' ? e.text?.slice(0,42) + '…' : e.ticket?.subject?.slice(0,46) + '…';

    return `
      <div class="feed-item">
        <div class="feed-dot ${cfg.cls}"><i class="fa ${cfg.icon}"></i></div>
        <div class="feed-text">
          <strong>${text}</strong>
          <span>${sub}</span>
        </div>
        <div class="feed-time">${e.time}</div>
      </div>`;
  }).join('');
}

function startLiveFeed() {
  const initial = buildInitialFeed();
  FEED_EVENTS.push(...initial);
  renderActivityFeed(FEED_EVENTS.slice(0,10));

  // Simulate new live events every ~15s
  const liveEvents = [
    { type:'open',    ticket:{ id:'#0043', subject:'HP LaserJet sem toner amarelo' },   time:'agora' },
    { type:'comment', ticket:{ id:'#0039' }, author:'Ricardo Silva', text:'Fusão trocada. Testando qualidade...', time:'agora' },
    { type:'resolve', ticket:{ id:'#0036', subject:'Epson L1250 — tinta ciano fraca' }, time:'agora' },
    { type:'alert',   ticket:{ id:'#0041', subject:'Toner MX722adhe — SLA crítico' },   time:'agora' },
  ];

  let idx = 0;
  setInterval(() => {
    const ev = liveEvents[idx % liveEvents.length];
    FEED_EVENTS.unshift({ ...ev, time: 'agora' });
    renderActivityFeed(FEED_EVENTS.slice(0,10));
    idx++;
  }, 15_000);
}

// ── TEAM GRID ─────────────────────────────────────────────────────────────────
function renderTeamGrid() {
  const el = document.getElementById('team-grid');
  if (!el) return;

  el.innerHTML = TEAM.map(m => {
    const slaColor = m.sla >= 90 ? C.green : m.sla >= 80 ? C.amber : C.red;
    return `
      <div class="team-member" onclick="window.location.href='team.html'">
        <div class="tm-avatar" style="background:linear-gradient(135deg,${m.color})">${m.initials}</div>
        <div class="tm-info">
          <div class="tm-name">${m.name.split(' ')[0]}</div>
          <div class="tm-role">${m.role}</div>
        </div>
        <div class="tm-sla" style="color:${slaColor}">${m.sla}%</div>
        <div class="tm-status ${m.online ? 'tm-online' : 'tm-offline'}"></div>
      </div>`;
  }).join('');
}

// ── AI INSIGHT ────────────────────────────────────────────────────────────────
function renderAIInsight() {
  const s = stats();
  const title = document.getElementById('ai-insight-title');
  const body  = document.getElementById('ai-insight-body');
  if (!title || !body) return;

  const insights = [];

  if (s.critical.length > 0) {
    insights.push({
      title: `🚨 ${s.critical.length} chamado${s.critical.length > 1 ? 's' : ''} crítico${s.critical.length > 1 ? 's' : ''} sem resolução`,
      body:  `${s.critical.map(t => t.id).join(', ')} requerem ação imediata. SLA médio: ${Math.round(s.critical.reduce((a,t)=>a+t.sla,0)/s.critical.length)}%`,
    });
  }

  const topCat = Object.entries(s.cats).sort((a,b) => b[1]-a[1])[0];
  if (topCat) {
    insights.push({
      title: `📊 ${topCat[0]} lidera com ${topCat[1]} chamados este mês`,
      body: `Considere revisar os processos de ${topCat[0].toLowerCase()} para reduzir o volume recorrente.`,
    });
  }

  const lowSLA = TICKETS.filter(t => t.sla < 40 && (t.status==='Aberto'||t.status==='Em andamento'));
  if (lowSLA.length) {
    insights.push({
      title: `⏱ ${lowSLA.length} ticket${lowSLA.length>1?'s':''} com SLA abaixo de 40%`,
      body: `Priorize: ${lowSLA.map(t=>t.id).join(', ')} para evitar violação de SLA.`,
    });
  }

  if (!insights.length) {
    insights.push({
      title: '✅ Operação estável — nenhum alerta crítico',
      body: `SLA médio de ${s.slaAvg}% acima da meta. ${s.resolved.length} resoluções este período.`,
    });
  }

  const pick = insights[Math.floor(Date.now() / 15000) % insights.length];
  title.textContent = pick.title;
  body.textContent  = pick.body;
}

// ── NAV BADGES ────────────────────────────────────────────────────────────────
function updateNavBadges() {
  const open    = TICKETS.filter(t => t.status === 'Aberto' || t.status === 'Em andamento').length;
  const alerts  = (typeof AlertSystem !== 'undefined') ? AlertSystem.counts().total : 0;

  const oc = document.getElementById('nav-open-count');
  const ac = document.getElementById('nav-alert-count');
  if (oc) { oc.textContent = open;   oc.style.display = open   ? '' : 'none'; }
  if (ac) { ac.textContent = alerts; ac.style.display = alerts ? '' : 'none'; }
}

// ── HELPERS ───────────────────────────────────────────────────────────────────
function relTime(dateStr) {
  const d   = new Date(dateStr);
  const now = new Date();
  const diff = Math.round((now - d) / 3600000);
  if (diff < 1)  return 'agora';
  if (diff < 24) return `${diff}h atrás`;
  return `${Math.floor(diff/24)}d atrás`;
}

// openTicketDetail, statusBadge, priorityBadge, slaBar already in data.js
// closeModal, showToast, checkAuth, doLogout, toggleSidebar already in auth.js
