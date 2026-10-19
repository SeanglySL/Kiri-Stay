const roomId = new URLSearchParams(window.location.search).get('id');
const wrap = document.getElementById('room-wrap');

let CURRENT_ROOM = null;
let SELECTED_DATES = [];
let qrTimerInterval = null;

/* ---------------------------------------------------------------------
   Photo carousel (bed / bathroom / desk / window view)
--------------------------------------------------------------------- */
function carouselHTML(room) {
  const captions = ['Bed', 'Bathroom', 'Desk', 'Window view'];
  const photos = (room.gallery && room.gallery.length ? room.gallery : [room.image]).slice(0, 4);
  const slides = photos.map((src, i) => `
    <div class="room-carousel-slide">
      <img src="${src}" alt="${room.name} — ${captions[i] || ''}" loading="lazy" />
      <span>${captions[i] || ''}</span>
    </div>`).join('');
  const dots = photos.map((_, i) => `<span class="${i === 0 ? 'active' : ''}"></span>`).join('');
  return `
    <div class="room-carousel">
      <div class="room-carousel-track" id="carousel-track">${slides}</div>
      ${photos.length > 1 ? `
        <button type="button" class="room-carousel-nav prev" id="car-prev" aria-label="Previous photo">&larr;</button>
        <button type="button" class="room-carousel-nav next" id="car-next" aria-label="Next photo">&rarr;</button>
        <div class="room-carousel-dots" id="car-dots">${dots}</div>
      ` : ''}
    </div>`;
}
function wireCarousel() {
  const track = document.getElementById('carousel-track');
  if (!track) return;
  const slides = track.querySelectorAll('.room-carousel-slide');
  const dots = document.querySelectorAll('#car-dots span');
  document.getElementById('car-prev')?.addEventListener('click', () => {
    const i = Math.round(track.scrollLeft / track.clientWidth);
    track.scrollTo({ left: track.clientWidth * Math.max(0, i - 1), behavior: 'smooth' });
  });
  document.getElementById('car-next')?.addEventListener('click', () => {
    const i = Math.round(track.scrollLeft / track.clientWidth);
    track.scrollTo({ left: track.clientWidth * Math.min(slides.length - 1, i + 1), behavior: 'smooth' });
  });
  track.addEventListener('scroll', () => {
    const i = Math.round(track.scrollLeft / track.clientWidth);
    dots.forEach((d, idx) => d.classList.toggle('active', idx === i));
  });
}

/* ---------------------------------------------------------------------
   Deposit box (price breakdown shown above the Continue button)
--------------------------------------------------------------------- */
function depositBoxHTML(days, pricePerNight) {
  if (!days) {
    return `<div class="deposit-box"><p class="muted" style="margin:0;">Pick your dates above to see the price.</p></div>`;
  }
  const total = days * pricePerNight;
  const deposit = Math.round(total * 0.6 * 100) / 100;
  const balance = Math.round((total - deposit) * 100) / 100;
  return `
    <div class="deposit-box">
      <div class="deposit-row"><span>${days} day${days === 1 ? '' : 's'} &times; ${fmtMoney(pricePerNight)}</span><span>${fmtMoney(total)}</span></div>
      <div class="deposit-row total"><span>Total</span><span>${fmtMoney(total)}</span></div>
      <div class="deposit-row due"><span>Deposit due now (60%)</span><span>${fmtMoney(deposit)}</span></div>
      <div class="deposit-row"><span>Balance at check-in (40%)</span><span>${fmtMoney(balance)}</span></div>
    </div>`;
}

/* ---------------------------------------------------------------------
   Room detail page shell
--------------------------------------------------------------------- */
function detailHTML(room, user) {
  const bookPanel = `
    <div class="panel" id="book-panel">
      <h3 class="mt-0">Book this room</h3>
      <div id="book-msg" class="msg"></div>
      <div id="cal-container"></div>
      <div id="deposit-wrap">${depositBoxHTML(0, room.pricePerNight)}</div>
      ${user
        ? `<button type="button" id="confirm-btn" class="btn btn-brass btn-block" disabled>Pick dates to continue</button>`
        : `<div class="flex gap-12">
             <a class="btn btn-outline" href="/login.html?next=/room-detail.html?id=${room.id}">Log in to book</a>
             <a class="btn btn-brass" href="/register.html?next=/room-detail.html?id=${room.id}">Register</a>
           </div>`}
    </div>`;

  return `
    <div>
      ${carouselHTML(room)}
      <span class="eyebrow" id="rd-type">${localText(room.type)} &middot; Floor ${room.floor || '—'}</span>
      <h1>${room.name}</h1>
      <p id="rd-desc">${localText(room.description)}</p>
      <h3>Amenities</h3>
      <div class="amenity-tags" id="rd-amenities">${localText(room.amenities).split(',').map((a) => a.trim()).filter(Boolean).map((a) => `<span>${a}</span>`).join('')}</div>
      <div class="panel" style="margin-top:26px;">
        <div class="price">${fmtMoney(room.pricePerNight)}<small> / night</small></div>
        <p class="muted" style="margin-top:6px;">Sleeps up to ${room.capacity} guest${room.capacity === 1 ? '' : 's'}</p>
      </div>
    </div>
    <div>${bookPanel}</div>
  `;
}

