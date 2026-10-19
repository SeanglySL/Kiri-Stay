function amenitiesList(room) {
  return localText(room.amenities).split(',').map((s) => s.trim()).filter(Boolean);
}

function roomCard(room) {
  return `
    <div class="ledger-card">
      <div class="thumb"><img src="${room.image}" alt="${room.name}" loading="lazy" /><span class="type-tag">${localText(room.type)}</span></div>
      <div class="body">
        <h3>${room.name}</h3>
        <div class="meta">Floor ${room.floor || 1} &middot; Sleeps ${room.capacity}</div>
        <div class="amenity-tags">${amenitiesList(room).slice(0, 3).map((a) => `<span>${a}</span>`).join('')}</div>
        <p class="desc">${localText(room.description)}</p>
        <div class="perforation"></div>
        <div class="price-row">
          <div class="price">${fmtMoney(room.pricePerNight)}<small> / night</small></div>
          <a class="btn btn-brass btn-sm" href="/room-detail.html?id=${room.id}">Book</a>
        </div>
      </div>
    </div>`;
}

// Room-type filter groups rooms by bed count rather than the exact
// internal type name — Suite and Family both read as "3 Bed" to a guest.
// Always compares against the room's canonical English type name, since
// that doesn't change with the display language.
function matchesTypeFilter(room, filterValue) {
  if (!filterValue) return true;
  const typeEn = (room.type && room.type.en) || room.type;
  if (filterValue === 'single') return typeEn === 'Single';
  if (filterValue === 'double') return typeEn === 'Double';
  if (filterValue === '3bed') return room.capacity >= 3;
  return true;
}

function matchesPriceFilter(room, filterValue) {
  if (!filterValue) return true;
  if (filterValue === '500plus') return room.pricePerNight >= 500;
  return room.pricePerNight < Number(filterValue);
}

let ALL_ROOMS = [];

function renderRooms() {
  const el = document.getElementById('room-list');
  const price = document.getElementById('f-price').value;
  const type = document.getElementById('f-type').value;
  const filtered = ALL_ROOMS.filter((r) => matchesPriceFilter(r, price) && matchesTypeFilter(r, type));
  if (!filtered.length) { el.innerHTML = '<p class="muted">No rooms match those filters.</p>'; return; }
  el.innerHTML = filtered.map(roomCard).join('');
}

async function loadRooms() {
  const el = document.getElementById('room-list');
  el.innerHTML = '<p class="muted">Loading rooms…</p>';
  try {
    const { rooms } = await API.get('/api/rooms');
    ALL_ROOMS = rooms;
    renderRooms();
  } catch (e) {
    el.innerHTML = '<p class="muted">Could not load rooms right now.</p>';
  }
}

document.getElementById('filter-form').addEventListener('submit', (e) => {
  e.preventDefault();
  renderRooms();
});

document.addEventListener('kiristay:lang-changed', renderRooms);

loadRooms();
