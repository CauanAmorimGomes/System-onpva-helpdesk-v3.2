// data.js — Mock data store for Inova+ Helpdesk
// absprinter © 2025

window.TICKETS = [
  { id:'#0042', subject:'Impressora atolando papel frequentemente',  category:'Impressora',  requester:'Cauan Gomes',    assignee:'Ana Lima',      priority:'Crítica', status:'Aberto',      sla:85,  created:'2025-03-28', serial:'HP-3L8ZK1F9Q2', model:'Lexmark MX611',    dept:'TI',            desc:'Impressora atolando em papel A4 75g/m². Já limpei o caminho mas persiste. Ocorre principalmente nas primeiras 5 páginas.',      comments:[{author:'Ana Lima',  text:'Verificando o sensor de papel. Possível desgaste do rolete de alimentação.', time:'10h30'}] },
  { id:'#0041', subject:'Toner preto acabou — MX722adhe',           category:'Suprimentos', requester:'Mariana Oliveira',assignee:'Ricardo Silva', priority:'Alta',    status:'Em andamento', sla:62,  created:'2025-03-27', serial:'HP-3L8ZK1F9Q2', model:'Lexmark MX722adhe',dept:'Administrativo', desc:'Toner preto esgotado. Impressora com mensagem de erro e bloqueada.',                                                            comments:[{author:'Ricardo Silva',text:'Pedido de toner realizado. Chega amanhã.',time:'09h15'}] },
  { id:'#0040', subject:'Sem conexão com impressora de rede',        category:'Rede',        requester:'João Costa',     assignee:'Cauan Gomes',   priority:'Alta',    status:'Resolvido',    sla:100, created:'2025-03-26', serial:'EP-9Q1X7M4K2L', model:'Epson L1250',      dept:'Financeiro',    desc:'Impressora sumiu da rede após update do Windows 11. Driver corrompido.',                                                       comments:[{author:'Cauan Gomes',text:'Reinstalei o driver via Windows Update. Resolvido.',time:'14h20'}] },
  { id:'#0039', subject:'Erro de fusão — Lexmark MS611de',           category:'Impressora',  requester:'Paulo Ferreira', assignee:'Ricardo Silva', priority:'Crítica', status:'Em andamento', sla:30,  created:'2025-03-25', serial:'PR-7X2M9Q4L1Z', model:'Lexmark MS611de',  dept:'Operacional',   desc:'Erro 920 na tela (fusão). Impressão com manchas quentes.',                                                                     comments:[] },
  { id:'#0038', subject:'Solicitar papel A4 — estoque zerado',       category:'Suprimentos', requester:'Ana Lima',       assignee:'Cauan Gomes',   priority:'Média',   status:'Resolvido',    sla:100, created:'2025-03-24', serial:'',              model:'',                 dept:'TI',            desc:'Estoque de papel A4 75g/m² zerado. Necessário urgente para setor financeiro.',                                                 comments:[{author:'Cauan Gomes',text:'Compra realizada. 10 resmas chegando quinta.',time:'11h00'}] },
  { id:'#0037', subject:'Configurar VPN para home office',           category:'TI',          requester:'Cauan Gomes',    assignee:'Cauan Gomes',   priority:'Baixa',   status:'Fechado',      sla:100, created:'2025-03-23', serial:'',              model:'',                 dept:'TI',            desc:'Usuário precisando de VPN para trabalho remoto. Configurar OpenVPN.',                                                          comments:[{author:'Cauan Gomes',text:'Configurado. Arquivo .ovpn enviado por e-mail.',time:'16h45'}] },
  { id:'#0036', subject:'Impressora Epson L1250 — tinta ciano fraca',category:'Impressora',  requester:'Mariana Oliveira',assignee:'Ana Lima',     priority:'Média',   status:'Aberto',       sla:70,  created:'2025-03-22', serial:'BR-5Z8L2XQ9F1', model:'Epson L1250',      dept:'Marketing',     desc:'Ciano saindo muito fraco mesmo com 76% de tinta. Possível entupimento de cabeçote.',                                           comments:[] },
  { id:'#0035', subject:'Reset de senha — sistema financeiro',       category:'TI',          requester:'João Costa',     assignee:'Cauan Gomes',   priority:'Alta',    status:'Resolvido',    sla:100, created:'2025-03-21', serial:'',              model:'',                 dept:'Financeiro',    desc:'Usuário bloqueado após 5 tentativas erradas. Resetar senha TOTVS.',                                                            comments:[{author:'Cauan Gomes',text:'Senha resetada. Enviada por e-mail seguro.',time:'08h30'}] },
  { id:'#0034', subject:'Impressora não imprime duplex',             category:'Impressora',  requester:'Paulo Ferreira', assignee:'Ana Lima',      priority:'Baixa',   status:'Aberto',       sla:90,  created:'2025-03-20', serial:'SN-A9F3K2L8X7', model:'Lexmark MX522',    dept:'RH',            desc:'Opção de duplex sumiu após atualização de driver.',                                                                             comments:[] },
  { id:'#0033', subject:'Toner magenta crítico — MX522',             category:'Suprimentos', requester:'Ricardo Silva',  assignee:'Cauan Gomes',   priority:'Alta',    status:'Aberto',       sla:45,  created:'2025-03-19', serial:'EP-9Q1X7M4K2L', model:'Lexmark MX522',    dept:'TI',            desc:'Toner magenta em 15%. Solicitar reposição urgente.',                                                                            comments:[] },
];

