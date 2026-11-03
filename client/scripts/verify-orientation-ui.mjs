import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium, expect } from '@playwright/test'
import { getAnswerChoices } from '../src/lib/questionScale.js'

const base = process.env.ORIENTATION_TEST_URL || 'http://127.0.0.1:5187'
const output = join(tmpdir(), 'zelia-orientation-tests')
await mkdir(output, { recursive: true })
const agreementOptions = (value) => ['Pas du tout', 'Plutôt pas', 'Plutôt oui', 'Carrément'].map((label, level) => ({ label, value, level }))
const dilemmaOptions = (a, valueA, b, valueB) => [
  { label: a, value: valueA, strength: 2 },
  { label: b, value: valueB, strength: 2 }
]
const questions = Array.from({ length: 20 }, (_, index) => {
  const base = { id: index + 1, content: `Question ${index + 1}`, contenu: `Question ${index + 1}` }
  // Keep both legacy formats covered alongside the new dilemmas.
  if (index === 19) return { ...base, category: 'hands_mind', options: [{ label: 'Construire', value: 'mains' }, { label: 'Analyser', value: 'tete' }] }
  if (index === 18) return { ...base, category: 'interest', options: agreementOptions('S') }
  return {
    ...base,
    category: index % 4 === 3 ? 'interest' : 'hands_mind',
    options: dilemmaOptions(
      'Démonter et tester des pièces, quitte à recommencer plusieurs fois.', index % 4 === 3 ? 'R' : 'mains',
      "Comparer les schémas et les mesures, sans manipuler l'objet.", index % 4 === 3 ? 'I' : 'tete'
    )
  }
})
const savedAnswers = Object.fromEntries(questions.map((q, index) => [q.id, getAnswerChoices(q)[index === 19 ? 1 : 0].answer]))
const user = { id: 'orientation-fixture', first_name: 'Camille', department: '75' }
const avatarFixture = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect width="100" height="100" rx="22" fill="#fbe7ef"/>
  <circle cx="50" cy="39" r="26" fill="#a95f39"/>
  <path d="M23 100c2-20 13-30 27-30s25 10 27 30" fill="#c1ff72"/>
  <circle cx="50" cy="45" r="19" fill="#f1c8a4"/>
  <path d="M31 38c2-13 9-20 19-20s18 7 19 20c-10-2-17-7-21-12-3 6-9 10-17 12" fill="#a95f39"/>
  <circle cx="43" cy="45" r="2" fill="#29211b"/><circle cx="57" cy="45" r="2" fill="#29211b"/>
  <path d="M44 55q6 5 12 0" fill="none" stroke="#7d4938" stroke-width="2" stroke-linecap="round"/>
