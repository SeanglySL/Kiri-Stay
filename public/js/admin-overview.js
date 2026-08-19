function guardAdmin(user) {
  if (!user) { window.location.href = '/login.html?next=/admin/index.html'; return false; }
  if (user.role !== 'admin') { window.location.href = '/dashboard.html'; return false; }
  return true;
}

function statCard(num, label) {
  return `<div class="stat-card"><div class="num">${num}</div><div class="label">${label}</div></div>`;
}

async function load() {
  const [{ rooms }, { bookings }, { users }] = await Promise.all([
    API.get('/api/rooms'),
    API.get('/api/bookings'),
    API.get('/api/users'),
  ]);
  const active = bookings.filter((b) => b.status !== 'cancelled').length;
  const checkedIn = bookings.filter((b) => b.status === 'checked-in').length;
  const guests = users.filter((u) => u.role === 'customer').length;

  document.getElementById('stats').innerHTML = [
    statCard(rooms.length, 'Room types'),
    statCard(checkedIn, 'Currently checked in'),
    statCard(active, 'Active bookings'),
    statCard(guests, 'Registered guests'),
  ].join('');

  const recent = bookings.slice(0, 6);
  const recentWrap = document.getElementById('recent-wrap');
  if (!recent.length) {
    recentWrap.innerHTML = '<p class="muted">No bookings yet.</p>';
    return;
  }
  recentWrap.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead><tr><th>Guest</th><th>Room</th><th>Dates</th><th>Status</th></tr></thead>
        <tbody>
          ${recent.map((b) => `
            <tr>
              <td>${b.guestName}<div class="muted">${b.guestEmail}</div></td>
              <td>${b.room ? b.room.name : 'Room #' + b.roomId}</td>
              <td>${describeDates(b.dates)}</td>
              <td><span class="stamp stamp-${b.status}">${b.status}</span></td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

document.addEventListener('kiristay:auth-ready', (e) => {
  if (!guardAdmin(e.detail.user)) return;
  load();
});
