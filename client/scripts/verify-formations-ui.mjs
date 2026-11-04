import assert from 'node:assert/strict'
import { assertSharedUX } from './fixtures/assert-shared-ux.mjs'
import { mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium, expect } from '@playwright/test'
import { rankPartnerFormations } from '../src/lib/partnerRelevance.js'

const base = process.env.FORMATIONS_TEST_URL || 'http://127.0.0.1:5187'
const output = join(tmpdir(), 'zelia-formations-tests')
await mkdir(output, { recursive: true })
const tailwindResponse = await fetch('https://cdn.tailwindcss.com', { signal: AbortSignal.timeout(30000) })
assert.ok(tailwindResponse.ok, 'The application Tailwind runtime must be available for a representative UI check')
const tailwindScript = await tailwindResponse.text()
const browser = await chromium.launch({ headless: true })
const user = { id: 'formation-explorer-fixture', first_name: 'Camille', department: '75' }
const rows = [
  { id: 1, nm: ['BTS Services informatiques aux organisations'], nmc: 'BTS-SIO', etab_nom: 'Lycée national', commune: 'Paris', etab_url: 'https://example.com/national',
    fiche: 'https://example.com/fiche?utm_source=old&utm_campaign=rentree#inscription', dataviz: 'https://example.com/stats',
    facebook: 'https://www.facebook.com/ecole', linkedin: 'https://www.linkedin.com/school/ecole', youtube: 'https://www.youtube.com/@ecole',
    email: 'contact@example.com', telephone: '0123456789' },
  { id: 2, nm: ['BTS Tourisme'], etab_nom: 'Lycée des voyages', commune: 'Lyon' }
]
const discoveredRows = Array.from({ length: 36 }, (_, i) => ({
  ...rows[0], id: i + 10, etab_nom: `Lycée national ${String(i + 1).padStart(2, '0')}`,
  nm: [`BTS Services informatiques aux organisations - option ${i % 2 ? 'SLAM' : 'SISR'}`]
}))
const partners = Array.from({ length: 31 }, (_, i) => ({
  id: `partner-${String(i).padStart(2, '0')}`, school_name: `École ${String(i).padStart(2, '0')}`,
  formation_name: 'BTS Services informatiques aux organisations', diploma_level: 'Bac+2',
  city: i % 2 ? 'Lyon' : 'Paris', is_active: true, show_in_results: true, highlight_in_results: i !== 2,
  description: 'Objectif: Apprendre à développer. Débouchés: Développement informatique.',
  link: i === 3 ? 'javascript:alert(1)' : 'https://example.com/school'
}))
partners.push({ ...partners[0], id: 'tourism', school_name: 'École des voyages', formation_name: 'BTS Tourisme' })
partners.push({ ...partners[0], id: 'hidden', show_in_results: false, school_name: 'École hors recommandations' })
partners.push({ ...partners[0], id: 'second-campus', city: 'Lyon' })

