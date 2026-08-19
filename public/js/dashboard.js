let DASH_BOOKINGS = [];

function bookingRow(b) {
  const room = b.room || {};
  const canViewId = b.status !== 'cancelled';
  return `
    <tr>
      <td><strong>${room.name || 'Room #' + b.roomId}</strong><div class="muted">${room.type || ''}</div></td>
      <td>${describeDates(b.dates)}<div class="muted">${b.nights} day${b.nights === 1 ? '' : 's'}</div></td>
      <td>${fmtMoney(b.totalPrice)}<div class="muted">Deposit paid: ${fmtMoney(b.depositAmount ?? b.totalPrice * 0.6)}</div></td>
      <td>${fmtMoney(b.balanceAmount ?? b.totalPrice * 0.4)}<div class="muted">due at check-in</div></td>
      <td><span class="stamp stamp-${b.status}">${b.status}</span></td>
      <td>${canViewId ? `<button class="btn btn-outline btn-sm" data-view-id="${b.id}">View ID</button>` : '—'}</td>
    </tr>`;
}

async function loadBookings() {
  const wrap = document.getElementById('bookings-wrap');
  try {
    const { bookings } = await API.get('/api/bookings');
    DASH_BOOKINGS = bookings;
    if (!bookings.length) {
      wrap.innerHTML = `<div class="panel center"><p>No bookings yet.</p><a href="/rooms.html" class="btn btn-brass">Browse rooms</a></div>`;
      return;
    }
    wrap.innerHTML = `
      <div class="table-wrap">
        <table>
          <thead><tr><th>Room</th><th>Dates</th><th>Total / Deposit</th><th>Balance</th><th>Status</th><th></th></tr></thead>
          <tbody>${bookings.map(bookingRow).join('')}</tbody>
        </table>
      </div>
      <p class="muted" style="margin-top:14px;">Need to cancel or change a booking? Contact the front desk — self-cancellation isn't available once a deposit is paid.</p>`;
    wrap.querySelectorAll('[data-view-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const booking = DASH_BOOKINGS.find((b) => b.id === Number(btn.dataset.viewId));
        if (booking) showBookingCard(booking);
      });
    });
  } catch (e) {
    wrap.innerHTML = '<p class="muted">Could not load bookings.</p>';
  }
}

document.addEventListener('kiristay:auth-ready', (e) => {
  if (!e.detail.user) {
    window.location.href = '/login.html?next=/dashboard.html';
    return;
  }
  loadBookings();
});
