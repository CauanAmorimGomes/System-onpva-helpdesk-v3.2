// api.js — Cliente HTTP para Inova+ Helpdesk
// Chamadas ao backend PHP + fallback offline (localStorage) quando o PHP não responde
// absprinter © 2025

'use strict';

// ─── Configuração ─────────────────────────────────────────────────────────────
const API_BASE = './api.php';
const LOCAL_TICKETS_KEY = 'inova_local_tickets';

// ─── Cliente HTTP genérico ────────────────────────────────────────────────────
const Http = {
  async request(method, resource, params = {}, body = null, opts = {}) {
    const url = new URL(API_BASE, window.location.href);
    url.searchParams.set('resource', resource);

    for (const [k, v] of Object.entries(params || {})) {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
    }

    const headers = { 'Accept': 'application/json' };
    const token = localStorage.getItem('inova_token');
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const options = { method, headers };

    if (body instanceof FormData) {
      // O navegador define o Content-Type multipart com boundary sozinho
      options.body = body;
    } else if (body && ['POST', 'PUT', 'PATCH'].includes(method)) {
      headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(body);
    }

    // 1) Falha de rede (PHP desligado, página aberta via file://, etc.)
    let res;
    try {
      res = await fetch(url.toString(), options);
    } catch (e) {
      const err = new Error('Servidor indisponível.');
      err.offline = true;
      throw err;
    }

    // 2) Resposta que não é JSON (ex.: servidor estático devolvendo o código-fonte do api.php)
    const text = await res.text();
    let data;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      throw Http._noPhp(res.status);
    }

    // 3) Erro que NÃO veio do api.php (ele sempre responde com { error: "..." }).
    //    Ex.: 405/501 do Live Server, nginx ou outro servidor sem PHP → trata como offline.
    if (!res.ok && !(data && typeof data === 'object' && 'error' in data)) {
      throw Http._noPhp(res.status);
    }

    // 4) Erro HTTP de verdade do api.php (validação, 404, 500…)
    if (!res.ok) {
      const msg = data.error || `Erro ${res.status}`;
      if (!opts.silent && typeof showToast === 'function') showToast(msg, 'error');
      const err = new Error(msg);
      err.status = res.status;
      throw err;
    }

    return data;
  },

  _noPhp(status) {
    if (!Http._warned) {
      Http._warned = true;
      console.warn(
        `[Inova+] O servidor respondeu ${status || 'algo inválido'} para api.php — o PHP não está sendo executado.\n` +
        'Rode o sistema com "php -S localhost:8000" (ou iniciar-servidor.bat) ou pelo XAMPP/WAMP, e não pelo Live Server.\n' +
        'Enquanto isso, os chamados ficam salvos no navegador e são enviados quando o PHP voltar.'
      );
    }
    const err = new Error(`Servidor PHP indisponível (HTTP ${status || '?'}).`);
    err.offline = true;
    err.status = status;
    return err;
  },

  get:    (resource, params, opts)       => Http.request('GET',    resource, params, null, opts),
  post:   (resource, body, params, opts) => Http.request('POST',   resource, params ?? {}, body, opts),
  put:    (resource, id, body, opts)     => Http.request('PUT',    resource, { id }, body, opts),
  delete: (resource, id, opts)           => Http.request('DELETE', resource, { id }, null, opts),
};

// ─── Armazenamento local (fallback offline) ──────────────────────────────────
const LocalTickets = {
  all() {
    try {
      const list = JSON.parse(localStorage.getItem(LOCAL_TICKETS_KEY) || '[]');
      return Array.isArray(list) ? list : [];
    } catch { return []; }
  },
  save(list) {
    try { localStorage.setItem(LOCAL_TICKETS_KEY, JSON.stringify(list)); } catch {}
  },
  add(ticket) {
    const list = this.all();
    list.unshift(ticket);
    this.save(list);
  },
  remove(id) {
    this.save(this.all().filter(t => t.id !== id));
  },
  nextId() {
    const ids = [...(window.TICKETS || []), ...this.all()]
      .map(t => parseInt(String(t.id || '').replace(/\D/g, ''), 10) || 0);
    const max = ids.length ? Math.max(...ids) : 0;
    return '#' + String(max + 1).padStart(4, '0');
  },
};
window.LocalTickets = LocalTickets;

