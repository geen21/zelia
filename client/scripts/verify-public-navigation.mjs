import assert from 'node:assert/strict'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium, expect as baseExpect } from '@playwright/test'
import { blogPosts } from '../src/pages/blog/posts.js'
import { assertSharedUX } from './fixtures/assert-shared-ux.mjs'

const expect = baseExpect.configure({ timeout: 15000 })
const base = process.env.PUBLIC_NAV_TEST_URL || 'http://127.0.0.1:5187'
const origin = new URL(base).origin
const paths = ['/', '/parents', '/blog', `/blog/${blogPosts[0].slug}`, '/blog/choisir-ses-etudes-sans-pression', '/formations', '/formations/123-navigation-test', '/metiers/', '/legal/mentions-legales', '/legal/conditions']
const output = await mkdtemp(join(tmpdir(), 'zelia-public-nav-'))
const browser = await chromium.launch({ headless: true })
console.log(`Navigation screenshots: ${output}`)

async function signature(page) {
  const header = page.locator('.public-header:visible')
  await expect(header).toHaveCount(1)
  await page.evaluate(() => document.fonts.ready)
  await page.mouse.move(0, 0)
  return header.evaluate((header) => {
    const appearance = (element) => {
      const style = getComputedStyle(element)
      const box = element.getBoundingClientRect()
      return {
        width: box.width, height: box.height,
        color: style.color, background: style.backgroundColor,
        font: style.fontFamily, size: style.fontSize, weight: style.fontWeight,
        lineHeight: style.lineHeight, padding: style.padding,
        border: style.border, radius: style.borderRadius, shadow: style.boxShadow
      }
    }
    return {
      header: appearance(header),
      nav: appearance(header.querySelector('nav')),
      logo: appearance(header.querySelector('img')),
      links: [...header.querySelectorAll('.public-header__links > a')].map((link) => ({
        text: link.textContent.trim(), href: link.getAttribute('href'), appearance: appearance(link)
      })),
      toggle: appearance(header.querySelector('button')),
      footer: appearance(document.querySelector('.public-footer')),
      footerLinks: [...document.querySelectorAll('.public-footer a')].map((link) => ({
        text: link.textContent.trim(), href: link.getAttribute('href'), appearance: appearance(link)
      }))
    }
  })
}

async function assertBounds(page) {
  await assertSharedUX(page)
  const issues = await page.locator('.public-header').evaluate((header) => {
    const problems = []
    if (document.documentElement.scrollWidth > innerWidth + 1) problems.push('Document overflow')
    for (const element of header.querySelectorAll('nav, img, a, button, .public-header__links')) {
      const rect = element.getBoundingClientRect()
      if (!rect.width || !rect.height) continue
      if (rect.left < -1 || rect.right > innerWidth + 1) problems.push(`Off-screen: ${element.className}`)
      if (element.scrollWidth > element.clientWidth + 1) problems.push(`Clipped: ${element.className}`)
    }
    return problems
  })
  assert.deepEqual(issues, [])
}

