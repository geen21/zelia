import assert from 'node:assert/strict'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium, expect as baseExpect } from '@playwright/test'
import { blogPosts } from '../src/pages/blog/posts.js'

const expect = baseExpect.configure({ timeout: 15000 })
const base = process.env.LANDING_TEST_URL || 'http://127.0.0.1:5187'
const origin = new URL(base).origin
const originalOrder = blogPosts.map((post) => post.slug)
const latestPosts = [...blogPosts].sort((a, b) => new Date(b.dateIso) - new Date(a.dateIso)).slice(0, 3)
const output = await mkdtemp(join(tmpdir(), 'zelia-landing-'))
console.log(`Landing screenshots: ${output}`)
const browser = await chromium.launch({ headless: true })
const user = { id: 'landing-fixture', email: 'landing@example.com', user_metadata: {} }
const avatarUrl = 'https://api.dicebear.com/9.x/lorelei/svg?seed=zelia&size=560&radius=15'

async function prepare(width, storageKey) {
  const context = await browser.newContext({
    viewport: { width, height: width <= 390 ? 844 : 1000 },
    reducedMotion: width === 320 ? 'reduce' : 'no-preference'
  })
  const page = await context.newPage()
  page.setDefaultTimeout(15000)
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await context.addInitScript(({ origin, storageKey }) => {
    if (location.origin !== origin || window !== window.top) return
    window.tailwind = { config: {} }
    if (storageKey) localStorage.setItem(storageKey, 'landing-fixture-token')
    window.landingShares = { copied: [], native: [], prompts: [], failure: false, cancel: false }
    Object.defineProperty(navigator, 'share', { configurable: true, value: undefined })
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (text) => {
          if (window.landingShares.failure) throw new Error('Clipboard fixture failure')
          window.landingShares.copied.push(text)
        }
      }
    })
    window.prompt = (message, value) => {
      window.landingShares.prompts.push({ message, value })
      return value
    }
  }, { origin, storageKey })
  await context.route('**/*', (route) => {
    const url = new URL(route.request().url())
    if (url.hostname === 'cdn.tailwindcss.com') {
      return route.fulfill({ contentType: 'application/javascript', body: 'window.tailwind = { config: {} }' })
    }
    if (url.pathname.includes('/auth/v1/')) return route.fulfill({ json: user })
    if (url.href === avatarUrl) {
      return route.fulfill({
        contentType: 'image/svg+xml',
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="560" height="560" viewBox="0 0 560 560"><circle cx="280" cy="280" r="220" fill="#ddd"/><circle cx="210" cy="250" r="20"/><circle cx="350" cy="250" r="20"/><path d="M200 340q80 70 160 0" fill="none" stroke="#15151b" stroke-width="12"/></svg>'
      })
    }
    // Test the landing's destinations without running their onboarding or payment flows.
    if (url.origin === origin && /\/src\/pages\/(?:Login|Questionnaire|ParentsFormation|ConversationalHome|AuthCallback|school-portal\/SchoolPortalHome)\.jsx$/.test(url.pathname)) {
      return route.fulfill({ contentType: 'application/javascript', body: "export default function LandingDestination() { return 'Destination landing simulée' }" })
    }
    if (url.origin === origin && url.pathname.startsWith('/api/')) {
      if (url.pathname === '/api/users/me') return route.fulfill({ json: { user } })
      if (url.pathname === '/api/users/profile') return route.fulfill({ json: { profile: user } })
      errors.push(`Unexpected landing fixture request: ${route.request().method()} ${url.pathname}`)
      return route.fulfill({ status: 404, json: { error: 'Unexpected fixture request' } })
    }
    if (url.origin === origin) return route.continue()
    return route.abort()
  })
  return { context, page, errors }
}

