function guardAdmin_(user) {
  if (!user) { window.location.href = '/login.html?next=/admin/bookings.html'; return false; }
  if (user.role !== 'admin') { window.location.href = '/dashboard.html'; return false; }
  return true;
}

const ALL_STATUSES = ['pending', 'confirmed', 'checked-in', 'checked-out', 'cancelled'];

// A booking counts as a missed check-in ("no-show") once every date it
// covers is in the past and the guest was never checked in. This is a
// computed label, not a stored status — it can still be corrected with
// the dropdown if the guest actually showed up.
function isNoShow(b) {
  if (b.status !== 'confirmed' && b.status !== 'pending') return false;
  const lastDate = [...b.dates].sort().slice(-1)[0];
  const today = localISODate(new Date());
  return lastDate < today;
}

function statusSelect(b) {
  return `<select data-status="${b.id}">
    ${ALL_STATUSES.map((o) => `<option value="${o}" ${o === b.status ? 'selected' : ''}>${o}</option>`).join('')}
  </select>`;
}

function quickActions(b) {
  const buttons = [];
  if (b.status === 'confirmed' || b.status === 'pending') {
    buttons.push(`<button class="btn btn-brass btn-sm" data-checkin="${b.id}">Check in</button>`);
  }
  if (b.status === 'checked-in') {
    buttons.push(`<button class="btn btn-outline btn-sm" data-checkout="${b.id}">Check out</button>`);
  }
  return buttons.join(' ');
}

function row(b) {
  const deposit = b.depositAmount ?? b.totalPrice * 0.6;
  const balance = b.balanceAmount ?? b.totalPrice * 0.4;
  const noShow = isNoShow(b);
  return `
    <tr>
      <td>${b.guestName}
        ${!b.seenByAdmin ? '<span class="stamp stamp-pending">new</span>' : ''}
        ${noShow ? '<span class="stamp stamp-no-show">no-show</span>' : ''}
        <div class="muted">${b.guestEmail}</div>
      </td>
      <td>${b.room ? b.room.name : 'Room #' + b.roomId}</td>
      <td>${describeDates(b.dates)}<div class="muted">${b.nights} day(s)</div></td>
      <td>${fmtMoney(b.totalPrice)}<div class="muted">Deposit ${fmtMoney(deposit)} paid</div></td>
      <td>${fmtMoney(balance)}<div class="muted">${b.balancePaid ? 'paid at check-in' : 'due at check-in'}</div></td>
      <td>
        <span class="stamp stamp-${b.status}">${b.status}</span>
        <div style="margin-top:6px;">${statusSelect(b)}</div>
        <div style="margin-top:6px; display:flex; gap:6px;">${quickActions(b)}</div>
      </td>
      <td>
        <button class="btn btn-outline btn-sm" data-view-id="${b.id}">View ID</button>
        <button class="btn btn-danger btn-sm" data-delete="${b.id}">Delete</button>
      </td>
    </tr>`;
}

let ADMIN_BOOKINGS = [];

async function setStatus(id, status) {
  try {
    await API.put('/api/bookings/' + id, { status });
    load();
    window.refreshAdminBell?.();
  } catch (err) {
    alert(err.data?.error || 'Could not update status.');
    load();
  }
}

async function load() {
  const el = document.getElementById('bookings-table');
  try {
    const { bookings } = await API.get('/api/bookings');
    ADMIN_BOOKINGS = bookings;
    if (!bookings.length) { el.innerHTML = '<p class="muted">No bookings yet.</p>'; return; }
    el.innerHTML = `
      <div class="table-wrap">
        <table>
          <thead><tr><th>Guest</th><th>Room</th><th>Dates</th><th>Total / Deposit</th><th>Balance</th><th>Status</th><th></th></tr></thead>
          <tbody>${bookings.map(row).join('')}</tbody>
        </table>
      </div>`;

    el.querySelectorAll('[data-view-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const booking = ADMIN_BOOKINGS.find((b) => b.id === Number(btn.dataset.viewId));
        if (booking) showBookingCard(booking);
      });
    });

    el.querySelectorAll('[data-status]').forEach((sel) => {
      sel.addEventListener('change', () => setStatus(sel.dataset.status, sel.value));
    });
    el.querySelectorAll('[data-checkin]').forEach((btn) => {
      btn.addEventListener('click', () => setStatus(btn.dataset.checkin, 'checked-in'));
    });
    el.querySelectorAll('[data-checkout]').forEach((btn) => {
      btn.addEventListener('click', () => setStatus(btn.dataset.checkout, 'checked-out'));
    });
    el.querySelectorAll('[data-delete]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm('Delete this booking record?')) return;
        try {
          await API.del('/api/bookings/' + btn.dataset.delete);
          load();
        } catch (err) {
          alert(err.data?.error || 'Could not delete booking.');
        }
      });
    });

    // Viewing this page counts as having seen any new bookings — clears
    // their "new" tag and brings the bell badge count down.
    const unseen = bookings.filter((b) => !b.seenByAdmin);
    if (unseen.length) {
      await Promise.all(unseen.map((b) => API.put('/api/bookings/' + b.id, { seenByAdmin: true }).catch(() => {})));
      window.refreshAdminBell?.();
    }
  } catch (e) {
    el.innerHTML = '<p class="muted">Could not load bookings.</p>';
  }
}

async function loadCheckInTimeSetting() {
  const input = document.getElementById('checkin-time-input');
  if (!input) return;
  try {
    const { settings } = await API.get('/api/settings');
    input.value = settings.standardCheckInTime || '2:00 PM';
  } catch (e) { /* leave blank on failure */ }
}
document.getElementById('checkin-time-save')?.addEventListener('click', async () => {
  const msg = document.getElementById('checkin-time-msg');
  msg.className = 'msg';
  const value = document.getElementById('checkin-time-input').value.trim();
  if (!value) return showMsg(msg, 'Enter a time first.', 'error');
  try {
    await API.put('/api/settings', { standardCheckInTime: value });
    showMsg(msg, 'Saved — new check-in cards will show this time.', 'success');
  } catch (err) {
    showMsg(msg, err.data?.error || 'Could not save.', 'error');
  }
});

document.addEventListener('kiristay:auth-ready', (e) => {
  if (!guardAdmin_(e.detail.user)) return;
  load();
  loadCheckInTimeSetting();
});