async function prepare(viewport, options = {}) {
  const context = await browser.newContext({ viewport })
  const page = await context.newPage()
  page.setDefaultTimeout(15000)
  page.setDefaultNavigationTimeout(30000)
  const errors = []
  const state = { noTest: false, failure: '', degree: 'BTS SIO', mutations: [], requests: [], ...options }
  page.on('pageerror', (error) => errors.push(error.message))
  await context.addInitScript(() => {
    localStorage.setItem('token', 'formation-explorer-fixture')
    window.tailwind = { config: {} }
  })
  await context.route('**/*', (route) => {
    const url = new URL(route.request().url())
    if (url.hostname === 'cdn.tailwindcss.com') return route.fulfill({ contentType: 'text/javascript', body: tailwindScript })
    return url.origin === new URL(base).origin || url.pathname.includes('/api/') ? route.continue() : route.abort()
  })
  await context.route('**/api/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const path = url.pathname.replace(/^.*\/api/, '')
    state.requests.push({ path, q: url.searchParams.get('q'), page: url.searchParams.get('page'), department: url.searchParams.get('departement') })
    if (path === state.failure) return route.fulfill({ status: 503, json: { error: 'Fixture temporarily unavailable' } })
    if (path === state.heldPath) {
      state.heldStarted = true
      await new Promise((resolve) => { state.releaseHeld = resolve })
      state.heldPath = ''
    }
    let data
    const analysis = state.noTest ? null : { studyRecommendations: [{ degree: state.degree }] }
    if (path === '/users/profile') data = { profile: user }
    else if (path === '/users/me') data = { user }
    else if (path === '/users/profile/extra-info') data = { entries: state.noTest ? [] : [
      { question_id: 'orientation_formation_preferences', answer_text: '["bts"]' },
      { question_id: 'orientation_study_location', answer_text: 'near_home' },
      { question_id: 'orientation_department_name', answer_text: 'Paris' }
    ] }
    else if (path === '/analysis/my-results') {
      if (state.noTest) assert.equal(url.searchParams.get('optional'), 'true', 'No analysis is an expected state, not an API error')
      data = { results: analysis }
    }
    else if (path === '/formations/1') data = { formation: rows[0] }
    else if (path === '/formations') data = { formations: [] }
    else if (path === '/ecoles/partenaires') data = { formations: state.longTitle
      ? partners.map((p, index) => index ? p : { ...p, formation_name: `${p.formation_name} ${'parcours cybersécurité et administration des infrastructures '.repeat(8)}` })
      : partners }
    else if (path === '/ecoles/matched') data = { matched: state.noTest ? [] : rankPartnerFormations(partners.filter((p) => p.show_in_results && p.city === 'Paris'), { analysis, profile: { formation_preferences: ['bts'] } }) }
    else if (path === '/ecoles/my-submissions') data = { submissions: state.mutations.map((id) => ({ formation_id: id })) }
    else if (path.startsWith('/ecoles/partenaires/')) data = { formation: partners.find((p) => p.id === path.split('/').at(-1)) }
    else if (path === '/ecoles/submit') {
      if (state.submitFailure) return route.fulfill({ status: 503, json: { message: 'Demande temporairement indisponible' } })
      assert.equal(request.postDataJSON().sharingVersion, 'orientation-dossier-v1')
      state.mutations.push(request.postDataJSON().formation_id)
      data = { success: true }
    } else if (path === '/catalog/formations/search') {
      if (url.searchParams.get('q') === 'retard') {
        state.delayedStarted = true
        await new Promise((resolve) => { state.releaseDelayed = resolve })
      }
      if (state.discovery && !state.noTest) {
        const q = url.searchParams.get('q')
        const pageNumber = Number(url.searchParams.get('page'))
        const offset = (pageNumber - 2) * 24
        data = q === 'services informatiques organisations'
          ? pageNumber === 1
            ? { items: [rows[1]], has_more: true }
            : { items: discoveredRows.slice(offset, offset + 24), has_more: offset + 24 < discoveredRows.length }
          : { items: [rows[1]], has_more: false }
      } else data = {
        items: url.searchParams.get('q') === 'retard' ? [{ ...rows[0], id: 999, nm: ['Résultat obsolète'] }]
          : url.searchParams.get('page') === '2' ? [{ ...rows[0], id: 3, etab_nom: 'Autre lycée' }] : rows,
        has_more: url.searchParams.get('q') === 'informatique' && url.searchParams.get('page') === '1'
      }
    } else {
      errors.push(`Unexpected request: ${path}`)
      return route.fulfill({ status: 404, json: { error: 'Unexpected fixture request' } })
    }
    return route.fulfill({ json: data })
  })
  return { context, page, state, errors }
}

async function ready(page) {
  await expect(page.getByRole('heading', { name: 'Les formations à explorer' })).toBeVisible()
  await expect(page.getByRole('status')).toHaveCount(0)
}

async function noOverflow(page) {
  await assertSharedUX(page)
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'No horizontal overflow')
}

async function showAllLoaded(page) {
  const more = page.getByRole('button', { name: /Afficher plus de formations/ })
  while (await more.count()) await more.click()
}

