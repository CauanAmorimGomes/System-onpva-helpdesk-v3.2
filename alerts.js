// alerts.js — Sistema de Alertas Dinâmico Inova+ Helpdesk
// Lê os dados reais do TICKETS e gera alertas atualizados automaticamente
// absprinter © 2025

// ─── CONFIGURAÇÕES DE SLA POR PRIORIDADE ───────────────────────────────────
const SLA_RULES = {
  'Crítica': { resposta: 2,  resolucao: 4  },   // horas
  'Alta':    { resposta: 4,  resolucao: 8  },
  'Média':   { resposta: 8,  resolucao: 24 },
  'Baixa':   { resposta: 24, resolucao: 72 },
};

const SLA_THRESHOLDS = {
  CRITICO:  20,   // abaixo de 20% → vermelho / crítico
  ATENCAO:  50,   // 20–50%        → amarelo / atenção
  // acima de 50%  → verde / ok
};

// ─── MOTOR DE ALERTAS ────────────────────────────────────────────────────────
window.AlertSystem = {

  // Retorna todos os alertas calculados a partir dos tickets reais
  getAll() {
    const alerts = [];
    const activeStatuses = ['Aberto', 'Em andamento'];

    TICKETS.forEach(t => {
      if (!activeStatuses.includes(t.status)) return;

      const rule = SLA_RULES[t.priority] || SLA_RULES['Média'];
      const ageHours = this._ageHours(t.created_at || t.created);

      // ── NOVO CHAMADO NA FILA (aberto nas últimas 24h, aguardando atendimento) ──
      if (t.status === 'Aberto' && ageHours < 24) {
        const hot = t.priority === 'Crítica' || t.priority === 'Alta';
        alerts.push({
          type:     'novo_chamado',
          level:    hot ? 'critico' : 'atencao',
          ticketId:  t.id,
          subject:   t.subject,
          assignee:  t.assignee,
          priority:  t.priority,
          sla:       t.sla,
          serial:    t.serial || null,
          model:     t.model  || null,
          icon:      'fa-inbox',
          color:     hot ? '#ef4444' : '#818cf8',
          bg:        hot ? 'rgba(239,68,68,0.10)' : 'rgba(99,102,241,0.10)',
          border:    hot ? 'rgba(239,68,68,0.30)' : 'rgba(99,102,241,0.30)',
          title:     `Novo chamado na fila — ${t.id}${t._pending ? ' (offline)' : ''}`,
          msg:       `"${t.subject}" aberto por ${t.requester || '—'} · aguardando atendimento${ageHours < 1 ? ' (há poucos minutos)' : ` há ${Math.round(ageHours)}h`}.`,
          action:    `Responsável: ${t.assignee}`,
          ageHours,
          rule,
        });
      }

      // ── SLA VENCIDO ────────────────────────────────────────────────────────
      if (t.sla <= SLA_THRESHOLDS.CRITICO) {
        alerts.push({
          type:     'sla_vencido',
          level:    'critico',
          ticketId:  t.id,
          subject:   t.subject,
          assignee:  t.assignee,
          priority:  t.priority,
          sla:       t.sla,
          serial:    t.serial || null,
          model:     t.model  || null,
          icon:      'fa-fire',
          color:     '#ef4444',
          bg:        'rgba(239,68,68,0.10)',
          border:    'rgba(239,68,68,0.30)',
          title:     `SLA CRÍTICO — Chamado ${t.id}`,
          msg:       `"${t.subject}" está com SLA em ${t.sla}%. Prazo quase esgotado!`,
          action:    `Responsável: ${t.assignee}`,
          ageHours,
          rule,
        });
      }

      // ── SLA EM ATENÇÃO ─────────────────────────────────────────────────────
      else if (t.sla <= SLA_THRESHOLDS.ATENCAO) {
        alerts.push({
          type:     'sla_atencao',
          level:    'atencao',
          ticketId:  t.id,
          subject:   t.subject,
          assignee:  t.assignee,
          priority:  t.priority,
          sla:       t.sla,
          serial:    t.serial || null,
          model:     t.model  || null,
          icon:      'fa-triangle-exclamation',
          color:     '#f59e0b',
          bg:        'rgba(245,158,11,0.08)',
          border:    'rgba(245,158,11,0.25)',
          title:     `Atenção SLA — Chamado ${t.id}`,
          msg:       `"${t.subject}" com SLA em ${t.sla}%. Necessita ação.`,
          action:    `Responsável: ${t.assignee}`,
          ageHours,
          rule,
        });
      }

      // ── CHAMADO SEM ATRIBUIÇÃO ─────────────────────────────────────────────
      if (!t.assignee || t.assignee === '') {
        alerts.push({
          type:     'sem_atribuicao',
          level:    'atencao',
          ticketId:  t.id,
          subject:   t.subject,
          priority:  t.priority,
          sla:       t.sla,
          icon:      'fa-user-slash',
          color:     '#f59e0b',
          bg:        'rgba(245,158,11,0.08)',
          border:    'rgba(245,158,11,0.25)',
          title:     `Sem Atribuição — ${t.id}`,
          msg:       `Chamado "${t.subject}" ainda não foi atribuído a nenhum técnico.`,
          action:    'Atribuir agora',
          ageHours,
          rule,
        });
      }

      // ── PRIORIDADE CRÍTICA ABERTO > 1h ────────────────────────────────────
      if (t.priority === 'Crítica' && ageHours > 1 && t.status === 'Aberto') {
        alerts.push({
          type:     'critica_aguardando',
          level:    'critico',
          ticketId:  t.id,
          subject:   t.subject,
          assignee:  t.assignee,
          priority:  t.priority,
          sla:       t.sla,
          serial:    t.serial || null,
          model:     t.model  || null,
          icon:      'fa-bolt',
          color:     '#ef4444',
          bg:        'rgba(239,68,68,0.10)',
          border:    'rgba(239,68,68,0.30)',
          title:     `🚨 URGENTE — Chamado ${t.id} Crítico Aguardando`,
          msg:       `"${t.subject}" é CRÍTICO e está há ${Math.round(ageHours)}h sem resolução!`,
          action:    `Assignado: ${t.assignee}`,
          ageHours,
          rule,
        });
      }

      // ── IMPRESSORA COM SERIAL ─────────────────────────────────────────────
      if (t.serial && t.category === 'Impressora' && t.sla < 70) {
        alerts.push({
          type:     'impressora_serial',
          level:    t.sla < 40 ? 'critico' : 'atencao',
          ticketId:  t.id,
          subject:   t.subject,
          assignee:  t.assignee,
          priority:  t.priority,
          sla:       t.sla,
          serial:    t.serial,
          model:     t.model,
          icon:      'fa-print',
          color:     t.sla < 40 ? '#ef4444' : '#f59e0b',
          bg:        t.sla < 40 ? 'rgba(239,68,68,0.10)' : 'rgba(245,158,11,0.08)',
          border:    t.sla < 40 ? 'rgba(239,68,68,0.30)' : 'rgba(245,158,11,0.25)',
          title:     `Impressora — ${t.id} | SN: ${t.serial}`,
          msg:       `${t.model || 'Impressora'} (${t.serial}) com problema: "${t.subject}". SLA ${t.sla}%.`,
          action:    `Técnico: ${t.assignee}`,
          ageHours,
          rule,
        });
      }
    });

    // Ordena: críticos primeiro, depois por SLA crescente
    return alerts.sort((a, b) => {
      if (a.type === 'novo_chamado' && b.type !== 'novo_chamado') return -1;
      if (b.type === 'novo_chamado' && a.type !== 'novo_chamado') return  1;
      if (a.level === 'critico' && b.level !== 'critico') return -1;
      if (b.level === 'critico' && a.level !== 'critico') return  1;
      return a.sla - b.sla;
    });
  },

  // Conta por nível
  counts() {
    const all = this.getAll();
    return {
      total:   all.length,
      critico: all.filter(a => a.level === 'critico').length,
      atencao: all.filter(a => a.level === 'atencao').length,
    };
  },

  // Horas desde a criação do ticket
  _ageHours(dateStr) {
    const created = new Date(dateStr);
    if (isNaN(created)) return 0;
    const now     = new Date();
    return Math.abs(now - created) / 36e5;
  },
};

