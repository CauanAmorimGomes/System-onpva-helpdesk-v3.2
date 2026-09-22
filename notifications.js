// notifications.js — Central de Notificações (sininho) Inova+ Helpdesk
// • Busca eventos no servidor (api.php?resource=notifications) a cada 10s
// • Funciona offline com eventos locais (localStorage)
// • Contador, painel, som, animação, notificação do navegador, título da aba
// • Sincroniza entre abas e atualiza fila/alertas quando chega algo novo
// absprinter © 2025

'use strict';

(function () {
  if (window.NotificationCenter) return;

  // ── Config ────────────────────────────────────────────────────────────────
  const POLL_MS      = 10_000;
  const MAX_ITEMS    = 50;
  const KEY_LOCAL    = 'inova_local_notifications';
  const KEY_READ     = 'inova_notif_read';
  const KEY_SEEN     = 'inova_notif_seen_at';
  const KEY_SOUND    = 'inova_notif_sound';
  const API_URL      = './api.php';

  const TYPE_CFG = {
    new_ticket: { icon: 'fa-ticket',        color: '#7c83f7', label: 'Novo chamado' },
    attend:     { icon: 'fa-headset',       color: '#f5a623', label: 'Em atendimento' },
    status:     { icon: 'fa-arrows-rotate', color: '#f5a623', label: 'Status' },
    resolved:   { icon: 'fa-circle-check',  color: '#22d47a', label: 'Resolvido' },
    closed:     { icon: 'fa-lock',          color: '#94a3b8', label: 'Fechado' },
    comment:    { icon: 'fa-comment',       color: '#00d4aa', label: 'Comentário' },
    assign:     { icon: 'fa-user-tag',      color: '#a78bfa', label: 'Atribuição' },
    sla:        { icon: 'fa-fire',          color: '#f5476b', label: 'SLA' },
  };

  // ── Storage helpers ───────────────────────────────────────────────────────
  const store = {
    get(k, def) { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? def; } catch { return def; } },
    set(k, v)   { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  };

  const decode = (() => {
    const ta = document.createElement('textarea');
    return s => { ta.innerHTML = String(s ?? ''); return ta.value; };
  })();
  const esc = s => decode(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

  function relTime(iso) {
    const d = new Date(iso);
    if (isNaN(d)) return '';
    const s = Math.round((Date.now() - d) / 1000);
    if (s < 45) return 'agora';
    if (s < 3600) return `há ${Math.round(s / 60)} min`;
    if (s < 86400) return `há ${Math.round(s / 3600)} h`;
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ' ' +
           d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }

  // ── Estado ────────────────────────────────────────────────────────────────
  let items = [];
  let serverOnline = null;
  let filter = 'all';
  let pollTimer = null;
  let firstLoad = true;
  let tabNewest = null; // evento mais recente já visto NESTA aba
  let els = {};

  // ── CSS (injetado para funcionar em qualquer página) ──────────────────────
  const CSS = `
  .nc-wrap{position:relative;display:inline-flex;align-items:center}
  .nc-wrap.nc-floating{position:fixed;top:12px;right:16px;z-index:1500}
  .nc-bell{position:relative;width:36px;height:36px;border-radius:10px;background:#0f2035;border:1px solid rgba(255,255,255,.08);color:#7a93b0;display:flex;align-items:center;justify-content:center;font-size:.95rem;cursor:pointer;transition:all .15s}
  .nc-bell:hover{background:#162840;color:#e8f0fe}
  .nc-bell.has-unread{color:#e8f0fe;border-color:rgba(91,99,245,.45);box-shadow:0 0 0 3px rgba(91,99,245,.12)}
  .nc-bell.ring i{animation:nc-ring 1s ease both;transform-origin:50% 4px}
  @keyframes nc-ring{0%{transform:rotate(0)}15%{transform:rotate(18deg)}30%{transform:rotate(-16deg)}45%{transform:rotate(12deg)}60%{transform:rotate(-8deg)}75%{transform:rotate(4deg)}100%{transform:rotate(0)}}
  .nc-count{position:absolute;top:-6px;right:-6px;min-width:18px;height:18px;padding:0 5px;border-radius:9px;background:#f5476b;color:#fff;font:700 .62rem/18px 'DM Sans',sans-serif;text-align:center;border:2px solid #0c1929;display:none}
  .nc-bell.has-unread .nc-count{display:block}
  .nc-bell.has-unread::after{content:'';position:absolute;top:-6px;right:-6px;width:18px;height:18px;border-radius:50%;background:#f5476b;opacity:.5;animation:nc-pulse 2s ease-out infinite;z-index:-1}
  @keyframes nc-pulse{0%{transform:scale(1);opacity:.5}100%{transform:scale(2.2);opacity:0}}
  .nc-panel{position:absolute;top:calc(100% + 10px);right:0;width:380px;max-width:calc(100vw - 24px);background:#0c1929;border:1px solid rgba(255,255,255,.1);border-radius:14px;box-shadow:0 18px 50px rgba(0,0,0,.55);z-index:1600;overflow:hidden;font-family:'DM Sans',system-ui,sans-serif;color:#e8f0fe;text-align:left}
  .nc-panel[hidden]{display:none}
  .nc-head{display:flex;align-items:center;gap:8px;padding:.8rem 1rem;border-bottom:1px solid rgba(255,255,255,.06)}
  .nc-head strong{font-family:'Syne',sans-serif;font-size:.9rem;font-weight:800}
  .nc-pill{font-size:.62rem;font-weight:700;padding:1px 7px;border-radius:10px;background:rgba(245,71,107,.18);color:#fda4af}
  .nc-link{margin-left:auto;background:none;border:none;color:#7c83f7;font-size:.72rem;font-weight:600;cursor:pointer;padding:2px}
  .nc-link:hover{text-decoration:underline}
  .nc-tabs{display:flex;gap:4px;padding:.5rem .75rem;border-bottom:1px solid rgba(255,255,255,.06)}
  .nc-tab{background:none;border:1px solid transparent;color:#7a93b0;font-size:.72rem;font-weight:600;padding:3px 10px;border-radius:14px;cursor:pointer}
  .nc-tab.active{background:rgba(91,99,245,.15);border-color:rgba(91,99,245,.35);color:#a5b4fc}
  .nc-list{max-height:380px;overflow-y:auto}
  .nc-item{display:flex;gap:10px;padding:.7rem 1rem;border-bottom:1px solid rgba(255,255,255,.05);cursor:pointer;transition:background .12s;position:relative}
  .nc-item:hover{background:rgba(255,255,255,.03)}
  .nc-item.unread{background:rgba(91,99,245,.06)}
  .nc-item.unread::before{content:'';position:absolute;left:5px;top:50%;width:5px;height:5px;margin-top:-2.5px;border-radius:50%;background:#7c83f7}
  .nc-ico{width:32px;height:32px;border-radius:9px;display:flex;align-items:center;justify-content:center;font-size:.8rem;flex-shrink:0}
  .nc-body{flex:1;min-width:0}
  .nc-title{font-size:.8rem;font-weight:700;line-height:1.3}
  .nc-msg{font-size:.74rem;color:#7a93b0;margin-top:2px;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
  .nc-meta{font-size:.66rem;color:#4a6282;margin-top:3px;display:flex;gap:6px;align-items:center}
  .nc-tag{font-size:.58rem;font-weight:800;padding:0 5px;border-radius:4px;background:rgba(245,166,35,.15);color:#fcd34d}
  .nc-empty{padding:2.2rem 1rem;text-align:center;color:#4a6282;font-size:.8rem}
  .nc-empty i{display:block;font-size:1.6rem;margin-bottom:.5rem}
  .nc-foot{display:flex;align-items:center;gap:6px;padding:.6rem .9rem;border-top:1px solid rgba(255,255,255,.06);font-size:.7rem;color:#4a6282}
  .nc-foot button,.nc-foot a{background:none;border:1px solid rgba(255,255,255,.08);color:#7a93b0;border-radius:7px;padding:3px 8px;font-size:.68rem;cursor:pointer;display:inline-flex;align-items:center;gap:5px;text-decoration:none}
  .nc-foot button:hover,.nc-foot a:hover{color:#e8f0fe;background:#162840}
  .nc-foot .nc-status{margin-right:auto;display:flex;align-items:center;gap:5px}
  .nc-dot{width:6px;height:6px;border-radius:50%;background:#4a6282}
  .nc-dot.on{background:#22d47a}.nc-dot.off{background:#f5a623}
  .nc-pop{position:fixed;right:1.25rem;bottom:1.25rem;z-index:2100;width:340px;max-width:calc(100vw - 24px);background:#0c1929;border:1px solid rgba(91,99,245,.4);border-radius:12px;padding:.8rem .9rem;display:flex;gap:10px;box-shadow:0 18px 40px rgba(0,0,0,.5);font-family:'DM Sans',sans-serif;color:#e8f0fe;cursor:pointer;animation:nc-in .3s ease}
  .nc-pop.out{animation:nc-out .3s ease forwards}
  @keyframes nc-in{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}
  @keyframes nc-out{to{opacity:0;transform:translateY(12px)}}
  .nc-pop .nc-x{background:none;border:none;color:#4a6282;cursor:pointer;align-self:flex-start;padding:2px}
  `;

  // ── Montagem do sininho ───────────────────────────────────────────────────
  function mount() {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    // Remove sininhos antigos (estáticos) das páginas
    const oldPanel = document.getElementById('notif-panel');
    if (oldPanel) {
      const holder = oldPanel.closest('.notif-btn') || oldPanel.parentElement;
      if (holder && !holder.classList.contains('topbar-actions') && !holder.classList.contains('topbar')) holder.remove();
      else oldPanel.remove();
    }
    document.querySelectorAll('.notif-btn').forEach(e => e.remove());

    const wrap = document.createElement('div');
    wrap.className = 'nc-wrap';
    wrap.innerHTML = `
      <button type="button" class="nc-bell" id="nc-bell" aria-label="Notificações" aria-haspopup="true" aria-expanded="false">
        <i class="fa fa-bell"></i><span class="nc-count" id="nc-count">0</span>
      </button>
      <div class="nc-panel" id="nc-panel" hidden role="dialog" aria-label="Notificações">
        <div class="nc-head">
          <strong>Notificações</strong><span class="nc-pill" id="nc-pill">0 novas</span>
          <button class="nc-link" id="nc-readall">Marcar todas como lidas</button>
        </div>
        <div class="nc-tabs">
          <button class="nc-tab active" data-f="all">Todas</button>
          <button class="nc-tab" data-f="unread">Não lidas</button>
          <button class="nc-tab" data-f="tickets">Chamados</button>
          <button class="nc-tab" data-f="sla">Alertas SLA <span id="nc-sla-count"></span></button>
        </div>
        <div class="nc-list" id="nc-list"></div>
        <div class="nc-foot">
          <span class="nc-status"><span class="nc-dot" id="nc-dot"></span><span id="nc-status">Conectando…</span></span>
          <button id="nc-sound" title="Som das notificações"></button>
          <button id="nc-desktop" title="Avisos do navegador"><i class="fa fa-desktop"></i> Ativar</button>
          <a href="alerts.html" title="Central de Alertas"><i class="fa fa-arrow-right"></i></a>
        </div>
      </div>`;

    const topbar = document.querySelector('.topbar');
    if (topbar) {
      const actions = topbar.querySelector('.topbar-actions') || topbar;
      const avatar  = actions.querySelector('#topbar-avatar, .topbar-avatar, .user-avatar');
      if (avatar && avatar.parentElement === actions) actions.insertBefore(wrap, avatar);
      else actions.appendChild(wrap);
    } else {
      wrap.classList.add('nc-floating');
      document.body.appendChild(wrap);
    }

    els = {
      wrap, bell: wrap.querySelector('#nc-bell'), count: wrap.querySelector('#nc-count'),
      panel: wrap.querySelector('#nc-panel'), list: wrap.querySelector('#nc-list'),
      pill: wrap.querySelector('#nc-pill'), sound: wrap.querySelector('#nc-sound'),
      desktop: wrap.querySelector('#nc-desktop'), dot: wrap.querySelector('#nc-dot'),
      status: wrap.querySelector('#nc-status'), slaCount: wrap.querySelector('#nc-sla-count'),
    };

    els.bell.addEventListener('click', e => { e.stopPropagation(); togglePanel(); });
    els.panel.addEventListener('click', e => e.stopPropagation());
    document.addEventListener('click', () => togglePanel(false));
    document.addEventListener('keydown', e => { if (e.key === 'Escape') togglePanel(false); });

    wrap.querySelector('#nc-readall').addEventListener('click', markAllRead);
    wrap.querySelectorAll('.nc-tab').forEach(t => t.addEventListener('click', () => {
      filter = t.dataset.f;
      wrap.querySelectorAll('.nc-tab').forEach(x => x.classList.toggle('active', x === t));
      renderList();
    }));
    els.list.addEventListener('click', e => {
      const it = e.target.closest('.nc-item');
      if (it) openItem(it.dataset.id, it.dataset.ticket);
    });
    els.sound.addEventListener('click', () => { store.set(KEY_SOUND, !soundOn()); renderFooter(); if (soundOn()) chime(); });
    els.desktop.addEventListener('click', requestDesktop);
    renderFooter();
  }

  function togglePanel(force) {
    const open = typeof force === 'boolean' ? force : els.panel.hidden;
    els.panel.hidden = !open;
    els.bell.setAttribute('aria-expanded', String(open));
    if (open) renderList();
  }

  // ── Dados ─────────────────────────────────────────────────────────────────
  const readSet = () => new Set(store.get(KEY_READ, []));
  const isRead  = n => readSet().has(n.id);

  function markRead(ids) {
    const s = readSet();
    ids.forEach(id => s.add(id));
    store.set(KEY_READ, [...s].slice(-500));
    render();
  }
  function markAllRead() { markRead(items.map(n => n.id)); }

  async function fetchServer() {
    const url = new URL(API_URL, location.href);
    url.searchParams.set('resource', 'notifications');
    const res = await fetch(url, { headers: { Accept: 'application/json' }, cache: 'no-store' });
    const data = JSON.parse(await res.text());
    if (!res.ok || !Array.isArray(data)) throw new Error('bad');
    return data;
  }

  async function poll() {
    let server = [];
    try { server = await fetchServer(); serverOnline = true; }
    catch { serverOnline = false; }

    const local = store.get(KEY_LOCAL, []);
    const map = new Map();
    [...server, ...(Array.isArray(local) ? local : [])].forEach(n => { if (n && n.id) map.set(n.id, n); });
    items = [...map.values()]
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, MAX_ITEMS);

    // Chegou evento novo (de qualquer aba/usuário) → atualiza fila/alertas desta página
    const newest = items[0]?.created_at || null;
    if (tabNewest !== null && newest && new Date(newest) > new Date(tabNewest)) refreshPageData();
    if (newest) tabNewest = newest; else if (tabNewest === null) tabNewest = '1970-01-01T00:00:00Z';

    detectFresh();
    render();
  }

  // Descobre notificações novas desde a última vez que qualquer aba viu
  function detectFresh() {
    const seenAt = store.get(KEY_SEEN, null);
    const newest = items[0]?.created_at;

    // 1º acesso neste navegador: marca "agora" como referência (não toca pelo histórico)
    if (!seenAt) { store.set(KEY_SEEN, newest || new Date().toISOString()); firstLoad = false; return; }
    if (!newest) return;

    const fresh = items.filter(n => new Date(n.created_at) > new Date(seenAt) && !isRead(n));
    if (new Date(newest) > new Date(seenAt)) store.set(KEY_SEEN, newest);

    if (fresh.length) alertUser(fresh);
    firstLoad = false;
  }

  // ── Alertar o usuário ─────────────────────────────────────────────────────
  function alertUser(fresh) {
    els.bell.classList.remove('ring'); void els.bell.offsetWidth; els.bell.classList.add('ring');
    if (soundOn()) chime(fresh.some(n => n.priority === 'Crítica'));
    popup(fresh[0], fresh.length);

    if ('Notification' in window && Notification.permission === 'granted' && document.hidden) {
      fresh.slice(0, 3).forEach(n => {
        try {
          const dn = new Notification(decode(n.title), { body: decode(n.msg), tag: n.id, icon: undefined });
          dn.onclick = () => { window.focus(); openItem(n.id, n.ticketId); dn.close(); };
        } catch {}
      });
    }
  }

  function popup(n, total) {
    document.querySelectorAll('.nc-pop').forEach(p => p.remove());
    const cfg = TYPE_CFG[n.type] || TYPE_CFG.status;
    const color = n.priority === 'Crítica' ? '#f5476b' : cfg.color;
    const el = document.createElement('div');
    el.className = 'nc-pop';
    el.innerHTML = `
      <div class="nc-ico" style="background:${color}22;color:${color}"><i class="fa ${cfg.icon}"></i></div>
      <div class="nc-body">
        <div class="nc-title">${esc(n.title)}</div>
        <div class="nc-msg">${esc(n.msg)}</div>
        ${total > 1 ? `<div class="nc-meta">+${total - 1} outra(s) notificação(ões)</div>` : ''}
      </div>
      <button class="nc-x" aria-label="Fechar"><i class="fa fa-xmark"></i></button>`;
    el.addEventListener('click', e => {
      if (!e.target.closest('.nc-x')) openItem(n.id, n.ticketId);
      el.classList.add('out'); setTimeout(() => el.remove(), 300);
    });
    document.body.appendChild(el);
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 300); }, 6000);
  }

  let audioCtx;
  function chime(urgent) {
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      const notes = urgent ? [880, 660, 880] : [660, 990];
      notes.forEach((f, i) => {
        const o = audioCtx.createOscillator(), g = audioCtx.createGain();
        const t = audioCtx.currentTime + i * 0.16;
        o.type = 'sine'; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.18, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
        o.connect(g).connect(audioCtx.destination);
        o.start(t); o.stop(t + 0.3);
      });
    } catch {}
  }
  const soundOn = () => store.get(KEY_SOUND, true) !== false;

  async function requestDesktop() {
    if (!('Notification' in window)) { toast('Este navegador não suporta avisos.', 'error'); return; }
    if (Notification.permission === 'denied') { toast('Avisos bloqueados — libere nas configurações do navegador.', 'error'); return; }
    const p = await Notification.requestPermission();
    renderFooter();
    if (p === 'granted') toast('Avisos do navegador ativados!', 'success');
  }

  function toast(msg, type) { if (typeof showToast === 'function') showToast(msg, type); }

  // Recarrega os dados da página atual (fila, alertas, dashboard)
  async function refreshPageData() {
    try {
      if (typeof refreshTickets === 'function') { await refreshTickets(); return; }
      if (window.TicketAPI) await TicketAPI.list();
    } catch {}
    ['renderTickets', 'renderMyTickets', 'fullRender', 'renderAll'].forEach(fn => {
      if (typeof window[fn] === 'function') { try { window[fn](); } catch {} }
    });
  }

  // ── Abrir notificação ─────────────────────────────────────────────────────
  async function openItem(id, ticketId) {
    if (id) markRead([id]);
    togglePanel(false);
    if (!ticketId) { location.href = 'alerts.html'; return; }
    const hasModal = document.getElementById('modal-detail') && typeof openTicketDetail === 'function';
    const find = () => (window.TICKETS || []).find(x => x.id === ticketId);
    if (hasModal && !find()) await refreshPageData();      // chamado ainda não carregado → busca
    if (hasModal && find()) openTicketDetail(ticketId);
    else location.href = 'tickets.html?novo=' + encodeURIComponent(String(ticketId).replace(/\D/g, '')) + '&abrir=1';
  }

  // ── Render ────────────────────────────────────────────────────────────────
  function slaItems() {
    if (!window.AlertSystem) return [];
    try {
      return AlertSystem.getAll().filter(a => a.type !== 'novo_chamado').slice(0, 15).map(a => ({
        id: `sla-${a.type}-${a.ticketId}`, type: 'sla', ticketId: a.ticketId, priority: a.priority,
        title: a.title, msg: a.msg, created_at: null, _sla: a,
      }));
    } catch { return []; }
  }

  function render() {
    const unread = items.filter(n => !isRead(n)).length;
    els.count.textContent = unread > 99 ? '99+' : unread;
    els.bell.classList.toggle('has-unread', unread > 0);
    els.bell.title = unread ? `${unread} notificação(ões) não lida(s)` : 'Sem notificações novas';
    els.pill.textContent = `${unread} nova${unread !== 1 ? 's' : ''}`;
    els.pill.style.display = unread ? '' : 'none';

    const base = document.title.replace(/^\(\d+\+?\)\s*/, '');
    document.title = unread ? `(${unread}) ${base}` : base;

    const sla = slaItems();
    els.slaCount.textContent = sla.length ? `(${sla.length})` : '';

    els.dot.className = 'nc-dot ' + (serverOnline ? 'on' : serverOnline === false ? 'off' : '');
    els.status.textContent = serverOnline ? 'Ao vivo' : serverOnline === false ? 'Offline (local)' : 'Conectando…';

    if (!els.panel.hidden) renderList();
  }

  function renderList() {
    let list;
    if (filter === 'sla') list = slaItems();
    else if (filter === 'unread') list = items.filter(n => !isRead(n));
    else if (filter === 'tickets') list = items.filter(n => n.type === 'new_ticket' || n.type === 'attend');
    else list = items;

    if (!list.length) {
      els.list.innerHTML = `<div class="nc-empty"><i class="fa fa-bell-slash"></i>${
        filter === 'sla' ? 'Nenhum alerta de SLA ativo ✅' : filter === 'unread' ? 'Tudo lido por aqui!' : 'Nenhuma notificação ainda.'}</div>`;
      return;
    }

    els.list.innerHTML = list.map(n => {
      const cfg = TYPE_CFG[n.type] || TYPE_CFG.status;
      const color = n._sla ? n._sla.color : (n.priority === 'Crítica' && n.type === 'new_ticket' ? '#f5476b' : cfg.color);
      const unread = !n._sla && !isRead(n);
      return `
        <div class="nc-item ${unread ? 'unread' : ''}" data-id="${n._sla ? '' : esc(n.id)}" data-ticket="${esc(n.ticketId || '')}">
          <div class="nc-ico" style="background:${color}22;color:${color}"><i class="fa ${n._sla ? n._sla.icon : cfg.icon}"></i></div>
          <div class="nc-body">
            <div class="nc-title">${esc(n.title)}</div>
            <div class="nc-msg">${esc(n.msg)}</div>
            <div class="nc-meta">
              ${n.created_at ? relTime(n.created_at) : `SLA ${n._sla?.sla ?? ''}%`}
              ${n.actor ? `· ${esc(n.actor)}` : ''}
              ${n.local ? '<span class="nc-tag">OFFLINE</span>' : ''}
            </div>
          </div>
        </div>`;
    }).join('');
  }

  function renderFooter() {
    els.sound.innerHTML = soundOn() ? '<i class="fa fa-volume-high"></i> Som' : '<i class="fa fa-volume-xmark"></i> Mudo';
    const perm = 'Notification' in window ? Notification.permission : 'denied';
    els.desktop.style.display = perm === 'granted' ? 'none' : '';
  }

  // ── API pública ───────────────────────────────────────────────────────────
  window.NotificationCenter = {
    /** Cria uma notificação local (usada quando o servidor está offline) */
    push({ type = 'status', ticketId = null, title, msg = '', priority = null, actor = null }) {
      const list = store.get(KEY_LOCAL, []);
      list.unshift({
        id: 'l-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        type, ticketId, title, msg, priority, actor, local: true,
        created_at: new Date().toISOString(),
      });
      store.set(KEY_LOCAL, list.slice(0, MAX_ITEMS));
      poll();
    },
    /** Remove notificações locais de um ticket (após sincronizar com o servidor) */
    dropLocalFor(ticketId) {
      store.set(KEY_LOCAL, store.get(KEY_LOCAL, []).filter(n => n.ticketId !== ticketId));
    },
    refresh: () => poll(),
    markAllRead,
  };

  // ── Init ──────────────────────────────────────────────────────────────────
  function init() {
    mount();
    poll();
    pollTimer = setInterval(poll, POLL_MS);
    // Outra aba criou/leu algo → atualiza esta
    window.addEventListener('storage', e => {
      if ([KEY_LOCAL, KEY_READ, KEY_SEEN].includes(e.key)) { e.key === KEY_LOCAL ? poll() : render(); }
    });
    // Volta para a aba → checa na hora
    document.addEventListener('visibilitychange', () => { if (!document.hidden) poll(); });
    // Atualiza tempos relativos e alertas de SLA
    setInterval(render, 30_000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();