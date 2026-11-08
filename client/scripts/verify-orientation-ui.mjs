import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium, devices, expect } from '@playwright/test'
import { getAnswerChoices } from '../src/lib/questionScale.js'

const base = process.env.ORIENTATION_TEST_URL || 'http://127.0.0.1:5187'
const output = join(tmpdir(), 'zelia-orientation-tests')
await mkdir(output, { recursive: true })
const agreementOptions = (value, alternative) => ['Pas du tout', 'Plutôt pas', 'Plutôt oui', 'Carrément']
  .map((label, level) => ({ label, value, level, ...(alternative ? { alternative } : {}) }))
const firstStatement = "Pour comprendre une panne, je préfère démonter l'objet plutôt qu'étudier son schéma."
const longStatement = "Pour apprendre, je préfère comprendre la théorie plutôt qu'essayer par moi-même."
const questions = Array.from({ length: 20 }, (_, index) => {
  const content = index === 0 ? firstStatement : index === 1 ? longStatement : `Question ${index + 1}`
  const base = { id: index + 1, content, contenu: content }
  // Keep legacy formats covered alongside comparative agreement statements.
  if (index === 19) return { ...base, category: 'hands_mind', options: [{ label: 'Construire', value: 'mains' }, { label: 'Analyser', value: 'tete' }] }
  if (index === 18) return { ...base, category: 'interest', options: agreementOptions('S') }
  return {
    ...base,
    category: index % 4 === 3 ? 'interest' : 'hands_mind',
    options: agreementOptions(index % 4 === 3 ? 'R' : 'mains', index % 4 === 3 ? 'I' : 'tete')
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
    etab_nom: `Lycée Exemple ${index + 1}`, commune: 'Paris', departement: 'Paris', score: 0.9
  })),
  // Off-topic rows a broad catalog query can return: they must never be shown.
  { id: 101, nm: ['Bachelor in Management (BSc)'], etab_nom: 'ESCP', commune: 'Paris', departement: 'Paris', score: 24 },
  { id: 102, nm: ['Bachelor of Arts in Fashion Design'], etab_nom: 'IFM', commune: 'Paris', departement: 'Paris', score: 24 }
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

async function prepareJourney(viewport, { authenticated = false, answered = false, reducedMotion = 'no-preference', questionnaire = questions, progressAnswers = savedAnswers, mobile = false } = {}) {
  const context = await browser.newContext({ ...(mobile ? devices['Pixel 7'] : {}), viewport, reducedMotion })
  const page = await context.newPage()
  page.setDefaultTimeout(15000)
  const state = { errors: [], registrations: [], profiles: [], sharing: [], submissions: [], failProfile: false, failSharing: false, invalidSharing: false, failAnalysis: false, analysisError: 'Analyse indisponible', analyses: 0 }
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
        version: 'orientation-flow-v5-20',
        answers: savedAnswers
      }))
    }
  }, { authenticated, answered, savedAnswers: progressAnswers })
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
        assert.equal(url.searchParams.get('type'), 'inscription_v5')
        data = questionnaire
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
      } else if (path === '/questionnaire/submit') {
        state.submissions.push(request.postDataJSON())
        data = { success: true }
      } else if (path === '/analysis/generate-analysis') {
        state.analyses += 1
        await analysisReady
        if (state.failAnalysis) return route.fulfill({ status: 503, json: { error: state.analysisError } })
        data = { success: true }
      } else if (path === '/analysis/my-results') data = { results: { personalityAnalysis: 'Profil concret.', skillsAssessment: 'Précision.' } }
      else if (path !== '/users/profile/extra-info') {
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

async function getStageLayout(page) {
  const stageCard = page.locator('.orientation-stage > .orientation-card')
  await expect(stageCard).toHaveCSS('transform', /^(none|matrix\(1, 0, 0, 1, 0, 0\))$/)
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }))
  const [header, card] = await Promise.all([
    page.locator('.orientation-topbar').boundingBox(),
    stageCard.boundingBox()
  ])
  assert.ok(header && card, 'The orientation header and card must be visible.')
  return { headerHeight: header.height, gap: card.y - header.y - header.height, x: card.x, width: card.width }
}

