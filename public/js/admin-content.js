function guardAdmin_(user) {
  if (!user) { window.location.href = '/login.html?next=/admin/content.html'; return false; }
  if (user.role !== 'admin') { window.location.href = '/dashboard.html'; return false; }
  return true;
}

/* ---------------------------------------------------------------------
   Image field: a URL text box + a small file-upload button, with a live
   thumbnail. Uploading a file fills the URL box automatically.
--------------------------------------------------------------------- */
function imageFieldHTML(value) {
  const v = value || '';
  return `
    <div class="img-field-row">
      <img class="img-field-preview" src="${v}" onerror="this.style.visibility='hidden'" />
      <input type="text" class="img-url" placeholder="https://example.com/photo.jpg" value="${v}" />
      <input type="file" class="img-upload" accept="image/png,image/jpeg,image/webp,image/gif" />
    </div>`;
}

document.addEventListener('input', (e) => {
  if (e.target.matches('.img-url')) {
    const preview = e.target.closest('.img-field-row').querySelector('.img-field-preview');
    preview.src = e.target.value;
    preview.style.visibility = '';
  }
});
document.addEventListener('change', async (e) => {
  if (!e.target.matches('.img-upload')) return;
  const file = e.target.files[0];
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) {
    alert('That image is over 5MB — please pick a smaller file.');
    e.target.value = '';
    return;
  }
  const row = e.target.closest('.img-field-row');
  const urlInput = row.querySelector('.img-url');
  const preview = row.querySelector('.img-field-preview');
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const { url } = await API.post('/api/uploads', { dataUrl: reader.result });
      urlInput.value = url;
      preview.src = url;
      preview.style.visibility = '';
    } catch (err) {
      alert(err.data?.error || 'Upload failed.');
    } finally {
      e.target.value = '';
    }
  };
  reader.readAsDataURL(file);
});

// Delegated: any "×" remove button on a repeat row deletes that row.
document.addEventListener('click', (e) => {
  if (e.target.matches('.remove-row')) {
    e.target.closest('.repeat-row').remove();
  }
});

/* ---------------------------------------------------------------------
   Section renderers — each fills its form from the loaded content and
   wires its own "+ Add" button and submit handler. Every text field
   uses i18nRowsHTML/readI18nField (from app.js) for English/Khmer/Chinese.
--------------------------------------------------------------------- */

function renderHeroForm(hero) {
  document.getElementById('hero-eyebrow-i18n').innerHTML = i18nRowsHTML('eyebrow', hero.eyebrow);
  document.getElementById('hero-heading-i18n').innerHTML = i18nRowsHTML('heading', hero.heading);
  document.getElementById('hero-description-i18n').innerHTML = i18nRowsHTML('description', hero.description, 'textarea');
  const list = document.getElementById('hero-images-list');
  list.innerHTML = '';
  (hero.images || []).forEach((src) => addHeroImageRow(src));
}
function addHeroImageRow(src) {
  const div = document.createElement('div');
  div.className = 'repeat-row';
  div.innerHTML = `<button type="button" class="remove-row" title="Remove">&times;</button><div class="row-grid">${imageFieldHTML(src)}</div>`;
  document.getElementById('hero-images-list').appendChild(div);
}
document.getElementById('hero-add-image').addEventListener('click', () => addHeroImageRow(''));

document.getElementById('form-hero').addEventListener('submit', async (e) => {
  e.preventDefault();
  const images = [...document.querySelectorAll('#hero-images-list .img-url')].map((i) => i.value.trim()).filter(Boolean);
  const payload = {
    eyebrow: readI18nField(document.getElementById('hero-eyebrow-i18n'), 'eyebrow'),
    heading: readI18nField(document.getElementById('hero-heading-i18n'), 'heading'),
    description: readI18nField(document.getElementById('hero-description-i18n'), 'description'),
    images,
  };
  await saveSection('hero', payload);
});

function renderWhyForm(why) {
  document.getElementById('why-eyebrow-i18n').innerHTML = i18nRowsHTML('eyebrow', why.eyebrow);
  document.getElementById('why-heading-i18n').innerHTML = i18nRowsHTML('heading', why.heading);
  document.getElementById('why-description-i18n').innerHTML = i18nRowsHTML('description', why.description, 'textarea');
  const list = document.getElementById('why-stats-list');
  list.innerHTML = '';
  (why.stats || []).forEach((s) => addWhyStatRow(s));
}
function addWhyStatRow(stat) {
  stat = stat || { value: '', label: {} };
  const div = document.createElement('div');
  div.className = 'repeat-row';
  div.innerHTML = `
    <button type="button" class="remove-row" title="Remove">&times;</button>
    <div class="field"><label>Value (e.g. "5") — not translated</label><input type="text" class="stat-value" value="${stat.value || ''}" /></div>
    <div class="field"><label>Label</label>${i18nRowsHTML('label', stat.label)}</div>`;
  document.getElementById('why-stats-list').appendChild(div);
}
document.getElementById('why-add-stat').addEventListener('click', () => addWhyStatRow());

