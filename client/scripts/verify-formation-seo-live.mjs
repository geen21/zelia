import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { parseArgs } from 'node:util'
import { chromium, expect } from '@playwright/test'
import { getFormationSlug, getFormationTitle } from '../src/lib/formationDisplay.js'

const { values } = parseArgs({ options: {
  origin: { type: 'string', default: 'https://zelia.io' },
  manifest: { type: 'string', default: '..\\server\\.generated\\formation-historical-canonicals-20261104.json' }
} })
const origin = new URL(values.origin).origin
const canonicalOrigin = 'https://zelia.io'
const manifest = JSON.parse(await readFile(values.manifest, 'utf8'))
assert.equal(manifest.format, 'zelia-historical-formation-canonicals-v1')
const ids = [1, 3, 1540, 3767, 5604]
const expected = new Map(manifest.rows.map((row) => [String(row.id), row.slug]))
const records = []
for (const id of ids) {
  assert.ok(expected.has(String(id)), 'Representative id absent from historical manifest')
  const response = await fetch(`${origin}/api/formations/${id}`, { signal: AbortSignal.timeout(20000) })
  assert.equal(response.status, 200, `Public formation API ${id}`)
  const { formation } = await response.json()
  assert.equal(formation?.canonical_slug, expected.get(String(id)),
    `Canonical restoration is not active in production for ${id}; do not validate Search Console yet.`)
  assert.equal(getFormationSlug(formation), expected.get(String(id)))
  records.push(formation)
}
const sitemap = await fetch(`${origin}/sitemap-formations-1.xml`, { signal: AbortSignal.timeout(30000) })
assert.equal(sitemap.status, 200)
assert.match(sitemap.headers.get('content-type'), /xml/)
const xml = await sitemap.text()
assert.ok(xml.includes(`<loc>${canonicalOrigin}/formations/${expected.get('1')}</loc>`), 'Sitemap still exposes a different canonical')

const browser = await chromium.launch({ headless: true })
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const page = await context.newPage()
  await context.route('**/*', (route) => {
    const url = new URL(route.request().url())
    return url.origin === origin ? route.continue() : route.abort()
  })
  for (const formation of records) {
    const canonical = `${canonicalOrigin}/formations/${formation.canonical_slug}`
    await page.goto(`${origin}/formations/${formation.canonical_slug}`)
    await expect(page.getByRole('heading', { name: getFormationTitle(formation), exact: true, level: 1 })).toBeVisible()
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', canonical)
    await expect(page.locator('meta[property="og:url"]')).toHaveAttribute('content', canonical)
  }
  await context.unrouteAll({ behavior: 'wait' })
  await context.close()
} finally {
  await browser.close()
}
console.log(`Live formation SEO verified: historical API slugs, root sitemap and rendered canonical tags agree on ${origin}. No Search Console action performed.`)
