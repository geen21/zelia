import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { buildMetierDocuments, metierDocumentSeo, metierDataPath } from '../src/pages/metiers/metierSeo.js'
import { validateMetierSnapshot, METIER_ORIGIN } from '../src/lib/metierContent.js'

const escapeXml = (value) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export async function prerenderMetiers({ vite, template, dist, injectSeo, snapshotPath }) {
  const snapshot = validateMetierSnapshot(JSON.parse(readFileSync(snapshotPath, 'utf8')))
  const { renderMetierDocument } = await vite.ssrLoadModule('/src/pages/metiers/MetierPrerender.jsx')
  const write = (parts, content) => {
    const path = resolve(dist, ...parts)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, content, 'utf8')
  }
  const urls = []
  for (const doc of buildMetierDocuments(snapshot)) {
    const payload = JSON.stringify(doc).replace(/</g, '\\u003c')
    const html = injectSeo(template, metierDocumentSeo(doc))
      .replace('<div id="root"></div>', () => `<div id="root">${renderMetierDocument(doc)}</div><script type="application/json" id="zelia-metier-data">${payload}</script>`)
    write([...doc.path.split('/').filter(Boolean), 'index.html'], html)
    write(metierDataPath(doc.path).split('/').filter(Boolean), JSON.stringify(doc))
    urls.push({ path: doc.path, updatedAt: doc.updatedAt })
  }
  if (!snapshot.preview) {
    const sitemapNames = []
    for (let offset = 0; offset < urls.length; offset += 5000) {
      const name = `sitemap-metiers-${offset / 5000 + 1}.xml`
      sitemapNames.push(name)
      const entries = urls.slice(offset, offset + 5000).map((entry) =>
        `<url><loc>${escapeXml(METIER_ORIGIN + entry.path)}</loc><lastmod>${escapeXml(entry.updatedAt)}</lastmod></url>`).join('\n')
      write([name], `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${entries}</urlset>`)
    }
    write(['sitemap-metiers-index.xml'], `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${sitemapNames.map((name) =>
      `<sitemap><loc>${METIER_ORIGIN}/${name}</loc></sitemap>`).join('\n')}</sitemapindex>`)
    const robotsPath = resolve(dist, 'robots.txt')
    writeFileSync(robotsPath, `${readFileSync(robotsPath, 'utf8').trim()}\nSitemap: ${METIER_ORIGIN}/sitemap-metiers-index.xml\n`, 'utf8')
    const sitemapPath = resolve(dist, 'sitemap.xml')
    writeFileSync(sitemapPath, readFileSync(sitemapPath, 'utf8').replace('</urlset>',
      `  <url><loc>${METIER_ORIGIN}/metiers/</loc></url>\n</urlset>`), 'utf8')
  }
  console.log(`Métiers : ${snapshot.pages.length} fiches, ${urls.length} pages HTML ; ${snapshot.preview ? 'PRÉVISUALISATION non indexable, aucun sitemap' : 'publication complète'}.`)
  return urls
}
