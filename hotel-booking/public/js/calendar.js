/**
 * A small, dependency-free month calendar for picking booking days.
 * Guests click individual days — not necessarily a contiguous range —
 * and pay only for the days they pick. Days already fully booked by
 * someone else (every unit taken) are shown in a light salmon colour
 * and cannot be clicked.
 */
function createBookingCalendar(container, { fullDates, onChange }) {
  const fullSet = new Set(fullDates || []);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let viewYear = today.getFullYear();
  let viewMonth = today.getMonth(); // 0-11
  const selected = new Set(); // iso date strings

  function isoDate(d) {
    return localISODate(d);
  }

  function isPast(date) {
    return date < today;
  }

  function render() {
    const first = new Date(viewYear, viewMonth, 1);
    const startWeekday = first.getDay();
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const monthName = first.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

    let cells = '';
    for (let i = 0; i < startWeekday; i++) cells += '<div class="cal-cell cal-empty"></div>';

    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(viewYear, viewMonth, day);
      const iso = isoDate(date);
      const past = isPast(date);
      const full = fullSet.has(iso);
      const isSelected = selected.has(iso);
      let cls = 'cal-cell cal-day';
      if (past) cls += ' cal-past';
      else if (full) cls += ' cal-full';
      else cls += ' cal-open';
      if (isSelected) cls += ' cal-selected';
      cells += `<div class="${cls}" data-date="${iso}">${day}</div>`;
    }

    container.innerHTML = `
      <div class="cal-widget">
        <div class="cal-head">
          <button type="button" class="cal-nav" data-nav="-1">&larr;</button>
          <span class="cal-month">${monthName}</span>
          <button type="button" class="cal-nav" data-nav="1">&rarr;</button>
        </div>
        <div class="cal-weekdays">
          <span>S</span><span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span>
        </div>
        <div class="cal-grid">${cells}</div>
        <div class="cal-legend">
          <span><i class="cal-swatch cal-open"></i> Open</span>
          <span><i class="cal-swatch cal-full"></i> Already booked</span>
          <span><i class="cal-swatch cal-selected"></i> Your dates</span>
        </div>
        <div class="cal-summary" id="cal-summary">Click any open day you want to book — pick as many as you like.</div>
        ${selected.size ? '<button type="button" class="btn btn-outline btn-sm" id="cal-clear" style="margin-top:10px;">Clear selection</button>' : ''}
      </div>`;

    container.querySelectorAll('[data-nav]').forEach((btn) => {
      btn.addEventListener('click', () => {
        viewMonth += Number(btn.dataset.nav);
        if (viewMonth > 11) { viewMonth = 0; viewYear++; }
        if (viewMonth < 0) { viewMonth = 11; viewYear--; }
        render();
      });
    });

    container.querySelectorAll('.cal-day.cal-open').forEach((el) => {
      el.addEventListener('click', () => {
        const iso = el.dataset.date;
        if (selected.has(iso)) selected.delete(iso);
        else selected.add(iso);
        render();
        updateSummary();
      });
    });

    container.querySelector('#cal-clear')?.addEventListener('click', () => {
      selected.clear();
      render();
      updateSummary();
    });

    updateSummary();
  }

  function updateSummary() {
    const summary = container.querySelector('#cal-summary');
    if (!summary) return;
    const sorted = [...selected].sort();
    if (!sorted.length) {
      summary.textContent = 'Click any open day you want to book — pick as many as you like.';
    } else {
      const labels = sorted.map((iso) => new Date(iso + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' }));
      summary.textContent = `${sorted.length} day${sorted.length === 1 ? '' : 's'} selected: ${labels.join(', ')}`;
    }
    onChange(sorted);
  }

  render();
  return {
    reset() { selected.clear(); render(); },
  };
}
