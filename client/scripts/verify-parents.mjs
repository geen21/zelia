import assert from 'node:assert/strict'
import { chromium, expect } from '@playwright/test'
import { assertSharedUX } from './fixtures/assert-shared-ux.mjs'

const base = process.env.PARENTS_TEST_URL || 'http://127.0.0.1:5191'
const browser = await chromium.launch({ headless: true })
const videoUrl = 'https://www.youtube.com/embed/__cJzw_RYnM?si=pdYeNzrpT6uN0tOO'
const bookingNote = "Le choix du créneau d'une heure se fait juste après le règlement."
const checkoutPath = '/__parent-checkout-test'

async function prepare(viewport, options = {}) {
  const context = await browser.newContext({ viewport, reducedMotion: options.reducedMotion || 'no-preference' })
  const page = await context.newPage()
  page.setDefaultTimeout(15000)
  const state = {
    enabled: true,
    priceAmount: 2500,
    paid: true,
    checkoutError: null,
    verificationError: null,
    checkoutRequests: [],
    verificationRequests: [],
    scriptErrors: [],
    ...options
  }
  page.on('pageerror', (error) => state.scriptErrors.push(error.message))
  await context.route('**/*', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const reply = (data, status = 200) => route.fulfill({
      status, contentType: 'application/json', body: JSON.stringify(data)
    })
    if (url.pathname.endsWith('/payments/parent-training/config')) {
      if (state.configDelay) await new Promise((resolve) => setTimeout(resolve, state.configDelay))
      return reply({ enabled: state.enabled, priceAmount: state.priceAmount, priceCurrency: 'eur' })
    }
    if (url.pathname.endsWith('/payments/parent-training/checkout')) {
      state.checkoutRequests.push(request.postDataJSON())
      return state.checkoutError
        ? reply({ error: state.checkoutError }, 503)
        : reply({ url: `${base}${checkoutPath}` })
    }
    if (url.pathname.endsWith('/payments/parent-training/verify')) {
      state.verificationRequests.push(request.postDataJSON())
      return state.verificationError
        ? reply({ error: state.verificationError }, 503)
        : reply({ paid: state.paid })
    }
    if (url.pathname === checkoutPath) {
      return route.fulfill({ contentType: 'text/html', body: '<h1>Checkout fixture</h1>' })
    }
    if (url.href === videoUrl) {
      return route.fulfill({ contentType: 'text/html', body: '<body>Video fixture</body>' })
    }
    if (url.href === 'https://assets.calendly.com/assets/external/widget.js') {
      return route.fulfill({ contentType: 'application/javascript', body: '' })
    }
    if (url.hostname === 'cdn.tailwindcss.com') {
      return route.fulfill({ contentType: 'application/javascript', body: 'window.tailwind = {}' })
    }
    if (url.origin === new URL(base).origin && !url.pathname.startsWith('/api/')) {
      return route.continue()
    }
    return route.abort()
  })
  return { context, page, state }
}

async function verifyLayout(page) {
  await assertSharedUX(page)
  const problems = await page.evaluate(() => {
    const root = document.querySelector('.parents-landing')
    const issues = root.scrollWidth > root.clientWidth + 1 ? ['Landing overflow'] : []
    for (const element of document.querySelectorAll(
      '.public-header, .parents-hero, .parents-hero-cta, .parents-video iframe, .parents-module-card, .parents-situation-card, ' +
      '.parents-cta-block .primary-action, .parents-pricing-card, .identity-form-grid input, ' +
      '.parents-confirmation, .calendly-inline-widget'
    )) {
      const rect = element.getBoundingClientRect()
      if (rect.left < -1 || rect.right > innerWidth + 1) issues.push(element.className || element.tagName)
    }
    return issues
  })
  assert.deepEqual(problems, [])
  const bounds = await page.locator('.parents-video iframe').boundingBox()
  assert.ok(bounds && Math.abs(bounds.width / bounds.height - 16 / 9) < 0.01)
  // Read every box in one frame, including during the post-payment smooth scroll.
  const { heroCopy, heroMedia, boxes, details, form } = await page.evaluate(() => {
    const box = (element) => {
      if (!element) return null
      const rect = element.getBoundingClientRect()
      return { x: rect.left, y: rect.top + scrollY, width: rect.width, height: rect.height }
    }
    return {
      heroCopy: box(document.querySelector('.parents-hero-copy')),
      heroMedia: box(document.querySelector('.parents-hero-media')),
      boxes: [...document.querySelectorAll('.parents-module-card')].map(box),
      details: box(document.querySelector('.parents-registration-details')),
      form: box(document.querySelector('.parents-pricing-card'))
    }
  })
  assert.ok(heroCopy && heroMedia)
  if (page.viewportSize().width > 1000) {
    assert.ok(heroMedia.x >= heroCopy.x + heroCopy.width, 'Desktop video must sit beside the introduction')
    assert.ok(heroMedia.y < page.viewportSize().height, 'Desktop video must be visible in the first viewport')
    assert.ok(boxes.every((box) => box && Math.abs(box.y - boxes[0].y) < 1), 'Desktop modules must share a row')
    if (form) {
      assert.ok(details && form && form.x >= details.x + details.width, 'Desktop registration must have a separate form column')
    }
  } else {
    assert.ok(heroMedia.y >= heroCopy.y + heroCopy.height, 'Mobile/tablet video must follow the introduction')
    assert.ok(boxes.every((box, index) => box && (!index || box.y >= boxes[index - 1].y + boxes[index - 1].height)),
      'Mobile/tablet modules must stack without overlap')
  }
}

