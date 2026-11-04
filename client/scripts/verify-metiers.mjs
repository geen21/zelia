import assert from 'node:assert/strict'
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { parseArgs } from 'node:util'
import { chromium } from '@playwright/test'
import { preview } from 'vite'
import { startViteTestServer } from './vite-test-server.mjs'
import react from '@vitejs/plugin-react'
import { metierPagesPlugin } from './metier-vite.mjs'
import { metierSnapshot } from './fixtures/metiers.mjs'
import { buildMetierDocuments, metierDataPath } from '../src/pages/metiers/metierSeo.js'
import { metierWordCount } from '../src/lib/metierContent.js'
import { withZeliaUtm } from '../src/lib/outboundUrl.js'

const client = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const dist = resolve(client, 'dist')
const { values } = parseArgs({ options: { snapshot: { type: 'string' }, 'skip-build': { type: 'boolean' } } })
if (values['skip-build'] && !values.snapshot) throw new Error('--skip-build nécessite le snapshot du build à vérifier')
const snapshot = values.snapshot ? JSON.parse(await readFile(resolve(values.snapshot), 'utf8')) : metierSnapshot()
const temp = await mkdtemp(resolve(tmpdir(), 'zelia-metier-check-'))
const snapshotPath = resolve(temp, 'snapshot.json')
await writeFile(snapshotPath, JSON.stringify(snapshot))
let browser
let server
let devServer
try {
  if (!values['skip-build']) {
    const args = process.env.npm_execpath ? [process.env.npm_execpath, 'run', 'build'] :
      [resolve(client, 'scripts', 'build-metiers.mjs'), '--optional']
    const build = spawnSync(process.execPath, args, {
      cwd: client, stdio: 'inherit', env: { ...process.env, METIER_SNAPSHOT_PATH: snapshotPath }
    })
    assert.equal(build.status, 0, 'Ordinary production build must preserve the metier catalogue')
  }
  const docs = [...buildMetierDocuments(snapshot)]
  for (const doc of docs) {
    const html = await readFile(resolve(dist, ...doc.path.split('/').filter(Boolean), 'index.html'), 'utf8')
    const renderedHtml = html.split('<script type="application/json" id="zelia-metier-data">')[0]
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
      assert.ok(!html.includes('Appréciation générée par IA'))
      assert.ok(!html.includes('Perspectives générales en France, pas une garantie'))
      assert.ok(!html.includes('metier-disclaimer'))
      if (doc.page.content.version === 2) {
        assert.ok(metierWordCount(doc.page.content) >= 600 && metierWordCount(doc.page.content) <= 900)
        assert.equal(JSON.parse(schemas[0][1])['@graph'][0].wordCount, metierWordCount(doc.page.content))
        assert.ok(html.includes('id="questions-frequentes"') && html.includes('id="sources-metier"'))
        for (const section of doc.page.content.sections) {
          assert.ok(html.includes(`id="${section.id}"`))
          for (const text of section.paragraphs) assert.ok(renderedHtml.includes(text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;')))
        }
        for (const source of doc.page.content.sources) assert.ok(html.includes(`href="${withZeliaUtm(source.url).replace(/&/g, '&amp;')}"`))
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

  server = await preview({ root: client, preview: { host: '127.0.0.1', port: 0, strictPort: true }, logLevel: 'error' })
  const base = `http://127.0.0.1:${server.httpServer.address().port}`
  const directoryResponse = await fetch(`${base}/metiers-data/index.json`)
  assert.match(directoryResponse.headers.get('content-type'), /application\/json/)
  assert.deepEqual(await directoryResponse.json(), docs[0])
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
  assert.equal(await page.locator('.metier-disclaimer').count(), 0)
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
    await page.locator('.metier-faq summary').first().focus()
    await page.keyboard.press('Enter')
    assert.ok(await page.locator('.metier-faq details').first().getAttribute('open') !== null)
    assert.equal(await page.locator('.metier-faq summary').first().evaluate((element) => getComputedStyle(element).outlineWidth), '3px')
    assert.equal(await page.locator('.metier-sources li').count(), snapshot.pages.find((entry) => page.url().includes(entry.slug)).content.sources.length)
  }
  await page.route('**/metiers-data/index.json', (route) => route.fulfill({ status: 503, body: 'Unavailable' }))
  await page.evaluate(() => { history.pushState({}, '', '/metiers/'); dispatchEvent(new PopStateEvent('popstate')) })
  await page.getByRole('alert').waitFor()
  await page.unroute('**/metiers-data/index.json')
  await page.getByRole('button', { name: 'Réessayer' }).click()
  await page.locator('.metier-card').first().waitFor()
  await page.locator('.metier-card').first().click()
  await page.getByRole('heading', { name: /Est-ce que le métier/ }).waitFor()
  await page.route('**/metiers-data/index.json', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><main>Unexpected SPA fallback</main>' }))
  await page.getByRole('link', { name: 'Tous les métiers', exact: true }).click()
  await page.getByRole('alert').waitFor()
  await page.unroute('**/metiers-data/index.json')
  await page.getByRole('button', { name: 'Réessayer' }).click()
  await page.locator('.metier-card').first().waitFor()
  await page.keyboard.press('Tab')
  assert.ok(await page.evaluate(() => document.activeElement.tagName !== 'BODY'))
  await context.close()
  devServer = await startViteTestServer({
    root: client, configFile: false, plugins: [react(), metierPagesPlugin({ snapshotPath })],
    server: { host: '127.0.0.1', port: 0, strictPort: true, hmr: false }, logLevel: 'error'
  })
  const devBase = `http://127.0.0.1:${devServer.httpServer.address().port}`
  const devContext = await browser.newContext()
  await devContext.route('**/*', (route) => route.request().url().startsWith(devBase) ? route.continue() : route.abort())
  const devPage = await devContext.newPage()
  await devPage.goto(`${devBase}/metiers/`)
  await devPage.locator('.metier-card').first().waitFor()
  assert.equal(await devPage.locator('.metier-card').count(), Math.min(36, snapshot.pages.length))
  await devPage.locator('.metier-card').first().click()
  await devPage.getByRole('heading', { name: /Est-ce que le métier/ }).waitFor()
  assert.equal(await devPage.locator('.metier-sources li').count(),
    snapshot.pages.find((entry) => devPage.url().includes(entry.slug)).content.sources.length)
  await devContext.close()
  console.log(`Métiers vérifiés : ${snapshot.pages.length} HTML complets, build classique, vrais serveurs Vite preview/dev, JSON, 404, sans JS, navigation, erreurs, clavier et responsive.`)
} finally {
  if (browser) await browser.close()
  if (devServer) await devServer.close()
  if (server) await new Promise((resolve) => { server.httpServer.close(resolve); server.httpServer.closeAllConnections() })
  await rm(temp, { recursive: true })
}