</svg>`
const jobs = ['Infirmier', 'Électricien', 'Cuisinier', 'Mécanicien', 'Journaliste', 'Comptable']
const longJobs = [
  { title: "UX/UI Designer (Designer d'Expérience Utilisateur et d'Interface Utilisateur)", skills: ['Créativité', 'Écoute', 'Ergonomie'] },
  { title: 'Chef de Projet Innovation', skills: [] },
  { title: 'Consultant en Stratégie Digitale', skills: ['Analyse', 'Stratégie'] },
  { title: 'Concepteur Rédacteur (Publicité / Contenu)', skills: ['Rédaction', 'Créativité'] },
  { title: 'Chargé de Marketing Digital', skills: ['Communication', 'Analyse'] },
  { title: 'Ingénieur R&D (Recherche et Développement)', skills: ['Recherche', 'Rigueur'] }
]
const formations = [
  ...Array.from({ length: 12 }, (_, index) => ({
    id: index + 1, nm: [`BTS Maintenance ${index + 1}`], nmc: `BTS-Maintenance-${index + 1}`,
    etab_nom: `Lycée Exemple ${index + 1}`, commune: 'Paris', departement: '75', score: 0.9
  })),
  // Off-topic rows a broad catalog query can return: they must never be shown.
  { id: 101, nm: ['Bachelor in Management (BSc)'], etab_nom: 'ESCP', commune: 'Paris', departement: '75', score: 24 },
  { id: 102, nm: ['Bachelor of Arts in Fashion Design'], etab_nom: 'IFM', commune: 'Paris', departement: '75', score: 24 }
]
const offTopicTitles = ['Bachelor in Management', 'Fashion Design']
const partner = {
  id: 'partner-fixture', school_name: 'École Exemple', formation_name: 'BTS Électrotechnique',
  city: 'Paris', diploma_level: 'Bac+2', is_active: true, results_priority: 30, match_score: 60
}
const partners = [
  partner,
  { ...partner, id: 'partner-second', formation_name: 'BTS Tourisme', results_priority: 20, match_score: 96 },
  { ...partner, id: 'partner-third', formation_name: 'BTS Commerce', results_priority: 10, match_score: 70 },
  { ...partner, id: 'partner-fourth', formation_name: 'BTS Gestion', results_priority: 5, match_score: 100 },
  { ...partner, id: 'partner-hidden', show_in_results: false, results_priority: 100, match_score: 100 },
  { ...partner, id: 'partner-inactive', is_active: false, results_priority: 100, match_score: 100 },
  partner
]
const browser = await chromium.launch({ headless: true })

async function prepareJourney(viewport, { authenticated = false, answered = false, reducedMotion = 'no-preference' } = {}) {
  const context = await browser.newContext({ viewport, reducedMotion })
  const page = await context.newPage()
  page.setDefaultTimeout(15000)
  const state = { errors: [], registrations: [], profiles: [], sharing: [], failProfile: false, failSharing: false, invalidSharing: false, failAnalysis: false, analyses: 0 }
  let releaseAnalysis
  const analysisReady = new Promise((resolve) => { releaseAnalysis = resolve })
  page.on('pageerror', (error) => state.errors.push(error.message))
  await context.addInitScript(({ authenticated, answered, savedAnswers }) => {
    window.tailwind = { config: {} }
    if (authenticated) {
      localStorage.setItem('token', 'orientation-fixture-token')
      localStorage.setItem('orientation_resume_after_auth', 'analysis')
    }
    if (authenticated || answered) {
      localStorage.setItem('answers_progress', JSON.stringify({
        version: 'orientation-flow-v4-binary-20',
        answers: savedAnswers
      }))
    }
  }, { authenticated, answered, savedAnswers })
  await context.route('**/*', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (url.pathname.includes('/auth/v1/')) {
      if (url.pathname.endsWith('/token')) {
        return route.fulfill({ json: {
          access_token: 'fixture-access-token', refresh_token: 'fixture-refresh-token',
          expires_in: 3600, token_type: 'bearer', user: { ...user, email: 'camille@example.com', aud: 'authenticated' }
        } })
      }
      return route.fulfill({ json: { user } })
    }
    if (url.pathname.includes('/api/')) {
      const path = url.pathname.replace(/^.*\/api/, '')
      let data = {}
      if (path === '/questionnaire/questions') {
        assert.equal(url.searchParams.get('type'), 'inscription_v4')
        data = questions
      }
      else if (path === '/auth/register') {
        state.registrations.push(request.postDataJSON())
        data = { user }
      } else if (path === '/users/me') data = { user }
      else if (path === '/users/profile') {
        if (request.method() === 'PUT') {
          state.profiles.push(request.postDataJSON())
          if (state.failProfile) return route.fulfill({ status: 503, json: { error: 'Profil indisponible' } })
        }
        data = { profile: user }
      } else if (path === '/users/school-sharing') {
        state.sharing.push(request.postDataJSON())
        if (state.failSharing) return route.fulfill({ status: 503, json: { error: 'Partage indisponible' } })
        data = state.invalidSharing ? {} : { saved: true }
      } else if (path === '/analysis/generate-analysis') {
        state.analyses += 1
        await analysisReady
        if (state.failAnalysis) return route.fulfill({ status: 503, json: { error: 'Analyse indisponible' } })
        data = { success: true }
      } else if (path === '/analysis/my-results') data = { results: { personalityAnalysis: 'Profil concret.', skillsAssessment: 'Précision.' } }
      else if (path !== '/users/profile/extra-info' && path !== '/questionnaire/submit') {
        state.errors.push(`Unexpected journey request: ${request.method()} ${path}`)
        return route.fulfill({ status: 404, json: { error: 'Unexpected fixture request' } })
      }
      return route.fulfill({ json: data })
    }
    if (url.origin === new URL(base).origin) return route.continue()
    return route.abort()
  })
  return { context, page, state, releaseAnalysis }
}

async function fillRegistration(page) {
  await page.getByLabel('Prénom', { exact: true }).fill('Camille')
  await page.getByLabel('Nom', { exact: true }).fill('Martin')
  await page.getByLabel('Genre', { exact: true }).selectOption('Femme')
  await page.getByLabel('Département', { exact: true }).selectOption('75')
  await page.getByLabel('Email', { exact: true }).fill('camille@example.com')
  await page.getByLabel('Mot de passe', { exact: true }).fill('fixture-password')
}

try {
  for (const version of ['orientation-flow-v2-20', 'orientation-flow-v3-20', 'orientation-flow-v4-20', 'orientation-flow-v4-binary-20']) {
    const { context, page, state, releaseAnalysis } = await prepareJourney({ width: 390, height: 844 })
    try {
      await context.addInitScript(({ version }) => {
        localStorage.setItem('orientation_resume_after_auth', 'analysis')
        localStorage.setItem('answers_progress', JSON.stringify({
          version,
          answers: { 300: 'Plutôt : Construire' }
        }))
      }, { version })
      await page.goto(`${base}/orientation`)
      if (version !== 'orientation-flow-v4-binary-20') {
        await page.getByRole('button', { name: "C'est parti !", exact: true }).click()
        assert.equal(await page.evaluate(() => localStorage.getItem('orientation_resume_after_auth')), null)
      }
      await expect(page.getByRole('heading', { name: 'Question 1', exact: true })).toBeVisible()
      assert.equal(state.analyses, 0, 'Stale answers must not trigger analysis.')
      assert.deepEqual(state.errors, [])
    } finally {
      releaseAnalysis()
      await context.close()
    }
  }

  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }, { width: 320, height: 568 }]) {
    const { context, page, state, releaseAnalysis } = await prepareJourney(viewport)
    try {
      await page.goto(`${base}/orientation`)
      await page.getByRole('button', { name: "C'est parti !", exact: true }).click()
      const progress = page.getByRole('progressbar', { name: 'Progression du questionnaire' })
      await expect(progress).toBeVisible()
      await expect(progress).toHaveAttribute('aria-valuenow', '0')
      await expect(page.locator('.question-icon-badge')).toHaveCount(0)
      await expect(page.getByRole('heading', { name: 'Question 1', exact: true })).toBeVisible()
      await page.keyboard.press('ArrowRight')
      await expect(progress).toHaveAttribute('aria-valuenow', '5')
      assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('answers_progress')).answers['1']), questions[0].options[1].label)
      assert.equal(await page.evaluate(() => window.dataLayer.filter((item) => item?.event === 'orientation_question_answered').at(-1).orientation_answer_position), 2)
      await page.getByRole('button', { name: 'Revenir en arrière' }).click()
      await expect(progress).toHaveAttribute('aria-valuenow', '0')
      await expect(page.locator('.question-prompt, .dilemma-options')).toHaveCount(0)
      await expect(page.locator('.scale-choice')).toHaveCount(2)
      await expect(page.locator('.scale-choice')).toHaveText([
        'Démonter et tester des pièces, quitte à recommencer plusieurs fois.',
        "Comparer les schémas et les mesures, sans manipuler l'objet."
      ])
      await expect(page.locator('.scale-choice.level-3')).toHaveAttribute('aria-pressed', 'true')
      assert.equal(await page.locator('.scale-choice').first().evaluate((el) => getComputedStyle(el).borderColor), await page.locator('.scale-choice').nth(1).evaluate((el) => getComputedStyle(el).borderColor), 'Preference controls must not imply a good or bad choice.')
      await expect(page.locator('.scale-choice').first()).toHaveAccessibleName(questions[0].options[0].label)
      await page.keyboard.press('ArrowLeft')
      await expect(progress).toHaveAttribute('aria-valuenow', '5')
      assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('answers_progress')).answers['1']), questions[0].options[0].label)
      assert.equal(await page.evaluate(() => window.dataLayer.filter((item) => item?.event === 'orientation_question_answered').at(-1).orientation_answer_position), 1)
      await page.getByRole('button', { name: 'Revenir en arrière' }).click()
      await expect(progress).toHaveAttribute('aria-valuenow', '0')
      await expect(page.locator('.scale-choice.level-0')).toHaveAttribute('aria-pressed', 'true')
      await expect(page.locator('.axis-pole')).toHaveCount(0)
      const buttons = await page.locator('.scale-choice').evaluateAll((elements) => elements.map((element) => {
        const { x, y, width, height } = element.getBoundingClientRect()
        return { x, y, width, height }
      }))
      if (viewport.width <= 640) {
        assert.ok(buttons.every((button) => button.width >= viewport.width - 40 && button.height >= 44), 'Mobile answers must be wide touch targets.')
        assert.ok(buttons.slice(1).every((button, index) => button.y >= buttons[index].y + buttons[index].height), 'Mobile answers must be stacked vertically.')
      } else {
        assert.ok(buttons.every((button) => Math.abs(button.y - buttons[0].y) < 1), 'Desktop answers must stay on one row.')
        assert.ok(buttons.slice(1).every((button, index) => button.x >= buttons[index].x + buttons[index].width), 'Desktop answers must go from left to right.')
      }
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'Dilemma overflow.')
      await page.screenshot({ path: join(output, `questions-dilemma-${viewport.width}.png`) })
      await page.keyboard.press('3')
      await page.keyboard.press('4')
      await expect(progress).toHaveAttribute('aria-valuenow', '0')
      await page.locator('.scale-choice.level-3').click()
      await expect(progress).toHaveAttribute('aria-valuenow', '5')
      await page.reload()
      await expect(progress).toHaveAttribute('aria-valuenow', '5')
      if (viewport.width === 390) {
        const card = page.locator('.question-card')
        const box = await card.boundingBox()
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
        await page.mouse.down()
        await page.mouse.move(box.x + box.width / 2 + 130, box.y + box.height / 2, { steps: 8 })
        await page.mouse.up()
        await expect(progress).toHaveAttribute('aria-valuenow', '10')
        assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('answers_progress')).answers['2']), questions[1].options[1].label)
        await expect(card).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 0)')
        const nextBox = await card.boundingBox()
        await page.mouse.move(nextBox.x + nextBox.width / 2, nextBox.y + nextBox.height / 2)
        await page.mouse.down()
        await page.mouse.move(nextBox.x + nextBox.width / 2 - 130, nextBox.y + nextBox.height / 2, { steps: 8 })
        await page.mouse.up()
        await expect(progress).toHaveAttribute('aria-valuenow', '15')
        assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('answers_progress')).answers['3']), questions[2].options[0].label)
      }
      while (await page.locator('.question-card').count()) {
        const previousQuestion = await page.locator('.flow-step-label').textContent()
        const questionNumber = Number(previousQuestion.match(/^Question (\d+)/)?.[1])
        if (questionNumber >= 4 && questionNumber <= 7) {
          await expect(page.locator('.scale-choice')).toHaveCount(2)
          const position = questionNumber % 2 + 1
          await page.keyboard.press(String(position))
          assert.equal(await page.evaluate((id) => JSON.parse(localStorage.getItem('answers_progress')).answers[id], questionNumber), questions[questionNumber - 1].options[position - 1].label)
          assert.equal(await page.evaluate(() => window.dataLayer.filter((item) => item?.event === 'orientation_question_answered').at(-1).orientation_answer_position), position)
        } else if (questionNumber === 19) {
          await expect(page.locator('.question-prompt')).toHaveText('Ça te ressemble ?')
          await expect(page.locator('.scale-choice')).toHaveText(['Carrément', 'Plutôt oui', 'Plutôt pas', 'Pas du tout'])
          await page.locator('.scale-choice.level-3').click()
        } else if (previousQuestion.startsWith('Question 20 ')) {
          await expect(page.locator('.question-prompt')).toHaveCount(0)
          await expect(page.locator('.scale-choice')).toHaveText(['Construire', 'Analyser'])
          await page.locator('.scale-choice.level-3').click()
        } else {
          await page.locator('.scale-choice.level-3').click()
        }
        await expect(page.locator('.flow-step-label')).not.toHaveText(previousQuestion)
      }
      await expect(progress).toHaveAttribute('aria-valuenow', '100')
      await expect(page.getByRole('heading', { name: "Tu es aujourd'hui en..." })).toBeVisible()
      await page.getByRole('button', { name: 'Revenir en arrière' }).click()
      await expect(page.getByRole('button', { name: 'Revenir en arrière' }).locator('svg')).toBeVisible()
      await expect(progress).toHaveAttribute('aria-valuenow', '95')
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'Questionnaire overflow.')
      await page.screenshot({ path: join(output, `questions-${viewport.width}.png`) })
      if (viewport.width === 390) {
        await page.locator('.scale-choice.level-3').click()
        await expect(progress).toHaveAttribute('aria-valuenow', '100')
        while (await page.locator('.choice-card').count()) {
          const previousTitle = await page.locator('.choice-card h1').textContent()
          await page.locator('.choice-card button').first().click()
          const continueButton = page.getByRole('button', { name: 'Continuer', exact: true })
          if (await continueButton.count()) await continueButton.click()
          await expect(page.getByRole('heading', { name: previousTitle, exact: true })).toHaveCount(0)
        }
        await expect(page).toHaveURL(`${base}/register?after=orientation-analysis`)
        await expect(page.getByRole('heading', { name: 'Découvre ton profil complet' })).toBeVisible()
        await fillRegistration(page)
        await page.getByRole('checkbox').first().check()
        await expect(page.getByRole('checkbox').nth(1)).not.toBeChecked()
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'Registration overflow.')
        await page.screenshot({ path: join(output, 'registration-mobile.png') })
        await page.getByRole('button', { name: 'Voir mon profil complet', exact: true }).click()
        await expect(page).toHaveURL(`${base}/orientation`)
        await expect.poll(() => state.analyses).toBe(1)
        assert.equal(state.registrations[0].questionnaireResponses.length, 20)
        const storedAnswers = JSON.stringify(state.registrations[0].questionnaireResponses)
        assert.ok(storedAnswers.includes(questions[0].options[1].label), `Activity answer not stored: ${storedAnswers}`)
        assert.ok(!storedAnswers.includes('Clairement : ') && !storedAnswers.includes('Plutôt : '), 'New dilemmas must store the activity directly.')
        assert.ok(storedAnswers.includes('Carrément'), `Agreement answer not stored: ${storedAnswers}`)
        assert.ok(storedAnswers.includes('Analyser'), `Legacy answer not stored: ${storedAnswers}`)
        assert.equal(state.registrations[0].newsletterOptIn, false)
        assert.deepEqual(state.sharing[0], { granted: true, version: 'orientation-dossier-v1' })
        releaseAnalysis()
        await expect(page.getByRole('button', { name: 'Découvre tes formations', exact: true })).toBeVisible()
      }
      assert.deepEqual(state.errors, [])
      console.log(`questions-${viewport.width}: progress, keyboard, swipe, back and resume verified.`)
    } finally {
      releaseAnalysis()
      await context.close()
    }
  }

  for (const failure of [null, 'profile', 'sharing', 'invalid-sharing']) {
    const { context, page, state, releaseAnalysis } = await prepareJourney({ width: failure ? 390 : 1440, height: 844 }, { answered: true })
    try {
      await page.goto(`${base}/register?after=orientation-analysis`)
      const checkboxes = page.getByRole('checkbox')
      await expect(checkboxes).toHaveCount(2)
      await expect(checkboxes.nth(0)).not.toBeChecked()
      await expect(checkboxes.nth(1)).not.toBeChecked()
      await expect(page.getByRole('button', { name: 'Tout valider' })).toHaveCount(0)
      await fillRegistration(page)
      await page.screenshot({ path: join(output, `registration-${failure || 'success'}.png`) })
      await page.getByRole('button', { name: 'Créer avec email', exact: true }).click()
      assert.equal(state.registrations.length, 0)
      assert.equal(await checkboxes.nth(0).evaluate((input) => input.validity.valueMissing), true)
      await checkboxes.nth(0).check()
      const optedIn = failure === 'invalid-sharing'
      if (optedIn) await checkboxes.nth(1).check()
      state.failProfile = failure === 'profile'
      state.failSharing = failure === 'sharing'
      state.invalidSharing = failure === 'invalid-sharing'
      await page.getByRole('button', { name: 'Créer avec email', exact: true }).click()
      if (failure) {
        await expect(page.getByRole('alert')).toContainText('Ton compte est créé')
        await expect(page).toHaveURL(/\/register\?after=orientation-analysis/)
        assert.equal(state.analyses, 0, 'No results before required persistence.')
        if (failure === 'profile') assert.equal(state.sharing.length, 0)
        state.failProfile = false
        state.failSharing = false
        state.invalidSharing = false
        if (failure === 'sharing') {
          await page.reload()
          await expect(page.getByLabel('Email', { exact: true })).toHaveValue('camille@example.com')
          await fillRegistration(page)
          await page.getByRole('checkbox').first().check()
        }
        await page.getByRole('button', { name: 'Réessayer et continuer' }).click()
      }
      await expect(page).toHaveURL(`${base}/orientation`)
      await expect.poll(() => state.analyses).toBe(1)
      assert.equal(state.registrations.length, 1, 'Retry must not create a second account.')
      const registration = state.registrations[0]
      assert.equal(registration.acceptTerms, true)
      assert.equal(registration.acceptDataTransfer, true)
      assert.equal(registration.newsletterOptIn, optedIn)
      const profile = state.profiles.findLast((item) => item.institution_data?.accept_terms)
      assert.equal(profile.institution_data.accept_data_transfer, true)
      assert.equal(profile.institution_data.newsletter_opt_in, optedIn)
      assert.ok(Number.isFinite(Date.parse(profile.institution_data.terms_accepted_at)))
      assert.deepEqual(state.sharing.at(-1), { granted: true, version: 'orientation-dossier-v1' })
      assert.equal(await page.evaluate(() => localStorage.getItem('pending_registration_email')), null)
      assert.deepEqual(state.errors, [])
      console.log(`registration-${failure || 'success'}: two boxes, optional emails, persisted agreement and recovery verified.`)
    } finally {
      releaseAnalysis()
      await context.close()
    }
  }

  for (const reducedMotion of ['no-preference', 'reduce']) {
    const { context, page, state, releaseAnalysis } = await prepareJourney({ width: 390, height: 844 }, { authenticated: true, reducedMotion })
    try {
      state.failAnalysis = reducedMotion === 'no-preference'
      await page.goto(`${base}/orientation`)
      await expect.poll(() => state.analyses).toBe(1)
      const loading = page.locator('.orientation-loading')
      const bar = loading.getByRole('progressbar')
      await expect(bar).toBeVisible()
      assert.equal(await bar.getAttribute('aria-valuenow'), null)
      await expect(loading.locator('.loading-message')).toHaveText('Gimgembre')
      if (reducedMotion === 'reduce') {
        await expect(loading.locator('.loading-brain')).toHaveCSS('animation-name', 'none')
        await expect(bar.locator('span')).toHaveCSS('animation-name', 'none')
        await page.waitForTimeout(3000)
        await expect(loading.locator('.loading-message')).toHaveText('Gimgembre')
      } else {
        await expect(loading.locator('.loading-message')).toHaveText('Ça charbonne')
        await page.screenshot({ path: join(output, 'loading-mobile.png') })
      }
      releaseAnalysis()
      if (state.failAnalysis) {
        await expect(page.getByRole('alert')).toContainText("L'analyse n'a pas pu être générée")
        await expect(loading).toHaveCount(0)
        state.failAnalysis = false
        await page.getByRole('button', { name: 'Réessayer', exact: true }).click()
        await expect.poll(() => state.analyses).toBe(2)
      }
      await expect(page.getByRole('button', { name: 'Découvre tes formations', exact: true })).toBeVisible()
      await expect(loading).toHaveCount(0)
      assert.equal(state.sharing.length, 0, 'Existing users must not be asked for a new agreement.')
      assert.equal(state.registrations.length, 0)
      assert.deepEqual(state.errors, [])
      console.log(`loading-${reducedMotion}: honest progress, messages, error retry and existing user access verified.`)
    } finally {
      releaseAnalysis()
      await context.close()
    }
  }

  for (const scenario of [
    { name: 'desktop', viewport: { width: 1440, height: 900 }, populated: true },
    { name: 'mobile', viewport: { width: 390, height: 844 }, populated: true },
    { name: 'small-mobile', viewport: { width: 320, height: 568 }, populated: true },
    { name: 'slow-partners', viewport: { width: 390, height: 844 }, populated: true, slowPartners: true },
    { name: 'national-best', viewport: { width: 1440, height: 900 }, populated: true, partnerMatchScore: 0 },
    { name: 'equal-best', viewport: { width: 390, height: 844 }, populated: true, partnerMatchScore: 99 },
    { name: 'many-partners', viewport: { width: 390, height: 844 }, populated: true, manyPartners: true },
    { name: 'partner-retry', viewport: { width: 390, height: 844 }, populated: true, partnerFailure: true },
    { name: 'recommendations-retry', viewport: { width: 390, height: 844 }, populated: true, snapshotFailure: true },
    { name: 'no-partner-match', viewport: { width: 390, height: 844 }, populated: true, noPartners: true },
    { name: 'unselected-partners', viewport: { width: 390, height: 844 }, populated: true, selectPartners: false },
    { name: 'partners-only', viewport: { width: 390, height: 844 }, populated: false, partnersOnly: true },
    { name: 'partners-only-unselected', viewport: { width: 390, height: 844 }, populated: false, partnersOnly: true, selectPartners: false },
    { name: 'empty', viewport: { width: 390, height: 844 }, populated: false },
    { name: 'jobs-long-desktop', viewport: { width: 680, height: 900 }, populated: false, jobRecommendations: longJobs },
    { name: 'jobs-long-tablet', viewport: { width: 570, height: 800 }, populated: false, jobRecommendations: longJobs },
    { name: 'jobs-long-mobile', viewport: { width: 320, height: 568 }, populated: false, jobRecommendations: longJobs },
    { name: 'jobs-single', viewport: { width: 570, height: 800 }, populated: false, jobRecommendations: longJobs.slice(0, 1) },
    { name: 'jobs-odd', viewport: { width: 680, height: 900 }, populated: false, jobRecommendations: longJobs.slice(0, 3) },
    { name: 'jobs-unbroken', viewport: { width: 320, height: 568 }, populated: false, jobRecommendations: [{ title: 'A'.repeat(85), skills: ['Compétence'.repeat(6)] }] },
    {
      name: 'jobs-legacy', viewport: { width: 390, height: 844 }, populated: false,
      jobRecommendations: ['Photographe', { intitule: 'Architecte', competences: ['Dessin', 'Créativité'] }, { title: 'Archiviste' }, { title: 'Technicienne', strengths: 'Organisation' }],
      expectedJobCards: [
        { title: 'Photographe', skills: [] },
        { title: 'Architecte', skills: ['Dessin', 'Créativité'] },
        { title: 'Archiviste', skills: [] },
        { title: 'Technicienne', skills: ['Organisation'] }
      ]
    },
    { name: 'jobs-empty', viewport: { width: 390, height: 844 }, populated: false, jobRecommendations: [] },
    { name: 'jobs-empty-with-formations', viewport: { width: 390, height: 844 }, populated: false, partnersOnly: true, jobRecommendations: [] }
  ]) {
    const jobFixtures = scenario.jobRecommendations || jobs.map((title) => ({ title, skills: ['Rigueur'] }))
    const expectedJobCards = scenario.expectedJobCards || jobFixtures
    const hasPartners = !scenario.noPartners && (scenario.populated || scenario.partnersOnly)
    const extraPartners = scenario.manyPartners ? Array.from({ length: 20 }, (_, index) => ({
      ...partner, id: `partner-extra-${String(index).padStart(2, '0')}`,
      formation_name: `BTS Partenaire ${index + 1}`, results_priority: 0, match_score: 40
    })) : []
    const partnerCount = hasPartners ? 3 : 0
    // Relevance (match_score) ranks partners; the back-office priority only adds up to +5.
    const expectedPartnerIds = scenario.partnerMatchScore === undefined
      ? ['partner-fourth', 'partner-second', 'partner-third']
      : ['partner-fixture', 'partner-second', 'partner-third']
    const selectPartners = hasPartners && scenario.selectPartners !== false
    const context = await browser.newContext({ viewport: scenario.viewport })
    const page = await context.newPage()
    page.setDefaultTimeout(15000)
    const errors = []
    const savedSelections = []
    const savedRecommendations = []
    let recommendationRequests = 0
    let partnerRequests = 0
    let releaseCatalog
    const catalogReady = new Promise((resolve) => { releaseCatalog = resolve })
    let releasePartners
    const partnersReady = new Promise((resolve) => { releasePartners = resolve })
    page.on('pageerror', (error) => errors.push(error.message))
    await context.addInitScript(({ savedAnswers }) => {
      localStorage.setItem('token', 'orientation-fixture-token')
      localStorage.setItem('orientation_resume_after_auth', 'analysis')
      localStorage.setItem('answers_progress', JSON.stringify({
        version: 'orientation-flow-v4-binary-20',
        answers: savedAnswers
      }))
      localStorage.setItem('orientation_micro_profile', JSON.stringify({
        formation_preferences: ['bts'], strong_subjects: ['sciences'], study_location: 'near_home'
      }))
      // Prevent the optional CDN Tailwind script from being needed by this test.
      window.tailwind = { config: {} }
    }, { savedAnswers })
    await context.route('**/*', async (route) => {
      const url = new URL(route.request().url())
      if (url.hostname === 'api.dicebear.com') return route.fulfill({ contentType: 'image/svg+xml', body: avatarFixture })
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
        const entries = request.postDataJSON()?.entries || []
        const selection = entries.find((entry) => entry.question_id === 'orientation_final_selection')
        if (selection) savedSelections.push(JSON.parse(selection.answer_text))
        const recommendations = entries.find((entry) => entry.question_id === 'orientation_recommendations')
        if (recommendations) {
          recommendationRequests += 1
          if (scenario.snapshotFailure && recommendationRequests === 1) return route.fulfill({ status:503,json:{ error:'Snapshot save unavailable' } })
          savedRecommendations.push(JSON.parse(recommendations.answer_text))
        }
      } else if (path === '/analysis/my-results') data = {
        results: {
          personalityAnalysis: 'Tu apprécies les activités concrètes.',
          skillsAssessment: 'Précision et écoute.',
          jobRecommendations: jobFixtures,
          studyRecommendations: scenario.populated ? [{ degree: 'BTS Maintenance', type: 'Formation pratique.' }] : []
        }
      }
      else if (path === '/ecoles/matched') {
        partnerRequests += 1
        await partnersReady
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
      const firstPartnerResponse = page.waitForResponse((response) => response.url().endsWith('/api/ecoles/matched'))
      const firstCatalogResponse = scenario.slowPartners
        ? page.waitForResponse((response) => response.url().includes('/api/catalog/formations/search'))
        : null
      await studiesCta.click()
      const jobsCta = page.getByRole('button', { name: 'Découvre tes métiers', exact: true })
      await expect(page.getByText('On cherche parmi 127 498 formations celles qui collent vraiment à ton profil...')).toBeVisible()
      await expect(jobsCta).toBeInViewport({ ratio: 1 })
      await expect(jobsCta).toBeDisabled()
      await expect(jobsCta.locator('svg[aria-hidden="true"]')).toBeVisible()
      await expect(page.locator('.formation-reveal-actions')).toHaveCSS('position', 'fixed')
      await expect(page.locator('.orientation-loading').getByRole('progressbar')).toBeVisible()
      const partnerCards = page.locator('.formation-lead-card[data-source="partner"]')
      // Sponsored results must never be revealed before the national catalog results.
      await expect.poll(() => partnerRequests).toBeGreaterThan(0)
      if (scenario.slowPartners) {
        releaseCatalog()
        await (await firstCatalogResponse).finished()
      } else {
        releasePartners()
        await (await firstPartnerResponse).finished()
      }
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
      await expect(page.locator('.formation-lead-card')).toHaveCount(0)
      await expect(page.getByRole('alert')).toHaveCount(0)
      await expect(jobsCta).toBeDisabled()
      assert.equal(savedRecommendations.length, 0, 'No partial recommendations snapshot while either source is pending.')
      releaseCatalog()
      releasePartners()
      await (await firstPartnerResponse).finished()

      if (scenario.partnerFailure) {
        await expect(page.getByRole('alert')).toContainText('Impossible de charger les formations partenaires')
        await expect(page.locator('.formation-lead-card[data-source="national"]')).toHaveCount(8)
        await expect(partnerCards).toHaveCount(0)
        await page.getByRole('button', { name: 'Réessayer les formations partenaires' }).click()
        await expect(page.getByRole('alert')).toHaveCount(0)
      }
      await expect(partnerCards).toHaveCount(partnerCount)
      await expect(page.getByRole('button', { name: /Demande d'infos|Demande envoyée/ })).toHaveCount(0)
      if (hasPartners) {
        for (const card of await partnerCards.all()) {
          const checkbox = card.getByRole('checkbox', { name: "Je veux plus d'infos" })
          await expect(checkbox).toBeChecked()
          if (!selectPartners) {
            await card.locator('.formation-lead-check').click()
            await expect(checkbox).not.toBeChecked()
          }
        }
      }
      assert.equal(savedSelections.length, 0, 'Toggling a partner must not submit or save a request.')
      if (scenario.snapshotFailure) {
        await expect(page.getByRole('alert')).toContainText('Impossible d’enregistrer les recommandations')
        await page.getByRole('button',{ name:'Réessayer l’enregistrement des recommandations',exact:true }).click()
        await expect(page.getByRole('alert')).toHaveCount(0)
      }

      await expect(page.getByRole('button', { name: "Voir d'autres formations" })).toHaveCount(1)
      await expect(jobsCta).toBeEnabled()
      await expect(page.locator('.orientation-loading')).toHaveCount(0)
      await expect(page.locator('.formation-lead-card[data-source="national"]')).toHaveCount(scenario.populated ? 8 : 0)
      for (const title of offTopicTitles) await expect(page.locator('.formation-lead-card', { hasText: title })).toHaveCount(0)
      await expect(partnerCards).toHaveCount(partnerCount)
      const cardSources = await page.locator('.formation-lead-card').evaluateAll((cards) => cards.map((card) => card.dataset.source))
      if (hasPartners) assert.equal(cardSources.indexOf('partner'), scenario.populated ? 3 : 0, 'The first partner comes after the first three national results.')
      await expect(page.getByRole('checkbox')).toHaveCount((scenario.populated ? 8 : 0) + partnerCount)
      const recommendationCount = (scenario.populated ? 8 : 0) + partnerCount
      await expect.poll(() => savedRecommendations.at(-1)?.length).toBe(recommendationCount)
      assert.ok(savedRecommendations.at(-1).every((item) => !Object.hasOwn(item,'requestMoreInformation')),'A displayed recommendation does not represent a choice or a request for information.')
      assert.equal(savedSelections.length,0,'Displayed recommendations must be recorded before continuation, separately from choices.')
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
      await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }))
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
      await expect.poll(() => page.locator('.metier-reveal-card .persona-avatar').evaluate((image) => image.complete && image.naturalWidth > 0)).toBe(true)
      const jobItems = page.locator('.metier-reveal-item')
      await expect(jobItems).toHaveCount(jobFixtures.length)
      assert.deepEqual(await jobItems.locator('strong').allTextContents(), expectedJobCards.map((job) => job.title))
      await expect(jobItems.getByRole('button')).toHaveCount(0)
      await expect(jobItems.getByRole('link')).toHaveCount(0)
      if (jobFixtures.length) {
        await expect(page.getByRole('region', { name: 'Tes pistes' }).getByRole('list')).toBeVisible()
        await expect(page.locator('.metier-reveal-count')).toHaveText(`${jobFixtures.length} métier${jobFixtures.length > 1 ? 's' : ''}`)
        for (const [index, job] of expectedJobCards.entries()) {
          const skills = jobItems.nth(index).locator('.metier-reveal-skills')
          if (job.skills.length) await expect(skills).toHaveText(`Compétences : ${job.skills.slice(0, 2).join(' · ')}`)
          else await expect(skills).toHaveCount(0)
        }
        const layout = await jobItems.evaluateAll((items) => items.map((item) => {
          const box = item.getBoundingClientRect()
          const title = item.querySelector('strong')
          const titleBox = title.getBoundingClientRect()
          const skills = item.querySelector('.metier-reveal-skills')
          return {
            x: box.x, y: box.y, width: box.width, height: box.height,
            titleLeft: titleBox.left - box.left, titleRight: titleBox.right,
            titleFits: title.scrollWidth <= title.clientWidth + 1,
            skillsFit: !skills || skills.scrollWidth <= skills.clientWidth + 1
          }
        }))
        for (const card of layout) {
          assert.ok(card.titleFits && card.skillsFit, 'Job titles and skills must wrap without clipping.')
          assert.ok(card.titleLeft > 0 && card.titleRight <= card.x + card.width + 1, 'Job content must stay inside its card.')
          assert.ok(Math.abs(card.titleLeft - layout[0].titleLeft) <= 1, 'Job titles must align.')
        }
        const gridWidth = await page.locator('.metier-reveal-list').evaluate((list) => list.clientWidth)
        const gridGap = scenario.viewport.width <= 520 ? 8 : 10
        if (gridWidth >= 420 + gridGap && layout.length > 1) {
          for (let index = 0; index + 1 < layout.length; index += 2) {
            assert.ok(Math.abs(layout[index].y - layout[index + 1].y) <= 1 && Math.abs(layout[index].height - layout[index + 1].height) <= 1, 'Job cards must align in each row.')
          }
          if (layout.length % 2) assert.ok(layout.at(-1).width > layout[0].width, 'An unpaired job must fill the last row.')
        } else {
          assert.ok(layout.every((card) => Math.abs(card.x - layout[0].x) <= 1 && Math.abs(card.width - layout[0].width) <= 1), 'Mobile job cards must form one aligned column.')
        }
      } else {
        await expect(page.getByText("On n'a pas encore assez d'infos pour te proposer des métiers précis", { exact: false })).toBeVisible()
        await expect(page.locator('.metier-reveal-count')).toHaveCount(0)
      }
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'Job reveal horizontal overflow.')
      if (['desktop', 'mobile', 'small-mobile', 'jobs-long-desktop', 'jobs-long-tablet', 'jobs-long-mobile', 'jobs-empty'].includes(scenario.name)) {
        await page.locator('.metier-reveal-card').screenshot({ path: join(output, `${scenario.name}-jobs.png`) })
      }
      const formationCount = (scenario.populated ? 8 : 0) + partnerCount
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
        assert.equal(partnerSaved.length, partnerCount)
        assert.deepEqual(partnerSaved.map((entry) => entry.rawId), hasPartners ? expectedPartnerIds : [])
        assert.ok(partnerSaved.every((entry) => entry.requestMoreInformation === selectPartners && entry.partner && entry.detail.title === entry.raw.formation_name))
      }
      await page.getByRole('button', { name: 'Revenir en arrière' }).click()
      await expect(jobsCta).toBeInViewport({ ratio: 1 })
      await expect(jobsCta).toBeEnabled()
      if (scenario.populated) {
        await expect(page.locator('.formation-lead-card[data-source="national"]').getByRole('checkbox').first()).not.toBeChecked()
      }
      if (hasPartners) {
        for (const checkbox of await partnerCards.getByRole('checkbox').all()) {
          if (selectPartners) await expect(checkbox).toBeChecked()
          else await expect(checkbox).not.toBeChecked()
        }
      }
      await jobsCta.click()
      if (formationCount) {
        await expect.poll(() => savedSelections.length).toBe(2)
        assert.deepEqual(savedSelections[1], savedSelections[0], 'Returning to recommendations must preserve deselections.')
      }
      const avatarCta = page.getByRole('button', { name: 'Découvrir mon avatar', exact: true })
      await avatarCta.scrollIntoViewIfNeeded()
      await expect(avatarCta).toBeInViewport({ ratio: 1 })
      await expect(avatarCta.locator('svg[aria-hidden="true"]')).toBeVisible()
      await avatarCta.focus()
      await expect(avatarCta).toBeFocused()
      await page.keyboard.press('Enter')
      await expect(page.locator('.avatar-reveal-showcase')).toBeVisible()
      if (formationCount + jobFixtures.length) {
        await expect.poll(() => savedSelections.length).toBe(formationCount ? 3 : 1)
        const finalSelection = savedSelections.at(-1)
        assert.equal(finalSelection.length, formationCount + jobFixtures.length)
        const savedJobs = finalSelection.filter((entry) => entry.type === 'metier')
        assert.deepEqual(savedJobs.map((entry) => entry.title), expectedJobCards.map((job) => job.title))
        assert.deepEqual(savedJobs.map((entry) => entry.raw.skills), expectedJobCards.map((job) => job.skills))
        if (formationCount) {
          assert.deepEqual(finalSelection.filter((entry) => entry.type === 'formation'), savedSelections[0])
        }
        assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('orientation_final_selection'))), finalSelection)
      } else {
        assert.equal(savedSelections.length, 0)
        assert.equal(await page.evaluate(() => localStorage.getItem('orientation_final_selection')), null)
      }
      assert.deepEqual(errors, [])
      console.log(`${scenario.name}: partners only after national results, relevance order, shared checkboxes, saved selections without submissions, CTA visibility and navigation verified.`)
    } catch (error) {
      await page.screenshot({ path: join(output, `${scenario.name}-failure.png`) })
      throw error
    } finally {
      releaseCatalog()
      releasePartners()
      await context.close()
    }
  }
  console.log(`Screenshots: ${output}`)
} finally {
  await browser.close()
}
