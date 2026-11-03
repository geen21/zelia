import assert from 'node:assert/strict'
import { chromium, expect as baseExpect } from '@playwright/test'

const base = process.env.PROFILE_TEST_URL || 'http://127.0.0.1:5187'
const expect = baseExpect.configure({ timeout: 30000 })
const source = await (await fetch(`${base}/src/lib/supabase.js`)).text()
const supabaseUrl = source.match(/"VITE_SUPABASE_URL"\s*:\s*"([^"]+)"/)?.[1]
assert.ok(supabaseUrl, 'Run this check against the Vite development server.')
const storageKey = `sb-${new URL(supabaseUrl).hostname.split('.')[0]}-auth-token`
const user = { id: 'profile-rate-limit-fixture', email: 'profile@example.com', aud: 'authenticated' }
const browser = await chromium.launch({ headless: true })

async function check({ endpoint = '/users/profile', status = 429, retryAfter, expected }) {
  const context = await browser.newContext()
  const page = await context.newPage()
  const errors = []
  let blocked = true
  page.on('pageerror', (error) => errors.push(error.message))
  page.setDefaultTimeout(15000)
  page.setDefaultNavigationTimeout(60000)
  await context.addInitScript(({ storageKey, user }) => {
    window.tailwind = { config: {} }
    localStorage.setItem('token', 'profile-fixture-token')
    localStorage.setItem(storageKey, JSON.stringify({
      access_token: 'profile-fixture-token',
      refresh_token: 'profile-fixture-refresh',
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      expires_in: 3600,
      token_type: 'bearer',
      user
    }))
  }, { storageKey, user })
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url())
    if (url.pathname.includes('/auth/v1/')) return route.fulfill({ json: user })
    if (url.pathname.includes('/api/')) {
      const path = url.pathname.replace(/^.*\/api/, '')
      if (blocked && path === endpoint) {
        return route.fulfill({
          status,
          headers: {
            'Access-Control-Expose-Headers': 'Retry-After',
            ...(retryAfter === undefined ? {} : { 'Retry-After': retryAfter })
          },
          json: { error: 'Fixture failure', code: 'RATE_LIMIT_EXCEEDED' }
        })
      }
      if (path === '/users/profile') return route.fulfill({ json: { profile: { id: user.id, first_name: 'Camille' } } })
      if (path === '/users/me') return route.fulfill({ json: { user } })
      if (path === '/users/profile/extra-info') return route.fulfill({ json: { entries: [] } })
      if (path === '/analysis/my-results') return route.fulfill({ status: 404, json: { error: 'No analysis results found' } })
      if (path === '/users/school-sharing') return route.fulfill({ json: { consent: null, schools: [] } })
      throw new Error(`Unexpected API request: ${path}`)
    }
    if (url.origin === new URL(base).origin) return route.continue()
    return route.abort()
  })
  try {
    await page.goto(`${base}/app/profile`)
    await expect(page.getByRole('alert')).toHaveText(new RegExp(expected))
    if (status === 429) {
      await expect(page.getByRole('alert')).not.toContainText('Impossible de charger les informations du profil.')
    }
    blocked = false
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
      page.getByRole('button', { name: 'Réessayer', exact: true }).click()
    ])
    await expect(page.getByRole('heading', { name: 'Mes informations', exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Camille', exact: true })).toBeVisible()
    await expect(page.getByRole('alert')).toHaveCount(0)
    assert.deepEqual(errors, [], 'Profile errors must not crash the page')
  } catch (error) {
    console.error('Profile UI failure:', { url: page.url(), errors, alerts: await page.getByRole('alert').allTextContents() })
    throw error
  } finally {
    await context.close()
  }
}

try {
  await check({ retryAfter: '125', expected: 'Réessaie dans 3 min' })
  await check({ endpoint: '/analysis/my-results', retryAfter: '1', expected: 'Réessaie dans 1 min' })
  await check({ expected: 'Réessaie dans quelques instants' })
  await check({ retryAfter: 'invalid', expected: 'Réessaie dans quelques instants' })
  await check({ status: 500, expected: 'Impossible de charger les informations du profil.' })
  console.log('Profile rate-limit UI: 5 error/recovery scenarios passed.')
} finally {
  await browser.close()
}
