/* Shared across every page: API helper + header auth state. */

const API = {
  base: '',
  token() { return localStorage.getItem('kiristay_token'); },
  setToken(t) { localStorage.setItem('kiristay_token', t); },
  clearToken() { localStorage.removeItem('kiristay_token'); },

  async request(method, path, body) {
    const headers = { 'Content-Type': 'application/json' };
    const token = API.token();
    if (token) headers['Authorization'] = 'Bearer ' + token;
    const res = await fetch(API.base + path, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    let data = {};
    try { data = await res.json(); } catch (e) { /* no body */ }
    if (!res.ok) {
      const err = new Error(data.error || 'Request failed');
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  },
  get(path) { return API.request('GET', path); },
  post(path, body) { return API.request('POST', path, body); },
  put(path, body) { return API.request('PUT', path, body); },
  del(path) { return API.request('DELETE', path); },
};

let CURRENT_USER = null;
let SITE_CONTENT = null;

async function loadCurrentUser() {
  if (!API.token()) { CURRENT_USER = null; return null; }
  try {
    const { user } = await API.get('/api/me');
    CURRENT_USER = user;
    return user;
  } catch (e) {
    API.clearToken();
    CURRENT_USER = null;
    return null;
  }
}

// Site copy (hero, "Why Kiri Stay", "On site", "Building guide", footer
// tagline, About page) is admin-editable and stored server-side. Every
// page loads it once so the footer tagline — which appears on every
// page — always reflects the latest admin edit.
async function loadSiteContent() {
  try {
    const { content } = await API.get('/api/content');
    SITE_CONTENT = content || {};
  } catch (e) {
    SITE_CONTENT = {};
  }
  return SITE_CONTENT;
}

function applyFooterTagline() {
  const el = document.getElementById('footer-tagline');
  if (el && SITE_CONTENT?.footer?.tagline) {
    el.textContent = SITE_CONTENT.footer.tagline;
  }
}

function applyAuthUI(user) {
  document.querySelectorAll('[data-auth="guest"]').forEach((el) => {
    el.style.display = user ? 'none' : '';
  });
  document.querySelectorAll('[data-auth="user"]').forEach((el) => {
    el.style.display = user ? '' : 'none';
  });
  document.querySelectorAll('[data-auth="admin"]').forEach((el) => {
    el.style.display = user && user.role === 'admin' ? '' : 'none';
  });
  document.querySelectorAll('[data-user-name]').forEach((el) => {
    if (user) el.textContent = user.name;
  });
  document.querySelectorAll('[data-dashboard-link]').forEach((el) => {
    if (user) el.setAttribute('href', user.role === 'admin' ? '/admin/index.html' : '/dashboard.html');
  });
}

function wireLogout() {
  document.querySelectorAll('[data-action="logout"]').forEach((el) => {
    el.addEventListener('click', async (e) => {
      e.preventDefault();
      try { await API.post('/api/logout'); } catch (err) { /* ignore */ }
      API.clearToken();
      window.location.href = '/index.html';
    });
  });
}

function wireMobileNav() {
  const toggle = document.querySelector('.nav-toggle');
  const links = document.querySelector('.nav-links');
  if (!toggle || !links) return;
  toggle.addEventListener('click', () => {
    links.style.display = links.style.display === 'flex' ? 'none' : 'flex';
    links.style.cssText += 'flex-direction:column; position:absolute; top:76px; left:0; right:0; background:var(--ivory); padding:20px 28px; border-bottom:1px solid var(--line);';
  });
}

function showMsg(el, text, type) {
  if (!el) return;
  el.textContent = text;
  el.className = 'msg show msg-' + type;
}

function fmtDate(iso) {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtMoney(n) {
  return '$' + Number(n).toFixed(2);
}

// Local (not UTC) calendar date as YYYY-MM-DD. toISOString() converts to
// UTC first, which silently shifts the date backward for any timezone
// ahead of UTC (e.g. Indochina, UTC+7) during the early hours of each new
// local day — a date picked as "the 20th" could get sent to the server
// as the 19th. Every "what calendar day is this" computation in the app
// must use this instead of toISOString().slice(0,10).
function localISODate(d) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// A booking now stores an array of individually-picked days rather than a
// single check-in/check-out range, since guests can pick non-contiguous
// dates. Show a compact range when the days happen to be contiguous, and
// a plain list otherwise.
function describeDates(dates) {
  if (!dates || !dates.length) return '—';
  const sorted = [...dates].sort();
  let contiguous = true;
  for (let i = 1; i < sorted.length; i++) {
    const prev = new Date(sorted[i - 1] + 'T00:00:00');
    const cur = new Date(sorted[i] + 'T00:00:00');
    if (Math.round((cur - prev) / 86400000) !== 1) { contiguous = false; break; }
  }
  if (contiguous && sorted.length > 1) {
    return `${fmtDate(sorted[0])} → ${fmtDate(sorted[sorted.length - 1])}`;
  }
  return sorted.map(fmtDate).join(', ');
}

// The dates a guest actually needs to check IN on: the first day of each
// contiguous run. A guest who booked Aug 8-10 straight through only
// checks in once, on the 8th. A guest who separately booked Aug 8 and
// Aug 15 (two different stays) checks in twice — once per stay.
function checkInDates(dates) {
  if (!dates || !dates.length) return [];
  const sorted = [...dates].sort();
  const starts = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const prev = new Date(sorted[i - 1] + 'T00:00:00');
    const cur = new Date(sorted[i] + 'T00:00:00');
    if (Math.round((cur - prev) / 86400000) !== 1) starts.push(sorted[i]);
  }
  return starts;
}

let STANDARD_CHECKIN_TIME = '2:00 PM';
async function loadCheckInTimeGlobal() {
  try {
    const { settings } = await API.get('/api/settings');
    STANDARD_CHECKIN_TIME = settings.standardCheckInTime || '2:00 PM';
  } catch (e) { /* keep the default */ }
}

// The guest's check-in card — shown from the dashboard ("View ID") and
// from the admin's booking list, so front-desk staff can visually match
// it against what the guest shows on their phone at arrival.
function bookingCardHTML(booking) {
  const roomName = booking.room ? booking.room.name : 'Room #' + booking.roomId;
  const checkIns = checkInDates(booking.dates);
  const qrSrc = 'https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=' + encodeURIComponent(booking.checkInCode || String(booking.id));
  return `
    <div class="id-card">
      <div class="id-card-header">Kiri <span>Stay</span></div>
      <div class="id-card-qr"><img src="${qrSrc}" alt="Check-in QR" /></div>
      <div class="id-card-body">
        <div><span>ROOM:</span> ${roomName}</div>
        ${checkIns.map((d) => `<div><span>Check in:</span> ${fmtDate(d)}</div>`).join('')}
        <div><span>Time check in:</span> ${STANDARD_CHECKIN_TIME}</div>
        <div><span>ID:</span> ${booking.checkInCode || '—'}</div>
      </div>
      <div class="id-card-footer">Location: Kiri Stay Hotel</div>
    </div>`;
}

function showBookingCard(booking) {
  const overlay = document.createElement('div');
  overlay.className = 'card-modal-overlay';
  overlay.innerHTML = `
    <div class="card-modal">
      <button type="button" class="card-modal-close" aria-label="Close">&times;</button>
      ${bookingCardHTML(booking)}
    </div>`;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  overlay.querySelector('.card-modal-close').addEventListener('click', close);
}

/* ---------------------------------------------------------------------
   Admin CMS helper: every translatable field is edited as three stacked
   inputs (English / Khmer / Chinese) instead of one. These two functions
   generate that markup and read it back, used by admin-content.js and
   admin-rooms.js so both share one pattern instead of two.
--------------------------------------------------------------------- */
const I18N_ADMIN_LANGS = [['en', 'English'], ['km', 'ខ្មែរ'], ['zh', '中文']];

function i18nRowsHTML(field, values, tag) {
  values = values || {};
  tag = tag || 'input';
  return `<div class="i18n-field">` + I18N_ADMIN_LANGS.map(([code, label]) =>
    tag === 'textarea'
      ? `<div class="i18n-row"><span class="i18n-tag">${label}</span><textarea class="i18n-input" data-field="${field}" data-lang="${code}" rows="2">${values[code] || ''}</textarea></div>`
      : `<div class="i18n-row"><span class="i18n-tag">${label}</span><input type="text" class="i18n-input" data-field="${field}" data-lang="${code}" value="${(values[code] || '').replace(/"/g, '&quot;')}" /></div>`
  ).join('') + `</div>`;
}

function readI18nField(scopeEl, field) {
  const obj = {};
  ['en', 'km', 'zh'].forEach((code) => {
    const el = scopeEl.querySelector(`[data-field="${field}"][data-lang="${code}"]`);
    obj[code] = el ? el.value.trim() : '';
  });
  return obj;
}

document.addEventListener('DOMContentLoaded', async () => {
  wireMobileNav();
  wireLogout();
  const [user] = await Promise.all([loadCurrentUser(), loadSiteContent(), loadCheckInTimeGlobal()]);
  applyAuthUI(user);
  applyFooterTagline();
  document.dispatchEvent(new CustomEvent('kiristay:auth-ready', { detail: { user } }));
  document.dispatchEvent(new CustomEvent('kiristay:content-ready', { detail: { content: SITE_CONTENT } }));
});