/* ---------------------------------------------------------------------
   Payment step — Card / Bank QR tabs (simulated — no real charge)
--------------------------------------------------------------------- */
function depositAmountFor(room, dates) {
  const total = dates.length * room.pricePerNight;
  return Math.round(total * 0.6 * 100) / 100;
}

function paymentStepHTML(room, dates) {
  const amount = depositAmountFor(room, dates);
  const nightsLabel = `${dates.length} day${dates.length === 1 ? '' : 's'}`;
  return `
    <button type="button" class="btn btn-outline btn-sm" id="pay-back" style="margin-bottom:14px;">&larr; Back to dates</button>
    <h3 class="mt-0">Pay deposit</h3>
    <div id="book-msg" class="msg"></div>
    <div class="pay-summary"><span>${room.name} &middot; ${nightsLabel}</span><strong>${fmtMoney(amount)}</strong></div>

    <div class="pay-tabs">
      <button type="button" class="pay-tab-btn active" data-tab="card">Visa / Card</button>
      <button type="button" class="pay-tab-btn" data-tab="qr">Bank QR (KHQR)</button>
    </div>

    <div id="pay-tab-card" class="pay-tab-body">
      <div class="field">
        <label for="card-number">Card number</label>
        <div class="card-brand-row">
          <input type="text" id="card-number" inputmode="numeric" placeholder="4242 4242 4242 4242" maxlength="19" style="flex:1;" />
          <span id="card-brand" class="card-brand-icon" style="display:none;"></span>
        </div>
      </div>
      <div class="grid-2">
        <div class="field"><label for="card-expiry">Expiry (MM/YY)</label><input type="text" id="card-expiry" inputmode="numeric" placeholder="08/29" maxlength="5" /></div>
        <div class="field"><label for="card-cvv">CVV</label><input type="text" id="card-cvv" inputmode="numeric" placeholder="123" maxlength="4" /></div>
      </div>
      <div class="field"><label for="card-name">Cardholder name</label><input type="text" id="card-name" placeholder="As shown on card" /></div>
      <button type="button" class="btn btn-brass btn-block" id="pay-card-btn">Pay ${fmtMoney(amount)}</button>
    </div>

    <div id="pay-tab-qr" class="pay-tab-body hidden">
      <div class="qr-panel">
        <div class="qr-image-wrap">
          <img id="qr-image" src="" alt="Scan to pay with KHQR" />
        </div>
        <div class="qr-timer" id="qr-timer">05:00</div>
        <div class="qr-ref" id="qr-ref"></div>
        <p class="muted" style="margin-bottom:16px;">Scan with your banking app (ABA, ACLEDA, Wing, and other KHQR member banks).</p>
        <button type="button" class="btn btn-brass btn-block" id="pay-qr-btn">I've paid</button>
        <div class="qr-banks">🏦 ABA &nbsp; 🏦 ACLEDA &nbsp; 🏦 Wing &nbsp; 🏦 KHQR member banks</div>
      </div>
    </div>

    <p class="pay-secure-note">🔒 Secured checkout — demo payment, no real charge is made.</p>
  `;
}

function payStatusHTML(state, detail) {
  if (state === 'processing') {
    return `<div class="pay-status"><div class="pay-spinner"></div><p class="muted">Processing payment…</p></div>`;
  }
  if (state === 'success') {
    return `
      <div class="pay-status success">
        <div class="icon">✓</div>
        <h3>Payment successful</h3>
        <p class="muted">Booking #${detail} confirmed. Taking you to your dashboard…</p>
      </div>`;
  }
  return `
    <div class="pay-status fail">
      <div class="icon">✕</div>
      <h3>Payment failed</h3>
      <p class="muted">${detail}</p>
      <button type="button" class="btn btn-brass" id="pay-retry" style="margin-top:10px;">Try again</button>
    </div>`;
}

function formatCardNumber(value) {
  const digits = value.replace(/\D/g, '').slice(0, 16);
  return digits.replace(/(.{4})/g, '$1 ').trim();
}
function formatExpiry(value) {
  const digits = value.replace(/\D/g, '').slice(0, 4);
  if (digits.length <= 2) return digits;
  return digits.slice(0, 2) + '/' + digits.slice(2);
}
function detectBrand(digits) {
  if (digits.startsWith('4')) return { label: 'VISA', cls: 'visa' };
  if (/^5[1-5]/.test(digits)) return { label: 'Mastercard', cls: 'mastercard' };
  return null;
}

