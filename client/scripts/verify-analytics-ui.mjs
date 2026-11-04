import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { chromium, expect } from '@playwright/test'
import { startViteTestServer } from './vite-test-server.mjs'
import { getAnswerChoices } from '../src/lib/questionScale.js'

const server = await startViteTestServer({ root: fileURLToPath(new URL('..', import.meta.url)) })
const base = `http://127.0.0.1:${server.httpServer.address().port}`
let browser
const questions = Array.from({ length: 20 }, (_, index) => ({
  id: index + 1, content: `Question ${index + 1}`, category: 'hands_mind',
  options: ['Pas du tout', 'Plutôt pas', 'Plutôt oui', 'Carrément'].map((label, level) => ({
    label, level, value: 'mains', alternative: 'tete'
  }))
}))
const user = {
  id: 'analytics-fixture', first_name: 'Camille', last_name: 'Martin', department: '75',
  email: 'private@example.test', aud: 'authenticated', app_metadata: { provider: 'google' }
}
const formation = { id: 1, nm: ['BTS Maintenance'], etab_nom: 'Lycée exemple', commune: 'Paris', etab_url: 'https://example.test/formation' }
const partner = {
  id: 'partner-fixture', school_name: 'École exemple', formation_name: 'BTS Maintenance',
  city: 'Paris', diploma_level: 'Bac+2', is_active: true, show_in_results: true, match_score: 80
}
const results = {
  personalityAnalysis: 'Profil concret.', skillsAssessment: 'Précision.',
  shareImageUrl: 'data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22/%3E',
  jobRecommendations: [{ title: 'Technicien', skills: ['Précision'] }]
}
const count = (state, event) => state.events.filter((entry) => entry.event === event).length
const last = (state, event) => state.events.findLast((entry) => entry.event === event)
const assertPrivate = (state) => assert.doesNotMatch(
  JSON.stringify(state.events), /Camille|Martin|private@example|fixture-password|private message|cs_private/
)

async function prepare({ authenticated = false, ...options } = {}) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const state = { events: [], errors: [], failLead: false, paid: true, submitted: [], ...options }
  await context.exposeBinding('__recordAnalytics', (_, event) => state.events.push(event))
  const source = await (await fetch(`${base}/src/lib/supabase.js`)).text()
  const supabaseUrl = source.match(/"VITE_SUPABASE_URL"\s*:\s*"([^"]+)"/)?.[1]
  assert.ok(supabaseUrl, 'Supabase must be configured for the existing auth UI checks.')
  const storageKey = `sb-${new URL(supabaseUrl).hostname.split('.')[0]}-auth-token`
  await context.addInitScript(({ authenticated, storageKey, user }) => {
    const dataLayer = []
    const push = dataLayer.push
    dataLayer.push = (...items) => {
      for (const item of items) window.__recordAnalytics(item)
      return push.apply(dataLayer, items)
    }
    window.dataLayer = dataLayer
    if (authenticated) {
      localStorage.setItem('token', 'analytics-fixture-token')
      localStorage.setItem(storageKey, JSON.stringify({
        access_token: 'analytics-fixture-token', refresh_token: 'analytics-fixture-refresh',
        expires_at: Math.floor(Date.now() / 1000) + 3600, expires_in: 3600, token_type: 'bearer', user
      }))
    }
  }, { authenticated, storageKey, user })
  await context.route('**/*', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const reply = (json, status = 200) => route.fulfill({ json, status })
    if (url.pathname.includes('/auth/v1/')) {
      if (url.pathname.endsWith('/logout')) return reply({})
      if (url.pathname.endsWith('/token')) return reply({
        access_token: 'analytics-fixture-token', refresh_token: 'analytics-fixture-refresh',
        expires_in: 3600, token_type: 'bearer', user
      })
      return reply(user)
    }
    if (url.pathname.startsWith('/api/')) {
      const path = url.pathname.slice(4)
      if (path === '/questionnaire/questions') return reply(questions)
      if (path === '/auth/register') return reply({ user })
      if (path === '/users/me') return reply({ user })
      if (path === '/users/profile') return reply({ profile: user })
      if (path === '/users/profile/extra-info') return reply({ entries: [] })
      if (path === '/users/school-sharing') return reply({ saved: true, granted: true, schools: [] })
      if (path === '/questionnaire/submit') return reply({ success: true })
      if (path === '/analysis/generate-analysis') return reply({ success: true })
      if (path === '/analysis/my-results') return reply({ results })
      if (path === '/catalog/formations/search') return reply({ items: [], pathways: [], total: 0 })
      if (path === '/formations') return reply({ formations: [formation], total: 1 })
      if (path === '/formations/1') return reply({ formation })
      if (path === '/ecoles/matched') return reply({ matched: [partner] })
      if (path === '/ecoles/partenaires') return reply({ formations: [partner] })
      if (path === '/ecoles/partenaires/partner-fixture') return reply({ formation: partner })
      if (path === '/ecoles/my-submissions') return reply({ submissions: state.submitted.map((id) => ({ formation_id: id })) })
      if (path === '/formations/1/request-info' || path === '/ecoles/submit') {
        if (state.failLead) return reply({ error: 'Fixture indisponible', message: 'Fixture indisponible' }, 503)
        if (path === '/ecoles/submit') {
          if (state.duplicateLead) return reply({ message: 'Déjà envoyé' }, 409)
          state.submitted.push(request.postDataJSON().formation_id)
        }
        return reply({ success: true })
      }
      if (path === '/chat/ai') return state.failChat
        ? reply({ error: 'Fixture indisponible' }, 503) : reply({ reply: 'Réponse de test.' })
      if (path === '/chat/ai/quota') return reply({ remaining: 5 })
      if (path === '/payments/parent-training/config') return reply({ enabled: true, priceAmount: 2500, priceCurrency: 'eur' })
      if (path === '/payments/parent-training/verify') return reply({ paid: state.paid })
      if (path === '/payments/parent-training/checkout') return state.failCheckout
        ? reply({ error: 'Fixture indisponible' }, 503) : reply({ url: `${base}/__analytics-checkout` })
      state.errors.push(`Unexpected fixture request: ${request.method()} ${path}`)
      return reply({ error: 'Unexpected fixture request' }, 404)
    }
    if (url.pathname === '/__analytics-checkout') return route.fulfill({ contentType: 'text/html', body: '<h1>Checkout fixture</h1>' })
    if (url.origin === base) return route.continue()
    return route.abort()
  })
  const page = await context.newPage()
  page.setDefaultTimeout(15000)
  page.on('pageerror', (error) => state.errors.push(error.message))
  return { context, page, state }
}