document.getElementById('form-why').addEventListener('submit', async (e) => {
  e.preventDefault();
  const stats = [...document.querySelectorAll('#why-stats-list .repeat-row')].map((row) => ({
    value: row.querySelector('.stat-value').value.trim(),
    label: readI18nField(row, 'label'),
  })).filter((s) => s.value || s.label.en || s.label.km || s.label.zh);
  const payload = {
    eyebrow: readI18nField(document.getElementById('why-eyebrow-i18n'), 'eyebrow'),
    heading: readI18nField(document.getElementById('why-heading-i18n'), 'heading'),
    description: readI18nField(document.getElementById('why-description-i18n'), 'description'),
    stats,
  };
  await saveSection('whyKiriStay', payload);
});

function renderOnSiteForm(onSite) {
  document.getElementById('onsite-eyebrow-i18n').innerHTML = i18nRowsHTML('eyebrow', onSite.eyebrow);
  document.getElementById('onsite-heading-i18n').innerHTML = i18nRowsHTML('heading', onSite.heading);
  const list = document.getElementById('onsite-cards-list');
  list.innerHTML = '';
  (onSite.cards || []).forEach((c) => addOnSiteCardRow(c));
}
function addOnSiteCardRow(card) {
  card = card || { image: '', title: {}, description: {} };
  const div = document.createElement('div');
  div.className = 'repeat-row';
  div.innerHTML = `
    <button type="button" class="remove-row" title="Remove">&times;</button>
    <div class="row-grid">
      ${imageFieldHTML(card.image)}
      <div class="field"><label>Title</label>${i18nRowsHTML('title', card.title)}</div>
      <div class="field"><label>Description</label>${i18nRowsHTML('description', card.description, 'textarea')}</div>
    </div>`;
  document.getElementById('onsite-cards-list').appendChild(div);
}
document.getElementById('onsite-add-card').addEventListener('click', () => addOnSiteCardRow());

document.getElementById('form-onsite').addEventListener('submit', async (e) => {
  e.preventDefault();
  const cards = [...document.querySelectorAll('#onsite-cards-list .repeat-row')].map((row) => ({
    image: row.querySelector('.img-url').value.trim(),
    title: readI18nField(row, 'title'),
    description: readI18nField(row, 'description'),
  })).filter((c) => c.image || c.title.en || c.description.en);
  const payload = {
    eyebrow: readI18nField(document.getElementById('onsite-eyebrow-i18n'), 'eyebrow'),
    heading: readI18nField(document.getElementById('onsite-heading-i18n'), 'heading'),
    cards,
  };
  await saveSection('onSite', payload);
});

function renderGuideForm(guide) {
  document.getElementById('guide-eyebrow-i18n').innerHTML = i18nRowsHTML('eyebrow', guide.eyebrow);
  document.getElementById('guide-heading-i18n').innerHTML = i18nRowsHTML('heading', guide.heading);
  const list = document.getElementById('guide-rows-list');
  list.innerHTML = '';
  (guide.rows || []).forEach((r) => addGuideRow(r));
}
function addGuideRow(row) {
  row = row || { label: {}, title: {}, description: {} };
  const div = document.createElement('div');
  div.className = 'repeat-row';
  div.innerHTML = `
    <button type="button" class="remove-row" title="Remove">&times;</button>
    <div class="row-grid">
      <div class="field"><label>Floor label (e.g. "Floor 3", "Roof")</label>${i18nRowsHTML('label', row.label)}</div>
      <div class="field"><label>Title</label>${i18nRowsHTML('title', row.title)}</div>
      <div class="field"><label>Description</label>${i18nRowsHTML('description', row.description, 'textarea')}</div>
    </div>`;
  document.getElementById('guide-rows-list').appendChild(div);
}
document.getElementById('guide-add-row').addEventListener('click', () => addGuideRow());

document.getElementById('form-guide').addEventListener('submit', async (e) => {
  e.preventDefault();
  const rows = [...document.querySelectorAll('#guide-rows-list .repeat-row')].map((row) => ({
    label: readI18nField(row, 'label'),
    title: readI18nField(row, 'title'),
    description: readI18nField(row, 'description'),
  })).filter((r) => r.label.en || r.title.en || r.description.en);
  const payload = {
    eyebrow: readI18nField(document.getElementById('guide-eyebrow-i18n'), 'eyebrow'),
    heading: readI18nField(document.getElementById('guide-heading-i18n'), 'heading'),
    rows,
  };
  await saveSection('buildingGuide', payload);
});

function renderFooterForm(footer) {
  document.getElementById('footer-tagline-i18n').innerHTML = i18nRowsHTML('tagline', footer.tagline, 'textarea');
}
document.getElementById('form-footer').addEventListener('submit', async (e) => {
  e.preventDefault();
  await saveSection('footer', { tagline: readI18nField(document.getElementById('footer-tagline-i18n'), 'tagline') });
});

