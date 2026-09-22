// auth.js — Sistema de Autenticação Completo Inova+ Helpdesk
// JWT + Refresh Tokens + Rate Limiting + Device Fingerprint + MFA
// absprinter © 2025

'use strict';

const AUTH_CONFIG = {
  TOKEN_KEY:       'inova_token',
  REFRESH_KEY:     'inova_refresh',
  USER_KEY:        'inova_user',
  SESSION_KEY:     'inova_session',
  FINGERPRINT_KEY: 'inova_fp',
  TOKEN_TTL:       8 * 60 * 60 * 1000,
  REFRESH_TTL:     30 * 24 * 60 * 60 * 1000,
  SECRET:          'inova_secret_2025_absprinter',
  API_BASE:        './auth.php',
};

// ── LOCAL USERS (offline demo) ────────────────────────────────────────────────
const LOCAL_USERS = [
  { id:1, name:'Cauan Gomes',      email:'cauan.gomes@techub.com',      password:'mudar@1254', role:'admin', initials:'CG', dept:'TI',      mfa:true  },
  { id:2, name:'Ana Lima',         email:'ana.lima@absprinter.com',      password:'mudar@1254', role:'agent', initials:'AL', dept:'Suporte', mfa:false },
  { id:3, name:'Ricardo Silva',    email:'ricardo.silva@absprinter.com', password:'mudar@1254', role:'agent', initials:'RS', dept:'TI',      mfa:false },
  { id:4, name:'Mariana Oliveira', email:'mariana@absprinter.com',       password:'mudar@1254', role:'agent', initials:'MO', dept:'Suporte', mfa:false },
];

// ── JWT SIMULATION ────────────────────────────────────────────────────────────
const JWT = {
  encode(payload) {
    const header = btoa(JSON.stringify({ alg:'HS256', typ:'JWT' }));
    const body   = btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
    const sig    = btoa(AUTH_CONFIG.SECRET + body).replace(/[^a-zA-Z0-9]/g,'').slice(0,16);
    return `${header}.${body}.${sig}`;
  },
  decode(token) {
    try {
      if (!token || typeof token !== 'string') return null;
      const parts = token.split('.');
      if (parts.length !== 3) return null;
      return JSON.parse(decodeURIComponent(escape(atob(parts[1]))));
    } catch { return null; }
  },
  verify(token) {
    const p = this.decode(token);
    if (!p) return null;
    if (p.exp && p.exp < Date.now()) return null;
    return p;
  },
};

// ── DEVICE FINGERPRINT ────────────────────────────────────────────────────────
const DeviceFingerprint = {
  generate() {
    const raw = [navigator.userAgent, navigator.language, screen.width, screen.height, navigator.platform].join('|');
    let h = btoa(raw).replace(/[^a-zA-Z0-9]/g,'');
    return h.slice(0, 28);
  },
  isTrusted() { return localStorage.getItem(AUTH_CONFIG.FINGERPRINT_KEY) === this.generate(); },
  trust()     { localStorage.setItem(AUTH_CONFIG.FINGERPRINT_KEY, this.generate()); },
};

// ── SESSION ────────────────────────────────────────────────────────────────────
const Session = {
  save(user, token, refreshToken, persistent = false) {
    localStorage.setItem(AUTH_CONFIG.TOKEN_KEY, token);
    localStorage.setItem(AUTH_CONFIG.USER_KEY,  JSON.stringify(user));
    if (refreshToken) localStorage.setItem(AUTH_CONFIG.REFRESH_KEY, refreshToken);
    localStorage.setItem(AUTH_CONFIG.SESSION_KEY, JSON.stringify({
      userId: user.id, role: user.role,
      loginAt: Date.now(), expiresAt: Date.now() + AUTH_CONFIG.TOKEN_TTL, persistent,
    }));
  },
  get()        { return JWT.verify(localStorage.getItem(AUTH_CONFIG.TOKEN_KEY)); },
  getUser()    { try { return JSON.parse(localStorage.getItem(AUTH_CONFIG.USER_KEY)||'null'); } catch { return null; } },
  getSession() { try { return JSON.parse(localStorage.getItem(AUTH_CONFIG.SESSION_KEY)||'null'); } catch { return null; } },
  clear()      { [AUTH_CONFIG.TOKEN_KEY, AUTH_CONFIG.REFRESH_KEY, AUTH_CONFIG.USER_KEY, AUTH_CONFIG.SESSION_KEY].forEach(k=>localStorage.removeItem(k)); },
  needsRefresh() {
    const s = this.getSession();
    if (!s) return false;
    const rem = s.expiresAt - Date.now();
    return rem > 0 && rem < 15 * 60 * 1000;
  },
};

