import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium, expect as baseExpect } from '@playwright/test'

const expect = baseExpect.configure({ timeout: 15000 })
const base = process.env.LOGIN_TEST_URL || 'http://127.0.0.1:5187'
const output = join(tmpdir(), 'zelia-login-tests')
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ headless: true })
const user = { id: 'login-fixture', email: 'camille@example.com', aud: 'authenticated', user_metadata: { first_name: 'Camille' } }
const answers = [{ question_id: 1, answer: 'Carrément' }]

async function prepare(viewport, { cached = false, consent = false, reducedMotion = 'no-preference' } = {}) {
  const context = await browser.newContext({ viewport, reducedMotion })
  const page = await context.newPage()
  page.setDefaultTimeout(15000)
  page.setDefaultNavigationTimeout(60000)
  const state = { errors: [], credentials: [], profiles: [], submissions: [], oauth: [], authFailure: null, failProfile: false, holdToken: false }
  let releaseLogin
  const tokenReady = new Promise((resolve) => { releaseLogin = resolve })
  page.on('pageerror', (error) => state.errors.push(error.message))
  await context.addInitScript(({ cached, consent, answers, origin }) => {
    if (window !== window.top || location.origin !== origin) return
    window.tailwind = { config: {} }
    if (cached) {
      localStorage.setItem('answers_cache', JSON.stringify({ answers }))
      localStorage.setItem('answers_progress', JSON.stringify({ version: 'orientation-flow-v3-20', answers: { 1: 'Carrément' } }))
    }
    if (consent) localStorage.setItem('registration_consent', JSON.stringify({ accept_terms: true, accept_data_transfer: false }))
  }, { cached, consent, answers, origin: new URL(base).origin })
  await context.route('**/*', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (url.pathname.endsWith('/auth/v1/authorize')) {
      state.oauth.push(url.toString())
      return route.fulfill({ contentType: 'text/html', body: '<p>Google simulé</p>' })
    }
    if (url.pathname.includes('/auth/v1/')) {
      if (url.pathname.endsWith('/token')) {
        state.credentials.push(request.postDataJSON())
        if (state.holdToken) await tokenReady
        if (state.authFailure) return route.fulfill({ status: state.authFailure.status || 400, json: state.authFailure })
        return route.fulfill({ json: {
          access_token: 'login-fixture-token', refresh_token: 'login-fixture-refresh',
          expires_in: 3600, token_type: 'bearer', user
        } })
      }
      return route.fulfill({ json: user })
    }
    // Keep this check focused on authentication: downstream pages must not consume onboarding state.
    if (url.origin === new URL(base).origin && /\/src\/pages\/(?:ConversationalHome|Results|Questionnaire)\.jsx$/.test(url.pathname)) {
      return route.fulfill({ contentType: 'application/javascript', body: "export default function AuthDestination() { return 'Destination connectée simulée' }" })
    }
    if (url.pathname.includes('/api/')) {
      const path = url.pathname.replace(/^.*\/api/, '')
      let data
      if (path === '/users/profile') {
        if (request.method() === 'PUT') {
          state.profiles.push(request.postDataJSON())
          if (state.failProfile) return route.fulfill({ status: 503, json: { error: 'Profil indisponible' } })
        }
        data = { profile: { ...user, first_name: 'Camille' } }
      } else if (path === '/users/me') data = { user }
      else if (path === '/questionnaire/submit') {
        state.submissions.push(request.postDataJSON())
        data = { success: true }
      } else {
        state.errors.push(`Unexpected auth fixture request: ${request.method()} ${path}`)
        return route.fulfill({ status: 404, json: { error: 'Unexpected fixture request' } })
      }
      return route.fulfill({ json: data })
    }
    if (url.origin === new URL(base).origin) return route.continue()
    return route.abort()
  })
  return { context, page, state, releaseLogin }
}

async function fillCredentials(page) {
  await page.getByLabel('Email', { exact: true }).fill(user.email)
  await page.getByLabel('Mot de passe', { exact: true }).fill('fixture-password')
}

