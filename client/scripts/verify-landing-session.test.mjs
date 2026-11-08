import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { chromium, expect } from '@playwright/test'
import { loadEnv, preview } from 'vite'

const root = fileURLToPath(new URL('../', import.meta.url))

test('production landing checks Supabase sessions without losing the dynamic module exports', async (t) => {
  const env = loadEnv('production', root, 'VITE_SUPABASE_')
  const storageKey = `sb-${new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0]}-auth-token`
  const server = await preview({ root, preview: { host: '127.0.0.1', port: 0, open: false } })
  t.after(() => new Promise((resolve, reject) => {
    server.httpServer.close((error) => error ? reject(error) : resolve())
    server.httpServer.closeAllConnections()
  }))
  const base = server.resolvedUrls.local[0]
  const origin = new URL(base).origin
  const browser = await chromium.launch({ headless: true })
  t.after(() => browser.close())

  for (const mode of ['anonymous', 'supabase-session', 'supabase_auth_token', 'token', 'callback']) {
    await t.test(mode, async () => {
      const context = await browser.newContext({ serviceWorkers: 'block' })
      try {
        const page = await context.newPage()
        const errors = []
        const supabaseModules = []
        page.on('pageerror', (error) => errors.push(error.message))
        page.on('console', (message) => {
          if (message.text().includes('Landing session check failed')) errors.push(message.text())
        })
        page.on('response', (response) => {
          if (/\/assets\/supabase-[^/]+\.js$/.test(new URL(response.url()).pathname)) {
            supabaseModules.push(response)
          }
        })
        await context.addInitScript(({ mode, storageKey, origin }) => {
          if (location.origin !== origin || window !== window.top) return
          if (mode === 'supabase-session') {
            localStorage.setItem(storageKey, JSON.stringify({
              access_token: 'landing-session-fixture',
              refresh_token: 'landing-refresh-fixture',
              expires_at: Math.floor(Date.now() / 1000) + 3600,
              token_type: 'bearer',
              user: { id: 'landing-fixture', aud: 'authenticated', user_metadata: {} }
            }))
          } else if (mode === 'supabase_auth_token' || mode === 'token') {
            localStorage.setItem(mode, 'landing-session-fixture')
          }
        }, { mode, storageKey, origin })
        await context.route('**/*', (route) => {
          const url = new URL(route.request().url())
          if (url.origin === origin) {
            if (/\/assets\/(?:Layout|ConversationalHome|AuthCallback)-[^/]+\.js$/.test(url.pathname)) {
              return route.fulfill({
                contentType: 'application/javascript',
                body: "export default function Destination() { return 'Landing fixture destination' }"
              })
            }
            if (url.pathname.startsWith('/api/')) {
              return route.fulfill({ json: { user: { id: 'landing-fixture' } } })
            }
            return route.continue()
          }
          if (url.pathname.includes('/auth/v1/')) {
            return route.fulfill({ json: { id: 'landing-fixture', aud: 'authenticated', user_metadata: {} } })
          }
          return route.abort()
        })
        const hash = mode === 'callback' ? '#access_token=callback-fixture&refresh_token=refresh-fixture' : ''
        await page.goto(new URL(`/${hash}`, base).href, { waitUntil: 'networkidle' })
        if (mode === 'anonymous') {
          await expect(page).toHaveURL(base)
          await expect(page.locator('.zelia-home')).toBeVisible()
        } else if (mode === 'callback') {
          await expect(page).toHaveURL(new URL(`/auth/callback${hash}`, base).href)
        } else {
          await expect(page).toHaveURL(new URL('/app', base).href)
          if (mode === 'supabase-session') {
            assert.equal(await page.evaluate(() => localStorage.getItem('supabase_auth_token')), 'landing-session-fixture')
          }
        }
        if (mode !== 'callback') assert.ok(supabaseModules.length, 'Exercise the compiled dynamic Supabase import')
        assert.deepEqual(errors, [])
      } finally {
        await context.close()
      }
    })
  }
})