// ─── Integração com o sininho (notifications.js) ─────────────────────────────
function _me() {
  try { return JSON.parse(localStorage.getItem('inova_user') || '{}').name || 'Usuário'; } catch { return 'Usuário'; }
}
function _notifyRefresh() {
  if (window.NotificationCenter) NotificationCenter.refresh();
}
function _notifyLocal(n) {
  if (window.NotificationCenter) NotificationCenter.push(n);
}
function _statusNotif(t, status) {
  const map = {
    'Em andamento': ['attend',   `Chamado ${t.id} em atendimento`, `${t.assignee} assumiu "${t.subject}"`],
    'Resolvido':    ['resolved', `Chamado ${t.id} resolvido ✅`,   `${t.subject} · por ${_me()}`],
    'Fechado':      ['closed',   `Chamado ${t.id} fechado`,        `${t.subject} · por ${_me()}`],
  };
  const [type, title, msg] = map[status] || ['status', `Chamado ${t.id} → ${status}`, t.subject];
  return { type, ticketId: t.id, priority: t.priority, title, msg, actor: _me() };
}

/** Junta os tickets locais (pendentes) na lista global sem duplicar */
function mergeLocalTickets() {
  if (!Array.isArray(window.TICKETS)) window.TICKETS = [];
  const existing = new Set(window.TICKETS.map(t => t.id));
  const pending = LocalTickets.all().filter(t => !existing.has(t.id));
  window.TICKETS.unshift(...pending);
}

// ─── API de Tickets ───────────────────────────────────────────────────────────
window.TicketAPI = {

  async list(filters = {}) {
    const data = await Http.get('tickets', filters, { silent: true });
    if (!Array.isArray(data)) throw new Error('Formato de resposta inválido.');
    window.TICKETS = data;
    mergeLocalTickets();
    return window.TICKETS;
  },

  async get(id) {
    return Http.get('tickets', { id });
  },

  /**
   * Cria ticket no servidor.
   * @param {object} payload campos do chamado
   * @param {File[]} files anexos opcionais
   */
  async create(payload, files = []) {
    let body = payload;
    if (files && files.length) {
      body = new FormData();
      Object.entries(payload).forEach(([k, v]) => body.append(k, v ?? ''));
      files.forEach(f => body.append('attachments[]', f, f.name));
    }
    const data = await Http.post('tickets', body, {}, { silent: true });
    if (!data || !data.ticket) throw Object.assign(new Error('Resposta inválida do servidor.'), { offline: true });

    if (!Array.isArray(window.TICKETS)) window.TICKETS = [];
    window.TICKETS.unshift(data.ticket);
    _notifyRefresh(); // servidor já gerou a notificação "novo chamado"
    return data.ticket;
  },

  /**
   * Tenta criar no servidor; se ele estiver fora do ar, salva localmente
   * para sincronizar depois. Erros de validação (400) NÃO caem no fallback.
   * @returns {{ticket: object, offline: boolean}}
   */
  async createWithFallback(payload, files = []) {
    try {
      const ticket = await this.create(payload, files);
      return { ticket, offline: false };
    } catch (err) {
      if (!err.offline) throw err;

      const now = new Date();
      const ticket = {
        id:          LocalTickets.nextId(),
        subject:     payload.subject,
        category:    payload.category,
        requester:   payload.requester || 'Usuário',
        assignee:    payload.assignee  || 'Ana Lima',
        priority:    payload.priority  || 'Média',
        status:      'Aberto',
        sla:         100,
        created:     now.toISOString().slice(0, 10),
        created_at:  now.toISOString(),
        serial:      payload.serial || '',
        model:       payload.model  || '',
        dept:        payload.dept   || 'TI',
        location:    payload.location || '',
        contact:     payload.contact  || '',
        desc:        payload.desc,
        attachments: (files || []).map(f => ({ name: f.name, size: f.size, type: f.type, url: null })),
        comments:    [],
        _pending:    true,
      };
      LocalTickets.add(ticket);
      if (!Array.isArray(window.TICKETS)) window.TICKETS = [];
      window.TICKETS.unshift(ticket);
      _notifyLocal({
        type: 'new_ticket', ticketId: ticket.id, priority: ticket.priority, actor: ticket.requester,
        title: `Novo chamado ${ticket.id} na fila${ticket.priority === 'Crítica' ? ' 🚨' : ''}`,
        msg: `${ticket.subject} · ${ticket.category} · Prioridade ${ticket.priority} · Atribuído a ${ticket.assignee}`,
      });
      return { ticket, offline: true };
    }
  },

  /** Envia ao servidor os chamados que foram criados offline */
  async syncPending() {
    const pending = LocalTickets.all();
    if (!pending.length) return 0;
    let synced = 0;
    for (const t of pending) {
      try {
        const { _pending, id, attachments, ...payload } = t;
        await this.create(payload);
        LocalTickets.remove(t.id);
        if (window.NotificationCenter) NotificationCenter.dropLocalFor(t.id);
        window.TICKETS = (window.TICKETS || []).filter(x => x.id !== t.id);
        synced++;
      } catch (err) {
        if (err.offline) break; // servidor ainda fora — tenta na próxima
        LocalTickets.remove(t.id); // erro de validação: descarta para não travar a fila
      }
    }
    return synced;
  },

  async update(id, payload) {
    const data = await Http.put('tickets', id, { ...payload, actor: _me() });
    const idx = window.TICKETS.findIndex(t => t.id === id);
    if (idx !== -1) window.TICKETS[idx] = data.ticket;
    _notifyRefresh();
    return data.ticket;
  },

  /** Técnico atual assume o chamado: sai da fila e vai para "Em andamento" */
  async attend(id) {
    return TicketAPI.update(id, { status: 'Em andamento', assignee: _me() });
  },

  async close(id)   { return TicketAPI.update(id, { status: 'Fechado', sla: 100 }); },
  async resolve(id) { return TicketAPI.update(id, { status: 'Resolvido' }); },

  async delete(id) {
    await Http.delete('tickets', id);
    window.TICKETS = window.TICKETS.filter(t => t.id !== id);
  },

  async reply(id, text, author) {
    const r = await Http.request('POST', 'tickets', { action: 'reply', id }, { text, author });
    _notifyRefresh();
    return r;
  },
};

