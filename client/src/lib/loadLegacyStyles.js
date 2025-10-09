let stylesLoaded = false;

function injectStyle(cssText, id) {
  if (!cssText) return;
  const existing = id ? document.querySelector(`style[data-legacy-style="${id}"]`) : null;
  if (existing) {
    existing.textContent = cssText;
    return;
  }
  const styleEl = document.createElement('style');
  if (id) styleEl.dataset.legacyStyle = id;
  styleEl.textContent = cssText;
  document.head.appendChild(styleEl);
}

function ensureFavicon(faviconUrl) {
  if (!faviconUrl) return;
  const rels = [
    'icon',
    'shortcut icon',
    'apple-touch-icon'
  ];
  const existing = document.querySelector('link[rel="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]');
  const target = existing || document.createElement('link');
  target.rel = rels.includes(target.rel) ? target.rel : 'icon';
  target.href = faviconUrl;
  if (!existing) document.head.appendChild(target);
}

export function loadLegacyStyles() {
  if (stylesLoaded || typeof document === 'undefined') return;
  stylesLoaded = true;

  const cssModules = import.meta.glob('../../public/static/css/*.css', { eager: true, import: 'default', query: '?raw' });
  const overrideModules = import.meta.glob('../../public/overrides.css', { eager: true, import: 'default', query: '?raw' });

  const assetModules = import.meta.glob('../../public/static/{fonts,images,icons}/**/*', {
    eager: true,
    import: 'default',
    query: '?url'
  });

  const replacementMap = Object.entries(assetModules).reduce((acc, [path, url]) => {
    const [_, tail] = path.split('/static/');
    if (!tail) return acc;
    const variants = [
      `../${tail}`,
      `./${tail}`,
      `/static/${tail}`,
      `static/${tail}`
    ];
    variants.forEach((key) => {
      acc[key] = url;
    });
    return acc;
  }, {});

  Object.entries(cssModules).forEach(([path, raw]) => {
    let cssText = raw;
    Object.entries(replacementMap).forEach(([needle, replacement]) => {
      if (cssText.includes(needle)) {
        cssText = cssText.split(needle).join(replacement);
      }
    });
    const id = path.split('/static/css/')[1] || path;
    injectStyle(cssText, id);
  });

  Object.entries(overrideModules).forEach(([path, raw]) => {
    const id = path.split('/').pop() || path;
    injectStyle(raw, id);
  });

  const faviconModule = import.meta.glob('../../public/static/images/favicon.ico', { eager: true, import: 'default', query: '?url' });
  const faviconUrl = Object.values(faviconModule)[0];
  ensureFavicon(faviconUrl);
}
