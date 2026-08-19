function guardAdmin_(user) {
  if (!user) { window.location.href = '/login.html?next=/admin/messages.html'; return false; }
  if (user.role !== 'admin') { window.location.href = '/dashboard.html'; return false; }
  return true;
}

let ALL_MESSAGES = [];
let ACTIVE_FILTER_EMAIL = new URLSearchParams(window.location.search).get('email') || null;

function fmtWhen(iso) {
  return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function senderSummary() {
  const byEmail = {};
  ALL_MESSAGES.forEach((m) => {
    if (!byEmail[m.email]) byEmail[m.email] = { name: m.name, email: m.email, total: 0, unread: 0, latest: m.createdAt };
    byEmail[m.email].total += 1;
    if (!m.read) byEmail[m.email].unread += 1;
    if (m.createdAt > byEmail[m.email].latest) byEmail[m.email].latest = m.createdAt;
  });
  return Object.values(byEmail).sort((a, b) => new Date(b.latest) - new Date(a.latest));
}

function renderSenders() {
  const wrap = document.getElementById('senders-wrap');
  const senders = senderSummary();
  if (!senders.length) {
    wrap.innerHTML = '<p class="muted">No one has written in yet.</p>';
    return;
  }
  wrap.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead><tr><th>Name</th><th>Email</th><th>Messages</th><th>Unread</th><th></th></tr></thead>
        <tbody>
          ${senders.map((s) => `
            <tr>
              <td>${s.name}</td>
              <td>${s.email}</td>
              <td>${s.total}</td>
              <td>${s.unread > 0 ? `<span class="bell-unread-pill">${s.unread} new</span>` : '—'}</td>
              <td><button class="btn btn-outline btn-sm" data-filter="${s.email}">View messages</button></td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
  wrap.querySelectorAll('[data-filter]').forEach((btn) => {
    btn.addEventListener('click', () => setFilter(btn.dataset.filter));
  });
}

function setFilter(email) {
  ACTIVE_FILTER_EMAIL = email;
  const url = email ? `/admin/messages.html?email=${encodeURIComponent(email)}` : '/admin/messages.html';
  history.replaceState(null, '', url);
  renderMessageList();
}

function messageRow(m) {
  const mailtoHref = `mailto:${m.email}?subject=${encodeURIComponent('Re: Your message to Kiri Stay')}&body=${encodeURIComponent(`Hi ${m.name},\n\n`)}`;
  return `
    <div class="panel" style="margin-bottom:14px; ${m.read ? '' : 'border-color:var(--brass);'}">
      <div class="flex-between" style="margin-bottom:8px;">
        <div>
          <strong>${m.name}</strong>
          ${!m.read ? '<span class="stamp stamp-pending" style="margin-left:8px;">new</span>' : ''}
          <div class="muted" style="font-size:0.8rem;">${m.email} &middot; ${fmtWhen(m.createdAt)}</div>
        </div>
        <div class="flex gap-8">
          <a class="btn btn-outline btn-sm" href="${mailtoHref}">Reply by email</a>
          ${!m.read ? `<button class="btn btn-outline btn-sm" data-seen="${m.id}">Mark as seen</button>` : ''}
          <button class="btn btn-danger btn-sm" data-delete="${m.id}">Delete</button>
        </div>
      </div>
      <p style="margin:0; white-space:pre-wrap;">${m.message}</p>
    </div>`;
}

function renderMessageList() {
  const heading = document.getElementById('list-heading');
  const clearBtn = document.getElementById('clear-filter');
  const wrap = document.getElementById('messages-wrap');

  const list = ACTIVE_FILTER_EMAIL
    ? ALL_MESSAGES.filter((m) => m.email === ACTIVE_FILTER_EMAIL)
    : ALL_MESSAGES;

  if (ACTIVE_FILTER_EMAIL) {
    heading.textContent = `Messages from ${ACTIVE_FILTER_EMAIL}`;
    clearBtn.classList.remove('hidden');
  } else {
    heading.textContent = 'All messages';
    clearBtn.classList.add('hidden');
  }

  if (!list.length) {
    wrap.innerHTML = '<p class="muted">No messages here.</p>';
    return;
  }
  wrap.innerHTML = list.map(messageRow).join('');

  wrap.querySelectorAll('[data-seen]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        await API.put('/api/messages/' + btn.dataset.seen, { read: true });
        const m = ALL_MESSAGES.find((x) => x.id === Number(btn.dataset.seen));
        if (m) m.read = true;
        renderSenders();
        renderMessageList();
        window.refreshAdminBell?.();
      } catch (err) {
        alert(err.data?.error || 'Could not update message.');
        btn.disabled = false;
      }
    });
  });
  wrap.querySelectorAll('[data-delete]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this message?')) return;
      try {
        await API.del('/api/messages/' + btn.dataset.delete);
        ALL_MESSAGES = ALL_MESSAGES.filter((x) => x.id !== Number(btn.dataset.delete));
        renderSenders();
        renderMessageList();
        window.refreshAdminBell?.();
      } catch (err) {
        alert(err.data?.error || 'Could not delete message.');
      }
    });
  });
}

document.getElementById('clear-filter').addEventListener('click', (e) => {
  e.preventDefault();
  setFilter(null);
});

async function loadMessages() {
  try {
    const { messages } = await API.get('/api/messages');
    ALL_MESSAGES = messages;
    renderSenders();
    renderMessageList();
  } catch (e) {
    document.getElementById('senders-wrap').innerHTML = '<p class="muted">Could not load messages.</p>';
    document.getElementById('messages-wrap').innerHTML = '';
  }
}

document.addEventListener('kiristay:auth-ready', (e) => {
  if (!guardAdmin_(e.detail.user)) return;
  loadMessages();
});
