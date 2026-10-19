let CACHED_ROOMS = [];
let CACHED_HOME_CONTENT = {};

function roomCard(room) {
  return `
    <a class="ledger-card" href="/room-detail.html?id=${room.id}" style="text-decoration:none;color:inherit;">
      <div class="thumb"><img src="${room.image}" alt="${room.name}" loading="lazy" /><span class="type-tag">${localText(room.type)}</span></div>
      <div class="body">
        <h3>${room.name}</h3>
        <div class="meta">Floor ${room.floor || 1} &middot; Sleeps ${room.capacity}</div>
        <p class="desc">${localText(room.description)}</p>
        <div class="perforation"></div>
        <div class="price-row">
          <div class="price">${fmtMoney(room.pricePerNight)}<small> / night</small></div>
          <span class="btn btn-outline btn-sm">Details</span>
        </div>
      </div>
    </a>`;
}

function renderFeatured() {
  const el = document.getElementById('rooms-by-floor');
  const rooms = CACHED_ROOMS;
  if (!rooms.length) { el.innerHTML = '<p class="muted">No rooms yet.</p>'; return; }

  // Group rooms by floor, then render floor by floor: heading, its rooms,
  // heading for the next floor, and so on — climbing the building.
  const byFloor = {};
  rooms.forEach((r) => {
    const f = r.floor || 1;
    (byFloor[f] = byFloor[f] || []).push(r);
  });
  const floors = Object.keys(byFloor).map(Number).sort((a, b) => a - b);
  const topFloor = Math.max(5, ...floors);

  let html = '';
  for (let f = 1; f <= topFloor; f++) {
    const roomsOnFloor = byFloor[f];
    html += `<div class="floor-group">
      <div class="floor-heading"><span class="fnum">Floor ${f}</span></div>
      ${roomsOnFloor
        ? `<div class="room-grid">${roomsOnFloor.map(roomCard).join('')}</div>`
        : `<p class="muted" style="margin-bottom:36px;">More rooms coming to this floor soon.</p>`}
    </div>`;
  }
  el.innerHTML = html;
}

async function loadFeatured() {
  const el = document.getElementById('rooms-by-floor');
  try {
    const { rooms } = await API.get('/api/rooms');
    CACHED_ROOMS = rooms;
    renderFeatured();
  } catch (e) {
    el.innerHTML = '<p class="muted">Could not load rooms right now.</p>';
  }
}

function renderHomeContent(content) {
  CACHED_HOME_CONTENT = content;
  const hero = content.hero || {};
  const why = content.whyKiriStay || {};
  const onSite = content.onSite || {};
  const guide = content.buildingGuide || {};

  // Hero
  document.getElementById('hero-eyebrow').textContent = localText(hero.eyebrow);
  document.getElementById('hero-heading').textContent = localText(hero.heading);
  document.getElementById('hero-description').textContent = localText(hero.description);
  const slidesEl = document.getElementById('hero-slides');
  const dotsEl = document.getElementById('hero-dots');
  const images = hero.images && hero.images.length ? hero.images : [];
  // Only rebuild the slideshow DOM (and restart its timer) the first time —
  // a language switch shouldn't reset which photo is currently showing.
  if (!slidesEl.children.length) {
    slidesEl.innerHTML = images.map((src, i) => `<div class="hero-slide${i === 0 ? ' active' : ''}" style="background-image:url('${src}')"></div>`).join('');
    dotsEl.innerHTML = images.map((_, i) => `<span${i === 0 ? ' class="active"' : ''}></span>`).join('');
    heroSlideshow();
  }

  // Why Kiri Stay
  document.getElementById('why-eyebrow').textContent = localText(why.eyebrow);
  document.getElementById('why-heading').textContent = localText(why.heading);
  document.getElementById('why-description').textContent = localText(why.description);
  document.getElementById('why-stats').innerHTML = (why.stats || []).map((s) => `
    <div class="stat-card"><div class="num">${s.value}</div><div class="label">${localText(s.label)}</div></div>
  `).join('');

  // On site
  document.getElementById('onsite-eyebrow').textContent = localText(onSite.eyebrow);
  document.getElementById('onsite-heading').textContent = localText(onSite.heading);
  document.getElementById('onsite-cards').innerHTML = (onSite.cards || []).map((c) => `
    <div class="amenity-card">
      <img src="${c.image}" alt="${localText(c.title)}" />
      <div class="body"><h3>${localText(c.title)}</h3><p>${localText(c.description)}</p></div>
    </div>
  `).join('');

  // Building guide
  document.getElementById('guide-eyebrow').textContent = localText(guide.eyebrow);
  document.getElementById('guide-heading').textContent = localText(guide.heading);
  document.getElementById('guide-rows').innerHTML = (guide.rows || []).map((r) => `
    <li><span class="fnum">${localText(r.label)}</span><div class="fdesc"><strong>${localText(r.title)}</strong><span>${localText(r.description)}</span></div></li>
  `).join('');
}

// Hero photo slideshow — advances every 3 seconds
function heroSlideshow() {
  const slides = document.querySelectorAll('#hero-slides .hero-slide');
  const dots = document.querySelectorAll('#hero-dots span');
  if (!slides.length) return;
  let i = 0;
  setInterval(() => {
    slides[i].classList.remove('active');
    dots[i]?.classList.remove('active');
    i = (i + 1) % slides.length;
    slides[i].classList.add('active');
    dots[i]?.classList.add('active');
  }, 3000);
}

loadFeatured();
document.addEventListener('kiristay:content-ready', (e) => renderHomeContent(e.detail.content || {}));
document.addEventListener('kiristay:lang-changed', () => {
  renderHomeContent(CACHED_HOME_CONTENT);
  renderFeatured();
});