// ─── RENDERIZAÇÃO DO PAINEL DE ALERTAS ───────────────────────────────────────
function renderAlertPanel(containerId, options = {}) {
  const el = document.getElementById(containerId);
  if (!el) return;

  const alerts = AlertSystem.getAll();
  const counts = AlertSystem.counts();
  const max    = options.max || alerts.length;
  const shown  = alerts.slice(0, max);

  if (!alerts.length) {
    el.innerHTML = `
      <div class="alert-empty">
        <i class="fa fa-circle-check" style="color:var(--success);font-size:2rem;margin-bottom:0.5rem;display:block"></i>
        <strong>Nenhum alerta no momento</strong>
        <span>Todos os chamados estão dentro do SLA ✅</span>
      </div>`;
    return;
  }

  el.innerHTML = `
    <div class="alert-summary-bar">
      <div class="alert-summary-item critico">
        <i class="fa fa-fire"></i>
        <span><b>${counts.critico}</b> Crítico${counts.critico !== 1 ? 's' : ''}</span>
      </div>
      <div class="alert-summary-item atencao">
        <i class="fa fa-triangle-exclamation"></i>
        <span><b>${counts.atencao}</b> Atenção</span>
      </div>
      <div class="alert-summary-item total">
        <i class="fa fa-bell"></i>
        <span><b>${counts.total}</b> Total</span>
      </div>
      <span class="alert-ts">Atualizado: ${new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}</span>
    </div>
    ${shown.map(a => renderAlertCard(a)).join('')}
    ${alerts.length > max ? `<div class="alert-more" onclick="expandAlerts('${containerId}')">Ver mais ${alerts.length - max} alertas <i class="fa fa-chevron-down"></i></div>` : ''}
  `;
}