async function assertStageLayout(page, reference) {
  const layout = await getStageLayout(page)
  for (const key of Object.keys(reference)) {
    assert.ok(Math.abs(layout[key] - reference[key]) <= 1, `Orientation ${key} must stay stable: expected ${reference[key]}, received ${layout[key]}.`)
  }
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'Orientation step overflow.')
}

async function getContinueButtonStyle(button) {
  return button.evaluate((element) => {
    const style = getComputedStyle(element)
    return Object.fromEntries([
      'backgroundColor', 'color', 'borderRadius', 'borderWidth', 'borderColor',
      'fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'minHeight', 'gap',
      'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'boxShadow'
    ].map((property) => [property, style[property]]))
  })
}

try {
  for (const draft of [['doctorat', 'voie_pro', 'master'], ['doctorat', 'voie_pro']]) {
    const { context, page, state, releaseAnalysis } = await prepareJourney({ width: 390, height: 844 }, { answered: true })
    try {
      await context.addInitScript(({ draft }) => {
        localStorage.setItem('orientation_micro_profile', JSON.stringify({ formation_preferences: draft }))
      }, { draft })
      await page.goto(`${base}/orientation`)
      await expect(page.getByRole('heading', { name: "Tu es aujourd'hui en..." })).toBeVisible()
      assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('orientation_micro_profile')).formation_preferences), draft)
      for (let step = 0; step < 3; step += 1) {
        const previousTitle = await page.locator('.choice-card h1').textContent()
        await page.locator('.choice-card button').first().click()
        const next = page.getByRole('button', { name: 'Continuer', exact: true })
        if (await next.count()) await next.click()
        await expect(page.getByRole('heading', { name: previousTitle, exact: true })).toHaveCount(0)
      }
      await expect(page.getByRole('heading', { name: 'Quelles formations veux-tu voir en priorité ?' })).toBeVisible()
      await expect(page.locator('.choice-card .orientation-pill')).toHaveText('4 / 6')
      await expect(page.locator('.formation-preference-option')).toHaveCount(8)
      await expect(page.locator('.formation-preference-label')).toHaveText([
        'BTS', 'BUT', 'Licence', 'Bachelor', 'Master', 'École spécialisée', 'Alternance', 'Prépa'
      ])
      await expect(page.locator('.formation-preference-description')).toHaveText([
        'BTS, BTSA et BTS maritimes', 'Formations en IUT, en 3 ans',
        'Licences générales et professionnelles', 'Bachelors d’écoles à bac +3',
        'Masters et diplômes de grade master', 'Ingénieur, commerce, santé, social, arts…',
        'Apprentissage selon le diplôme choisi', 'CPGE scientifiques, économiques ou littéraires'
      ])
      for (const button of await page.locator('.formation-preference-option').all()) {
        const descriptionId = await button.getAttribute('aria-describedby')
        await expect(page.locator(`[id="${descriptionId}"]`)).toBeVisible()
      }
      await expect(page.locator('.formation-preference-hint')).toHaveText(`${draft.includes('master') ? 1 : 0}/3 formats sélectionnés`)
      if (draft.includes('master')) {
        await page.getByRole('button', { name: 'BTS', exact: true }).click()
        await page.getByRole('button', { name: 'BUT', exact: true }).click()
        await expect(page.locator('.formation-preference-hint')).toHaveText('3/3 formats sélectionnés')
        await page.getByRole('button', { name: 'Licence', exact: true }).click()
        await expect(page.getByRole('button', { name: 'Licence', exact: true })).toHaveAttribute('aria-pressed', 'false')
        await page.getByRole('button', { name: 'Master', exact: true }).click()
        await page.getByRole('button', { name: 'Licence', exact: true }).click()
        await page.locator('.formation-preference-card').screenshot({ path: join(output, 'available-formation-preferences-mobile.png') })
      }
      await page.getByRole('button', { name: 'Continuer', exact: true }).click()
      await expect(page.getByRole('heading', { name: 'Pour tes études, tu préfères...' })).toBeVisible()
      assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('orientation_micro_profile')).formation_preferences),
        draft.includes('master') ? ['bts', 'but', 'licence'] : [])
      assert.equal(state.analyses, 0)
      assert.equal(state.registrations.length, 0)
      assert.deepEqual(state.errors, [])
    } finally {
      releaseAnalysis()
      await context.close()
    }
  }

  {
    const { context, page, state, releaseAnalysis } = await prepareJourney({ width: 393, height: 851 }, { mobile: true })
    try {
      await page.goto(`${base}/orientation`)
      await page.getByRole('button', { name: "C'est parti !", exact: true }).tap()
      await page.clock.install()
      await page.clock.pauseAt(new Date())
      const stepLabel = page.locator('.flow-step-label')
      for (let index = 0; index < questions.length; index += 1) {
        await expect(stepLabel).toHaveText(`Question ${index + 1} / 20`)
        const firstChoice = await page.locator('.scale-choice').first().boundingBox()
        const lastChoice = await page.locator('.scale-choice').last().boundingBox()
        await page.touchscreen.tap(firstChoice.x + firstChoice.width / 2, firstChoice.y + firstChoice.height / 2)
        await expect(page.locator('.scale-choice:enabled')).toHaveCount(0)
        await page.touchscreen.tap(lastChoice.x + lastChoice.width / 2, lastChoice.y + lastChoice.height / 2)
        await page.keyboard.press('4')
        await page.clock.runFor(250)
        if (index < questions.length - 1) {
          await expect(stepLabel).toHaveText(`Question ${index + 2} / 20`)
        } else {
          await expect(page.getByRole('heading', { name: "Tu es aujourd'hui en..." })).toBeVisible()
        }
        const progress = await page.evaluate(() => JSON.parse(localStorage.getItem('answers_progress')).answers)
        assert.equal(Object.keys(progress).length, index + 1, 'Rapid taps must save exactly one answer per question.')
        assert.equal(progress[questions[index].id], getAnswerChoices(questions[index])[0].answer, 'The first accepted answer must not be overwritten during the transition.')
      }
      assert.equal(await page.evaluate(() => window.dataLayer.filter((item) => item?.event === 'orientation_question_answered').length), 20)
      await page.clock.resume()
      while (await page.locator('.choice-card').count()) {
        const previousTitle = await page.locator('.choice-card h1').textContent()
        if (previousTitle === 'Quelles formations veux-tu voir en priorité ?') {
          await expect(page.locator('.formation-preference-option')).toHaveCount(8)
          await expect(page.locator('.formation-preference-label')).toHaveText([
            'BTS', 'BUT', 'Licence', 'Bachelor', 'Master', 'École spécialisée', 'Alternance', 'Prépa'
          ])
          await expect(page.getByRole('button', { name: 'Doctorat', exact: true })).toHaveCount(0)
          await expect(page.getByRole('button', { name: 'CAP ou bac pro', exact: true })).toHaveCount(0)
        }
        await page.locator('.choice-card button').first().tap()
        const continueButton = page.getByRole('button', { name: 'Continuer', exact: true })
        if (await continueButton.count()) await continueButton.tap()
        await expect(page.getByRole('heading', { name: previousTitle, exact: true })).toHaveCount(0)
      }
      await expect(page).toHaveURL(`${base}/register?after=orientation-analysis`)
      await fillRegistration(page)
      await page.getByRole('checkbox').first().check()
      await page.getByRole('button', { name: 'Voir mon profil complet', exact: true }).tap()
      await expect(page).toHaveURL(`${base}/orientation`)
      await expect.poll(() => state.analyses).toBe(1)
      const expectedAnswers = questions.map((question) => ({
        question_id: question.id, answer: getAnswerChoices(question)[0].answer
      }))
      assert.deepEqual(state.registrations[0].questionnaireResponses, expectedAnswers)
      assert.deepEqual(state.submissions[0].answers, expectedAnswers)
      releaseAnalysis()
      await expect(page.getByRole('button', { name: 'Découvre tes formations', exact: true })).toBeVisible()
      assert.deepEqual(state.errors, [])
      console.log('android-rapid-taps: all 20 questions answered exactly once, registration resumes to results.')
    } finally {
      releaseAnalysis()
      await context.close()
    }
  }

  {
    const { context, page, state, releaseAnalysis } = await prepareJourney({ width: 393, height: 851 }, { mobile: true })
    try {
      await page.goto(`${base}/orientation`)
      await page.getByRole('button', { name: "C'est parti !", exact: true }).tap()
      await page.clock.install()
      await page.clock.pauseAt(new Date())
      const stepLabel = page.locator('.flow-step-label')
      const touch = await context.newCDPSession(page)
      const card = await page.locator('.question-card').boundingBox()
      const start = { x: card.x + card.width / 3, y: card.y + card.height / 2 }
      const end = { ...start, x: start.x + 130 }
      await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [start] })
      await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [end] })
      await page.clock.runFor(40)
      await touch.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] })
      await page.clock.runFor(250)
      await expect(stepLabel).toHaveText('Question 1 / 20')
      assert.equal(await page.evaluate(() => localStorage.getItem('answers_progress')), null, 'A cancelled touch must not submit an answer.')

      for (let swipe = 0; swipe < 2; swipe += 1) {
        await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [start] })
        await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [end] })
        await page.clock.runFor(40)
        await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
      }
      await page.clock.runFor(250)
      await expect(stepLabel).toHaveText('Question 2 / 20')
      assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('answers_progress')).answers), { 1: 'Pas du tout' })

      await page.keyboard.down('1')
      await page.keyboard.down('1')
      await page.clock.runFor(250)
      await expect(stepLabel).toHaveText('Question 3 / 20')
      await page.keyboard.down('1')
      await page.clock.runFor(250)
      await page.keyboard.up('1')
      await expect(stepLabel).toHaveText('Question 3 / 20')

      const choice = await page.locator('.scale-choice').first().boundingBox()
      await page.touchscreen.tap(choice.x + choice.width / 2, choice.y + choice.height / 2)
      await page.getByRole('button', { name: 'Revenir en arrière' }).tap()
      await expect(stepLabel).toHaveText('Question 2 / 20')
      await page.clock.runFor(250)
      await expect(stepLabel).toHaveText('Question 2 / 20')
      await expect(page.locator('.scale-choice').first()).toBeEnabled()
      await expect(page.locator('.scale-choice').first()).toHaveAttribute('aria-pressed', 'true')
      const changedChoice = await page.locator('.scale-choice').last().boundingBox()
      await page.touchscreen.tap(changedChoice.x + changedChoice.width / 2, changedChoice.y + changedChoice.height / 2)
      await page.clock.runFor(250)
      await expect(stepLabel).toHaveText('Question 3 / 20')
      assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('answers_progress')).answers), {
        1: 'Pas du tout', 2: 'Pas du tout', 3: 'Carrément'
      })
      assert.deepEqual(state.errors, [])
      console.log('android-input-transitions: cancelled gestures, rapid swipes, held keys, back during animation and answer changes verified.')
    } finally {
      releaseAnalysis()
      await context.close()
    }
  }

  for (const complete of [true, false]) {
    const questionnaire = questions.map((question, index) => {
      if (index === 4) return { ...question, options: null }
      if (index === 10) return { ...question, options: [] }
      if (index === 15) {
        const { options, ...withoutOptions } = question
        return withoutOptions
      }
      return question
    })
    const progressAnswers = { ...savedAnswers, 5: 'Oui', 11: 'Non', 16: 'Oui' }
    if (!complete) progressAnswers[3] = 'Ancien choix incompatible'
    const { context, page, state, releaseAnalysis } = await prepareJourney({ width: 390, height: 844 }, {
      answered: true, questionnaire, progressAnswers
    })
    try {
      await page.goto(`${base}/register?after=orientation-analysis`)
      await fillRegistration(page)
      await page.getByRole('checkbox').first().check()
      await page.getByRole('button', { name: 'Créer avec email', exact: true }).click()
      await expect(page).toHaveURL(`${base}/orientation`)
      if (complete) {
        await expect.poll(() => state.analyses).toBe(1)
        assert.deepEqual(state.submissions[0].answers, questionnaire.map((question) => ({
          question_id: question.id, answer: progressAnswers[question.id]
        })))
        releaseAnalysis()
        await expect(page.getByRole('button', { name: 'Découvre tes formations', exact: true })).toBeVisible()
        assert.equal(await page.evaluate(() => localStorage.getItem('orientation_resume_after_auth')), null)
      } else {
        await expect(page.locator('.flow-step-label')).toHaveText('Question 3 / 20')
        assert.equal(state.analyses, 0, 'An incompatible answer must still require correction.')
        assert.deepEqual(state.submissions, [])
      }
      assert.deepEqual(state.errors, [])
      console.log(`registration-fallback-${complete ? 'complete' : 'incompatible'}: saved answers validated against displayed choices.`)
    } finally {
      releaseAnalysis()
      await context.close()
    }
  }

  for (const version of ['orientation-flow-v2-20', 'orientation-flow-v3-20', 'orientation-flow-v4-20', 'orientation-flow-v4-binary-20', 'orientation-flow-v5-20']) {
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
      if (version !== 'orientation-flow-v5-20') {
        await page.getByRole('button', { name: "C'est parti !", exact: true }).click()
        assert.equal(await page.evaluate(() => localStorage.getItem('orientation_resume_after_auth')), null)
      }
      await expect(page.getByRole('heading', { name: firstStatement, exact: true })).toBeVisible()
      assert.equal(state.analyses, 0, 'Stale answers must not trigger analysis.')
      assert.deepEqual(state.errors, [])
    } finally {
      releaseAnalysis()
      await context.close()
    }
  }

  for (const viewport of [{ width: 1440, height: 900 }, { width: 713, height: 357 }, { width: 693, height: 695 }, { width: 390, height: 844 }, { width: 320, height: 568 }]) {
    const { context, page, state, releaseAnalysis } = await prepareJourney(viewport)
    try {
      await page.goto(`${base}/orientation`)
      await page.getByRole('button', { name: "C'est parti !", exact: true }).click()
      const progress = page.getByRole('progressbar', { name: 'Progression du questionnaire' })
      await expect(progress).toBeVisible()
      await expect(progress).toHaveAttribute('aria-valuenow', '0')
      await expect(page.locator('.question-icon-badge')).toHaveCount(0)
      await expect(page.getByRole('heading', { name: firstStatement, exact: true })).toBeVisible()
      const questionLayout = await getStageLayout(page)
      await page.keyboard.press('ArrowRight')
      await expect(progress).toHaveAttribute('aria-valuenow', '5')
      await assertStageLayout(page, questionLayout)
      assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('answers_progress')).answers['1']), 'Pas du tout')
      assert.equal(await page.evaluate(() => window.dataLayer.filter((item) => item?.event === 'orientation_question_answered').at(-1).orientation_answer_position), 4)
      await page.getByRole('button', { name: 'Revenir en arrière' }).click()
      await expect(progress).toHaveAttribute('aria-valuenow', '0')
      await expect(page.locator('.question-prompt')).toHaveCount(0)
      await expect(page.locator('.dilemma-options, .dilemma-scale')).toHaveCount(0)
      await expect(page.locator('.scale-choice')).toHaveCount(4)
      await expect(page.locator('.scale-choice')).toHaveText(['Carrément', 'Plutôt oui', 'Plutôt pas', 'Pas du tout'])
      await expect(page.locator('.scale-choice.level-0')).toHaveAttribute('aria-pressed', 'true')
      const colors = await page.locator('.scale-choice').evaluateAll((buttons) => buttons.map((el) => getComputedStyle(el).backgroundColor))
      assert.deepEqual(colors, ['rgb(193, 255, 114)', 'rgb(248, 255, 240)', 'rgb(255, 247, 253)', 'rgb(252, 232, 255)'])
      await expect(page.locator('.scale-choice').first()).toHaveAccessibleName('Carrément')
      await page.keyboard.press('ArrowLeft')
      await expect(progress).toHaveAttribute('aria-valuenow', '5')
      assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('answers_progress')).answers['1']), 'Carrément')
      assert.equal(await page.evaluate(() => window.dataLayer.filter((item) => item?.event === 'orientation_question_answered').at(-1).orientation_answer_position), 1)
      await page.getByRole('button', { name: 'Revenir en arrière' }).click()
      await expect(progress).toHaveAttribute('aria-valuenow', '0')
      await expect(page.locator('.scale-choice.level-3')).toHaveAttribute('aria-pressed', 'true')
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
      await expect(page.locator('.scale-choice').last()).toBeInViewport({ ratio: 1 })
      await page.screenshot({ path: join(output, `questions-comparison-${viewport.width}.png`) })
      await page.locator('.scale-choice.level-2').click()
      await expect(progress).toHaveAttribute('aria-valuenow', '5')
      await page.reload()
      await expect(progress).toHaveAttribute('aria-valuenow', '5')
      await expect(page.getByRole('heading', { name: longStatement, exact: true })).toBeVisible()
      await expect(page.locator('.scale-choice').last()).toBeInViewport({ ratio: 1 })
      await page.screenshot({ path: join(output, `questions-comparison-long-${viewport.width}.png`) })
      if (viewport.width === 390) {
        const card = page.locator('.question-card')
        const box = await card.boundingBox()
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
        await page.mouse.down()
        await page.mouse.move(box.x + box.width / 2 + 130, box.y + box.height / 2, { steps: 8 })
        await page.mouse.up()
        await expect(progress).toHaveAttribute('aria-valuenow', '10')
        assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('answers_progress')).answers['2']), 'Pas du tout')
        await expect(card).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 0)')
        const nextBox = await card.boundingBox()
        await page.mouse.move(nextBox.x + nextBox.width / 2, nextBox.y + nextBox.height / 2)
        await page.mouse.down()
        await page.mouse.move(nextBox.x + nextBox.width / 2 - 130, nextBox.y + nextBox.height / 2, { steps: 8 })
        await page.mouse.up()
        await expect(progress).toHaveAttribute('aria-valuenow', '15')
        assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('answers_progress')).answers['3']), 'Carrément')
      }
      while (await page.locator('.question-card').count()) {
        const previousQuestion = await page.locator('.flow-step-label').textContent()
        const questionNumber = Number(previousQuestion.match(/^Question (\d+)/)?.[1])
        if (questionNumber >= 4 && questionNumber <= 7) {
          await expect(page.locator('.scale-choice')).toHaveCount(4)
          const position = questionNumber - 3
          await page.keyboard.press(String(position))
          assert.equal(await page.evaluate((id) => JSON.parse(localStorage.getItem('answers_progress')).answers[id], questionNumber), ['Carrément', 'Plutôt oui', 'Plutôt pas', 'Pas du tout'][position - 1])
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
      await assertStageLayout(page, questionLayout)
      await page.getByRole('button', { name: 'Revenir en arrière' }).click()
      await expect(page.getByRole('button', { name: 'Revenir en arrière' }).locator('svg')).toBeVisible()
      await expect(progress).toHaveAttribute('aria-valuenow', '95')
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'Questionnaire overflow.')
      await page.screenshot({ path: join(output, `questions-${viewport.width}.png`) })
      await page.locator('.scale-choice.level-3').click()
      await expect(progress).toHaveAttribute('aria-valuenow', '100')
      let infoStep = 0
      while (await page.locator('.choice-card').count()) {
        infoStep += 1
        await assertStageLayout(page, questionLayout)
        const previousTitle = await page.locator('.choice-card h1').textContent()
        await page.screenshot({ path: join(output, `info-${infoStep}-${viewport.width}.png`) })
        await page.locator('.choice-card button').first().click()
        const continueButton = page.getByRole('button', { name: 'Continuer', exact: true })
        if (await continueButton.count()) await continueButton.click()
        await expect(page.getByRole('heading', { name: previousTitle, exact: true })).toHaveCount(0)
      }
      assert.equal(infoStep, 6, 'All six follow-up steps must preserve the questionnaire spacing.')
      await expect(page).toHaveURL(`${base}/register?after=orientation-analysis`)
      if (viewport.width === 390) {
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
        assert.ok(storedAnswers.includes('Plutôt oui'), `Nuanced agreement answer not stored: ${storedAnswers}`)
        assert.ok(!storedAnswers.includes('Clairement : ') && !storedAnswers.includes('Plutôt : '), 'Comparisons must store agreement labels, not activity labels.')
        assert.ok(storedAnswers.includes('Carrément'), `Agreement answer not stored: ${storedAnswers}`)
        assert.ok(storedAnswers.includes('Analyser'), `Legacy answer not stored: ${storedAnswers}`)
        assert.equal(state.registrations[0].newsletterOptIn, false)
        assert.deepEqual(state.sharing[0], { granted: true, version: 'orientation-dossier-v1' })
        releaseAnalysis()
        await expect(page.getByRole('button', { name: 'Découvre tes formations', exact: true })).toBeVisible()
      }
      assert.deepEqual(state.errors, [])
      console.log(`questions-${viewport.width}: stable header and follow-up spacing, progress, keyboard, swipe, back and resume verified.`)
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
      state.failAnalysis = true
      if (reducedMotion === 'reduce') state.analysisError = "L'accès au service d'analyse est refusé ou mal configuré. Contacte l'équipe Zélia."
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
        await expect(page.getByRole('alert')).toContainText(state.analysisError)
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
    { name: 'doctorat-empty', viewport: { width: 390, height: 844 }, populated: false, formationPreferences: ['doctorat'] },
    { name: 'masters-unified-results', viewport: { width: 390, height: 844 }, populated: true, noPartners: true, formationPreferences: ['master'], masterCoverage: true },
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
    const nationalCount = scenario.populated ? (scenario.masterCoverage ? 2 : 8) : 0
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
    await context.addInitScript(({ savedAnswers, formationPreferences }) => {
      localStorage.setItem('token', 'orientation-fixture-token')
      localStorage.setItem('orientation_resume_after_auth', 'analysis')
      localStorage.setItem('answers_progress', JSON.stringify({
        version: 'orientation-flow-v5-20',
        answers: savedAnswers
      }))
      localStorage.setItem('orientation_micro_profile', JSON.stringify({
        formation_preferences: formationPreferences, strong_subjects: ['sciences'], study_location: 'near_home'
      }))
      // Prevent the optional CDN Tailwind script from being needed by this test.
      window.tailwind = { config: {} }
    }, { savedAnswers, formationPreferences: scenario.formationPreferences || ['bts'] })
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
          studyRecommendations: scenario.masterCoverage
            ? [{ degree: 'Master sciences politiques' }, { degree: 'Master informatique' }]
            : scenario.populated ? [{ degree: 'BTS Maintenance', type: 'Formation pratique.' }] : []
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
        data = scenario.masterCoverage ? {
          items: [
            { id: 5604, nmc: 'ScPo', nm: ['Sciences Po - Instituts d’études politiques - Grade Master'], fl: ['Grade Master'], etab_nom: 'Établissement exemple', commune: 'Paris', departement: 'Paris' },
            { id: 3661, nmc: 'CMI-Info', nm: ['Cursus Master en Ingénierie - Informatique'], etab_nom: 'Université exemple', commune: 'Paris', departement: 'Paris' }
          ]
        } : { items: scenario.populated ? formations : [] }
      } else {
        errors.push(`Unexpected API request: ${request.method()} ${path}`)
        return route.fulfill({ status: 404, json: { error: 'Unexpected fixture request' } })
      }
      return route.fulfill({ status: 200, json: data })
    })

    try {
      await page.goto(`${base}/orientation`)
      const studiesCta = page.getByRole('button', { name: 'Découvre tes formations', exact: true })
      await expect(studiesCta).toHaveCount(1)
      await expect(studiesCta).toBeInViewport({ ratio: 1 })
      await expect(studiesCta.locator('svg[aria-hidden="true"]')).toBeVisible()
      await expect(page.locator('.personality-reveal-actions')).toHaveCSS('position', 'fixed')
      await expect(page.locator('.persona-card-poster .persona-icon-btn')).toHaveCount(3)
      await expect(page.locator('.persona-card-poster .persona-continue')).toHaveCount(0)
      await page.mouse.move(0, 0)
      await expect(studiesCta).toHaveCSS('transform', 'none')
      const studiesStyle = await getContinueButtonStyle(studiesCta)
      const studiesPosition = await studiesCta.boundingBox()
      await page.locator('.personality-details summary').click()
      await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }))
      await expect(studiesCta).toBeInViewport({ ratio: 1 })
      await page.mouse.move(0, 0)
      await expect(studiesCta).toHaveCSS('transform', 'none')
      const studiesPositionAfterScroll = await studiesCta.boundingBox()
      assert.ok(Math.abs(studiesPositionAfterScroll.y - studiesPosition.y) <= 1, 'The formations CTA must stay fixed during scrolling.')
      const detailsBox = await page.locator('.personality-details').boundingBox()
      const studiesBar = await page.locator('.personality-reveal-actions').boundingBox()
      assert.ok(detailsBox.y + detailsBox.height <= studiesBar.y, 'The fixed formations CTA must not obscure the analysis.')
      if (['desktop', 'mobile', 'small-mobile'].includes(scenario.name)) {
        await page.screenshot({ path: join(output, `${scenario.name}-discover-formations.png`) })
      }
      const firstPartnerResponse = page.waitForResponse((response) => response.url().endsWith('/api/ecoles/matched'))
      const firstCatalogResponse = scenario.slowPartners
        ? page.waitForResponse((response) => response.url().includes('/api/catalog/formations/search'))
        : null
      if (scenario.name === 'mobile') {
        await studiesCta.focus()
        await page.keyboard.press('Enter')
      } else {
        await studiesCta.click()
      }
      const jobsCta = page.getByRole('button', { name: 'Découvre tes métiers', exact: true })
      await expect(studiesCta).toHaveCount(0)
      await expect(page.locator('.personality-reveal-actions')).toHaveCount(0)
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

      if (scenario.masterCoverage) {
        const cmi = page.locator('.formation-lead-card[data-source="national"]', { hasText: 'Cursus Master en Ingénierie - Informatique' })
        await expect(cmi).toBeVisible()
        await expect(cmi.locator('.formation-lead-score')).toBeVisible()
        await expect(cmi.getByRole('checkbox', { name: "Je veux plus d'infos" })).toBeChecked()
        await cmi.locator('.formation-lead-check').click()
        await expect(cmi.getByRole('checkbox')).not.toBeChecked()
        await cmi.locator('.formation-lead-check').click()
        await expect(cmi.getByRole('checkbox')).toBeChecked()
        await expect(page.getByRole('region', { name: 'Parcours vers un master' })).toHaveCount(0)
        await expect(page.getByRole('link', { name: 'Explorer le parcours' })).toHaveCount(0)
      }

      if (scenario.partnerFailure) {
        await expect(page.getByRole('alert')).toContainText('Impossible de charger les formations partenaires')
        await expect(page.locator('.formation-lead-card[data-source="national"]')).toHaveCount(8)
        await expect(partnerCards).toHaveCount(0)
        await page.getByRole('button', { name: 'Réessayer les formations partenaires' }).click()
        await expect(page.getByRole('alert')).toHaveCount(0)
      }
      await expect(partnerCards).toHaveCount(partnerCount)
      if (scenario.formationPreferences?.includes('doctorat')) {
        await expect(page.getByText('Aucun doctorat correspondant', { exact: false })).toBeVisible()
        await expect(page.locator('.persona-portrait-grid')).toHaveCount(0)
      }
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
      await page.mouse.move(0, 0)
      await expect(jobsCta).toHaveCSS('background-color', studiesStyle.backgroundColor)
      await expect(jobsCta).toHaveCSS('transform', 'none')
      assert.deepEqual(await getContinueButtonStyle(jobsCta), studiesStyle, 'Both discovery CTAs must have exactly the same computed appearance.')
      const jobsPosition = await jobsCta.boundingBox()
      for (const dimension of ['x', 'y', 'width', 'height']) {
        assert.ok(Math.abs(jobsPosition[dimension] - studiesPosition[dimension]) <= 1, `Both discovery CTAs must have the same ${dimension}: ${studiesPosition[dimension]} vs ${jobsPosition[dimension]}.`)
      }
      await expect(page.locator('.orientation-loading')).toHaveCount(0)
      await expect(page.locator('.formation-lead-card[data-source="national"]')).toHaveCount(nationalCount)
      for (const title of offTopicTitles) await expect(page.locator('.formation-lead-card', { hasText: title })).toHaveCount(0)
      await expect(partnerCards).toHaveCount(partnerCount)
      const cardSources = await page.locator('.formation-lead-card').evaluateAll((cards) => cards.map((card) => card.dataset.source))
      if (hasPartners) assert.equal(cardSources.indexOf('partner'), scenario.populated ? 3 : 0, 'The first partner comes after the first three national results.')
      await expect(page.getByRole('checkbox')).toHaveCount(nationalCount + partnerCount)
      const recommendationCount = nationalCount + partnerCount
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
      const formationCount = nationalCount + partnerCount
      await expect.poll(() => savedSelections.length).toBe(formationCount ? 1 : 0)
      if (scenario.populated) {
        const nationalSaved = savedSelections[0].filter((entry) => entry.sourceTable === 'formation_france')
        assert.equal(nationalSaved.length, nationalCount)
        if (scenario.masterCoverage) {
          assert.ok(nationalSaved.some((entry) => String(entry.rawId) === '3661'), 'CMI selection must be saved with the other national formations')
        }
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