try {
  for (const width of [1440, 1024, 768, 390, 320]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 }, reducedMotion: 'reduce' })
    const page = await context.newPage()
    page.setDefaultTimeout(15000)
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    await context.route('**/*', (route) => {
      const url = new URL(route.request().url())
      if (url.hostname === 'cdn.tailwindcss.com') return route.fulfill({ contentType: 'application/javascript', body: 'window.tailwind = {}' })
      if (url.hostname === 'api.dicebear.com') return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="560" height="560"/>' })
      if (url.origin === origin && url.pathname === '/api/payments/parent-training/config') {
        return route.fulfill({ json: { enabled: true, priceAmount: 2500, priceCurrency: 'eur' } })
      }
      if (url.origin === origin && url.pathname === '/api/formations') return route.fulfill({ json: { formations: [], total: 0 } })
      if (url.origin === origin && /^\/api\/formations\/[^/]+$/.test(url.pathname)) return route.fulfill({ status: 404, json: { error: 'Formation fixture absente' } })
      if (url.origin === origin && url.pathname.startsWith('/api/')) {
        errors.push(`Unexpected navigation fixture request: ${route.request().method()} ${url.pathname}`)
        return route.fulfill({ status: 404, json: { error: 'Unexpected fixture request' } })
      }
      if (url.origin === origin && url.pathname.startsWith('/metiers/') && url.pathname.endsWith('.json')) {
        return route.fulfill({ status: 404, json: { error: 'Catalogue fixture absent' } })
      }
      if (url.origin === origin) return route.continue()
      return route.abort()
    })
    try {
      let reference
      for (const path of paths) {
        await page.goto(`${base}${path}`, { waitUntil: 'domcontentloaded' })
        const nav = page.getByRole('navigation', { name: 'Navigation principale', exact: true })
        await expect(nav).toHaveCount(1)
        const expectedLinks = [
          ['Ambassadeur', '/espace-ecoles'], ['Parents', '/parents'], ['Le blog', '/blog']
        ]
        const hasMetiers = await nav.locator('a[href="/metiers/"]').count() > 0
        if (process.env.VITE_METIER_PAGES_ENABLED !== undefined) assert.equal(hasMetiers, process.env.VITE_METIER_PAGES_ENABLED === 'true')
        if (hasMetiers) expectedLinks.push(['Métiers', '/metiers/'])
        expectedLinks.push(['Me connecter', '/login'], ['Me découvrir', '/orientation'])
        const links = nav.locator('.public-header__links > a')
        assert.deepEqual(await links.evaluateAll((elements) => elements.map((link) => [link.textContent.trim(), link.getAttribute('href')])), expectedLinks)
        await expect(nav.getByRole('link', { name: 'Accueil Zélia', exact: true })).toHaveAttribute('href', '/')
        const current = await signature(page)
        if (!reference) reference = current
        else assert.deepEqual(current, reference, `The menu must look identical on ${path} at ${width}px.`)
        const toggle = nav.getByRole('button')
        if (width <= 900) {
          await expect(toggle).toHaveAttribute('aria-controls', 'public-header-menu')
          await expect(toggle).toHaveAttribute('aria-expanded', 'false')
          await expect(nav.getByRole('link', { name: 'Parents', exact: true })).toBeHidden()
          await toggle.focus()
          await toggle.press('Enter')
          await expect(toggle).toHaveAttribute('aria-expanded', 'true')
          for (const [name] of expectedLinks) await expect(nav.getByRole('link', { name, exact: true })).toBeVisible()
          await assertBounds(page)
          await toggle.press('Tab')
          await expect(nav.getByRole('link', { name: 'Ambassadeur', exact: true })).toBeFocused()
          await page.keyboard.press('Escape')
          await expect(toggle).toHaveAttribute('aria-expanded', 'false')
          await expect(toggle).toBeFocused()
          await expect(toggle).toHaveCSS('outline-color', 'rgb(109, 40, 217)')
          await expect(toggle).toHaveCSS('outline-offset', '5px')
        } else {
          await expect(toggle).toBeHidden()
          for (const [name] of expectedLinks) await expect(nav.getByRole('link', { name, exact: true })).toBeVisible()
        }
        await assertBounds(page)
        await expect(nav.locator('.public-header__cta')).toHaveCSS('transition-duration', '0s')
        if ([1440, 390].includes(width) && ['/', '/parents', '/blog'].includes(path)) {
          await page.screenshot({ path: join(output, `navigation-${path.slice(1) || 'home'}-${width}.png`) })
        }
        console.log(`OK shared menu ${width}px ${path}`)
      }
      for (const [name, path] of [['Parents', '/parents'], ['Le blog', '/blog'], ['Accueil Zélia', '/']]) {
        const nav = page.getByRole('navigation', { name: 'Navigation principale', exact: true })
        if (width <= 900 && path !== '/') await nav.getByRole('button', { name: 'Ouvrir le menu' }).click()
        await nav.getByRole('link', { name, exact: true }).click()
        await expect(page).toHaveURL(`${base}${path}`)
        if (width <= 900) await expect(page.getByRole('button', { name: 'Ouvrir le menu' })).toHaveAttribute('aria-expanded', 'false')
        assert.deepEqual(await signature(page), reference, 'Client-side navigation must preserve the shared menu.')
      }
      assert.deepEqual(errors, [])
      const nav = page.getByRole('navigation', { name: 'Navigation principale', exact: true })
      if (width <= 900) await nav.getByRole('button', { name: 'Ouvrir le menu' }).click()
      await nav.getByRole('link', { name: 'Ambassadeur', exact: true }).click()
      await expect(page).toHaveURL(`${base}/espace-ecoles`)
      await expect(page.locator('.zelia-ui, .public-footer')).toHaveCount(0)
    } finally {
      await context.close()
    }
  }
  console.log('Public navigation verified: identical links, appearance, responsive menu and keyboard behavior.')
} finally {
  await browser.close()
}
