import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'
import { chromium, expect } from '@playwright/test'
import { preview } from 'vite'

const root = fileURLToPath(new URL('../', import.meta.url))
const reportOnly = process.argv.includes('--report-only')
const server = await preview({ root, preview: { host: '127.0.0.1', port: 0, open: false } })
const base = server.resolvedUrls.local[0]
const origin = new URL(base).origin
const browser = await chromium.launch({ headless: true })
const formation = {
  id: 29958, nm: ['CPGE économique et commerciale voie technologique'],
  nmc: 'CPGE ECT', etab_nom: "Lycée Honoré d'Estienne d'Orves",
  commune: 'Nice', departement: 'Alpes-Maritimes', duree: '2 ans'
}
const paths = ['/', '/formations/cpge-ect-nice-29958', '/blog/']
const failures = []

try {
  for (const width of [390, 1440]) {
    for (const path of paths) {
      const measurements = []
      for (let run = 0; run < 3; run++) {
        const context = await browser.newContext({
          viewport: { width, height: 900 }, isMobile: width === 390,
          reducedMotion: 'reduce', serviceWorkers: 'block'
        })
        try {
          const page = await context.newPage()
          const errors = []
          const requests = []
          const scripts = new Map()
          page.on('pageerror', (error) => errors.push(error.message))
          page.on('console', (message) => {
            if (message.type() === 'error' && /Minified React error|hydration|did not match/i.test(message.text())) {
              errors.push(message.text())
            }
          })
          page.on('request', (request) => requests.push(request.url()))
          page.on('response', (response) => {
            const url = new URL(response.url())
            if (url.origin === origin && url.pathname.endsWith('.js')) {
              scripts.set(url.href, response.body().then((body) => gzipSync(body).length))
            }
          })
          await context.route('**/*', (route) => {
            const url = new URL(route.request().url())
            if (url.origin === origin) {
              if (url.pathname === '/api/formations/29958') return route.fulfill({ json: { formation } })
              if (url.pathname === '/api/formations') return route.fulfill({ json: { formations: [], total: 0 } })
              if (url.pathname.startsWith('/api/')) {
                errors.push(`Unexpected API request: ${url.pathname}`)
                return route.fulfill({ status: 404, json: { error: 'Unexpected fixture request' } })
              }
              return route.continue()
            }
            if (url.hostname === 'cdn.tailwindcss.com') {
              return route.fulfill({ contentType: 'application/javascript', body: 'window.tailwind = {}' })
            }
            // External services are excluded: this is a build regression check, not CrUX.
            return route.abort()
          })
          await page.addInitScript(() => {
            window.webVitals = { lcp: 0, cls: 0 }
            const prerenderObserver = new MutationObserver(() => {
              const heading = document.querySelector('#root[data-prerendered="true"] h1')
              if (!heading) return
              window.prerenderedHeading = heading
              prerenderObserver.disconnect()
            })
            prerenderObserver.observe(document, { childList: true, subtree: true })
            new PerformanceObserver((list) => {
              for (const entry of list.getEntries()) {
                window.webVitals.lcp = entry.startTime
                window.webVitals.element = entry.element?.tagName
                window.webVitals.role = entry.element?.getAttribute('role')
              }
            }).observe({ type: 'largest-contentful-paint', buffered: true })
            let sessionStart = 0
            let sessionEnd = 0
            let sessionValue = 0
            new PerformanceObserver((list) => {
              for (const entry of list.getEntries()) {
                if (entry.hadRecentInput) continue
                if (entry.startTime - sessionEnd > 1000 || entry.startTime - sessionStart > 5000) {
                  sessionStart = entry.startTime
                  sessionValue = 0
                }
                sessionEnd = entry.startTime
                sessionValue += entry.value
                window.webVitals.cls = Math.max(window.webVitals.cls, sessionValue)
              }
            }).observe({ type: 'layout-shift', buffered: true })
          })
          const cdp = await context.newCDPSession(page)
          await cdp.send('Emulation.setCPUThrottlingRate', { rate: width === 390 ? 4 : 1 })
          await cdp.send('Network.emulateNetworkConditions', {
            offline: false, latency: 40,
            downloadThroughput: 1.6 * 1024 * 1024 / 8,
            uploadThroughput: 750 * 1024 / 8
          })
          await page.goto(new URL(path, base).href, { waitUntil: 'networkidle' })
          await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
          await page.waitForFunction(() => window.webVitals.lcp > 0)
          await page.waitForTimeout(500)
          const metrics = await page.evaluate(() => ({
            ...window.webVitals,
            overflow: document.documentElement.scrollWidth > innerWidth + 1,
            prerenderPreserved: window.prerenderedHeading === document.querySelector('#root h1')
          }))
          const jsGzip = (await Promise.all(scripts.values())).reduce((total, size) => total + size, 0)
          measurements.push({ ...metrics, jsGzip })
          assert.deepEqual(errors, [], `Runtime errors on ${path}`)
          if (!reportOnly) {
            assert.equal(requests.some((url) => new URL(url).hostname === 'cdn.tailwindcss.com'), false, 'Tailwind must be compiled at build time')
            assert.equal(requests.filter((url) => url.startsWith('https://www.googletagmanager.com/gtm.js')).length, 1, 'Load GTM once')
            assert.equal(metrics.overflow, false, `Horizontal overflow on ${path}`)
            assert.notEqual(metrics.role, 'status', 'Measure page content, not the loading fallback')
            if (path === '/blog/') assert.equal(metrics.prerenderPreserved, true, 'Hydration must preserve the prerendered heading')
            assert.ok(metrics.cls <= 0.1, `CLS ${metrics.cls} exceeds 0.1 on ${path}`)
            assert.ok(jsGzip < 180 * 1024, `Initial JS ${jsGzip} exceeds 180 KiB on ${path}`)
          }
        } finally {
          await context.close()
        }
      }
      const lcp = measurements.map((measurement) => measurement.lcp).sort((a, b) => a - b)[1]
      const cls = Math.max(...measurements.map((measurement) => measurement.cls))
      const js = Math.max(...measurements.map((measurement) => measurement.jsGzip))
      console.log(`${width}px ${path}: median LCP ${Math.round(lcp)} ms; max CLS ${cls.toFixed(3)}; JS gzip ${(js / 1024).toFixed(1)} KiB`)
      if (lcp > 2500) failures.push(`${width}px ${path}: LCP ${Math.round(lcp)} ms exceeds 2500 ms`)
    }
  }
  if (!reportOnly) assert.deepEqual(failures, [], 'LCP budget exceeded')
} finally {
  await browser.close()
  await new Promise((resolve, reject) => server.httpServer.close((error) => error ? reject(error) : resolve()))
}