window.TEAM = [
  { name:'Ana Lima',         initials:'AL', role:'Suporte Sênior', dept:'Suporte', online:true,  tickets:42, sla:95, color:'#f59e0b,#ef4444' },
  { name:'Cauan Gomes',      initials:'CG', role:'Administrador',  dept:'TI',      online:true,  tickets:38, sla:91, color:'#6366f1,#8b5cf6' },
  { name:'Ricardo Silva',    initials:'RS', role:'Técnico TI',     dept:'TI',      online:true,  tickets:31, sla:84, color:'#10b981,#06b6d4' },
  { name:'Mariana Oliveira', initials:'MO', role:'Suporte',        dept:'Suporte', online:true,  tickets:27, sla:88, color:'#ec4899,#f43f5e' },
  { name:'João Costa',       initials:'JC', role:'Técnico',        dept:'TI',      online:false, tickets:15, sla:79, color:'#475569,#334155' },
  { name:'Paulo Ferreira',   initials:'PF', role:'Técnico',        dept:'TI',      online:false, tickets:19, sla:71, color:'#f59e0b,#84cc16' },
];

window.KB = [
  { title:'Como limpar papel atolado na MX611',       cat:'Impressora'  },
  { title:'Troca de toner Lexmark — passo a passo',   cat:'Suprimentos' },
  { title:'Impressora offline — diagnóstico rápido',  cat:'Impressora'  },
  { title:'Configurar impressora em rede Windows',    cat:'Rede'        },
  { title:'Recarregar tinta Epson EcoTank L1250',     cat:'Suprimentos' },
];

// Priority/Status helpers
window.PRIORITY_CLASS = { 'Crítica':'critica','Alta':'alta','Média':'media','Baixa':'baixa' };
window.STATUS_CLASS   = { 'Aberto':'aberto','Em andamento':'andamento','Resolvido':'resolvido','Fechado':'fechado' };

function priorityBadge(p) {
  const icons = {'Crítica':'🚨','Alta':'🔴','Média':'🟡','Baixa':'🟢'};
  return `<span class="badge badge-${PRIORITY_CLASS[p] || 'media'}">${icons[p]||''} ${p||'—'}</span>`;
}
function statusBadge(s) {
  const icons = {'Aberto':'●','Em andamento':'◐','Resolvido':'✓','Fechado':'○'};
  return `<span class="badge badge-${STATUS_CLASS[s] || 'aberto'}">${icons[s]||''} ${s||'—'}</span>`;
}
function slaBar(pct) {
  const p = parseInt(pct) || 0;
  const color = p>=80 ? '#22c55e' : p>=50 ? '#f59e0b' : '#ef4444';
  return `<div class="sla-bar-wrap"><div class="sla-bar"><div class="sla-fill" style="width:${p}%;background:${color}"></div></div><span style="font-size:0.72rem;color:${color}">${p}%</span></div>`;
}