async function check(name, options, run) {
  const prepared = await prepare(options)
  try {
    await run(prepared)
    assertPrivate(prepared.state)
    assert.deepEqual(prepared.state.errors, [])
    console.log(`analytics-${name}: verified`)
  } finally {
    await prepared.context.close()
  }
}

try {
  browser = await chromium.launch({ headless: true })
  await check('public-navigation', {}, async ({ page, state }) => {
    await page.goto(base)
    await page.locator('.public-header a[href="/parents"]').click()
    await expect(page).toHaveURL(`${base}/parents`)
    await expect.poll(() => count(state, 'site_cta_clicked')).toBe(1)
    assert.equal(last(state, 'site_cta_clicked').destination_path, '/parents')
    assert.equal(last(state, 'site_cta_clicked').navigation_area, 'header')
    const views = count(state, 'Pageview')
    await page.evaluate(() => {
      history.pushState(history.state, '', '?email=private@example.test#private')
      dispatchEvent(new PopStateEvent('popstate'))
    })
    await page.getByRole('button', { name: "Je m'inscris", exact: true }).click()
    await expect.poll(() => count(state, 'parent_training_cta_clicked')).toBe(1)
    assert.equal(count(state, 'Pageview'), views, 'Query/anchor changes must not duplicate pageviews.')
    assert.equal(count(state, 'gtm.js'), 1, 'SPA navigation must not reload GTM.')
  })

  await check('orientation-and-registration', {}, async ({ page, state }) => {
    await page.goto(`${base}/orientation`)
    await page.getByRole('button', { name: "C'est parti !", exact: true }).click()
    for (let index = 0; index < questions.length; index += 1) {
      await expect(page.locator('.flow-step-label')).toHaveText(`Question ${index + 1} / 20`)
      await page.locator('.scale-choice').first().evaluate((button) => { button.click(); button.click() })
    }
    await expect(page.locator('.choice-card')).toBeVisible()
    for (let index = 0; index < 6; index += 1) {
      await expect(page.locator('.flow-step-label')).toHaveText(`Étape ${index + 1} / 6`)
      await page.locator('.choice-card button').first().click()
      if ([1, 3, 5].includes(index)) {
        await page.getByRole('button', { name: 'Continuer', exact: true }).evaluate((button) => { button.click(); button.click() })
      }
    }
    await expect(page).toHaveURL(`${base}/register?after=orientation-analysis`)
    assert.equal(count(state, 'orientation_question_answered'), 20)
    assert.equal(count(state, 'orientation_micro_step_completed'), 6)
    assert.deepEqual(state.events.filter((event) => event.event === 'orientation_micro_step_completed')
      .map((event) => event.orientation_micro_step),
    ['school_level', 'strong_subjects', 'grade_confidence', 'formation_preferences', 'study_location', 'career_domains'])
    assert.equal(last(state, 'orientation_question_answered').orientation_answer_position, 1)
    assert.equal(last(state, 'orientation_question_answered').orientation_questionnaire, 'inscription_v5')
    await page.getByLabel('Prénom', { exact: true }).fill('Camille')
    await page.getByLabel('Nom', { exact: true }).fill('Martin')
    await page.getByLabel('Genre', { exact: true }).selectOption('Femme')
    await page.getByLabel('Département', { exact: true }).selectOption('75')
    await page.getByLabel('Email', { exact: true }).fill('private@example.test')
    await page.getByLabel('Mot de passe', { exact: true }).fill('fixture-password')
    await page.getByRole('checkbox').first().check()
    await page.getByRole('button', { name: 'Voir mon profil complet', exact: true }).click()
    await page.getByRole('button', { name: 'Découvre tes formations', exact: true }).click()
    await expect(page.locator('.formation-lead-card')).toHaveCount(1)
    await expect.poll(() => state.events.filter((event) => event.event === 'orientation_step_viewed' && event.orientation_step === 'formations').length).toBe(1)
    const formationView = state.events.findLast((event) => event.event === 'orientation_step_viewed' && event.orientation_step === 'formations')
    assert.equal(formationView.orientation_item_count, 1)
    assert.equal(formationView.orientation_micro_step, null)
    await page.locator('.formation-lead-check').click()
    await expect(page.locator('.formation-lead-check input')).not.toBeChecked()
    await page.getByRole('button', { name: 'Découvre tes métiers', exact: true }).click()
    const selection = state.events.findLast((event) => event.event === 'orientation_step_completed' && event.orientation_step === 'formations')
    assert.equal(selection.orientation_selected_count, 0)
    await page.getByRole('button', { name: 'Découvrir mon avatar', exact: true }).click()
    await page.getByRole('button', { name: "Découvrir l'app", exact: true }).click()
    await expect(page).toHaveURL(`${base}/app`)
    await expect.poll(() => count(state, 'orientation_flow_completed')).toBe(1)
    assert.equal(count(state, 'orientation_flow_started'), 1)
    assert.equal(count(state, 'sign_up'), 1)
    assert.equal(last(state, 'sign_up').auth_context, 'orientation')
    assert.equal(last(state, 'sign_up').page_type, 'orientation')
    assert.equal(count(state, 'orientation_analysis_started'), 1)
    assert.equal(count(state, 'orientation_analysis_completed'), 1)
    assert.equal(count(state, 'orientation_analysis_failed'), 0)
    assert.equal(getAnswerChoices(questions[0])[0].label, 'Carrément')
  })

  await check('public-formations', {}, async ({ page, state }) => {
    await page.goto(`${base}/formations`)
    await expect(page.locator('.fp-result-card')).toHaveCount(1)
    await page.getByLabel('Rechercher une formation').fill('private message')
    await expect.poll(() => last(state, 'formation_results_viewed')?.has_query).toBe(true)
    await page.locator('.fp-result-card').click()
    await expect.poll(() => count(state, 'formation_detail_viewed')).toBe(1)
    assert.equal(count(state, 'formation_selected'), 1)
    await page.getByRole('link', { name: /Site de l'établissement/ }).evaluate((link) => {
      link.addEventListener('click', (event) => event.preventDefault(), { once: true })
      link.click()
    })
    await expect.poll(() => count(state, 'formation_outbound_clicked')).toBe(1)
    assert.equal(last(state, 'formation_outbound_clicked').formation_source, 'national')
    assert.equal(count(state, 'generate_lead'), 0, 'Exploring a national formation is not a lead.')
  })

  for (const duplicateLead of [false, true]) {
    await check(`partner-lead-${duplicateLead ? 'duplicate' : 'success'}`, { authenticated: true, duplicateLead }, async ({ page, state }) => {
      await page.goto(`${base}/app/ecoles-partenaires/partner-fixture`)
      if (!duplicateLead) {
        state.failLead = true
        await page.getByRole('button', { name: "Demande d'informations", exact: true }).click()
        await expect.poll(() => count(state, 'formation_info_failed')).toBe(1)
        assert.equal(count(state, 'generate_lead'), 0)
        state.failLead = false
      }
      await page.getByRole('button', { name: "Demande d'informations", exact: true }).click()
      await expect(page.getByRole('button', { name: 'Demande envoyée', exact: true })).toBeVisible()
      await expect.poll(() => count(state, 'formation_info_requested')).toBe(duplicateLead ? 1 : 2)
      assert.equal(count(state, 'generate_lead'), duplicateLead ? 0 : 1)
      assert.equal(count(state, 'formation_info_failed'), duplicateLead ? 0 : 1)
    })
  }

  await check('app-explorer-and-activity', { authenticated: true }, async ({ page, state }) => {
    await page.goto(`${base}/app/formations`)
    await expect(page.locator('.fe-card')).toHaveCount(1)
    await page.getByRole('button', { name: 'Demander des informations', exact: true }).click()
    await expect.poll(() => count(state, 'generate_lead')).toBe(1)
    assert.equal(last(state, 'formation_results_viewed').formation_source, 'mixed')
    await page.locator('.zelia-topbar-logo').click()
    await page.getByRole('button', { name: /Comprends Parcoursup/ }).click()
    await expect.poll(() => count(state, 'app_tool_opened')).toBe(1)
    assert.equal(last(state, 'app_activity_selected').tool_id, 'parcoursup')
    assert.equal(last(state, 'app_tool_opened').tool_id, 'parcoursup')
  })

  await check('login-and-oauth-return', { authenticated: true }, async ({ page, state }) => {
    await page.goto(`${base}/auth/callback`)
    await expect(page).toHaveURL(`${base}/app`)
    await expect.poll(() => count(state, 'login')).toBe(1)
    assert.equal(last(state, 'login').method, 'google')
    assert.equal(last(state, 'login').page_type, 'app')
    assert.equal(count(state, 'gtm.js'), 1)
    assert.equal(state.events.filter((event) => event.event === 'Pageview').some((event) => event.pagePath.includes('callback')), false)
  })

  await check('chat-and-profile', { authenticated: true }, async ({ page, state }) => {
    await page.goto(`${base}/app/discuter`)
    const input = page.getByPlaceholder('Demande à Zélia : CV, formation, métier, lettre...')
    await input.fill('private message')
    await page.getByRole('button', { name: 'Envoyer', exact: true }).click()
    await expect.poll(() => count(state, 'chat_reply_received')).toBe(1)
    assert.equal(last(state, 'chat_message_sent').chat_mode, 'advisor')
    state.failChat = true
    await input.fill('private message')
    await page.getByRole('button', { name: 'Envoyer', exact: true }).click()
    await expect.poll(() => count(state, 'chat_reply_failed')).toBe(1)
    await page.locator('.zelia-topbar-profile').click()
    await page.getByRole('button', { name: 'Modifier', exact: true }).click()
    await page.getByLabel('Prénom', { exact: true }).fill('Camille')
    await page.getByRole('button', { name: /Enregistrer/ }).click()
    await expect.poll(() => count(state, 'profile_updated')).toBe(1)
  })

  await check('parents-checkout', { failCheckout: true }, async ({ page, state }) => {
    await page.goto(`${base}/parents`)
    await page.getByLabel('Prénom', { exact: true }).fill('Camille')
    await page.getByLabel('Nom', { exact: true }).fill('Martin')
    await page.getByLabel('Email', { exact: true }).fill('private@example.test')
    await page.getByRole('button', { name: "Je m'inscris et je paie" }).click()
    await expect.poll(() => count(state, 'parent_training_checkout_failed')).toBe(1)
    assert.equal(count(state, 'parent_training_payment_confirmed'), 0)
    state.failCheckout = false
    await page.getByRole('button', { name: "Je m'inscris et je paie" }).click()
    await expect(page).toHaveURL(`${base}/__analytics-checkout`)
    assert.equal(count(state, 'parent_training_checkout_started'), 2)
    assert.equal(count(state, 'parent_training_checkout_redirected'), 1)
  })

  for (const paid of [false, true]) {
    await check(`parents-payment-${paid ? 'confirmed' : 'pending'}`, { paid }, async ({ page, state }) => {
      await page.goto(`${base}/parents?checkout=success&session_id=cs_private`)
      await expect.poll(() => count(state, paid ? 'parent_training_payment_confirmed' : 'parent_training_payment_pending')).toBe(1)
      assert.equal(count(state, 'parent_training_payment_confirmed'), paid ? 1 : 0)
      if (paid) {
        await page.evaluate(() => {
          for (const origin of ['https://untrusted.example', 'https://calendly.com', 'https://calendly.com']) {
            dispatchEvent(new MessageEvent('message', { origin, data: { event: 'calendly.event_scheduled', payload: { email: 'private@example.test' } } }))
          }
        })
        await expect.poll(() => count(state, 'parent_training_booking_completed')).toBe(1)
        await page.reload()
        await expect(page.locator('.calendly-inline-widget')).toBeVisible()
        assert.equal(count(state, 'parent_training_payment_confirmed'), 1, 'Reloading a receipt must not count another conversion.')
      }
      for (const view of state.events.filter((event) => event.event === 'Pageview')) assert.equal(view.pagePath, '/parents')
    })
  }
} finally {
  await browser?.close()
  await server.close()
}