function expandAlerts(containerId) {
  renderAlertPanel(containerId, { max: 9999 });
}

function renderAlertCard(a) {
  const slaColor  = a.sla <= 20 ? '#ef4444' : a.sla <= 50 ? '#f59e0b' : '#22c55e';
  const slaFill   = `<div class="al-sla-track"><div class="al-sla-fill" style="width:${a.sla}%;background:${slaColor}"></div></div>`;
  const serialTag = a.serial ? `<span class="al-tag"><i class="fa fa-barcode"></i> ${a.serial}</span>` : '';
  const modelTag  = a.model  ? `<span class="al-tag"><i class="fa fa-print"></i> ${a.model}</span>`  : '';
  const ruleHint  = a.rule   ? `Prazo: ${a.rule.resposta}h resposta / ${a.rule.resolucao}h resolução` : '';
  const ageStr    = a.ageHours >= 24
    ? `${Math.floor(a.ageHours / 24)}d ${Math.round(a.ageHours % 24)}h`
    : `${Math.round(a.ageHours)}h`;

  return `
    <div class="alert-card level-${a.level}" style="border-color:${a.border};background:${a.bg}" onclick="openTicketDetail('${a.ticketId}')">
      <div class="alert-card-left">
        <div class="alert-icon" style="color:${a.color};background:${a.border}">
          <i class="fa ${a.icon}"></i>
        </div>
      </div>
      <div class="alert-card-body">
        <div class="alert-card-header">
          <span class="alert-ticket-id" style="color:${a.color}">${a.ticketId}</span>
          ${priorityBadge(a.priority)}
          <span class="alert-age"><i class="fa fa-clock"></i> ${ageStr} atrás</span>
        </div>
        <div class="alert-card-title">${a.title}</div>
        <div class="alert-card-msg">${a.msg}</div>
        <div class="alert-card-tags">
          ${serialTag}${modelTag}
          <span class="al-tag"><i class="fa fa-user"></i> ${a.assignee || '—'}</span>
        </div>
        <div class="alert-card-footer">
          <div class="al-sla-row">
            <span style="font-size:0.7rem;color:var(--text3)">SLA</span>
            ${slaFill}
            <span style="font-size:0.72rem;font-weight:700;color:${slaColor}">${a.sla}%</span>
          </div>
          <span class="alert-rule-hint">${ruleHint}</span>
        </div>
      </div>
      <div class="alert-card-arrow"><i class="fa fa-chevron-right" style="color:${a.color}"></i></div>
    </div>`;
}