// ─── API de Equipe ────────────────────────────────────────────────────────────
window.TeamAPI = {
  async list() {
    const data = await Http.get('team', {}, { silent: true });
    if (!Array.isArray(data)) throw new Error('Formato de resposta inválido.');
    window.TEAM = data;
    return data;
  },
  async update(id, payload) {
    return Http.put('team', id, payload);
  },
};

// ─── API da Base de Conhecimento ──────────────────────────────────────────────
window.KBAPI = {
  async list(filters = {}) { return Http.get('kb', filters); },
  async create(payload)    { return Http.post('kb', payload); },
  async delete(id)         { return Http.delete('kb', id); },
};

// ─── Patch das funções legadas (com fallback local) ──────────────────────────
function _localTicketUpdate(id, patch) {
  const t = (window.TICKETS || []).find(x => x.id === id);
  if (t) Object.assign(t, patch);
  const local = LocalTickets.all();
  const lt = local.find(x => x.id === id);
  if (lt) { Object.assign(lt, patch); LocalTickets.save(local); }
}

function _rerender() {
  if (typeof renderTickets   === 'function') renderTickets();
  if (typeof renderMyTickets === 'function') renderMyTickets();
  if (typeof fullRender      === 'function') fullRender();
  if (typeof renderAll       === 'function') renderAll();
}

window.closeTicketById = async function (id) {
  try { await TicketAPI.close(id); }
  catch (e) {
    if (!e.offline) return;
    _localTicketUpdate(id, { status: 'Fechado', sla: 100 });
    const t = window.TICKETS.find(x => x.id === id); if (t) _notifyLocal(_statusNotif(t, 'Fechado'));
  }
  closeModal('modal-detail');
  _rerender();
  showToast(`Ticket ${id} fechado com sucesso!`, 'success');
};
window.closeTicket = window.closeTicketById;

window.resolveTicket = async function (id) {
  try { await TicketAPI.resolve(id); }
  catch (e) {
    if (!e.offline) return;
    _localTicketUpdate(id, { status: 'Resolvido' });
    const t = window.TICKETS.find(x => x.id === id); if (t) _notifyLocal(_statusNotif(t, 'Resolvido'));
  }
  closeModal('modal-detail');
  _rerender();
  showToast(`Ticket ${id} marcado como resolvido!`, 'success');
};

