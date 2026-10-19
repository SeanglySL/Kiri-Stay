function guardAdmin_(user) {
  if (!user) { window.location.href = '/login.html?next=/admin/analytics.html'; return false; }
  if (user.role !== 'admin') { window.location.href = '/dashboard.html'; return false; }
  return true;
}

const PALETTE = {
  brass: '#b8874b',
  sage: '#5f7a63',
  wine: '#7a3344',
  ink: '#2c384a',
  roomColors: ['#b8874b', '#5f7a63', '#7a3344', '#4c6b8a', '#8f6836', '#6b5b95'],
};

let ALL_BOOKINGS = [];
let donutChart = null;
let barChart = null;

function isoDaysAgo(n) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - n);
  return localISODate(d);
}
// Buckets a stored UTC timestamp (createdAt, checkedInAt, cancelledAt) by
// the admin's own local calendar day, not the UTC day — otherwise a
// checkout that happened at, say, 11pm in Phnom Penh (already past
// midnight UTC) would get filed under the wrong day in the chart.
function dayOf(iso) { return iso ? localISODate(new Date(iso)) : ''; }

/* ---------------------------------------------------------------------
   Operational stats (not date-filtered — this is "right now" status)
--------------------------------------------------------------------- */
function isNoShow(b) {
  if (b.status !== 'confirmed' && b.status !== 'pending') return false;
  const lastDate = [...b.dates].sort().slice(-1)[0];
  return lastDate < localISODate(new Date());
}

function renderOpsStats() {
  const checkedIn = ALL_BOOKINGS.filter((b) => b.status === 'checked-in').length;
  const noShow = ALL_BOOKINGS.filter(isNoShow).length;
  const cancelled = ALL_BOOKINGS.filter((b) => b.status === 'cancelled').length;
  const cards = document.querySelectorAll('#ops-stats .stat-card .num');
  cards[0].textContent = checkedIn;
  cards[0].style.color = PALETTE.sage;   // currently checked in — green
  cards[1].textContent = noShow;
  cards[1].style.color = PALETTE.brass;  // missed check-in — yellow/amber
  cards[2].textContent = cancelled;
  cards[2].style.color = PALETTE.wine;   // cancelled & refunded — red
}

/* ---------------------------------------------------------------------
   Date-filtered revenue view
--------------------------------------------------------------------- */
function computeRange() {
  const from = document.getElementById('range-from').value;
  const to = document.getElementById('range-to').value;
  return { from, to };
}

function renderRevenueStats(from, to) {
  // Bookings created in range (for deposit + share)
  const createdInRange = ALL_BOOKINGS.filter((b) => dayOf(b.createdAt) >= from && dayOf(b.createdAt) <= to);
  let deposit = 0, balance = 0, refund = 0;
  createdInRange.forEach((b) => { deposit += b.depositAmount ?? b.totalPrice * 0.6; });
  ALL_BOOKINGS.filter((b) => b.checkedInAt && dayOf(b.checkedInAt) >= from && dayOf(b.checkedInAt) <= to)
    .forEach((b) => { balance += b.balanceAmount ?? b.totalPrice * 0.4; });
  ALL_BOOKINGS.filter((b) => b.cancelledAt && dayOf(b.cancelledAt) >= from && dayOf(b.cancelledAt) <= to)
    .forEach((b) => { refund += b.depositAmount ?? b.totalPrice * 0.6; });

  const net = deposit + balance - refund;
  const cards = [
    { label: 'Bookings started', value: createdInRange.length, color: PALETTE.ink },
    { label: 'Deposits collected', value: fmtMoney(deposit), color: PALETTE.brass },
    { label: 'Balance collected (check-in)', value: fmtMoney(balance), color: PALETTE.sage },
    { label: 'Refunded (cancellations)', value: '-' + fmtMoney(refund), color: PALETTE.wine },
    { label: 'Net revenue', value: fmtMoney(net), color: PALETTE.sage },
  ];
  document.getElementById('revenue-stats').innerHTML = cards.map((c) => `
    <div class="stat-card"><div class="num" style="color:${c.color};">${c.value}</div><div class="label">${c.label}</div></div>
  `).join('');

  return createdInRange;
}

