/**
 * Notification bell for the admin header — shown on every /admin/*.html
 * page. Combines two sources: contact messages (unread) and new bookings
 * (not yet seen by the admin). Shows a single unread-count badge and a
 * dropdown split into "New bookings" and "Messages".
 */

let BELL_MESSAGES = [];
let BELL_BOOKINGS = [];

function bellUnreadMessageCount() {
  return BELL_MESSAGES.filter((m) => !m.read).length;
}
function bellUnseenBookingCount() {
  return BELL_BOOKINGS.filter((b) => !b.seenByAdmin && b.status !== 'cancelled').length;
}

function bellSenderSummary() {
  const byEmail = {};
  BELL_MESSAGES.forEach((m) => {
    const key = m.email;
    if (!byEmail[key]) byEmail[key] = { name: m.name, email: m.email, total: 0, unread: 0, latest: m.createdAt };
    byEmail[key].total += 1;
    if (!m.read) byEmail[key].unread += 1;
    if (m.createdAt > byEmail[key].latest) byEmail[key].latest = m.createdAt;
  });
  return Object.values(byEmail).sort((a, b) => new Date(b.latest) - new Date(a.latest));
}

function bellNewBookings() {
  return BELL_BOOKINGS
    .filter((b) => !b.seenByAdmin && b.status !== 'cancelled')
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function renderBell() {
  const badge = document.getElementById('bell-badge');
  const count = bellUnreadMessageCount() + bellUnseenBookingCount();
  if (badge) {
    badge.textContent = count > 9 ? '9+' : String(count);
    badge.style.display = count > 0 ? '' : 'none';
  }

  const dropdown = document.getElementById('bell-dropdown');
  if (!dropdown) return;

  const newBookings = bellNewBookings();
  const senders = bellSenderSummary();

  const bookingsSection = newBookings.length ? `
    <div class="bell-head">New bookings</div>
    <div class="bell-list">
      ${newBookings.slice(0, 5).map((b) => `
        <a class="bell-row" href="/admin/bookings.html">
          <div>
            <strong>${b.guestName}</strong>
            <div class="muted" style="font-size:0.76rem;">${b.room ? b.room.name : 'Room #' + b.roomId} &middot; ${b.nights} day${b.nights === 1 ? '' : 's'}</div>
          </div>
          <span class="bell-unread-pill">new</span>
        </a>`).join('')}
    </div>` : '';

  const messagesSection = senders.length ? `
    <div class="bell-head">Messages</div>
    <div class="bell-list">
      ${senders.slice(0, 5).map((s) => `
        <a class="bell-row" href="/admin/messages.html?email=${encodeURIComponent(s.email)}">
          <div>
            <strong>${s.name}</strong>
            <div class="muted" style="font-size:0.76rem;">${s.email}</div>
          </div>
          <div class="bell-counts">
            ${s.unread > 0 ? `<span class="bell-unread-pill">${s.unread} new</span>` : ''}
            <span class="muted" style="font-size:0.72rem;">${s.total} total</span>
          </div>
        </a>`).join('')}
    </div>` : '';

  if (!bookingsSection && !messagesSection) {
    dropdown.innerHTML = `<div class="bell-empty">Nothing new.</div>`;
    return;
  }

  dropdown.innerHTML = `
    ${bookingsSection}
    ${messagesSection}
    <a class="bell-viewall" href="/admin/bookings.html">View bookings</a>
    <a class="bell-viewall" href="/admin/messages.html">View all messages</a>
  `;
}

async function loadBellData() {
  try {
    const [{ messages }, { bookings }] = await Promise.all([
      API.get('/api/messages'),
      API.get('/api/bookings'),
    ]);
    BELL_MESSAGES = messages;
    BELL_BOOKINGS = bookings;
  } catch (e) {
    BELL_MESSAGES = [];
    BELL_BOOKINGS = [];
  }
  renderBell();
}

// Exposed so admin-messages.js / admin-bookings.js can ask the bell to
// refresh right after something is marked seen or deleted, without a
// full page reload.
window.refreshAdminBell = loadBellData;

function injectBell() {
  const navAuth = document.querySelector('.nav-auth');
  if (!navAuth || document.getElementById('admin-bell')) return;
  const wrap = document.createElement('div');
  wrap.className = 'bell-wrap';
  wrap.innerHTML = `
    <button type="button" id="admin-bell" class="bell-btn" aria-label="Notifications">
      🔔<span id="bell-badge" class="bell-badge" style="display:none;"></span>
    </button>
    <div id="bell-dropdown" class="bell-dropdown hidden"></div>
  `;
  navAuth.insertBefore(wrap, navAuth.firstChild);

  document.getElementById('admin-bell').addEventListener('click', (e) => {
    e.stopPropagation();
    document.getElementById('bell-dropdown').classList.toggle('hidden');
  });
  document.addEventListener('click', (e) => {
    const dropdown = document.getElementById('bell-dropdown');
    if (dropdown && !dropdown.classList.contains('hidden') && !wrap.contains(e.target)) {
      dropdown.classList.add('hidden');
    }
  });
}

document.addEventListener('kiristay:auth-ready', (e) => {
  const user = e.detail.user;
  if (!user || user.role !== 'admin') return;
  injectBell();
  loadBellData();
});