// Botão "Atender" (detalhe do chamado): tira da fila e coloca em atendimento
window.attendTicket = async function (id) {
  try { await TicketAPI.attend(id); }
  catch (e) {
    if (!e.offline) return;
    _localTicketUpdate(id, { status: 'Em andamento', assignee: _me() });
    const t = window.TICKETS.find(x => x.id === id); if (t) _notifyLocal(_statusNotif(t, 'Em andamento'));
  }
  if (document.getElementById('modal-detail') && typeof openTicketDetail === 'function') openTicketDetail(id);
  _rerender();
  showToast(`Você assumiu o chamado ${id}. Bom atendimento!`, 'success');
};

window.sendReply = async function (id) {
  const inp = document.getElementById(`reply-input-${id}`);
  if (!inp || !inp.value.trim()) return;
  const user = JSON.parse(localStorage.getItem('inova_user') || '{}');
  const text = inp.value.trim();

  try {
    await TicketAPI.reply(id, text, user.name || 'Admin');
    const ticket = await TicketAPI.get(id);
    const idx = window.TICKETS.findIndex(t => t.id === id);
    if (idx !== -1) window.TICKETS[idx] = ticket;
  } catch (e) {
    if (!e.offline) return;
    const t = window.TICKETS.find(x => x.id === id);
    if (t) {
      t.comments = t.comments || [];
      t.comments.push({ author: user.name || 'Admin', text, time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) });
      _localTicketUpdate(id, { comments: t.comments });
      _notifyLocal({ type: 'comment', ticketId: id, priority: t.priority, actor: _me(),
        title: `Novo comentário em ${id}`, msg: `${_me()}: ${text.slice(0, 90)}` });
    }
  }

  openTicketDetail(id);
  showToast('Resposta enviada!', 'success');
};

// ─── submitTicket (compatibilidade) ──────────────────────────────────────────
// A página new-ticket.html usa NewTicket.submit() (new-ticket.js). Esta versão
// só existe para outras páginas que ainda chamem submitTicket() diretamente.
window.submitTicket = async function () {
  if (window.NewTicket && typeof NewTicket.submit === 'function') return NewTicket.submit();

  const subject  = document.getElementById('nt-subject')?.value.trim();
  const category = document.getElementById('nt-category')?.value;
  const desc     = document.getElementById('nt-desc')?.value.trim();

  if (!subject || !category || !desc) {
    showToast('Preencha todos os campos obrigatórios!', 'error');
    return;
  }

  const user = JSON.parse(localStorage.getItem('inova_user') || '{}');
  const payload = {
    subject, category, desc,
    serial:    document.getElementById('nt-serial')?.value || '',
    model:     document.getElementById('nt-printer-model')?.value || '',
    priority:  document.getElementById('nt-priority')?.value || 'Média',
    dept:      document.getElementById('nt-dept')?.value || 'TI',
    requester: user.name || 'Usuário',
    assignee:  'Ana Lima',
  };

  try {
    const { ticket, offline } = await TicketAPI.createWithFallback(payload);
    showToast(offline
      ? `Chamado ${ticket.id} salvo localmente (servidor offline).`
      : `Chamado ${ticket.id} aberto com sucesso! SLA iniciado.`, 'success');
    setTimeout(() => window.location.href = 'my-tickets.html', 1800);
  } catch (e) {
    showToast(e.message || 'Não foi possível abrir o chamado.', 'error');
  }
};

// ─── Bootstrap ────────────────────────────────────────────────────────────────
window.TICKETS = Array.isArray(window.TICKETS) ? window.TICKETS : [];
window.TEAM    = Array.isArray(window.TEAM)    ? window.TEAM    : [];
mergeLocalTickets(); // chamados criados offline aparecem já no carregamento

document.addEventListener('DOMContentLoaded', async () => {
  try {
    const synced = await TicketAPI.syncPending();
    await TicketAPI.list();
    await TeamAPI.list();
    if (synced && typeof showToast === 'function') {
      showToast(`${synced} chamado(s) offline sincronizado(s) com o servidor.`, 'success');
    }
    _rerender();
  } catch (_) {
    console.warn('API PHP indisponível — usando dados locais.');
  }
});