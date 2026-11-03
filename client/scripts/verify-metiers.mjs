import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { readFile, stat, mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve, dirname, extname, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { once } from 'node:events'
import { parseArgs } from 'node:util'
import { chromium } from '@playwright/test'
import { metierSnapshot } from './fixtures/metiers.mjs'
import { buildMetierDocuments, metierDataPath } from '../src/pages/metiers/metierSeo.js'
import { metierWordCount } from '../src/lib/metierContent.js'

const client = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const dist = resolve(client, 'dist')
const temp = await mkdtemp(resolve(tmpdir(), 'zelia-metier-check-'))
const { values } = parseArgs({ options: { snapshot: { type: 'string' } } })
const snapshot = values.snapshot ? JSON.parse(await readFile(resolve(values.snapshot), 'utf8')) : metierSnapshot()
const snapshotPath = resolve(temp, 'snapshot.json')
await writeFile(snapshotPath, JSON.stringify(snapshot))
let browser
let server
try {
  const build = spawnSync(process.execPath, [resolve(client, 'scripts', 'build-metiers.mjs'), '--snapshot', snapshotPath], { cwd: client, stdio: 'inherit' })
  assert.equal(build.status, 0, 'Metier production build')
  const docs = [...buildMetierDocuments(snapshot)]
  for (const doc of docs) {
    const html = await readFile(resolve(dist, ...doc.path.split('/').filter(Boolean), 'index.html'), 'utf8')
    assert.equal((html.match(/<h1\b/g) || []).length, 1)
    assert.equal((html.match(/rel="canonical"/g) || []).length, 1)
    assert.ok(html.includes(`href="https://zelia.io${doc.path}"`))
    assert.ok(html.includes('id="zelia-metier-data"'))
    assert.ok(!html.includes('JobPosting'))
    assert.equal(html.includes('content="noindex, follow"'), snapshot.preview)
    const schemas = [...html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)]
    assert.equal(schemas.length, 1)
    assert.equal(JSON.parse(schemas[0][1])['@graph'][0]['@type'], 'WebPage')
    if (doc.kind === 'detail') {
      assert.ok(html.includes(doc.page.content.summary))
      assert.ok(html.includes(doc.page.content.explanation))
      assert.ok(html.includes('Appréciation générée par IA'))
      if (doc.page.content.version === 2) {
        assert.ok(metierWordCount(doc.page.content) >= 600 && metierWordCount(doc.page.content) <= 900)
        assert.equal(JSON.parse(schemas[0][1])['@graph'][0].wordCount, metierWordCount(doc.page.content))
        assert.ok(html.includes('id="questions-frequentes"') && html.includes('id="sources-metier"'))
        for (const section of doc.page.content.sections) {
          assert.ok(html.includes(`id="${section.id}"`))
          for (const text of section.paragraphs) assert.ok(html.includes(text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;')))
        }
        for (const source of doc.page.content.sources) assert.ok(html.includes(`href="${source.url}"`))
      }
    }
    const json = JSON.parse(await readFile(resolve(dist, ...metierDataPath(doc.path).split('/').filter(Boolean)), 'utf8'))
    assert.deepEqual(json, doc)
  }
  if (snapshot.preview) {
    await assert.rejects(readFile(resolve(dist, 'sitemap-metiers-index.xml')), { code: 'ENOENT' })
    assert.ok(!(await readFile(resolve(dist, 'robots.txt'), 'utf8')).includes('sitemap-metiers-index.xml'))
  } else {
    const sitemap = await readFile(resolve(dist, 'sitemap-metiers-1.xml'), 'utf8')
    assert.equal((sitemap.match(/<url>/g) || []).length, docs.length)
    assert.ok((await readFile(resolve(dist, 'robots.txt'), 'utf8')).includes('sitemap-metiers-index.xml'))
    assert.ok((await readFile(resolve(dist, 'sitemap.xml'), 'utf8')).includes('https://zelia.io/metiers/'))
  }

  const mime = { '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.html': 'text/html', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' }
  server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://127.0.0.1')
      let path = resolve(dist, ...decodeURIComponent(url.pathname).split('/').filter(Boolean))
      if (path !== dist && !path.startsWith(dist + sep)) { res.writeHead(404).end(); return }
      let info
      try { info = await stat(path) } catch (error) {
        if (error.code !== 'ENOENT') throw error
        if (/^\/(?:metiers(?:-data)?\/|sitemap-metiers-)/.test(url.pathname)) { res.writeHead(404).end('Not found'); return }
        path = resolve(dist, 'index.html')
        info = await stat(path)
      }
      if (info.isDirectory()) {
        if (!url.pathname.endsWith('/')) { res.writeHead(301, { Location: `${url.pathname}/` }).end(); return }
        path = resolve(path, 'index.html')
      }
      res.writeHead(200, { 'Content-Type': `${mime[extname(path)] || 'application/octet-stream'}; charset=utf-8`, 'Cache-Control': 'no-cache' })
      res.end(await readFile(path))
    } catch (error) {
      console.error('Test static server:', error)
      if (!res.headersSent) res.writeHead(500)
      res.end()
    }
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const base = `http://127.0.0.1:${server.address().port}`
  assert.equal((await fetch(`${base}/metiers/inconnu/`)).status, 404)
  assert.equal((await fetch(`${base}/metiers-data/inconnu/index.json`)).status, 404)
  assert.equal((await fetch(`${base}/metiers`, { redirect: 'manual' })).status, 301)
  browser = await chromium.launch({ headless: true })
  const noJs = await browser.newContext({ javaScriptEnabled: false })
  const staticPage = await noJs.newPage()
  const detail = docs.find((doc) => doc.kind === 'detail')
  await staticPage.goto(base + detail.path)
  assert.equal(await staticPage.locator('h1').count(), 1)
  assert.ok(await staticPage.getByText(detail.page.content.explanation, { exact: true }).isVisible())
  await noJs.close()
  const context = await browser.newContext()
  await context.route('**/*', (route) => route.request().url().startsWith(base) ? route.continue() : route.abort())
  const page = await context.newPage()
  await page.goto(base + detail.path)
  await page.getByRole('heading', { name: /Est-ce que le métier/ }).waitFor()
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 })
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `Overflow at ${width}px`)
    assert.equal(await page.getByRole('link', { name: /Découvrir si ce métier me correspond/ }).getAttribute('href'), '/orientation')
  }
  await page.getByRole('link', { name: 'Tous les métiers', exact: true }).click()
  await page.getByRole('heading', { name: /Un métier d’avenir/ }).waitFor()
  assert.equal(await page.locator('.metier-card').count(), Math.min(36, snapshot.pages.length))
  if (snapshot.pages.length > 36) {
    await page.getByRole('link', { name: /Page suivante/ }).click()
    await page.waitForURL('**/metiers/page/2/')
    await page.locator('.metier-card').first().waitFor()
    assert.equal(await page.locator('.metier-card').count(), Math.min(36, snapshot.pages.length - 36))
  }
  await page.locator('.metier-card').first().click()
  await page.getByRole('heading', { name: /Est-ce que le métier/ }).waitFor()
  assert.equal(await page.locator('h1').count(), 1)
  assert.equal(await page.locator('link[rel=canonical]').count(), 1)
  if (snapshot.pages.every((entry) => entry.content.version === 2)) {
    await page.locator('.metier-faq summary').first().click()
    assert.ok(await page.locator('.metier-faq details').first().getAttribute('open') !== null)
    assert.equal(await page.locator('.metier-sources li').count(), snapshot.pages.find((entry) => page.url().includes(entry.slug)).content.sources.length)
  }
  await page.route('**/metiers-data/index.json', (route) => route.fulfill({ status: 503, body: 'Unavailable' }))
  await page.evaluate(() => { history.pushState({}, '', '/metiers/'); dispatchEvent(new PopStateEvent('popstate')) })
  await page.getByRole('alert').waitFor()
  await page.unroute('**/metiers-data/index.json')
  await page.getByRole('button', { name: 'Réessayer' }).click()
  await page.locator('.metier-card').first().waitFor()
  await page.keyboard.press('Tab')
  assert.ok(await page.evaluate(() => document.activeElement.tagName !== 'BODY'))
  await context.close()
  console.log(`Métiers vérifiés : ${snapshot.pages.length} HTML complets, SEO, données identiques, 404, sans JS, navigation, erreurs et responsive.`)
} finally {
  if (browser) await browser.close()
  if (server) await new Promise((resolve) => { server.close(resolve); server.closeAllConnections() })
  await rm(temp, { recursive: true })
}