async function assertLayout(page) {
  await page.evaluate(() => document.fonts.ready)
  const issues = await page.evaluate(() => {
    const problems = []
    if (document.documentElement.scrollWidth > innerWidth + 1) problems.push('Document overflow')
    for (const element of document.querySelectorAll(
      '.public-header__nav, .zelia-home-hero-content, .zelia-home-avatar-frame, ' +
      '.zelia-home-step-card, .zelia-home-pillar-card, .zelia-home-blog-card, ' +
      '.zelia-home-audience-card, .zelia-home-faq-item, .zelia-home-button'
    )) {
      const rect = element.getBoundingClientRect()
      if (!rect.width || !rect.height) continue
      if (rect.left < -1 || rect.right > innerWidth + 1) problems.push(`Off-screen: ${element.className}`)
      if (element.scrollWidth > element.clientWidth + 1) problems.push(`Clipped: ${element.className}`)
    }
    for (const heading of document.querySelectorAll('.zelia-home h1, .zelia-home h2, .zelia-home h3')) {
      if (getComputedStyle(heading).textTransform !== 'none') problems.push(`Heading case: ${heading.textContent}`)
    }
    const content = document.querySelector('.zelia-home-hero-content').getBoundingClientRect()
    const art = document.querySelector('.zelia-home-avatar-scene').getBoundingClientRect()
    if (content.right > art.left && art.right > content.left && content.bottom > art.top && art.bottom > content.top) problems.push('Hero overlap')
    return problems
  })
  assert.deepEqual(issues, [])
}

async function verifySharing(page) {
  const share = page.getByRole('button', { name: 'Partager à un.e proche', exact: true })
  await share.click()
  await expect(page.getByRole('status')).toHaveText('Lien copié ! À toi de le partager.')
  const copied = await page.evaluate(() => window.landingShares.copied)
  assert.equal(copied.length, 1)
  assert.ok(copied[0].includes(`${base}/`))

  await page.evaluate(() => { window.landingShares.failure = true })
  await share.click()
  await expect(page.getByRole('status')).toContainText("Le partage n'a pas fonctionné")
  await page.evaluate(() => {
    window.landingShares.failure = false
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: async (data) => {
        if (window.landingShares.cancel) throw new DOMException('Cancelled', 'AbortError')
        window.landingShares.native.push(data)
      }
    })
  })
  await share.click()
  await expect(page.getByRole('status')).toHaveText('Merci de faire découvrir Zélia !')
  assert.equal(await page.evaluate(() => window.landingShares.native[0].url), `${base}/`)
  await page.evaluate(() => { window.landingShares.cancel = true })
  await share.click()
  await expect(page.getByRole('status')).toBeEmpty()
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'share', { configurable: true, value: undefined })
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined })
  })
  await share.click()
  const prompts = await page.evaluate(() => window.landingShares.prompts)
  assert.equal(prompts.length, 1)
  assert.equal(prompts[0].value, `${base}/`)
}

