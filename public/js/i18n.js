/**
 * Lightweight language switcher (English only) for the
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
};


function currentLang() {
  return 'en';
}

// Resolves a translatable field, which can be either a plain string
// (legacy / non-translated values like a room's own name) or a
// { en, km, zh } object. Falls back to English, then to whatever's there.
function localText(field) {
  if (!field) return '';
  if (typeof field === 'string') return field;
  return field.en || field.km || field.zh || '';
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
  applyLanguage(lang);
  // Pages that render fetched data (rooms, hero, about, etc.) re-draw
  // themselves from their already-loaded data on this event, instead of
  // re-fetching — switching language should be instant.
  document.dispatchEvent(new CustomEvent('kiristay:lang-changed', { detail: { lang } }));
}

document.addEventListener('DOMContentLoaded', () => {
  applyLanguage(currentLang());
});