// Renders a compact month calendar (or several, if the dates span more
// than one month) with the given dates highlighted — used inside the
// donut chart's hover tooltip to show exactly which days a room type
// was booked on, not just a percentage.
function miniCalendarHTML(dates) {
  const unique = [...new Set(dates)].sort();
  if (!unique.length) return '<div class="muted" style="font-size:0.76rem;">No specific dates.</div>';
  const byMonth = {};
  unique.forEach((d) => { const ym = d.slice(0, 7); (byMonth[ym] = byMonth[ym] || []).push(d); });
  return Object.keys(byMonth).sort().map((ym) => {
    const [y, m] = ym.split('-').map(Number);
    const first = new Date(y, m - 1, 1);
    const daysInMonth = new Date(y, m, 0).getDate();
    const startWeekday = first.getDay();
    const marked = new Set(byMonth[ym]);
    let cells = '';
    for (let i = 0; i < startWeekday; i++) cells += '<span class="mini-cal-cell mini-cal-empty"></span>';
    for (let day = 1; day <= daysInMonth; day++) {
      const iso = `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      cells += `<span class="mini-cal-cell${marked.has(iso) ? ' mini-cal-marked' : ''}">${day}</span>`;
    }
    const label = first.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    return `<div class="mini-cal-month"><div class="mini-cal-label">${label}</div><div class="mini-cal-grid">${cells}</div></div>`;
  }).join('');
}

function donutTooltipEl() {
  let el = document.getElementById('donut-tooltip');
  if (!el) {
    el = document.createElement('div');
    el.id = 'donut-tooltip';
    el.className = 'donut-tooltip';
    document.body.appendChild(el);
  }
  return el;
}

function renderDonut(createdInRange) {
  // Room booking share is measured in DAYS booked, not number of booking
  // records — one guest booking 3 days should count 3x as much as one
  // guest booking 1 day, since that's the room's actual time-on-books.
  const dayCounts = {};
  const datesByRoom = {};
  createdInRange.forEach((b) => {
    const name = b.room ? b.room.name : 'Room #' + b.roomId;
    const days = (b.dates && b.dates.length) || b.nights || 1;
    dayCounts[name] = (dayCounts[name] || 0) + days;
    (datesByRoom[name] = datesByRoom[name] || []).push(...(b.dates || []));
  });
  const labels = Object.keys(dayCounts);
  const values = Object.values(dayCounts);
  const total = values.reduce((a, b) => a + b, 0);

  document.getElementById('donut-empty').classList.toggle('hidden', total > 0);
  document.getElementById('donut-chart').classList.toggle('hidden', total === 0);

  if (donutChart) donutChart.destroy();
  donutTooltipEl().style.opacity = 0;
  if (total === 0) { document.getElementById('donut-legend').innerHTML = ''; return; }

  donutChart = new Chart(document.getElementById('donut-chart'), {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{ data: values, backgroundColor: PALETTE.roomColors, borderWidth: 0 }],
    },
    options: {
      plugins: {
        legend: { display: false },
        tooltip: {
          enabled: false,
          external: (context) => {
            const { tooltip } = context;
            const el = donutTooltipEl();
            if (tooltip.opacity === 0) { el.style.opacity = 0; return; }
            const idx = tooltip.dataPoints[0].dataIndex;
            const name = labels[idx];
            const days = values[idx];
            const pct = Math.round((days / total) * 100);
            el.innerHTML = `
              <div class="donut-tooltip-head">${name}</div>
              <div class="muted" style="font-size:0.78rem; margin-bottom:8px;">${days} day${days === 1 ? '' : 's'} booked (${pct}%)</div>
              ${miniCalendarHTML(datesByRoom[name] || [])}
            `;
            const canvasRect = context.chart.canvas.getBoundingClientRect();
            el.style.opacity = 1;
            el.style.left = canvasRect.left + window.scrollX + tooltip.caretX + 14 + 'px';
            el.style.top = canvasRect.top + window.scrollY + tooltip.caretY - 10 + 'px';
          },
        },
      },
      cutout: '62%',
    },
  });

  document.getElementById('donut-legend').innerHTML = labels.map((name, i) => `
    <div style="display:flex; justify-content:space-between; font-size:0.82rem; padding:3px 0;">
      <span style="display:flex; align-items:center; gap:8px;">
        <span style="width:9px;height:9px;border-radius:3px;background:${PALETTE.roomColors[i % PALETTE.roomColors.length]};display:inline-block;"></span>
        ${name}
      </span>
      <span class="muted">${Math.round((values[i] / total) * 100)}%</span>
    </div>`).join('');
}

function renderBar(from, to) {
  // Build one entry per calendar day in range.
  const days = [];
  for (let d = new Date(from + 'T00:00:00'); d <= new Date(to + 'T00:00:00'); d.setDate(d.getDate() + 1)) {
    days.push(localISODate(d));
  }
  const deposit = {}, balance = {}, refund = {};
  // Which rooms make up each day's bar, for the tooltip.
  const bookedRooms = {}, checkedInRooms = {}, cancelledRooms = {};
  days.forEach((d) => {
    deposit[d] = 0; balance[d] = 0; refund[d] = 0;
    bookedRooms[d] = []; checkedInRooms[d] = []; cancelledRooms[d] = [];
  });

  const roomLabel = (b) => b.room ? b.room.name : 'Room #' + b.roomId;

  ALL_BOOKINGS.forEach((b) => {
    const createdDay = dayOf(b.createdAt);
    if (deposit[createdDay] !== undefined) {
      deposit[createdDay] += b.depositAmount ?? b.totalPrice * 0.6;
      bookedRooms[createdDay].push(roomLabel(b));
    }
    if (b.checkedInAt) {
      const d = dayOf(b.checkedInAt);
      if (balance[d] !== undefined) {
        balance[d] += b.balanceAmount ?? b.totalPrice * 0.4;
        checkedInRooms[d].push(roomLabel(b));
      }
    }
    if (b.cancelledAt) {
      const d = dayOf(b.cancelledAt);
      if (refund[d] !== undefined) {
        refund[d] -= (b.depositAmount ?? b.totalPrice * 0.6);
        cancelledRooms[d].push(roomLabel(b));
      }
    }
  });

  const hasActivity = days.some((d) => deposit[d] || balance[d] || refund[d]);
  document.getElementById('bar-empty').classList.toggle('hidden', hasActivity);
  document.getElementById('bar-chart').classList.toggle('hidden', !hasActivity);
  if (barChart) barChart.destroy();
  if (!hasActivity) return;

  const labels = days.map((d) => new Date(d + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' }));

  // Draws each day's net total (profit in green, loss in red) just above
  // that day's bar — the stacked segments show the breakdown, this shows
  // the bottom line at a glance.
  const dayTotalLabelPlugin = {
    id: 'dayTotalLabel',
    afterDatasetsDraw(chart) {
      const { ctx } = chart;
      const meta = chart.getDatasetMeta(0);
      const yScale = chart.scales.y;
      days.forEach((d, i) => {
        const net = deposit[d] + balance[d] + refund[d];
        if (!net) return;
        const bar = meta.data[i];
        if (!bar) return;
        const topValue = Math.max(deposit[d] + balance[d], 0);
        const yPos = yScale.getPixelForValue(topValue) - 8;
        ctx.save();
        ctx.font = "600 11px 'Inter', sans-serif";
        ctx.fillStyle = net >= 0 ? PALETTE.sage : PALETTE.wine;
        ctx.textAlign = 'center';
        ctx.fillText((net >= 0 ? '+' : '') + fmtMoney(net), bar.x, yPos);
        ctx.restore();
      });
    },
  };

  barChart = new Chart(document.getElementById('bar-chart'), {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Deposit (60%)', data: days.map((d) => deposit[d]), backgroundColor: PALETTE.brass, stack: 'a' },
        { label: 'Balance at check-in (40%)', data: days.map((d) => balance[d]), backgroundColor: PALETTE.sage, stack: 'a' },
        { label: 'Refunded (cancelled)', data: days.map((d) => refund[d]), backgroundColor: PALETTE.wine, stack: 'a' },
      ],
    },
    plugins: [dayTotalLabelPlugin],
    options: {
      responsive: true,
      layout: { padding: { top: 26 } },
      scales: {
        x: { stacked: true, ticks: { font: { size: 10 } } },
        y: { stacked: true, ticks: { callback: (v) => '$' + v } },
      },
      plugins: {
        legend: { position: 'bottom', labels: { font: { size: 11 } } },
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.dataset.label}: ${fmtMoney(ctx.raw)}`,
            // Lists which specific rooms make up that bar segment — which
            // rooms got booked / checked in / cancelled that day.
            afterLabel: (ctx) => {
              const d = days[ctx.dataIndex];
              const list = ctx.datasetIndex === 0 ? bookedRooms[d]
                : ctx.datasetIndex === 1 ? checkedInRooms[d]
                : cancelledRooms[d];
              if (!list || !list.length) return '';
              const counts = {};
              list.forEach((name) => { counts[name] = (counts[name] || 0) + 1; });
              return Object.entries(counts).map(([name, n]) => n > 1 ? `${name} (${n})` : name);
            },
          },
        },
      },
    },
  });
}

function renderAll() {
  renderOpsStats();
  const { from, to } = computeRange();
  const createdInRange = renderRevenueStats(from, to);
  renderDonut(createdInRange);
  renderBar(from, to);
}

function setPreset(days) {
  document.getElementById('range-from').value = isoDaysAgo(days - 1);
  document.getElementById('range-to').value = isoDaysAgo(0);
  renderAll();
}

async function init() {
  try {
    const { bookings } = await API.get('/api/bookings');
    ALL_BOOKINGS = bookings;
  } catch (e) {
    ALL_BOOKINGS = [];
  }
  document.getElementById('range-from').value = isoDaysAgo(29);
  document.getElementById('range-to').value = isoDaysAgo(0);
  document.getElementById('range-from').addEventListener('change', renderAll);
  document.getElementById('range-to').addEventListener('change', renderAll);
  document.querySelectorAll('[data-preset]').forEach((btn) => {
    btn.addEventListener('click', () => setPreset(Number(btn.dataset.preset)));
  });
  renderAll();
}

document.addEventListener('kiristay:auth-ready', (e) => {
  if (!guardAdmin_(e.detail.user)) return;
  init();
});