try {
  for (const width of [1440, 1000, 768, 390, 320]) {
    const { context, page, errors } = await prepare(width)
    try {
      await page.goto(`${base}/`, { waitUntil: 'domcontentloaded' })
      // Avoid legacy smooth scrolling racing keyboard focus and screenshot capture.
      await page.evaluate(() => { document.documentElement.style.scrollBehavior = 'auto' })
      await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
      await expect(page.getByRole('heading', { level: 1 })).toHaveText("L'expérience ultime des 15-20 ans pour apprendre à se connaître et préparer sereinement son futur.")
      await expect(page.getByText("L'orientation, à ton rythme", { exact: true })).toHaveCount(0)
      await expect(page.locator('.zelia-home-lead')).toHaveText('On découvre ensemble qui tu es et quelles formations sont faites pour toi !')
      const avatar = page.getByRole('img', { name: 'Avatar Zélia', exact: true })
      await expect(avatar).toBeVisible()
      await expect(avatar).toHaveAttribute('src', avatarUrl)
      await expect(avatar).toHaveAttribute('loading', 'eager')
      await expect(avatar).toHaveCSS('opacity', '1')
      await expect.poll(() => avatar.evaluate((image) => image.complete && image.naturalWidth > 0)).toBe(true)
      const avatarBounds = await avatar.boundingBox()
      assert.ok(avatarBounds.width >= 160 && avatarBounds.height >= 160, 'The Zelia avatar must be prominent, not a thumbnail.')
      if (width <= 600) await expect(avatar).toBeInViewport()
      await expect(page).toHaveTitle('Zelia - Trouve ton orientation scolaire et professionnelle')
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://zelia.io/')
      await expect(page.locator('.zelia-home')).toHaveCSS('background-color', 'rgb(255, 251, 247)')
      await expect(page.locator('.zelia-home-hero')).toHaveCSS('background-color', 'rgb(246, 143, 255)')
      await expect(page.locator('.zelia-home-pillars')).toHaveCSS('background-color', 'rgb(193, 255, 114)')
      await expect(page.locator('.zelia-home-actions .zelia-home-button--primary')).toHaveCSS('background-color', 'rgb(193, 255, 114)')
      await expect(page.locator('.zelia-home-proof')).toHaveText('5 minutes20 questions originales100% gratuit')
      await expect(page.locator('.zelia-home-steps h2')).toHaveText('Comment ça marche')
      await expect(page.locator('.zelia-home-steps-grid h3')).toHaveText([
        'Réponds à 20 questions', 'Découvre ton profil', 'Reçois des formations qui matchent', 'Contacte les écoles en un clic'
      ])
      await expect(page.locator('.zelia-home-pillars h2')).toHaveText('Pourquoi Zélia')
      await expect(page.locator('.zelia-home-pillars-grid h3')).toHaveText([
        '100% gratuit pour les élèves', 'De vraies écoles partenaires', 'Tes données, ton choix', 'Un profil qui te ressemble'
      ])
      await expect(page.locator('.zelia-home-audiences h2')).toHaveText([
        'Devenez le meilleur allié orientation de votre enfant', 'Vous êtes une école ou un centre de formation ?'
      ])
      await expect(page.locator('.zelia-home-faq h2')).toHaveText('Questions fréquentes')
      const blogLinks = page.locator('.zelia-home-blog-card > a')
      await expect(blogLinks).toHaveCount(latestPosts.length)
      for (const [index, post] of latestPosts.entries()) {
        await expect(blogLinks.nth(index)).toHaveAccessibleName(post.title)
        await expect(blogLinks.nth(index)).toHaveAttribute('href', `/blog/${post.slug}`)
        await expect(blogLinks.nth(index)).toContainText(post.readingTime)
        await expect(blogLinks.nth(index)).toContainText(post.category)
      }
      const sourceOrder = await page.evaluate(async () => {
        const { blogPosts } = await import('/src/pages/blog/posts.js')
        return blogPosts.map((post) => post.slug)
      })
      assert.deepEqual(sourceOrder, originalOrder, 'The landing must not reorder the blog catalogue.')
      await expect(page.locator('.zelia-home-footer').getByRole('link', { name: 'Le blog', exact: true })).toHaveAttribute('href', '/blog')
      await expect(page.locator('.zelia-home-actions').getByRole('link', { name: 'Commencer !', exact: true })).toHaveAttribute('href', '/orientation')
      await expect(page.locator('.zelia-home-pillars').getByRole('link', { name: 'Commencer !', exact: true })).toHaveAttribute('href', '/orientation')
      await expect(page.getByRole('link', { name: 'Découvrir la formation', exact: true })).toHaveAttribute('href', '/parents')
      await expect(page.locator('.zelia-home-audiences').getByRole('link', { name: 'Devenir partenaire' })).toHaveAttribute('href', '/espace-ecoles')
      await expect(page.getByRole('link', { name: 'Mentions légales', exact: true })).toHaveAttribute('href', '/legal/mentions-legales')
      await expect(page.getByRole('link', { name: 'CGU, CGV & confidentialité', exact: true })).toHaveAttribute('href', '/legal/conditions')
      const nav = page.getByRole('navigation', { name: 'Navigation principale' })
      if (process.env.VITE_METIER_PAGES_ENABLED !== undefined) {
        await expect(nav.getByRole('link', { name: 'Métiers', exact: true, includeHidden: true })).toHaveCount(process.env.VITE_METIER_PAGES_ENABLED === 'true' ? 1 : 0)
      }
      const toggle = nav.getByRole('button')
      if (width <= 900) {
        await expect(nav.getByRole('link', { name: 'Le blog', exact: true })).toBeHidden()
        await expect(toggle).toHaveAttribute('aria-expanded', 'false')
        await toggle.click()
        await expect(toggle).toHaveAttribute('aria-expanded', 'true')
        await expect(nav.getByRole('link', { name: 'Le blog', exact: true })).toBeVisible()
        await toggle.press('Escape')
        await expect(toggle).toHaveAttribute('aria-expanded', 'false')
        await expect(toggle).toBeFocused()
        await toggle.click()
        await assertLayout(page)
      } else {
        await expect(toggle).toBeHidden()
      }
      await expect(nav.getByRole('link', { name: 'Me connecter', exact: true })).toHaveAttribute('href', '/login')
      await nav.getByRole('link', { name: 'Le blog', exact: true }).click()
      await expect(page).toHaveURL(`${base}/blog`)
      await expect(page.getByRole('heading', { level: 1 })).toContainText('Les coulisses')
      await page.goBack()
      if (width <= 900) await expect(page.getByRole('button', { name: 'Ouvrir le menu' })).toHaveAttribute('aria-expanded', 'false')
      await page.locator('.zelia-home-blog-card > a').first().click()
      await expect(page).toHaveURL(`${base}/blog/${latestPosts[0].slug}`)
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(latestPosts[0].title)
      await page.goBack()
      await page.getByRole('link', { name: 'Voir tous les articles', exact: true }).click()
      await expect(page).toHaveURL(`${base}/blog`)
      await page.goBack()
      const summary = page.locator('.zelia-home-faq-item summary').first()
      await summary.focus()
      await summary.press('Enter')
      await expect(page.locator('.zelia-home-faq-item').first()).toHaveAttribute('open', '')
      await expect(page.locator('.zelia-home-faq-item').first().locator('p')).toBeVisible()
      await expect(summary).toHaveCSS('outline-style', 'solid')
      await summary.press('Space')
      await expect(page.locator('.zelia-home-faq-item').first()).not.toHaveAttribute('open')
      await assertLayout(page)
      if (width === 320) {
        await expect(page.locator('.zelia-home-blog-card').first()).toHaveCSS('transition-duration', '0s')
        await expect(page.locator('.zelia-home-button').first()).toHaveCSS('transition-duration', '0s')
      }
      await page.evaluate(() => {
        document.activeElement?.blur()
        window.scrollTo({ top: 0, behavior: 'instant' })
      })
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0)
      await expect(nav).toBeInViewport({ ratio: 1 })
      await page.screenshot({ path: join(output, `landing-${width}.png`) })
      await expect(nav).toBeInViewport({ ratio: 1 })
      if (width === 1440 || width === 320) {
        await page.locator('.zelia-home-blog').screenshot({ path: join(output, `landing-blog-${width}.png`) })
      }
      if (width === 1440) {
        await verifySharing(page)
        for (const [selector, path] of [
          ['.zelia-home-actions a', '/orientation'],
          ['.public-header__nav a[href="/login"]', '/login'],
          ['.zelia-home-audiences a[href="/parents"]', '/parents'],
          ['.zelia-home-audiences a[href="/espace-ecoles"]', '/espace-ecoles']
        ]) {
          await page.locator(selector).click()
          await expect(page).toHaveURL(`${base}${path}`)
          await expect(page.getByText('Destination landing simulée', { exact: true })).toBeVisible()
          await page.goBack()
        }
      }
      assert.deepEqual(errors, [])
      console.log(`OK landing ${width}px: layout, blog links, latest posts, keyboard and navigation`)
    } finally {
      await context.close()
    }
  }

  for (const storageKey of ['supabase_auth_token', 'token']) {
    const { context, page } = await prepare(390, storageKey)
    try {
      await page.goto(`${base}/`, { waitUntil: 'domcontentloaded' })
      await expect(page).toHaveURL(`${base}/app`)
      console.log(`OK landing authenticated redirect (${storageKey})`)
    } finally {
      await context.close()
    }
  }
  const { context, page } = await prepare(390)
  try {
    const hash = '#access_token=landing-fixture-token&refresh_token=landing-fixture-refresh'
    await page.goto(`${base}/${hash}`, { waitUntil: 'domcontentloaded' })
    await expect(page).toHaveURL(`${base}/auth/callback${hash}`)
    await expect(page.getByText('Destination landing simulée', { exact: true })).toBeVisible()
    console.log('OK landing auth callback preserves the token hash')
  } finally {
    await context.close()
  }
  console.log(`Landing verification passed. Screenshots: ${output}`)
} finally {
  await browser.close()
}