try {
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }, { width: 320, height: 568 }]) {
    const { context, page, state } = await prepare(viewport, { reducedMotion: viewport.width === 320 ? 'reduce' : 'no-preference' })
    try {
      await page.goto(`${base}/login`)
      await expect(page.getByRole('heading', { name: 'Reprends ton parcours' })).toBeVisible()
      await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
      await expect(page.getByText('Supabase', { exact: false })).toHaveCount(0)
      await expect(page.getByRole('link', { name: 'Créer un compte' })).toHaveAttribute('href', '/register')
      await expect(page.getByLabel('Email', { exact: true })).toHaveAttribute('autocomplete', 'email')
      await expect(page.getByLabel('Mot de passe', { exact: true })).toHaveAttribute('autocomplete', 'current-password')
      const submit = page.getByRole('button', { name: 'Se connecter', exact: true })
      await submit.click()
      assert.equal(state.credentials.length, 0, 'Empty forms must use native required-field validation.')
      await fillCredentials(page)
      const password = page.getByLabel('Mot de passe', { exact: true })
      await page.getByRole('button', { name: 'Afficher le mot de passe' }).click()
      await expect(password).toHaveAttribute('type', 'text')
      await expect(password).toHaveValue('fixture-password')
      await page.getByRole('button', { name: 'Masquer le mot de passe' }).click()
      await expect(password).toHaveAttribute('type', 'password')
      state.authFailure = { code: 'invalid_credentials', message: 'Invalid login credentials' }
      await submit.focus()
      await page.keyboard.press('Enter')
      await expect(page.getByRole('alert')).toContainText('Email ou mot de passe incorrect')
      await expect(password).toHaveValue('fixture-password')
      await expect(submit).toBeEnabled()
      await expect(page.getByRole('button', { name: 'Continuer avec Google' })).toBeEnabled()
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }))
      const layout = await page.evaluate(() => {
        const card = document.querySelector('.login-card').getBoundingClientRect()
        return {
          fits: document.documentElement.scrollWidth <= innerWidth,
          top: card.top,
          controls: [...document.querySelectorAll('.login-google, .login-submit, .login-input')].map((element) => {
            const box = element.getBoundingClientRect()
            return { input: element.tagName === 'INPUT', left: box.left, right: box.right, height: box.height, fontSize: getComputedStyle(element).fontSize }
          })
        }
      })
      assert.ok(layout.fits && layout.top >= 0, `Login must not overflow or clip its top on small screens: ${JSON.stringify(layout)}`)
      assert.ok(layout.controls.every((control) => control.height >= 48), 'Inputs and primary actions need comfortable touch targets.')
      assert.ok(layout.controls.every((control) => Math.abs(control.left - layout.controls[0].left) <= 1 && Math.abs(control.right - layout.controls[0].right) <= 1), 'Login fields and actions must align.')
      assert.ok(layout.controls.filter((control) => control.input).every((control) => control.fontSize === '16px'), 'Avoid automatic zoom on mobile input fields.')
      await page.getByRole('link', { name: 'Créer un compte' }).focus()
      await expect(page.getByRole('link', { name: 'Créer un compte' })).toBeFocused()
      await page.screenshot({ path: join(output, `login-error-${viewport.width}.png`), fullPage: true })
      assert.deepEqual(state.errors, [])
      console.log(`${viewport.width}px: responsive layout, labels, validation, password visibility, keyboard and error recovery verified.`)
    } finally {
      await context.close()
    }
  }

  for (const scenario of [
    { after: '', cached: false, target: '/app' },
    { after: 'results', cached: false, target: '/app/results' },
    { after: '', cached: true, target: '/app/results' },
    { after: 'orientation-analysis', cached: true, target: '/orientation' }
  ]) {
    const { context, page, state, releaseLogin } = await prepare({ width: 390, height: 844 }, scenario)
    try {
      await page.goto(`${base}/login${scenario.after ? `?after=${scenario.after}` : ''}`)
      await expect(page.locator('.login-resume')).toHaveCount(scenario.cached ? 1 : 0)
      await expect(page.getByRole('link', { name: 'Créer un compte' })).toHaveAttribute('href', `/register${scenario.after ? `?after=${scenario.after}` : ''}`)
      await page.screenshot({ path: join(output, `login-${scenario.cached ? 'resume' : scenario.after || 'default'}.png`), fullPage: true })
      await fillCredentials(page)
      state.holdToken = !scenario.after && !scenario.cached
      await page.getByRole('button', { name: 'Se connecter', exact: true }).click()
      if (state.holdToken) {
        await expect(page.getByRole('button', { name: 'Connexion en cours…' })).toBeDisabled()
        await expect(page.getByRole('button', { name: 'Continuer avec Google' })).toBeDisabled()
        await expect(page.getByLabel('Email', { exact: true })).toHaveAttribute('readonly', '')
        await expect(page.locator('.login-card')).toHaveAttribute('aria-busy', 'true')
        await expect.poll(() => state.credentials.length).toBe(1)
        await page.keyboard.press('Enter')
        assert.equal(state.credentials.length, 1, 'Pending login must not be submitted twice.')
        releaseLogin()
      }
      await expect(page).toHaveURL(`${base}${scenario.target}`)
      assert.equal(state.credentials.length, 1)
      assert.equal(state.credentials[0].email, user.email)
      assert.equal(state.credentials[0].password, 'fixture-password')
      assert.equal(await page.evaluate(() => localStorage.getItem('supabase_auth_token')), 'login-fixture-token')
      if (scenario.after === 'orientation-analysis') {
        assert.equal(await page.evaluate(() => localStorage.getItem('orientation_resume_after_auth')), 'analysis')
        assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('answers_cache')).answers), answers)
        assert.equal(state.submissions.length, 0)
      } else {
        assert.equal(await page.evaluate(() => localStorage.getItem('answers_cache')), null)
        assert.equal(state.submissions.length, scenario.cached ? 1 : 0)
      }
      assert.deepEqual(state.errors, [])
      console.log(`Email login: ${scenario.after || 'default'}, cached=${scenario.cached}, redirect and onboarding preserved.`)
    } finally {
      releaseLogin()
      await context.close()
    }
  }

  const { context, page, state } = await prepare({ width: 390, height: 844 }, { cached: true, consent: true })
  try {
    state.failProfile = true
    await page.goto(`${base}/login?after=orientation-analysis`)
    await fillCredentials(page)
    await page.getByRole('button', { name: 'Se connecter', exact: true }).click()
    await expect(page.getByRole('alert')).toContainText('Tes réponses sont conservées')
    assert.ok(await page.evaluate(() => localStorage.getItem('answers_cache')))
    state.failProfile = false
    await page.getByRole('button', { name: 'Se connecter', exact: true }).click()
    await expect(page).toHaveURL(`${base}/orientation`)
    assert.deepEqual(state.errors, [])
  } finally {
    await context.close()
  }

  for (const throws of [false, true]) {
    const { context, page, state } = await prepare({ width: 390, height: 844 })
    try {
      await page.goto(`${base}/login?after=orientation-analysis`)
      await page.evaluate(async (throws) => {
        const { supabase } = await import('/src/lib/supabase.js')
        supabase.auth.signInWithOAuth = async () => {
          const error = new Error('Connexion Google indisponible. Réessaie.')
          if (throws) throw error
          return { data: null, error }
        }
      }, throws)
      await page.getByRole('button', { name: 'Continuer avec Google' }).click()
      await expect(page.getByRole('alert')).toContainText('Connexion Google indisponible')
      await expect(page.getByRole('button', { name: 'Continuer avec Google' })).toBeEnabled()
      await expect(page.getByRole('button', { name: 'Se connecter', exact: true })).toBeEnabled()
      assert.equal(await page.evaluate(() => localStorage.getItem('zelia_auth_after')), 'orientation-analysis')
      assert.deepEqual(state.errors, [])
    } finally {
      await context.close()
    }
  }

  const google = await prepare({ width: 390, height: 844 })
  try {
    await google.page.goto(`${base}/login?after=orientation-analysis`)
    await google.page.getByRole('button', { name: 'Continuer avec Google' }).click()
    await expect.poll(() => google.state.oauth.length).toBe(1)
    const authorize = new URL(google.state.oauth[0])
    assert.equal(authorize.searchParams.get('provider'), 'google')
    assert.equal(authorize.searchParams.get('prompt'), 'select_account')
    assert.equal(authorize.searchParams.get('redirect_to'), `${base}/auth/callback?after=orientation-analysis`)
    assert.deepEqual(google.state.errors, [])
  } finally {
    await google.context.close()
  }
  console.log(`Login UI, email/Google authentication, errors, retries and onboarding redirects verified. Screenshots: ${output}`)
} finally {
  await browser.close()
}