function ticketRow(t, showAssignee=true) {
  return `<tr>
    <td><strong style="color:var(--accent2);font-size:0.78rem">${t.id}</strong></td>
    <td>
      <div style="max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:0.82rem">${t.subject}</div>
      ${t.serial ? `<small style="color:var(--text3);font-size:0.7rem">${t.serial}</small>` : ''}
    </td>
    <td><span style="font-size:0.78rem;color:var(--text2)">${t.category}</span></td>
    ${showAssignee
      ? `<td><span style="font-size:0.78rem">${t.requester}</span></td>
         <td><span style="font-size:0.78rem;color:var(--accent2)">${t.assignee}</span></td>`
      : ''}
    <td>${priorityBadge(t.priority)}</td>
    <td>${statusBadge(t.status)}</td>
    <td>${slaBar(t.sla)}</td>
    <td><span style="font-size:0.75rem;color:var(--text3)">${t.created}</span></td>
    <td>
      <div class="actions-cell">
        <button class="action-btn view" onclick="openTicketDetail('${t.id}')" title="Ver detalhes"><i class="fa fa-eye"></i></button>
        ${t.status!=='Fechado' ? `<button class="action-btn close" onclick="closeTicketById('${t.id}')" title="Fechar ticket"><i class="fa fa-check"></i></button>` : ''}
      </div>
    </td>
  </tr>`;
}

function openTicketDetail(id) {
  const t = TICKETS.find(x => x.id===id);
  if (!t) return;
  const modal = document.getElementById('modal-detail');
  if (!modal) { window.location.href=`tickets.html`; return; }

  document.getElementById('modal-title').textContent = `Ticket ${t.id} — ${t.subject}`;
  document.getElementById('modal-body-detail').innerHTML = `
    <div class="ticket-detail-grid">
      <div class="detail-item"><label>Status</label>${statusBadge(t.status)}</div>
      <div class="detail-item"><label>Prioridade</label>${priorityBadge(t.priority)}</div>
      <div class="detail-item"><label>Categoria</label><span>${t.category}</span></div>
      <div class="detail-item"><label>Departamento</label><span>${t.dept}</span></div>
      <div class="detail-item"><label>Solicitante</label><span>${t.requester}</span></div>
      <div class="detail-item"><label>Atribuído</label><span style="color:var(--accent2)">${t.assignee||'—'}</span></div>
      <div class="detail-item"><label>Criado em</label><span>${t.created}</span></div>
      <div class="detail-item"><label>SLA</label>${slaBar(t.sla)}</div>
      ${t.serial ? `<div class="detail-item"><label>Nº de Série</label><span style="font-family:monospace;color:var(--accent2)">${t.serial}</span></div>` : ''}
      ${t.model  ? `<div class="detail-item"><label>Modelo</label><span>${t.model}</span></div>` : ''}
      ${t.location ? `<div class="detail-item"><label>Local</label><span>${t.location}</span></div>` : ''}
      ${t.contact  ? `<div class="detail-item"><label>Contato</label><span>${t.contact}</span></div>` : ''}
    </div>
    ${t._pending ? `<div style="margin-bottom:0.75rem;padding:0.5rem 0.75rem;border-radius:8px;background:rgba(245,166,35,0.1);color:#fcd34d;font-size:0.78rem"><i class="fa fa-cloud-arrow-up"></i> Salvo offline — será enviado ao servidor quando ele estiver disponível.</div>` : ''}
    <div class="ticket-desc-box">${t.desc}</div>
    ${(t.attachments||[]).length ? `
      <div style="margin-bottom:1rem">
        <div style="font-size:0.8rem;font-weight:700;margin-bottom:0.5rem;color:var(--text2)">ANEXOS</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px">
          ${t.attachments.map(a => a.url
            ? `<a href="${a.url}" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:6px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);font-size:0.75rem"><i class="fa ${a.type==='application/pdf'?'fa-file-pdf':'fa-image'}"></i> ${a.name}</a>`
            : `<span style="display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:6px;background:rgba(255,255,255,0.03);font-size:0.75rem;opacity:0.6" title="Arquivo não enviado (modo offline)"><i class="fa fa-paperclip"></i> ${a.name}</span>`).join('')}
        </div>
      </div>` : ''}
    <div class="chat-box">
      <div style="font-size:0.8rem;font-weight:700;margin-bottom:0.75rem;color:var(--text2)">HISTÓRICO</div>
      ${(t.comments||[]).length
        ? t.comments.map(c=>`
            <div class="chat-msg">
              <div class="chat-avatar">${c.author.split(' ').map(w=>w[0]).join('')}</div>
              <div class="chat-bubble">
                <div class="chat-author">${c.author} <span style="color:var(--text3);font-weight:400">${c.time}</span></div>
                ${c.text}
              </div>
            </div>`).join('')
        : '<p style="color:var(--text3);font-size:0.82rem">Sem comentários ainda.</p>'}
      <div class="chat-reply">
        <input type="text" id="reply-input-${t.id}" placeholder="Escrever resposta..." />
        <button class="btn-primary sm" onclick="sendReply('${t.id}')"><i class="fa fa-paper-plane"></i></button>
      </div>
    </div>`;

  document.getElementById('modal-footer-detail').innerHTML = `
    <button class="btn-outline" onclick="closeModal('modal-detail')">Fechar</button>
    ${t.status==='Aberto' ? `<button class="btn-primary sm" onclick="attendTicket('${t.id}')"><i class="fa fa-headset"></i> Atender</button>` : ''}
    ${t.status!=='Resolvido' && t.status!=='Fechado' ? `<button class="btn-success" onclick="resolveTicket('${t.id}')"><i class="fa fa-check-circle"></i> Marcar Resolvido</button>` : ''}
    ${t.status!=='Fechado' ? `<button class="btn-danger" onclick="closeTicketById('${t.id}')"><i class="fa fa-xmark-circle"></i> Fechar Ticket</button>` : ''}`;

  modal.classList.remove('hidden');
}

