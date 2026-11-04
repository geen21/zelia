import assert from 'node:assert/strict'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium, expect as baseExpect } from '@playwright/test'
import { assertSharedUX } from './fixtures/assert-shared-ux.mjs'

const expect = baseExpect.configure({ timeout: 15000 })
const base = process.env.DASHBOARD_TEST_URL || 'http://127.0.0.1:5187'
const origin = new URL(base).origin
const output = await mkdtemp(join(tmpdir(), 'zelia-dashboard-'))
const browser = await chromium.launch({ headless: true })
const avatar = '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" rx="20" fill="#c1ff72"/></svg>'
const user = { id: 'dashboard-fixture', email: 'dashboard@example.com' }
const profile = { ...user, first_name: 'Camille', avatar_url: `${base}/dashboard-fixture-avatar.svg` }
const responses = new Map([
  ['/users/me', { user }],
  ['/users/profile', { profile }],
  ['/users/profile/extra-info', { entries: [] }],
  ['/analysis/my-results', { results: { personalityType: 'Explorateur', personalityAnalysis: 'Un profil curieux.', jobRecommendations: [{ title: 'Designer' }] } }]
])

async function assertDashboardLayout(page, width) {
  await assertSharedUX(page)
  const issues = await page.evaluate(() => {
    const problems = []
    for (const selector of ['.dash-greeting', '.dash-chat-cta']) {
      const card = document.querySelector(selector)
      const box = card.getBoundingClientRect()
      const style = getComputedStyle(card)
      const left = box.left + parseFloat(style.paddingLeft) + parseFloat(style.borderLeftWidth)
      const right = box.right - parseFloat(style.paddingRight) - parseFloat(style.borderRightWidth)
      for (const element of card.querySelectorAll('.dash-greeting-row, .dash-pill-nav, .dash-pill, .dash-pill span, img, .dash-chat-cta-text, h2, .dash-chat-cta-btn')) {
        const rect = element.getBoundingClientRect()
        if (!rect.width || !rect.height) continue
        if (rect.left < left - 1 || rect.right > right + 1) problems.push(`Outside card padding: ${element.className || element.tagName}`)
        if (element.scrollWidth > element.clientWidth + 1) problems.push(`Clipped content: ${element.className || element.tagName}`)
      }
    }
    const title = getComputedStyle(document.querySelector('.dash-chat-cta h2'))
    if (parseFloat(title.lineHeight) < parseFloat(title.fontSize) * 1.35) problems.push('Chat title line height')
    if (innerWidth <= 640) {
      for (const link of document.querySelectorAll('.dash-pill')) {
        if (link.getBoundingClientRect().height < 60) problems.push('Quick link touch target')
        const label = link.querySelector('span')
        if (label.getBoundingClientRect().height > parseFloat(getComputedStyle(label).lineHeight) + 1) problems.push('Quick link label must fit on one line')
      }
    }
    return problems
  })
  assert.deepEqual(issues, [], `Dashboard layout at ${width}px`)
  const hint = page.locator('.dash-chat-cta-btn')
  if (width <= 640) await expect(hint).toBeHidden()
  else await expect(hint).toBeVisible()
}

try {
  for (const width of [320, 360, 390, 439, 640, 641, 768, 1023, 1024, 1440, 1920, 2560]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' })
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    await context.addInitScript(() => {
      localStorage.setItem('token', 'dashboard-fixture-token')
      window.tailwind = { config: {} }
    })
    await context.route('**/*', (route) => {
      const url = new URL(route.request().url())
      if (url.pathname === '/dashboard-fixture-avatar.svg' || url.hostname === 'api.dicebear.com') return route.fulfill({ contentType: 'image/svg+xml', body: avatar })
      if (url.pathname.endsWith('/auth/v1/user')) return route.fulfill({ json: user })
      if (url.pathname.includes('/api/')) {
        const path = url.pathname.replace(/^.*\/api/, '')
        if (route.request().method() === 'GET' && responses.has(path)) return route.fulfill({ json: responses.get(path) })
        errors.push(`Unexpected dashboard fixture request: ${route.request().method()} ${path}`)
        return route.fulfill({ status: 404, json: { error: 'Unexpected fixture request' } })
      }
      if (url.origin === origin) return route.continue()
      return route.abort()
    })
    try {
      await page.goto(`${base}/app`, { waitUntil: 'domcontentloaded' })
      await expect(page.locator('.dash-greeting-text h1')).toHaveText('Salut Camille !')
      await page.evaluate(() => document.fonts.ready)
      const nav = page.getByRole('navigation', { name: 'Navigation rapide', exact: true })
      assert.deepEqual(await nav.locator('a').evaluateAll((links) => links.map((link) => [link.textContent.trim(), link.getAttribute('href')])), [
        ['Outils', '/app/outils'], ['Formations', '/app/formations'], ['Résultats', '/app/results']
      ])
      await expect(page.locator('.dash-chat-cta')).toHaveAttribute('href', '/app/discuter')
      await assertDashboardLayout(page, width)
      await page.screenshot({ path: join(output, `dashboard-${width}.png`) })
      assert.deepEqual(errors, [])
      console.log(`Dashboard ${width}px: quick links, chat card, text bounds and responsive CTA verified.`)
    } finally {
      await context.close()
    }
  }
  console.log(`Dashboard screenshots: ${output}`)
} finally {
  await browser.close()
}