// ── MAIN AUTH ─────────────────────────────────────────────────────────────────
window.Auth = {

  localLogin(email, password) {
    const user = LOCAL_USERS.find(u => u.email === email && u.password === password);
    if (!user) return { success: false, error: 'E-mail ou senha incorretos.' };
    const { password: _, ...safe } = user;
    return { success: true, requireMFA: user.mfa, user: safe, token: this.generateToken(safe), refreshToken: this.generateRefreshToken(safe) };
  },

  async loginWithAPI(email, password) {
    const fp = DeviceFingerprint.generate();
    let response;
    try {
      response = await fetch(AUTH_CONFIG.API_BASE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'login', email, password, fingerprint: fp }),
      });
    } catch { throw new Error('offline'); }

    if (!response.ok) throw new Error('api_error');
    const data = await response.json();

    if (data.success) {
      DeviceFingerprint.trust();
      return { success: true, requireMFA: !!data.require_mfa, user: data.user, token: data.token, refreshToken: data.refresh_token };
    }
    return { success: false, error: data.error || 'Credenciais inválidas.' };
  },

  async registerWithAPI({ name, email, password, dept }) {
    const response = await fetch(AUTH_CONFIG.API_BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'register', name, email, password, dept }),
    });
    if (!response.ok) throw new Error('offline');
    return response.json();
  },

  async refresh() {
    const token = localStorage.getItem(AUTH_CONFIG.REFRESH_KEY);
    if (!token) return false;
    try {
      const r = await fetch(AUTH_CONFIG.API_BASE, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'refresh', refresh_token: token }),
      });
      const d = await r.json();
      if (d.success && d.token) { localStorage.setItem(AUTH_CONFIG.TOKEN_KEY, d.token); return true; }
    } catch {
      const user = Session.getUser();
      if (user) { localStorage.setItem(AUTH_CONFIG.TOKEN_KEY, this.generateToken(user)); return true; }
    }
    return false;
  },

  async logout(redirect = true) {
    try {
      await fetch(AUTH_CONFIG.API_BASE, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem(AUTH_CONFIG.TOKEN_KEY)}` },
        body: JSON.stringify({ action: 'logout' }),
      });
    } catch {}
    Session.clear();
    if (redirect) window.location.href = 'index.html';
  },

  generateToken(user) {
    return JWT.encode({ sub: user.id, name: user.name, email: user.email, role: user.role, initials: user.initials, dept: user.dept, iat: Date.now(), exp: Date.now() + AUTH_CONFIG.TOKEN_TTL });
  },

  generateRefreshToken(user) {
    return JWT.encode({ sub: user.id, type: 'refresh', iat: Date.now(), exp: Date.now() + AUTH_CONFIG.REFRESH_TTL });
  },

  saveSession(user, token, refreshToken, persistent = false) {
    Session.save(user, token, refreshToken, persistent);
    DeviceFingerprint.trust();
  },

  getUser()    { return Session.getUser(); },
  getSession() { return Session.getSession(); },
  isLoggedIn() { return !!Session.get(); },
};

// ── LEGACY COMPAT ─────────────────────────────────────────────────────────────
function getUser()  { return Session.get(); }
function doLogout() { Auth.logout(); }

function checkAuth() {
  const session = Session.get();
  const user    = Session.getUser();

  if (!session || !user) {
    Auth.refresh().then(ok => { if (!ok) window.location.href = 'index.html'; });
    return null;
  }

  if (Session.needsRefresh()) Auth.refresh().catch(() => {});

  const initials = user.initials || (user.name||'??').split(' ').map(w=>w[0]).join('').slice(0,2);
  document.querySelectorAll('#sidebar-avatar, #topbar-avatar').forEach(el => el.textContent = initials);

  const nameEl = document.getElementById('sidebar-name');
  if (nameEl) nameEl.textContent = user.name;

  const dateEl = document.getElementById('topbar-date');
  if (dateEl) dateEl.textContent = new Date().toLocaleDateString('pt-BR', { weekday:'long', year:'numeric', month:'long', day:'numeric' });

  return user;
}

// ── UI HELPERS ────────────────────────────────────────────────────────────────
function toggleSidebar() {
  document.getElementById('sidebar')?.classList.toggle('open');
  document.getElementById('sidebar-overlay')?.classList.toggle('hidden');
}
function toggleNotif()    { document.getElementById('notif-panel')?.classList.toggle('hidden'); }
function closeModal(id)   { document.getElementById(id)?.classList.add('hidden'); }

function showToast(msg, type = 'success') {
  let t = document.getElementById('toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.appendChild(t); }
  t.className = `toast ${type}`;
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.add('hidden'), 3500);
}

// Close notif on outside click
document.addEventListener('click', e => {
  const panel = document.getElementById('notif-panel');
  if (panel && !e.target.closest('.notif-btn') && !panel.classList.contains('hidden'))
    panel.classList.add('hidden');
});

// Session heartbeat — checks every 5 min
setInterval(async () => {
  const page = window.location.pathname;
  if (page.includes('index.html') || page === '/' || page.endsWith('/')) return;
  if (!Session.get()) {
    const ok = await Auth.refresh();
    if (!ok) { showToast('Sessão expirada. Redirecionando…', 'error'); setTimeout(() => { Session.clear(); window.location.href = 'index.html'; }, 2000); }
  }
}, 5 * 60 * 1000);

// Bootstrap
document.addEventListener('DOMContentLoaded', () => {
  const page = window.location.pathname;
  const isLogin = page.includes('index.html') || page === '/' || page.endsWith('/');
  if (!isLogin) {
    if (!Session.get()) Auth.refresh().then(ok => { if (!ok) window.location.href = 'index.html'; });
  } else {
    if (Session.get()) window.location.href = 'dashboard.html';
  }
});