async function verifyInscriptionScroll(page) {
  try {
    await expect.poll(() => page.evaluate(() => {
      const top = document.getElementById('inscription').getBoundingClientRect().top
      const headerBottom = document.querySelector('.public-header').getBoundingClientRect().bottom
      const target = parseFloat(getComputedStyle(document.getElementById('inscription')).scrollMarginTop)
      return top >= headerBottom - 1 && Math.abs(top - target) < 1
    })).toBe(true)
  } catch (error) {
    console.error('Inscription scroll position:', await page.evaluate(() => ({
      url: location.href, width: innerWidth, height: innerHeight, scrollY,
      top: document.getElementById('inscription').getBoundingClientRect().top,
      headerBottom: document.querySelector('.public-header').getBoundingClientRect().bottom,
      margin: getComputedStyle(document.getElementById('inscription')).scrollMarginTop,
      focused: document.activeElement?.tagName
    })))
    throw error
  }
}

try {
  for (const viewport of [
    { width: 1920, height: 1080 }, { width: 1440, height: 1000 }, { width: 1024, height: 900 },
    { width: 1000, height: 900 }, { width: 768, height: 1024 }, { width: 390, height: 844 }, { width: 320, height: 740 }
  ]) {
    const { context, page, state } = await prepare(viewport)
    await page.goto(`${base}/parents`)
    await expect(page.locator('.parents-price-value')).toHaveText(/25,00\s*€/)
    await page.keyboard.press('Tab')
    await expect(page.getByRole('link', { name: 'Aller au contenu', exact: true })).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(page.locator('#parents-content')).toBeFocused()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'La méthode pas-à-pas pour les parents de lycéens (Seconde, Première, Terminale)'
    )
    await expect(page.locator('.parents-hero-lead')).toHaveText(
      'Devenez un allié orientation pour votre enfant et retrouvez le dialogue avec lui.'
    )
    await expect(page.locator('.parents-stat-value')).toHaveText(['48%', '70%', '20%'])
    await expect(page.locator('.parents-situations-grid h4')).toHaveText([
      'Le mur du silence', 'Le sentiment de désarroi', 'La jungle administrative'
    ])
    await expect(page.locator('.parents-modules-grid h3')).toHaveText(['Décoder', 'Briser la glace', 'Les outils'])
    await expect(page.locator('.parents-modules-grid ul li')).toHaveCount(9)
    await expect(page.locator('.parents-modules-grid > li')).toHaveCount(3)
    await expect(page.locator('.parents-section-copy').last()).toContainText('WhatsApp')
    const video = page.locator('.parents-video iframe')
    await expect(video).toHaveAttribute('src', videoUrl)
    await expect(video).toHaveAttribute('title', 'Présentation de la formation Zélia pour les parents')
    await expect(video).toHaveAttribute('allowfullscreen', '')
    await expect(video).toHaveAttribute('referrerpolicy', 'strict-origin-when-cross-origin')
    const ctas = page.getByRole('button', { name: /Obtenir mon accès immédiat à la formation/ })
    await expect(ctas).toHaveCount(3)
    for (let index = 0; index < 3; index++) {
      const block = page.locator('.parents-cta-block').nth(index)
      await expect(ctas.nth(index)).toHaveText(/Obtenir mon accès immédiat à la formation.*25,00\s*€/)
      await expect(block).toContainText('100% satisfait ou remboursé sous 14 jours.')
      await expect(block.locator('.parents-booking-note')).toHaveText(bookingNote)
      await ctas.nth(index).click()
      await verifyInscriptionScroll(page)
    }
    await page.getByRole('button', { name: "Je m'inscris", exact: true }).click()
    await verifyInscriptionScroll(page)
    await page.getByRole('link', { name: 'Découvrir le programme', exact: true }).click()
    await expect.poll(() => page.locator('#programme').evaluate((element) => {
      const top = element.getBoundingClientRect().top
      return Math.abs(top - parseFloat(getComputedStyle(element).scrollMarginTop)) < 1
    })).toBe(true)
    for (const target of ['#constat', '#programme', '#plan-action', '#inscription']) {
      await expect(page.locator(`.parents-page-nav a[href="${target}"]`)).toHaveCount(1)
      await expect(page.locator(target)).toHaveCount(1)
    }
    await expect(page.locator('.parents-footer a')).toHaveAttribute('href', 'mailto:nicolas.wiegele@zelia.io')
    await verifyLayout(page)
    assert.deepEqual(state.scriptErrors, [])
    assert.equal(state.checkoutRequests.length, 0)
    await context.close()
  }

  const { context, page, state } = await prepare({ width: 1280, height: 900 })
  await page.goto(`${base}/parents`)
  const submit = page.getByRole('button', { name: "Je m'inscris et je paie" })
  await submit.click()
  assert.equal(state.checkoutRequests.length, 0)
  await page.getByLabel('Prénom', { exact: true }).fill('   ')
  await page.getByLabel('Nom', { exact: true }).fill(' Martin ')
  await page.getByLabel('Email', { exact: true }).fill('camille@example.test')
  await submit.click()
  await expect(page.locator('.identity-error')).toHaveText('Merci de renseigner votre prénom, nom et email.')
  assert.equal(state.checkoutRequests.length, 0)
  await page.getByLabel('Prénom', { exact: true }).fill(' Camille ')
  state.checkoutError = 'Paiement indisponible pour le test.'
  await submit.click()
  await expect(page.locator('.identity-error')).toHaveText(state.checkoutError)
  await expect(submit).toBeEnabled()
  assert.deepEqual(state.checkoutRequests[0], { firstName: 'Camille', lastName: 'Martin', email: 'camille@example.test' })
  state.checkoutError = null
  await submit.click()
  await page.waitForURL(`${base}${checkoutPath}`)
  assert.equal(state.checkoutRequests.length, 2)
  assert.deepEqual(state.scriptErrors, [])
  await context.close()

  for (const scenario of [
    { query: '?checkout=cancelled', banner: 'Paiement annulé.', calendar: false },
    { query: '?checkout=success&session_id=cs_test', banner: 'Paiement confirmé !', calendar: true },
    { query: '?checkout=success&session_id=cs_test', viewport: { width: 320, height: 740 }, configDelay: 500, banner: 'Paiement confirmé !', calendar: true },
    { query: '?checkout=cancelled', reducedMotion: 'reduce', banner: 'Paiement annulé.', calendar: false },
    { query: '?checkout=success&session_id=cs_test', paid: false, banner: 'Paiement en attente ou incomplet.', calendar: false },
    { query: '?checkout=success&session_id=cs_test', verificationError: 'Verification fixture error', banner: 'Impossible de vérifier le paiement.', calendar: false },
    { query: '', enabled: false, banner: "Le paiement n'est pas encore configuré.", calendar: false },
    { query: '', priceAmount: 3500, calendar: false }
  ]) {
    const prepared = await prepare(scenario.viewport || { width: 390, height: 844 }, scenario)
    await prepared.page.goto(`${base}/parents${scenario.query}`)
    if (scenario.banner) await expect(prepared.page.locator('.parents-banner')).toContainText(scenario.banner)
    if (scenario.configDelay) await expect(prepared.page.locator('.parents-cta-block .primary-action').first()).toHaveText(/25,00\s*€/)
    if (scenario.query) await verifyInscriptionScroll(prepared.page)
    if (scenario.calendar) {
      await expect(prepared.page.locator('.parents-confirmation')).toContainText("Choisissez votre créneau d'une heure")
      await expect(prepared.page.locator('.calendly-inline-widget')).toHaveAttribute(
        'data-url', 'https://calendly.com/nicolas-wiegele-zelia/formation-orientation-zelia'
      )
      await expect(prepared.page.locator('script[src="https://assets.calendly.com/assets/external/widget.js"]')).toHaveCount(1)
      await expect(prepared.page.locator('.parents-pricing-card')).toHaveCount(0)
    } else {
      await expect(prepared.page.locator('.calendly-inline-widget')).toHaveCount(0)
      await expect(prepared.page.locator('.parents-pricing-card')).toBeVisible()
    }
    if (scenario.priceAmount) {
      await expect(prepared.page.locator('.parents-price-value')).toHaveText(/35,00\s*€/)
      await expect(prepared.page.locator('.parents-cta-block .primary-action')).toHaveText([
        /35,00\s*€/, /35,00\s*€/, /35,00\s*€/
      ])
    }
    assert.deepEqual(prepared.state.verificationRequests, scenario.query.includes('session_id')
      ? [{ sessionId: 'cs_test' }]
      : [])
    assert.equal(prepared.state.checkoutRequests.length, 0)
    assert.deepEqual(prepared.state.scriptErrors, [])
    await verifyLayout(prepared.page)
    await prepared.context.close()
  }
  console.log('Parents page verified: editorial layout (1920/1440/1024/1000/768/390/320px), anchors, content, three CTAs, pricing, checkout and post-payment booking states.')
} finally {
  await browser.close()
}