function wirePaymentStep(room, dates) {
  document.getElementById('pay-back').addEventListener('click', () => renderBookPanel(room));

  // Tabs
  const tabBtns = document.querySelectorAll('.pay-tab-btn');
  tabBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      tabBtns.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('pay-tab-card').classList.toggle('hidden', btn.dataset.tab !== 'card');
      document.getElementById('pay-tab-qr').classList.toggle('hidden', btn.dataset.tab !== 'qr');
      if (btn.dataset.tab === 'qr') startQrFlow(room, dates);
      else stopQrTimer();
    });
  });

  // Card field formatting + brand detection
  const numberInput = document.getElementById('card-number');
  const brandEl = document.getElementById('card-brand');
  numberInput.addEventListener('input', () => {
    numberInput.value = formatCardNumber(numberInput.value);
    const digits = numberInput.value.replace(/\D/g, '');
    const brand = detectBrand(digits);
    if (brand) {
      brandEl.textContent = brand.label;
      brandEl.className = 'card-brand-icon ' + brand.cls;
      brandEl.style.display = '';
    } else {
      brandEl.style.display = 'none';
    }
  });
  document.getElementById('card-expiry').addEventListener('input', (e) => { e.target.value = formatExpiry(e.target.value); });
  document.getElementById('card-cvv').addEventListener('input', (e) => { e.target.value = e.target.value.replace(/\D/g, '').slice(0, 4); });

  document.getElementById('pay-card-btn').addEventListener('click', () => handleCardSubmit(room, dates));
  document.getElementById('pay-qr-btn').addEventListener('click', () => handlePaymentResult(room, dates, true));
}

function handleCardSubmit(room, dates) {
  const msg = document.getElementById('book-msg');
  msg.className = 'msg';
  const digits = document.getElementById('card-number').value.replace(/\D/g, '');
  const expiry = document.getElementById('card-expiry').value;
  const cvv = document.getElementById('card-cvv').value;
  const name = document.getElementById('card-name').value.trim();

  if (digits.length < 13) return showMsg(msg, 'Enter a valid card number.', 'error');
  const expMatch = /^(\d{2})\/(\d{2})$/.exec(expiry);
  if (!expMatch) return showMsg(msg, 'Enter expiry as MM/YY.', 'error');
  const expMonth = Number(expMatch[1]);
  const expYear = 2000 + Number(expMatch[2]);
  if (expMonth < 1 || expMonth > 12) return showMsg(msg, 'Enter a valid expiry month.', 'error');
  const now = new Date();
  const expDate = new Date(expYear, expMonth, 1);
  if (expDate <= new Date(now.getFullYear(), now.getMonth(), 1)) return showMsg(msg, 'This card has expired.', 'error');
  if (cvv.length < 3) return showMsg(msg, 'Enter a valid CVV.', 'error');
  if (!name) return showMsg(msg, "Enter the cardholder's name.", 'error');

  // Simulated test-card decline, same pattern real sandboxes use: a card
  // number ending in 0002 always declines, so both paths are demoable.
  const willDecline = digits.endsWith('0002');
  handlePaymentResult(room, dates, !willDecline, willDecline ? 'Card was declined by the issuing bank. Please try a different card.' : null);
}

/* ---------------------------------------------------------------------
   Bank QR tab: shows Kiri Stay's real KHQR payment code (a static image
   provided by the hotel), plus a 5-minute countdown. If the timer runs
   out before "I've paid" is clicked, the payment is treated as
   failed/expired. The reference number is still generated per attempt
   so the front desk can tie a payment to this specific booking attempt.
--------------------------------------------------------------------- */
function startQrFlow(room, dates) {
  stopQrTimer();
  const ref = 'KS' + Date.now().toString().slice(-8);
  document.getElementById('qr-image').src = '/images/payment-qr.jpg';
  document.getElementById('qr-ref').textContent = 'Reference: ' + ref;

  let secondsLeft = 5 * 60;
  const timerEl = document.getElementById('qr-timer');
  const qrBtn = document.getElementById('pay-qr-btn');
  function tick() {
    const m = String(Math.floor(secondsLeft / 60)).padStart(2, '0');
    const s = String(secondsLeft % 60).padStart(2, '0');
    if (timerEl) timerEl.textContent = `${m}:${s}`;
    if (secondsLeft <= 0) {
      stopQrTimer();
      handlePaymentResult(room, dates, false, 'This QR code expired before payment was received. Please generate a new one.');
      return;
    }
    secondsLeft--;
  }
  tick();
  qrTimerInterval = setInterval(tick, 1000);
}
function stopQrTimer() {
  if (qrTimerInterval) { clearInterval(qrTimerInterval); qrTimerInterval = null; }
}

