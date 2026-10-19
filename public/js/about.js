let CACHED_ABOUT_CONTENT = {};

function renderAbout(content) {
  CACHED_ABOUT_CONTENT = content;
  const about = content.about || {};
  document.getElementById('about-eyebrow').textContent = localText(about.eyebrow);
  document.getElementById('about-heading').textContent = localText(about.heading);
  document.getElementById('about-paragraphs').innerHTML = (about.paragraphs || []).map((p) => `<p>${localText(p)}</p>`).join('');
  document.getElementById('about-glance-heading').textContent = localText(about.atAGlanceHeading) || 'At a glance';
  document.getElementById('about-glance-list').innerHTML = (about.atAGlance || []).map((li) => `<li>${localText(li)}</li>`).join('');
}

document.addEventListener('kiristay:content-ready', (e) => renderAbout(e.detail.content || {}));
document.addEventListener('kiristay:lang-changed', () => renderAbout(CACHED_ABOUT_CONTENT));