function renderAboutForm(about) {
  document.getElementById('about-eyebrow-i18n').innerHTML = i18nRowsHTML('eyebrow', about.eyebrow);
  document.getElementById('about-heading-i18n').innerHTML = i18nRowsHTML('heading', about.heading);
  document.getElementById('about-glance-heading-i18n').innerHTML = i18nRowsHTML('atAGlanceHeading', about.atAGlanceHeading);

  const pList = document.getElementById('about-paragraphs-list');
  pList.innerHTML = '';
  (about.paragraphs || []).forEach((p) => addParagraphRow(p));

  const gList = document.getElementById('about-glance-list-edit');
  gList.innerHTML = '';
  (about.atAGlance || []).forEach((b) => addBulletRow(b));
}
function addParagraphRow(value) {
  const div = document.createElement('div');
  div.className = 'repeat-row';
  div.innerHTML = `<button type="button" class="remove-row" title="Remove">&times;</button>${i18nRowsHTML('paragraph', value, 'textarea')}`;
  document.getElementById('about-paragraphs-list').appendChild(div);
}
function addBulletRow(value) {
  const div = document.createElement('div');
  div.className = 'repeat-row';
  div.innerHTML = `<button type="button" class="remove-row" title="Remove">&times;</button>${i18nRowsHTML('bullet', value)}`;
  document.getElementById('about-glance-list-edit').appendChild(div);
}
document.getElementById('about-add-paragraph').addEventListener('click', () => addParagraphRow({}));
document.getElementById('about-add-bullet').addEventListener('click', () => addBulletRow({}));

document.getElementById('form-about').addEventListener('submit', async (e) => {
  e.preventDefault();
  const paragraphs = [...document.querySelectorAll('#about-paragraphs-list .repeat-row')]
    .map((row) => readI18nField(row, 'paragraph'))
    .filter((p) => p.en || p.km || p.zh);
  const atAGlance = [...document.querySelectorAll('#about-glance-list-edit .repeat-row')]
    .map((row) => readI18nField(row, 'bullet'))
    .filter((b) => b.en || b.km || b.zh);
  const payload = {
    eyebrow: readI18nField(document.getElementById('about-eyebrow-i18n'), 'eyebrow'),
    heading: readI18nField(document.getElementById('about-heading-i18n'), 'heading'),
    paragraphs,
    atAGlanceHeading: readI18nField(document.getElementById('about-glance-heading-i18n'), 'atAGlanceHeading'),
    atAGlance,
  };
  await saveSection('about', payload);
});

function renderContactForm(contact) {
  document.getElementById('contact-eyebrow-i18n').innerHTML = i18nRowsHTML('eyebrow', contact.eyebrow);
  document.getElementById('contact-heading-i18n').innerHTML = i18nRowsHTML('heading', contact.heading);
  document.getElementById('contact-address-i18n').innerHTML = i18nRowsHTML('address', contact.address);
  document.getElementById('contact-phone-i18n').innerHTML = i18nRowsHTML('phone', contact.phone);
  document.getElementById('contact-email-i18n').innerHTML = i18nRowsHTML('email', contact.email);
  document.getElementById('contact-hours-i18n').innerHTML = i18nRowsHTML('hours', contact.hours, 'textarea');
}
document.getElementById('form-contact').addEventListener('submit', async (e) => {
  e.preventDefault();
  const payload = {
    eyebrow: readI18nField(document.getElementById('contact-eyebrow-i18n'), 'eyebrow'),
    heading: readI18nField(document.getElementById('contact-heading-i18n'), 'heading'),
    address: readI18nField(document.getElementById('contact-address-i18n'), 'address'),
    phone: readI18nField(document.getElementById('contact-phone-i18n'), 'phone'),
    email: readI18nField(document.getElementById('contact-email-i18n'), 'email'),
    hours: readI18nField(document.getElementById('contact-hours-i18n'), 'hours'),
  };
  await saveSection('contact', payload);
});

/* ---------------------------------------------------------------------
   Save + load
--------------------------------------------------------------------- */

async function saveSection(section, payload) {
  const msg = document.getElementById('content-msg');
  msg.className = 'msg';
  try {
    await API.put('/api/content/' + section, payload);
    showMsg(msg, 'Saved. Changes are live on the site now.', 'success');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (err) {
    showMsg(msg, err.data?.error || 'Could not save — please try again.', 'error');
  }
}

async function loadAllContent() {
  try {
    const { content } = await API.get('/api/content');
    renderHeroForm(content.hero || {});
    renderWhyForm(content.whyKiriStay || {});
    renderOnSiteForm(content.onSite || {});
    renderGuideForm(content.buildingGuide || {});
    renderFooterForm(content.footer || {});
    renderAboutForm(content.about || {});
    renderContactForm(content.contact || {});
    // Now that sections have real height, honor a #anchor in the URL.
    if (window.location.hash) {
      document.querySelector(window.location.hash)?.scrollIntoView();
    }
  } catch (e) {
    showMsg(document.getElementById('content-msg'), 'Could not load site content.', 'error');
  }
}

document.addEventListener('kiristay:auth-ready', (e) => {
  if (!guardAdmin_(e.detail.user)) return;
  loadAllContent();
});
