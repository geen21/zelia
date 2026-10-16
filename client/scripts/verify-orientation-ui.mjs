import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium, expect } from '@playwright/test'

const base = process.env.ORIENTATION_TEST_URL || 'http://127.0.0.1:5187'
const output = join(tmpdir(), 'zelia-orientation-tests')
await mkdir(output, { recursive: true })
const questions = Array.from({ length: 20 }, (_, index) => ({
  id: index + 1, content: `Question ${index + 1}`, category: 'hands_mind',
  options: [{ label: 'Non', value: 'non' }, { label: 'Oui', value: 'oui' }]
}))
const user = { id: 'orientation-fixture', first_name: 'Camille', department: '75' }
const jobs = ['Infirmier', 'Électricien', 'Cuisinier', 'Mécanicien', 'Journaliste', 'Comptable']
const formations = Array.from({ length: 12 }, (_, index) => ({
  id: index + 1, nm: [`BTS Maintenance ${index + 1}`], nmc: `BTS-Maintenance-${index + 1}`,
  etab_nom: `Lycée Exemple ${index + 1}`, commune: 'Paris', departement: '75', score: 0.9
}))
const partner = {
  id: 'partner-fixture', school_name: 'École Exemple', formation_name: 'BTS Électrotechnique',
  city: 'Paris', diploma_level: 'Bac+2', is_active: true, results_priority: 30, match_score: 60
}
const partners = [
  partner,
  { ...partner, id: 'partner-second', formation_name: 'BTS Tourisme', results_priority: 20, match_score: 80 },
  { ...partner, id: 'partner-third', formation_name: 'BTS Commerce', results_priority: 10, match_score: 70 },
  { ...partner, id: 'partner-fourth', formation_name: 'BTS Gestion', results_priority: 5, match_score: 55 },
  { ...partner, id: 'partner-hidden', show_in_results: false, results_priority: 100, match_score: 100 },
  { ...partner, id: 'partner-inactive', is_active: false, results_priority: 100, match_score: 100 },
  partner
]
const browser = await chromium.launch({ headless: true })