function closeTicketById(id) {
  const t = TICKETS.find(x=>x.id===id);
  if (t) { t.status='Fechado'; t.sla=100; }
  closeModal('modal-detail');
  // Refresh current page list if function exists
  if (typeof renderTickets==='function') renderTickets();
  if (typeof renderMyTickets==='function') { /* handled by caller */ }
  if (typeof fullRender==='function') fullRender();
  showToast(`Ticket ${id} fechado com sucesso!`,'success');
}

// Keep backward compat alias
window.closeTicket = closeTicketById;

function resolveTicket(id) {
  const t = TICKETS.find(x=>x.id===id);
  if (t) t.status='Resolvido';
  closeModal('modal-detail');
  if (typeof renderTickets==='function') renderTickets();
  if (typeof fullRender==='function') fullRender();
  showToast(`Ticket ${id} marcado como resolvido!`,'success');
}

function sendReply(id) {
  const inp = document.getElementById(`reply-input-${id}`);
  if (!inp || !inp.value.trim()) return;
  const t    = TICKETS.find(x=>x.id===id);
  const user = JSON.parse(localStorage.getItem('inova_user')||'{}');
  if (!t) return;
  t.comments = t.comments || [];
  t.comments.push({
    author: user.name||'Admin',
    text:   inp.value.trim(),
    time:   new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})
  });
  inp.value='';
  openTicketDetail(id);
  showToast('Resposta enviada!','success');
}

// ─── Chamados criados offline (localStorage) ─────────────────────────────────
// Garante que chamados abertos sem o servidor apareçam em TODAS as páginas,
// mesmo nas que não carregam o api.js.
(function mergeLocalTicketsFromStorage() {
  try {
    const local = JSON.parse(localStorage.getItem('inova_local_tickets') || '[]');
    if (!Array.isArray(local)) return;
    const ids = new Set(window.TICKETS.map(t => t.id));
    window.TICKETS.unshift(...local.filter(t => t && !ids.has(t.id)));
  } catch (_) {}
})();