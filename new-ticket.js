// new-ticket.js — Formulário "Abrir Chamado" Inova+ Helpdesk
// Validação, anexos (drag & drop / colar), rascunho automático, sugestões da KB,
// atribuição automática e envio com fallback offline.
// absprinter © 2025

'use strict';

(function () {

  // ── Config ────────────────────────────────────────────────────────────────
  const DRAFT_KEY  = 'inova_ticket_draft';
  const MAX_FILES  = 5;
  const MAX_SIZE   = 10 * 1024 * 1024; // 10 MB
  const ALLOWED    = ['image/png', 'image/jpeg', 'application/pdf'];
  const ALLOWED_EXT = /\.(png|jpe?g|pdf)$/i;

  const SLA_RULES = {
    'Crítica': { resposta: 2,  resolucao: 4  },
    'Alta':    { resposta: 4,  resolucao: 8  },
    'Média':   { resposta: 8,  resolucao: 24 },
    'Baixa':   { resposta: 24, resolucao: 72 },
  };

  // Técnico preferencial por categoria (fallback: menor carga entre os online)
  const CATEGORY_OWNER = {
    'Impressora':  'Ana Lima',
    'Suprimentos': 'Ricardo Silva',
    'TI':          'Cauan Gomes',
    'Rede':        'Cauan Gomes',
  };

  // Artigos da Base de Conhecimento para sugestão (espelha kb.html)
  const KB_LOCAL = [
    { id:1, title:'Como limpar papel atolado na MX611',        cat:'Impressora',  tags:['atolamento','atolando','papel','preso','mx611'] },
    { id:2, title:'Troca de toner — Lexmark MX611',            cat:'Impressora',  tags:['toner','cartucho','substituição','lexmark'] },
    { id:3, title:'Impressora offline — diagnóstico rápido',   cat:'Impressora',  tags:['offline','rede','não imprime','spooler','driver'] },
    { id:4, title:'Configurar impressora em rede Windows 10/11',cat:'Rede',       tags:['rede','driver','windows','ip'] },
    { id:5, title:'Epson L1250 — recarregar tinta EcoTank',    cat:'Suprimentos', tags:['tinta','epson','ecotank','ciano','fraca'] },
    { id:6, title:'Reset de contador de páginas Lexmark',      cat:'Impressora',  tags:['reset','contador','manutenção'] },
    { id:7, title:'VPN corporativa — configuração',            cat:'TI',          tags:['vpn','home office','remoto','openvpn'] },
    { id:8, title:'Solicitação de suprimentos — procedimento', cat:'Suprimentos', tags:['suprimentos','toner','pedido','papel','resma'] },
  ];

  // ── Estado ────────────────────────────────────────────────────────────────
  let files = [];
  let submitting = false;
  let dirty = false;

  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

  // ── Helpers ───────────────────────────────────────────────────────────────
  function currentUser() {
    try { return (window.Auth && Auth.getUser()) || JSON.parse(localStorage.getItem('inova_user') || '{}') || {}; }
    catch { return {}; }
  }

  function getPriority() {
    return document.querySelector('input[name="priority"]:checked')?.value || 'Média';
  }

  function fmtSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB';
    return (bytes / 1024 / 1024).toFixed(1) + ' MB';
  }

  function fmtDeadline(hours) {
    const d = new Date(Date.now() + hours * 3600 * 1000);
    return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  }

  function suggestAssignee(category) {
    const team = Array.isArray(window.TEAM) ? window.TEAM : [];
    const preferred = CATEGORY_OWNER[category];
    const pref = team.find(m => m.name === preferred);
    if (preferred && (!team.length || (pref && pref.online !== false))) return preferred;
    const online = team.filter(m => m.online);
    if (online.length) return online.sort((a, b) => (a.tickets || 0) - (b.tickets || 0))[0].name;
    return preferred || 'Ana Lima';
  }

  function collect() {
    const user = currentUser();
    const category = $('nt-category').value;
    const showPrinter = category === 'Impressora' || category === 'Suprimentos';
    return {
      subject:   $('nt-subject').value.trim(),
      category,
      dept:      $('nt-dept').value,
      priority:  getPriority(),
      serial:    showPrinter ? $('nt-serial').value.trim().toUpperCase() : '',
      model:     showPrinter ? $('nt-printer-model').value.trim() : '',
      location:  $('nt-location').value.trim(),
      contact:   $('nt-contact').value.trim(),
      desc:      $('nt-desc').value.trim(),
      requester: user.name || 'Usuário',
      assignee:  suggestAssignee(category),
    };
  }

  // ── Validação ─────────────────────────────────────────────────────────────
  function setInvalid(name, invalid) {
    const f = document.querySelector(`.field[data-field="${name}"]`);
    if (f) f.classList.toggle('invalid', invalid);
  }

  function validate(data) {
    const errors = [];
    if (data.subject.length < 5)  errors.push('subject');
    if (!data.category)           errors.push('category');
    if (data.desc.length < 10)    errors.push('desc');
    ['subject', 'category', 'desc'].forEach(n => setInvalid(n, errors.includes(n)));
    if (errors.length) {
      const first = { subject: 'nt-subject', category: 'nt-category', desc: 'nt-desc' }[errors[0]];
      $(first).focus();
    }
    return errors.length === 0;
  }

  // ── UI: resumo + SLA ──────────────────────────────────────────────────────
  function updateSummary() {
    const d = collect();
    const rule = SLA_RULES[d.priority] || SLA_RULES['Média'];
    $('sum-requester').textContent = d.requester;
    $('sum-category').textContent  = d.category || '—';
    $('sum-priority').textContent  = d.priority;
    $('sum-assignee').textContent  = d.category ? d.assignee : '—';
    $('sla-resp').textContent = fmtDeadline(rule.resposta);
    $('sla-res').textContent  = fmtDeadline(rule.resolucao);
    $('nt-priority').value = d.priority;

    $('printer-fields').classList.toggle('show', d.category === 'Impressora' || d.category === 'Suprimentos');
    $('subject-count').textContent = `${$('nt-subject').value.length}/120`;
    $('desc-count').textContent    = `${$('nt-desc').value.length}/2000`;
  }

  // ── UI: sugestões da KB ───────────────────────────────────────────────────
  function updateKB() {
    const text = ($('nt-subject').value + ' ' + $('nt-desc').value).toLowerCase();
    const cat  = $('nt-category').value;
    const box  = $('kb-suggestions');

    if (text.trim().length < 3 && !cat) {
      box.innerHTML = '<p class="muted">Digite o assunto para ver soluções da Base de Conhecimento.</p>';
      return;
    }

    const words = text.split(/[^a-zà-ú0-9]+/i).filter(w => w.length >= 3);
    const scored = KB_LOCAL.map(a => {
      let score = 0;
      const hay = (a.title + ' ' + a.tags.join(' ')).toLowerCase();
      words.forEach(w => { if (hay.includes(w)) score += 2; });
      if (cat && a.cat === cat) score += 1;
      return { a, score };
    }).filter(x => x.score >= 2).sort((x, y) => y.score - x.score).slice(0, 3);

    box.innerHTML = scored.length
      ? scored.map(({ a }) => `
          <a class="kb-item" href="kb.html" target="_blank" rel="noopener">
            <i class="fa fa-file-lines"></i>
            <div>${esc(a.title)}<small>${esc(a.cat)} · pode resolver sem abrir chamado</small></div>
          </a>`).join('')
      : '<p class="muted">Nenhum artigo relacionado encontrado.</p>';
  }

  // ── Anexos ────────────────────────────────────────────────────────────────
  function addFiles(list) {
    const incoming = Array.from(list || []);
    for (const f of incoming) {
      if (files.length >= MAX_FILES) { showToast(`Máximo de ${MAX_FILES} arquivos.`, 'error'); break; }
      if (!ALLOWED.includes(f.type) && !ALLOWED_EXT.test(f.name)) { showToast(`"${f.name}" não é PNG, JPG ou PDF.`, 'error'); continue; }
      if (f.size > MAX_SIZE) { showToast(`"${f.name}" passa de 10MB.`, 'error'); continue; }
      if (files.some(x => x.name === f.name && x.size === f.size)) continue;
      files.push(f);
    }
    renderFiles();
    dirty = true;
  }

  function removeFile(idx) {
    const f = files[idx];
    if (f && f._preview) URL.revokeObjectURL(f._preview);
    files.splice(idx, 1);
    renderFiles();
  }

  function renderFiles() {
    const el = $('file-list');
    el.innerHTML = files.map((f, i) => {
      const isImg = f.type.startsWith('image/');
      if (isImg && !f._preview) f._preview = URL.createObjectURL(f);
      const thumb = isImg ? `<img src="${f._preview}" alt="" />` : '<i class="fa fa-file-pdf"></i>';
      return `
        <div class="file-item">
          <div class="file-thumb">${thumb}</div>
          <div class="file-info">
            <div class="file-name" title="${esc(f.name)}">${esc(f.name)}</div>
            <div class="file-size">${fmtSize(f.size)}</div>
          </div>
          <button type="button" class="file-remove" data-idx="${i}" title="Remover"><i class="fa fa-xmark"></i></button>
        </div>`;
    }).join('');
    $('file-count').textContent = files.length ? `${files.length}/${MAX_FILES} arquivo(s)` : '';
  }

  // ── Rascunho ──────────────────────────────────────────────────────────────
  let draftTimer;
  function saveDraft() {
    clearTimeout(draftTimer);
    draftTimer = setTimeout(() => {
      const d = collect();
      const draft = {
        subject: d.subject, category: d.category, dept: d.dept, priority: d.priority,
        serial: $('nt-serial').value, model: $('nt-printer-model').value,
        location: d.location, contact: d.contact, desc: $('nt-desc').value,
      };
      try { localStorage.setItem(DRAFT_KEY, JSON.stringify(draft)); } catch {}
      $('draft-status').textContent = 'Rascunho salvo às ' + new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    }, 500);
  }

  function restoreDraft() {
    let draft;
    try { draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null'); } catch { draft = null; }
    if (!draft || !(draft.subject || draft.desc)) return;
    $('nt-subject').value       = draft.subject  || '';
    $('nt-category').value      = draft.category || '';
    $('nt-dept').value          = draft.dept     || 'TI';
    $('nt-serial').value        = draft.serial   || '';
    $('nt-printer-model').value = draft.model    || '';
    $('nt-location').value      = draft.location || '';
    $('nt-contact').value       = draft.contact  || '';
    $('nt-desc').value          = draft.desc     || '';
    const r = document.querySelector(`input[name="priority"][value="${draft.priority}"]`);
    if (r) r.checked = true;
    dirty = true;
    showToast('Rascunho anterior restaurado.', 'success');
  }

  function clearDraft() {
    try { localStorage.removeItem(DRAFT_KEY); } catch {}
  }

  // ── Conexão com servidor ──────────────────────────────────────────────────
  async function checkServer() {
    const chip = $('conn-chip'), label = $('conn-label');
    try {
      const res = await fetch(new URL('./api.php?resource=team', location.href), { headers: { Accept: 'application/json' } });
      JSON.parse(await res.text());
      chip.className = 'conn-chip online'; label.textContent = 'Servidor online';
    } catch {
      chip.className = 'conn-chip offline'; label.textContent = 'Modo offline';
      chip.title = 'O servidor PHP não respondeu. Os chamados serão salvos no navegador e enviados quando ele voltar.';
    }
  }

  // ── Envio ─────────────────────────────────────────────────────────────────
  function setLoading(on) {
    const btn = $('btn-submit');
    btn.disabled = on;
    btn.classList.toggle('loading', on);
    $('btn-submit-label').textContent = on ? 'Enviando…' : 'Abrir Chamado';
  }

  async function submit(e) {
    if (e) e.preventDefault();
    if (submitting) return;

    const data = collect();
    if (!validate(data)) {
      showToast('Preencha os campos obrigatórios destacados.', 'error');
      return;
    }

    submitting = true;
    setLoading(true);

    try {
      const { ticket, offline } = await TicketAPI.createWithFallback(data, files);
      clearDraft();
      dirty = false;
      showSuccess(ticket, offline);
    } catch (err) {
      showToast(err.message || 'Não foi possível abrir o chamado. Tente novamente.', 'error');
    } finally {
      submitting = false;
      setLoading(false);
    }
  }

  function showSuccess(ticket, offline) {
    const rule = SLA_RULES[ticket.priority] || SLA_RULES['Média'];
    $('toast')?.classList.add('hidden');
    $('success-id').textContent       = ticket.id;
    $('success-link').href = 'tickets.html?novo=' + encodeURIComponent(String(ticket.id).replace(/\D/g, ''));
    $('success-assignee').textContent = ticket.assignee || '—';
    $('success-priority').textContent = ticket.priority;
    $('success-sla').textContent      = fmtDeadline(rule.resolucao);

    const icon = $('success-icon');
    if (offline) {
      icon.className = 'success-icon warn';
      icon.innerHTML = '<i class="fa fa-cloud-arrow-up"></i>';
      $('success-title').textContent = 'Chamado salvo offline';
      $('success-msg').textContent   = 'O servidor não respondeu. O chamado ficou salvo neste navegador e será enviado automaticamente quando a conexão voltar.';
    } else {
      icon.className = 'success-icon';
      icon.innerHTML = '<i class="fa fa-check"></i>';
      $('success-title').textContent = 'Chamado aberto!';
      $('success-msg').textContent   = 'O SLA já está correndo. Você será notificado a cada atualização.';
    }
    $('modal-success').classList.remove('hidden');
  }

  function resetForm() {
    $('ticket-form').reset();
    files.forEach(f => f._preview && URL.revokeObjectURL(f._preview));
    files = [];
    renderFiles();
    document.querySelectorAll('.field.invalid').forEach(f => f.classList.remove('invalid'));
    $('modal-success').classList.add('hidden');
    clearDraft();
    dirty = false;
    updateSummary();
    updateKB();
    $('nt-subject').focus();
  }

  function cancel() {
    if (dirty && !confirm('Descartar este chamado? O rascunho será apagado.')) return;
    clearDraft();
    dirty = false;
    if (document.referrer && new URL(document.referrer).origin === location.origin) history.back();
    else location.href = 'dashboard.html';
  }

  // ── Init ──────────────────────────────────────────────────────────────────
  function init() {
    if (typeof checkAuth === 'function') checkAuth();

    const form = $('ticket-form');
    const dz   = $('dropzone');
    const inp  = $('nt-files');

    form.addEventListener('submit', submit);
    $('btn-cancel').addEventListener('click', cancel);

    form.addEventListener('input', e => {
      dirty = true;
      const field = e.target.closest('.field');
      if (field) field.classList.remove('invalid');
      updateSummary();
      if (['nt-subject', 'nt-desc'].includes(e.target.id)) updateKB();
      saveDraft();
    });
    form.addEventListener('change', e => {
      updateSummary();
      if (e.target.id === 'nt-category') { updateKB(); setInvalid('category', false); }
      saveDraft();
    });

    // Ctrl/Cmd + Enter envia
    document.addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') submit(e);
      if (e.key === 'Escape') $('modal-success').classList.add('hidden');
    });

    // Dropzone
    dz.addEventListener('click', () => inp.click());
    dz.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inp.click(); } });
    inp.addEventListener('change', () => { addFiles(inp.files); inp.value = ''; });
    ['dragenter', 'dragover'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.add('drag'); }));
    ['dragleave', 'drop'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.remove('drag'); }));
    dz.addEventListener('drop', e => addFiles(e.dataTransfer.files));
    $('file-list').addEventListener('click', e => {
      const btn = e.target.closest('.file-remove');
      if (btn) removeFile(+btn.dataset.idx);
    });

    // Colar print (Ctrl+V) em qualquer lugar da página
    document.addEventListener('paste', e => {
      const imgs = Array.from(e.clipboardData?.files || []).filter(f => f.type.startsWith('image/'));
      if (!imgs.length) return;
      const named = imgs.map((f, i) => new File([f], `print-${Date.now()}-${i + 1}.png`, { type: f.type }));
      addFiles(named);
      showToast('Print anexado!', 'success');
    });

    // Aviso ao sair com dados não enviados
    window.addEventListener('beforeunload', e => {
      if (dirty && !submitting && files.length) { e.preventDefault(); e.returnValue = ''; }
    });

    restoreDraft();
    updateSummary();
    updateKB();
    checkServer();
    $('nt-subject').focus();
  }

  // Exposto globalmente (api.js → submitTicket() delega para cá)
  window.NewTicket = { submit, resetForm, addFiles };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();