try {
  for (const heldPath of ['/catalog/formations/search', '/ecoles/partenaires', '/ecoles/matched']) {
    const { context, page, state, errors } = await prepare({ width: 390, height: 844 }, { discovery: true, heldPath })
    try {
      await page.goto(`${base}/app/formations`)
      await expect.poll(() => state.heldStarted).toBe(true)
      await expect.poll(() => state.requests.filter((r) => r.path === '/ecoles/matched').length).toBeGreaterThan(0)
      await page.waitForTimeout(500)
      await expect(page.getByRole('status')).toBeVisible()
      await expect(page.locator('.fe-card')).toHaveCount(0, 'Neither source appears alone while the first batch is pending')
      state.releaseHeld()
      await ready(page)
      await expect(page.locator('.fe-card[data-source=national]')).toHaveCount(18)
      await expect(page.locator('.fe-card[data-source=partner]')).toHaveCount(6)
      const initialRequests = state.requests.filter((r) => r.path === '/catalog/formations/search').length
      assert.equal(initialRequests, 3)
      await page.waitForTimeout(500)
      assert.equal(state.requests.filter((r) => r.path === '/catalog/formations/search').length, initialRequests, 'No automatic background scan')
      state.heldPath = '/catalog/formations/search'
      state.heldStarted = false
      await page.getByRole('button', { name: 'Chercher d’autres formations nationales' }).click()
      await expect.poll(() => state.heldStarted).toBe(true)
      await expect(page.locator('.fe-card[data-source=national]').first()).toBeVisible()
      await expect(page.locator('.fe-card[data-source=partner]').first()).toBeVisible()
      state.releaseHeld()
      await ready(page)
      await showAllLoaded(page)
      await expect(page.locator('.fe-card[data-source=national]')).toHaveCount(discoveredRows.length)
      assert.deepEqual(errors, [])
    } finally { await context.close() }
  }

  for (const [name, viewport] of [
    ['desktop', { width: 1440, height: 1000 }],
    ['mobile', { width: 390, height: 844 }],
    ['small', { width: 320, height: 740 }]
  ]) {
    const { context, page, state, errors } = await prepare(viewport, { discovery: true })
    try {
      await page.goto(`${base}/formations/1`)
      await expect(page.locator('a.fp-btn--primary[href^="https://example.com/fiche"]')).toHaveAttribute('href',
        'https://example.com/fiche?utm_source=zelia&utm_campaign=rentree&utm_medium=referral#inscription')
      const outbound = page.locator('a[target="_blank"]')
      await expect(outbound).toHaveCount(9)
      for (const href of await outbound.evaluateAll((links) => links.map((link) => link.href))) {
        const url = new URL(href)
        assert.deepEqual(url.searchParams.getAll('utm_source'), ['zelia'])
        assert.equal(url.searchParams.get('utm_medium'), 'referral')
      }
      await expect(page.locator('a[href="mailto:contact@example.com"]')).toHaveCount(1)
      await expect(page.locator('a[href="tel:0123456789"]')).toHaveCount(1)
      await page.goto(`${base}/app/formations?tab=formations`)
      await ready(page)
      await expect(page.getByRole('tablist')).toHaveCount(0)
      await expect(page.locator('.fe-grid')).toHaveCount(1)
      await expect(page.getByText('Retrouve les formations qui te correspondent', { exact: false })).toHaveCount(0)
      await expect(page.locator('.fe-intro > p')).toHaveCount(0)
      await expect(page.locator('.fe-intro details')).not.toHaveAttribute('open')
      await expect(page.locator('.fe-card[data-source=national]')).toHaveCount(18)
      await expect(page.locator('.fe-card[data-source=partner]')).toHaveCount(6)
      await expect(page.locator('.fe-card[data-source=national] .fe-score').first()).toHaveText('92 % de correspondance')
      assert.deepEqual(await page.locator('.fe-card').evaluateAll((cards) => cards.slice(0, 4).map((card) => card.dataset.source)), ['national', 'national', 'national', 'partner'])
      await expect(page.getByLabel('Ville', { exact: true })).toHaveValue('')
      await expect(page.locator('#formation-partner-00 .fe-score')).toHaveText('92 % de correspondance')
      assert.equal(state.mutations.length, 0)
      assert.ok(state.requests.some((r) => r.path === '/catalog/formations/search' && r.department === 'Paris'))
      assert.ok(state.requests.some((r) => r.q === 'services informatiques organisations' && r.page === '2'), 'Recover national formations after the exact title and first SQL page give no thematic matches')
      await noOverflow(page)
      await page.screenshot({ path: join(output, `${name}.png`), fullPage: true })
      await page.getByRole('button', { name: 'Chercher d’autres formations nationales' }).click()
      await ready(page)
      await showAllLoaded(page)
      await expect(page.locator('.fe-card[data-source=national]')).toHaveCount(discoveredRows.length)
      await expect(page.locator('.fe-card[data-source=partner]')).toHaveCount(partners.length)
      await expect(page.locator('#formation-tourism .fe-explore')).toHaveText('À explorer')
      await expect(page.locator('#formation-hidden .fe-explore')).toHaveText('À explorer')
      await expect(page.locator('#formation-second-campus')).toBeVisible()
      await expect(page.locator('#formation-partner-02')).not.toHaveClass(/fe-card-highlight/)
      await expect(page.locator('#formation-partner-03 a[href^="javascript:"]')).toHaveCount(0)
      await expect(page.locator('.fe-best-match')).toHaveCount(1)
      await expect(page.locator('#formation-partner-02 .fe-partner-label')).toHaveText('Partenaire')
      assert.equal(await page.locator('#formation-partner-02').evaluate((el) => getComputedStyle(el).backgroundColor), await page.locator('#formation-partner-00').evaluate((el) => getComputedStyle(el).backgroundColor), 'Every partner keeps the partner colour')
      assert.notEqual(await page.locator('#formation-partner-00').evaluate((el) => getComputedStyle(el).backgroundColor), await page.locator('.fe-card[data-source=national]').first().evaluate((el) => getComputedStyle(el).backgroundColor))
      await noOverflow(page)
      await page.locator('main').evaluate((element) => { element.scrollTop = 0 })
      await page.getByLabel('Ville', { exact: true }).selectOption('Lyon')
      await expect(page.locator('.fe-card')).toHaveCount(16)
      await page.getByRole('button', { name: 'Réinitialiser les filtres' }).click()
      await ready(page)
      const partner = page.locator('#formation-partner-00')
      await expect(partner.getByRole('link', { name: 'Site de l’établissement' })).toHaveAttribute('href', 'https://example.com/school?utm_source=zelia&utm_medium=referral')
      await expect(page.locator('.fe-card[data-source=national]').first().getByRole('link', { name: 'Site de l’établissement' })).toHaveAttribute('href', 'https://example.com/national?utm_source=zelia&utm_medium=referral')
      await expect(partner.getByRole('link', { name: 'Explorer la formation' })).toHaveAttribute('href', '/app/ecoles-partenaires/partner-00')
      await expect(page.locator('.fe-card[data-source=national]').first().getByRole('link', { name: 'Explorer la formation' })).toHaveAttribute('href', /\/formations\/.*-10$/)
      await partner.getByRole('link', { name: 'Explorer la formation' }).click()
      await expect(page.getByRole('heading', { name: partners[0].formation_name })).toBeVisible({ timeout: 15000 })
      await expect(page.getByRole('link', { name: 'Explorer le site de l’établissement' })).toHaveAttribute('href', 'https://example.com/school?utm_source=zelia&utm_medium=referral')
      await expect(page.getByText('92 % de correspondance', { exact: true })).toBeVisible()
      assert.equal(state.mutations.length, 0, 'Exploration never sends data')
      await page.getByRole('button', { name: 'Retour', exact: true }).click()
      await ready(page)
      await partner.getByRole('button', { name: 'Demander des informations' }).focus()
      assert.equal(await page.evaluate(() => document.activeElement?.textContent), 'Demander des informations')
      await partner.getByRole('button', { name: 'Demander des informations' }).press('Enter')
      await expect(partner.getByRole('button', { name: 'Demande envoyée' })).toBeDisabled()
      assert.deepEqual(state.mutations, ['partner-00'])
      state.degree = 'BTS Tourisme'
      await page.reload()
      await ready(page)
      await expect(page.locator('#formation-tourism .fe-score')).toHaveText('92 % de correspondance')
      await expect(page.locator('#formation-partner-00 .fe-score')).toHaveCount(0)
      assert.deepEqual(errors, [])
    } finally { await context.close() }
  }

  for (const failure of ['/ecoles/partenaires', '/ecoles/matched', '/analysis/my-results', '/catalog/formations/search', '/ecoles/my-submissions']) {
    const { context, page, state, errors } = await prepare({ width: 390, height: 844 }, { failure })
    try {
      await page.goto(`${base}/app/ecoles-partenaires`)
      await ready(page)
      await expect(page.getByRole('alert')).toHaveCount(1)
      assert.ok(await page.locator('.fe-card').count() > 0, 'Other sources remain available')
      state.failure = ''
      await page.getByRole('alert').getByRole('button', { name: /Réessayer/ }).click()
      await ready(page)
      await expect(page.getByRole('alert')).toHaveCount(0)
      await expect(page.locator('#formation-partner-00 .fe-score')).toHaveText('92 % de correspondance')
      assert.deepEqual(errors, [])
    } finally { await context.close() }
  }

  {
    const { context, page, state, errors } = await prepare({ width: 320, height: 740 }, { longTitle: true, submitFailure: true })
    try {
      await page.goto(`${base}/app/formations`)
      await ready(page)
      await expect(page.locator('#formation-partner-00 h2')).toContainText('parcours cybersécurité')
      await noOverflow(page)
      await page.getByRole('checkbox', { name: 'Élargir la recherche nationale à toute la France' }).check()
      await expect.poll(() => state.requests.filter((r) => r.path === '/catalog/formations/search' && r.department === '').length).toBeGreaterThan(0)
      await expect(page.getByText('Recherche nationale élargie : vérifie la localisation avant de poursuivre.')).toBeVisible()
      const card = page.locator('#formation-partner-00')
      await card.getByRole('button', { name: 'Demander des informations' }).click()
      await expect(page.getByRole('alert')).toContainText('Demande temporairement indisponible')
      await expect(card.getByRole('button', { name: 'Demander des informations' })).toBeEnabled()
      assert.equal(state.mutations.length, 0)
      state.submitFailure = false
      await card.getByRole('button', { name: 'Demander des informations' }).click()
      await expect(card.getByRole('button', { name: 'Demande envoyée' })).toBeDisabled()
      state.failure = '/ecoles/matched'
      await card.getByRole('link', { name: 'Explorer la formation' }).click()
      await expect(page.getByRole('alert')).toContainText('Impossible de charger ton pourcentage')
      state.failure = ''
      await page.getByRole('button', { name: 'Réessayer', exact: true }).click()
      await expect(page.getByText('92 % de correspondance', { exact: true })).toBeVisible()
      await expect(page.getByRole('alert')).toHaveCount(0)
      assert.deepEqual(errors, [])
    } finally { await context.close() }
  }
  {
    const { context, page, state, errors } = await prepare({ width: 390, height: 844 }, { noTest: true })
    try {
      await page.goto(`${base}/app/formations#formation-second-campus`)
      await ready(page)
      await expect(page.getByRole('link', { name: 'Faire mon test' })).toBeVisible()
      await expect(page.locator('.fe-score')).toHaveCount(0)
      await expect(page.locator('#formation-second-campus')).toBeVisible()
      assert.ok(await page.locator('.fe-card[data-source=national]').count() > 0, 'Without a test, national formations are accessible alongside partners')
      await showAllLoaded(page)
      await expect(page.locator('.fe-card[data-source=partner]')).toHaveCount(partners.length)
      await page.getByRole('searchbox').fill('informatique')
      await expect(page.locator('.fe-card[data-source=national]')).toHaveCount(2)
      await page.getByRole('button', { name: 'Chercher d’autres formations nationales' }).click()
      await expect(page.locator('.fe-card[data-source=national]')).toHaveCount(3)
      assert.ok(state.requests.some((r) => r.page === '2'))
      await page.getByRole('searchbox').fill('retard')
      await expect.poll(() => state.delayedStarted).toBe(true)
      await page.getByRole('searchbox').fill('tourisme')
      await expect.poll(() => state.requests.filter((r) => r.q === 'tourisme').length).toBeGreaterThan(0)
      state.releaseDelayed()
      await ready(page)
      await expect(page.getByText('Résultat obsolète')).toHaveCount(0)
      await page.goto(`${base}/app/formations#formation-%ZZ`)
      await ready(page)
      assert.deepEqual(errors, [])
    } finally { await context.close() }
  }
  console.log(`Formations UI verified: unified grid, all partners, scores, recalculation, links, consent, pagination, stale responses, partial failures and 320/390/1440px. Screenshots: ${output}`)
} finally {
  await browser.close()
}