try {
  for (const scenario of [
    { name: 'desktop', viewport: { width: 1440, height: 900 }, populated: true },
    { name: 'mobile', viewport: { width: 390, height: 844 }, populated: true },
    { name: 'small-mobile', viewport: { width: 320, height: 568 }, populated: true },
    { name: 'national-best', viewport: { width: 1440, height: 900 }, populated: true, partnerMatchScore: 0 },
    { name: 'equal-best', viewport: { width: 390, height: 844 }, populated: true, partnerMatchScore: 99 },
    { name: 'many-partners', viewport: { width: 390, height: 844 }, populated: true, manyPartners: true },
    { name: 'partner-retry', viewport: { width: 390, height: 844 }, populated: true, partnerFailure: true },
    { name: 'no-partner-match', viewport: { width: 390, height: 844 }, populated: true, noPartners: true },
    { name: 'unselected-partners', viewport: { width: 390, height: 844 }, populated: true, selectPartners: false },
    { name: 'partners-only', viewport: { width: 390, height: 844 }, populated: false, partnersOnly: true },
    { name: 'empty', viewport: { width: 390, height: 844 }, populated: false }
  ]) {
    const hasPartners = !scenario.noPartners && (scenario.populated || scenario.partnersOnly)
    const extraPartners = scenario.manyPartners ? Array.from({ length: 20 }, (_, index) => ({
      ...partner, id: `partner-extra-${String(index).padStart(2, '0')}`,
      formation_name: `BTS Partenaire ${index + 1}`, results_priority: 0, match_score: 40
    })) : []
    const partnerCount = hasPartners ? 4 + extraPartners.length : 0
    const selectPartners = hasPartners && scenario.selectPartners !== false
    const context = await browser.newContext({ viewport: scenario.viewport })
    const page = await context.newPage()
    page.setDefaultTimeout(15000)
    const errors = []
    const savedSelections = []
    let partnerRequests = 0
    let releaseCatalog
    const catalogReady = new Promise((resolve) => { releaseCatalog = resolve })
    page.on('pageerror', (error) => errors.push(error.message))
    await context.addInitScript(() => {
      localStorage.setItem('token', 'orientation-fixture-token')
      localStorage.setItem('orientation_resume_after_auth', 'analysis')
      localStorage.setItem('answers_progress', JSON.stringify({
        version: 'orientation-flow-20',
        answers: Object.fromEntries(Array.from({ length: 20 }, (_, index) => [index + 1, 'oui']))
      }))
      localStorage.setItem('orientation_micro_profile', JSON.stringify({
        formation_preferences: ['bts'], strong_subjects: ['sciences'], study_location: 'near_home'
      }))
      // Prevent the optional CDN Tailwind script from being needed by this test.
      window.tailwind = { config: {} }
    })
    await context.route('**/*', async (route) => {
      const url = new URL(route.request().url())
      if (url.pathname.includes('/api/')) return route.fallback()
      if (url.origin === new URL(base).origin) return route.continue()
      return route.abort()
    })
    await context.route('**/api/**', async (route) => {
      const request = route.request()
      const path = new URL(request.url()).pathname.replace(/^.*\/api/, '')
      let data = {}
      if (path === '/questionnaire/questions') data = questions
      else if (path === '/questionnaire/submit' || path === '/analysis/generate-analysis') data = { success: true }
      else if (path === '/users/me') data = { user }
      else if (path === '/users/profile') data = { profile: user }
      else if (path === '/users/profile/extra-info') {
        const selection = request.postDataJSON()?.entries?.find((entry) => entry.question_id === 'orientation_final_selection')
        if (selection) savedSelections.push(JSON.parse(selection.answer_text))
      } else if (path === '/analysis/my-results') data = {
        results: {
          personalityAnalysis: 'Tu apprécies les activités concrètes.',
          skillsAssessment: 'Précision et écoute.',
          jobRecommendations: jobs.map((title) => ({ title, skills: ['Rigueur'] })),
          studyRecommendations: scenario.populated ? [{ degree: 'BTS Maintenance', type: 'Formation pratique.' }] : []
        }
      }
      else if (path === '/ecoles/matched') {
        partnerRequests += 1
        if (scenario.partnerFailure && partnerRequests === 1) {
          return route.fulfill({ status: 503, json: { error: 'Partner matching unavailable' } })
        }
        data = { matched: hasPartners ? [...partners, ...extraPartners].map((entry) => ({ ...entry, match_score: scenario.partnerMatchScore ?? entry.match_score })) : [] }
      }
      else if (path === '/catalog/formations/search') {
        await catalogReady
        data = { items: scenario.populated ? formations : [] }
      } else {
        errors.push(`Unexpected API request: ${request.method()} ${path}`)
        return route.fulfill({ status: 404, json: { error: 'Unexpected fixture request' } })
      }
      return route.fulfill({ status: 200, json: data })
    })

    try {
      await page.goto(`${base}/orientation`)
      const studiesCta = page.getByRole('button', { name: 'Découvre tes formations', exact: true })
      await expect(studiesCta.locator('svg[aria-hidden="true"]')).toBeVisible()
      await studiesCta.click()
      const jobsCta = page.getByRole('button', { name: 'Découvre tes métiers', exact: true })
      await expect(page.getByText('On cherche parmi 127 498 formations celles qui collent vraiment à ton profil...')).toBeVisible()
      await expect(jobsCta).toBeInViewport({ ratio: 1 })
      await expect(jobsCta.locator('svg[aria-hidden="true"]')).toBeVisible()
      await expect(page.locator('.formation-reveal-actions')).toHaveCSS('position', 'fixed')
      const partnerCards = page.locator('.formation-lead-card[data-source="partner"]')
      if (scenario.partnerFailure) {
        await expect(page.getByRole('alert')).toContainText('Impossible de charger les formations partenaires')
        await expect(partnerCards).toHaveCount(0)
        await page.getByRole('button', { name: 'Réessayer les formations partenaires' }).click()
        await expect(page.getByRole('alert')).toHaveCount(0)
      }
      await expect(partnerCards).toHaveCount(partnerCount)
      await expect(page.getByText('Là où tu peux exceller', { exact: true })).toHaveCount(hasPartners ? 1 : 0)
      await expect(page.getByRole('button', { name: /Demande d'infos|Demande envoyée/ })).toHaveCount(0)
      if (hasPartners) {
        for (const card of await partnerCards.all()) {
          const checkbox = card.getByRole('checkbox', { name: "Je veux plus d'infos" })
          await expect(checkbox).not.toBeChecked()
          await card.locator('.formation-lead-check').click()
          await expect(checkbox).toBeChecked()
          await card.locator('.formation-lead-check').click()
          await expect(checkbox).not.toBeChecked()
          if (selectPartners) await card.locator('.formation-lead-check').click()
        }
      }
      assert.equal(savedSelections.length, 0, 'Toggling a partner must not submit or save a request.')
      releaseCatalog()

      await expect(page.getByRole('button', { name: "Voir d'autres formations" })).toHaveCount(1)
      await expect(page.locator('.formation-lead-card[data-source="national"]')).toHaveCount(scenario.populated ? 8 : 0)
      await expect(partnerCards).toHaveCount(partnerCount)
      await expect(page.getByRole('checkbox')).toHaveCount((scenario.populated ? 8 : 0) + partnerCount)
      const bestBadge = page.getByText('Là où tu peux exceller', { exact: true })
      await expect(bestBadge).toHaveCount(scenario.populated || hasPartners ? 1 : 0)
      if (scenario.populated || hasPartners) {
        const bestCard = page.locator('.formation-lead-card').filter({ has: bestBadge })
        const bestScore = Number((await bestCard.locator('.formation-lead-score').textContent()).replace('%', ''))
        const allScores = await page.locator('.formation-lead-score').allTextContents()
        assert.equal(bestScore, Math.max(...allScores.map((score) => Number(score.replace('%', '')))))
        await expect(bestCard).toHaveAttribute('data-source', scenario.name === 'national-best' || !hasPartners ? 'national' : 'partner')
      }
      if (hasPartners) {
        for (const checkbox of await partnerCards.getByRole('checkbox').all()) {
          if (selectPartners) await expect(checkbox).toBeChecked()
          else await expect(checkbox).not.toBeChecked()
        }
      }
      await expect(page.getByText("Coche celles pour lesquelles tu veux plus d'infos.", { exact: false })).toHaveCount(0)
      await expect(jobsCta).toBeInViewport({ ratio: 1 })
      const barAtTop = await page.locator('.formation-reveal-actions').boundingBox()
      if (scenario.populated) {
        const nationalCards = page.locator('.formation-lead-card[data-source="national"]')
        const firstSelection = nationalCards.getByRole('checkbox').first()
        await expect(firstSelection).toBeChecked()
        await nationalCards.locator('.formation-lead-check').first().click()
        await expect(firstSelection).not.toBeChecked()
      }
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
      await expect(jobsCta).toBeInViewport({ ratio: 1 })
      const lastContent = await page.locator('.formation-lead-empty').boundingBox()
      const bar = await page.locator('.formation-reveal-actions').boundingBox()
      assert.ok(Math.abs(barAtTop.y - bar.y) <= 1, 'The next-step bar moved during scrolling.')
      assert.ok(lastContent.y + lastContent.height <= bar.y, 'The fixed bar obscures the last result.')
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'Horizontal overflow.')
      await page.screenshot({ path: join(output, `${scenario.name}.png`) })
      if (scenario.populated || hasPartners) {
        await page.locator('.formation-lead-card').filter({ has: bestBadge }).screenshot({ path: join(output, `${scenario.name}-best-match.png`) })
      }
      await jobsCta.click()
      await expect(page.getByRole('heading', { name: 'Des métiers qui pourraient te plaire' })).toBeVisible()
      await expect(page.locator('.formation-reveal-actions')).toHaveCount(0)
      assert.deepEqual(await page.locator('.persona-portrait-tile strong').allTextContents(), jobs)
      const formationCount = (scenario.populated ? 8 : 0) + (selectPartners ? partnerCount : 0)
      await expect.poll(() => savedSelections.length).toBe(formationCount ? 1 : 0)
      if (scenario.populated) {
        const nationalSaved = savedSelections[0].filter((entry) => entry.sourceTable === 'formation_france')
        assert.equal(nationalSaved.length, 8)
        assert.equal(nationalSaved[0].requestMoreInformation, false)
        assert.ok(nationalSaved.slice(1).every((entry) => entry.requestMoreInformation))
      }
      if (formationCount) {
        assert.equal(savedSelections[0].length, formationCount)
        const partnerSaved = savedSelections[0].filter((entry) => entry.sourceTable === 'ecoles_partenaires')
        assert.equal(partnerSaved.length, selectPartners ? partnerCount : 0)
        assert.deepEqual(partnerSaved.map((entry) => entry.rawId), selectPartners ? [...partners.slice(0, 4), ...extraPartners].map((entry) => entry.id) : [])
        assert.ok(partnerSaved.every((entry) => entry.requestMoreInformation && entry.partner && entry.detail.title === entry.raw.formation_name))
      }
      await page.getByRole('button', { name: 'Revenir en arrière' }).click()
      await expect(jobsCta).toBeInViewport({ ratio: 1 })
      if (hasPartners) {
        for (const checkbox of await partnerCards.getByRole('checkbox').all()) {
          if (selectPartners) await expect(checkbox).toBeChecked()
          else await expect(checkbox).not.toBeChecked()
        }
      }
      await jobsCta.click()
      if (formationCount) await expect.poll(() => savedSelections.length).toBe(2)
      await page.getByRole('button', { name: 'On continue !', exact: true }).click()
      await expect.poll(() => savedSelections.length).toBe(formationCount ? 3 : 1)
      const finalSelection = savedSelections.at(-1)
      assert.equal(finalSelection.length, formationCount + jobs.length)
      assert.equal(finalSelection.filter((entry) => entry.type === 'metier').length, jobs.length)
      assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('orientation_final_selection'))), finalSelection)
      assert.deepEqual(errors, [])
      console.log(`${scenario.name}: shared checkboxes, partner choices during loading, saved selections without submissions, CTA visibility and navigation verified.`)
    } catch (error) {
      await page.screenshot({ path: join(output, `${scenario.name}-failure.png`) })
      throw error
    } finally {
      releaseCatalog()
      await context.close()
    }
  }
  console.log(`Screenshots: ${output}`)
} finally {
  await browser.close()
}