/* ---------------------------------------------------------------------
   Resolve the simulated payment, then either create the booking (on
   success) or show the failure screen with a retry option (booking is
   never created on failure).
--------------------------------------------------------------------- */
async function handlePaymentResult(room, dates, success, failReason) {
  stopQrTimer();
  const panel = document.getElementById('book-panel');
  panel.innerHTML = payStatusHTML('processing');

  await new Promise((r) => setTimeout(r, 1400));

  if (!success) {
    panel.innerHTML = payStatusHTML('fail', failReason || 'Your payment could not be completed. Please try again.');
    document.getElementById('pay-retry').addEventListener('click', () => renderPaymentStep(room, dates));
    return;
  }

  try {
    const { booking } = await API.post('/api/bookings', {
      roomId: room.id,
      dates,
      guests: room.capacity,
    });
    panel.innerHTML = payStatusHTML('success', booking.id);
    setTimeout(() => { window.location.href = '/dashboard.html'; }, 1600);
  } catch (err) {
    // Payment "succeeded" but the booking itself couldn't be created
    // (e.g. someone else took one of the dates in the meantime) — treat
    // this as a failed booking too, and don't leave the guest charged
    // for nothing in a real integration.
    panel.innerHTML = payStatusHTML('fail', err.data?.error || 'Could not complete the booking. Please try again.');
    document.getElementById('pay-retry').addEventListener('click', () => renderPaymentStep(room, dates));
  }
}

function renderPaymentStep(room, dates) {
  const panel = document.getElementById('book-panel');
  panel.innerHTML = paymentStepHTML(room, dates);
  wirePaymentStep(room, dates);
}

/* ---------------------------------------------------------------------
   Date-picking step (calendar + deposit box + Continue button)
--------------------------------------------------------------------- */
function renderBookPanel(room) {
  const panel = document.getElementById('book-panel');
  panel.innerHTML = `
    <h3 class="mt-0">Book this room</h3>
    <div id="book-msg" class="msg"></div>
    <div id="cal-container"></div>
    <div id="deposit-wrap">${depositBoxHTML(0, room.pricePerNight)}</div>
    <button type="button" id="confirm-btn" class="btn btn-brass btn-block" disabled>Pick dates to continue</button>
  `;

  const calContainer = document.getElementById('cal-container');
  createBookingCalendar(calContainer, {
    fullDates: CURRENT_ROOM_BOOKED_DATES,
    onChange: (dates) => {
      SELECTED_DATES = dates;
      document.getElementById('deposit-wrap').innerHTML = depositBoxHTML(dates.length, room.pricePerNight);
      const btn = document.getElementById('confirm-btn');
      if (btn) {
        btn.disabled = dates.length === 0;
        btn.textContent = dates.length ? 'Continue to payment' : 'Pick dates to continue';
      }
    },
  });

  document.getElementById('confirm-btn').addEventListener('click', () => {
    if (!SELECTED_DATES.length) return;
    renderPaymentStep(room, SELECTED_DATES);
  });
}

let CURRENT_ROOM_BOOKED_DATES = [];

async function init() {
  if (!roomId) { wrap.querySelector('.container').innerHTML = '<p class="muted">No room specified.</p>'; return; }
  let room, bookedInfo;
  try {
    const [roomData, bookedData] = await Promise.all([
      API.get('/api/rooms/' + roomId),
      API.get('/api/rooms/' + roomId + '/booked-dates'),
    ]);
    room = roomData.room;
    bookedInfo = bookedData;
  } catch (e) {
    wrap.querySelector('.container').innerHTML = '<p class="muted">Room not found.</p>';
    return;
  }

  CURRENT_ROOM = room;
  CURRENT_ROOM_BOOKED_DATES = bookedInfo.fullDates;

  await loadCurrentUser();
  wrap.querySelector('.container').innerHTML = detailHTML(room, CURRENT_USER);
  applyAuthUI(CURRENT_USER);
  wireCarousel();

  if (CURRENT_USER) renderBookPanel(room);
}

// Re-translate the static room text in place on a language switch,
// without disturbing the calendar/payment step the guest may be mid-way
// through.
document.addEventListener('kiristay:lang-changed', () => {
  if (!CURRENT_ROOM) return;
  const typeEl = document.getElementById('rd-type');
  const descEl = document.getElementById('rd-desc');
  const amenEl = document.getElementById('rd-amenities');
  if (typeEl) typeEl.innerHTML = `${localText(CURRENT_ROOM.type)} &middot; Floor ${CURRENT_ROOM.floor || '—'}`;
  if (descEl) descEl.textContent = localText(CURRENT_ROOM.description);
  if (amenEl) amenEl.innerHTML = localText(CURRENT_ROOM.amenities).split(',').map((a) => a.trim()).filter(Boolean).map((a) => `<span>${a}</span>`).join('');
});

init();
