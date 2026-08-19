/**
 * Lightweight language switcher (English / Khmer / Chinese) for the
 * public site's chrome — navigation, common buttons, footer labels.
 * Elements opt in with a data-i18n="key" attribute; this walks them and
 * swaps text on language change. The choice persists in localStorage.
 *
 * Scope note: this translates the site's shared navigation and common
 * buttons. Admin-editable content (hero text, room descriptions, About
 * page copy, etc.) is written by the hotel admin directly and isn't
 * auto-translated — the same way a real hotel's own staff would write
 * copy in whichever language(s) they choose.
 */

const I18N_DICT = {
  en: {
    'nav.home': 'Home',
    'nav.rooms': 'Rooms',
    'nav.about': 'About',
    'nav.contact': 'Contact',
    'auth.login': 'Log in',
    'auth.register': 'Register',
    'auth.dashboard': 'Dashboard',
    'auth.logout': 'Log out',
    'footer.explore': 'Explore',
    'footer.account': 'Account',
  },
  km: {
    'nav.home': 'ទំព័រដើម',
    'nav.rooms': 'បន្ទប់',
    'nav.about': 'អំពីយើង',
    'nav.contact': 'ទំនាក់ទំនង',
    'auth.login': 'ចូលគណនី',
    'auth.register': 'ចុះឈ្មោះ',
    'auth.dashboard': 'ផ្ទាំងគ្រប់គ្រង',
    'auth.logout': 'ចាកចេញ',
    'footer.explore': 'ស្វែងរក',
    'footer.account': 'គណនី',
  },
  zh: {
    'nav.home': '首页',
    'nav.rooms': '客房',
    'nav.about': '关于我们',
    'nav.contact': '联系我们',
    'auth.login': '登录',
    'auth.register': '注册',
    'auth.dashboard': '控制面板',
    'auth.logout': '登出',
    'footer.explore': '探索',
    'footer.account': '帐户',
  },
};

const I18N_LANG_LABELS = { en: 'EN', km: 'ខ្មែរ', zh: '中文' };

function currentLang() {
  return localStorage.getItem('kiristay_lang') || 'en';
}

// Resolves a translatable field, which can be either a plain string
// (legacy / non-translated values like a room's own name) or a
// { en, km, zh } object. Falls back to English, then to whatever's there.
function localText(field) {
  if (!field) return '';
  if (typeof field === 'string') return field;
  return field[currentLang()] || field.en || field.km || field.zh || '';
}

function applyLanguage(lang) {
  const dict = I18N_DICT[lang] || I18N_DICT.en;
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n');
    if (dict[key]) el.textContent = dict[key];
  });
  document.documentElement.setAttribute('lang', lang);
  document.querySelectorAll('.lang-switch button').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.lang === lang);
  });
}

function setLanguage(lang) {
  localStorage.setItem('kiristay_lang', lang);
  applyLanguage(lang);
  // Pages that render fetched data (rooms, hero, about, etc.) re-draw
  // themselves from their already-loaded data on this event, instead of
  // re-fetching — switching language should be instant.
  document.dispatchEvent(new CustomEvent('kiristay:lang-changed', { detail: { lang } }));
}

function injectLanguageSwitch() {
  const navAuth = document.querySelector('.nav-auth');
  if (!navAuth || document.querySelector('.lang-switch')) return;
  const wrap = document.createElement('div');
  wrap.className = 'lang-switch';
  wrap.innerHTML = Object.keys(I18N_LANG_LABELS).map((lang) =>
    `<button type="button" data-lang="${lang}">${I18N_LANG_LABELS[lang]}</button>`
  ).join('');
  navAuth.insertBefore(wrap, navAuth.firstChild);
  wrap.querySelectorAll('button').forEach((btn) => {
    btn.addEventListener('click', () => setLanguage(btn.dataset.lang));
  });
}

document.addEventListener('DOMContentLoaded', () => {
  injectLanguageSwitch();
  applyLanguage(currentLang());
});
