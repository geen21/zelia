import assert from 'node:assert/strict'
import { chromium, expect } from '@playwright/test'

const base = process.env.PARENTS_TEST_URL || 'http://127.0.0.1:5191'
const browser = await chromium.launch({ headless: true })
const videoUrl = 'https://www.youtube.com/embed/__cJzw_RYnM?si=pdYeNzrpT6uN0tOO'
const bookingNote = "Le choix du créneau d'une heure se fait juste après le règlement."
const checkoutPath = '/__parent-checkout-test'

async function prepare(viewport, options = {}) {
  const context = await browser.newContext({ viewport })
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
  const problems = await page.evaluate(() => {
    const root = document.querySelector('.parents-landing')
    const issues = root.scrollWidth > root.clientWidth + 1 ? ['Landing overflow'] : []
    for (const element of document.querySelectorAll(
      '.parents-header, .parents-header-cta, .parents-video iframe, .parents-module-card, ' +
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
}

async function verifyInscriptionScroll(page) {
  await expect.poll(() => page.evaluate(() => {
    const top = document.getElementById('inscription').getBoundingClientRect().top
    const headerBottom = document.querySelector('.parents-header').getBoundingClientRect().bottom
    return top >= headerBottom - 1 && top < headerBottom + 100
  })).toBe(true)
}

try {
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }, { width: 320, height: 740 }]) {
    const { context, page, state } = await prepare(viewport)
    await page.goto(`${base}/parents`)
    await expect(page.locator('.parents-price-value')).toHaveText(/25,00\s*€/)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'La méthode pas-à-pas pour les parents de lycéens (Seconde, Première, Terminale)'
    )
    await expect(page.locator('.parents-hero p')).toHaveText(
      'Devenez un allié orientation pour votre enfant et retrouvez le dialogue avec lui.'
    )
    await expect(page.locator('.parents-stat-value')).toHaveText(['48%', '70%', '20%'])
    await expect(page.locator('.parents-situations-grid h3')).toHaveText([
      'Le mur du silence', 'Le sentiment de désarroi', 'La jungle administrative'
    ])
    await expect(page.locator('.parents-modules-grid h3')).toHaveText(['Décoder', 'Briser la glace', 'Les outils'])
    await expect(page.locator('.parents-modules-grid li')).toHaveCount(9)
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
      if (index > 0) await expect(block.getByRole('link')).toHaveAttribute('href', 'mailto:nicolas.wiegele@zelia.io')
      await ctas.nth(index).click()
      await verifyInscriptionScroll(page)
    }
    await page.getByRole('button', { name: "Je m'inscris", exact: true }).click()
    await verifyInscriptionScroll(page)
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
    { query: '?checkout=success&session_id=cs_test', viewport: { width: 320, height: 740 }, banner: 'Paiement confirmé !', calendar: true },
    { query: '?checkout=success&session_id=cs_test', paid: false, banner: 'Paiement en attente ou incomplet.', calendar: false },
    { query: '?checkout=success&session_id=cs_test', verificationError: 'Verification fixture error', banner: 'Impossible de vérifier le paiement.', calendar: false },
    { query: '', enabled: false, banner: "Le paiement n'est pas encore configuré.", calendar: false },
    { query: '', priceAmount: 3500, calendar: false }
  ]) {
    const prepared = await prepare(scenario.viewport || { width: 390, height: 844 }, scenario)
    await prepared.page.goto(`${base}/parents${scenario.query}`)
    if (scenario.banner) await expect(prepared.page.locator('.parents-banner')).toContainText(scenario.banner)
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
  console.log('Parents page verified: content, responsive video/layout (1440/390/320px), three CTAs, pricing, checkout and post-payment booking states.')
} finally {
  await browser.close()
}
