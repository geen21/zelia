let stylesLoaded = false;

const LEGACY_STYLES = [
  { href: '/static/css/app.min.css', id: 'legacy-app' },
  { href: '/static/css/main.css', id: 'legacy-main' },
  { href: '/static/css/bootstrap.min.css', id: 'legacy-bootstrap' },
  { href: '/overrides.css', id: 'legacy-overrides' }
];

function ensureStylesheet({ href, id }) {
  if (!href || typeof document === 'undefined') return;

  const existing = document.head.querySelector(
    id ? `link[data-legacy-style="${id}"]` : `link[rel="stylesheet"][href*="${href}"]`
  )
    || Array.from(document.head.querySelectorAll('link[rel="stylesheet"]')).find((link) => link.href.includes(href));

  if (existing) return;

  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  if (id) link.dataset.legacyStyle = id;
  document.head.appendChild(link);
}

function ensureFavicon() {
  if (typeof document === 'undefined') return;
  const rels = ['icon', 'shortcut icon', 'apple-touch-icon'];
  const existing = document.querySelector('link[rel="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]');
  const target = existing || document.createElement('link');
  target.rel = rels.includes(target.rel) ? target.rel : 'icon';
  target.href = '/static/images/favicon.ico';
  if (!existing) document.head.appendChild(target);
}

export function loadLegacyStyles() {
  if (stylesLoaded || typeof document === 'undefined') return;
  stylesLoaded = true;

  LEGACY_STYLES.forEach(ensureStylesheet);
  ensureFavicon();
}