// ─── TOPBAR DINÂMICA ─────────────────────────────────────────────────────────
function updateTopbarAlerts() {
  const counts = AlertSystem.counts();

  // Badge de SLA em risco
  const slaBadge = document.getElementById('sla-risk-badge');
  if (slaBadge) {
    if (counts.critico > 0) {
      slaBadge.innerHTML = `<i class="fa fa-fire"></i> SLA crítico: <b>${counts.critico}</b>`;
      slaBadge.className = 'sla-alert-badge critico';
      slaBadge.style.display = '';
    } else if (counts.atencao > 0) {
      slaBadge.innerHTML = `<i class="fa fa-triangle-exclamation"></i> SLA em risco: <b>${counts.atencao}</b>`;
      slaBadge.className = 'sla-alert-badge';
      slaBadge.style.display = '';
    } else {
      slaBadge.style.display = 'none';
    }
  }

  // Contador de notificações
  const notifCount = document.getElementById('notif-count-badge');
  if (notifCount) {
    notifCount.textContent = counts.total;
    notifCount.style.display = counts.total ? '' : 'none';
  }

  // Painel de notificações dinâmico
  const notifPanel = document.getElementById('notif-panel');
  if (notifPanel) {
    const alerts = AlertSystem.getAll().slice(0, 6);
    const items = alerts.map(a => `
      <div class="notif-item unread" onclick="openTicketDetail('${a.ticketId}')" style="cursor:pointer">
        <i class="fa ${a.icon}" style="color:${a.color}"></i>
        <div>
          <span style="font-weight:700;color:${a.color}">${a.ticketId}</span> — ${a.subject.substring(0, 38)}${a.subject.length > 38 ? '...' : ''}
          <div style="font-size:0.7rem;color:var(--text3);margin-top:1px">SLA ${a.sla}% · ${a.assignee}</div>
        </div>
      </div>`).join('');

    notifPanel.innerHTML = `
      <div class="notif-header">
        Alertas <span style="background:rgba(239,68,68,0.2);color:#fca5a5;border-radius:20px;padding:1px 8px;font-size:0.7rem;margin-left:6px">${counts.total}</span>
      </div>
      ${items || '<div class="notif-item" style="color:var(--text3)">Nenhum alerta ativo ✅</div>'}
      <div style="padding:0.6rem 1rem;text-align:center;border-top:1px solid var(--panel-border)">
        <a href="alerts.html" style="font-size:0.78rem;color:var(--accent2)">Ver todos os alertas <i class="fa fa-arrow-right"></i></a>
      </div>`;
  }
}

// ─── AUTO-REFRESH (60s) ───────────────────────────────────────────────────────
function startAlertAutoRefresh(containerId, options = {}) {
  renderAlertPanel(containerId, options);
  updateTopbarAlerts();
  setInterval(() => {
    renderAlertPanel(containerId, options);
    updateTopbarAlerts();
    // Pulsa o badge se houver críticos
    const badge = document.getElementById('sla-risk-badge');
    if (badge && AlertSystem.counts().critico > 0) {
      badge.classList.add('pulse');
      setTimeout(() => badge.classList.remove('pulse'), 1000);
    }
  }, 60_000);
}