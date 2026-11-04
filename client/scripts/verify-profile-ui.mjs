import assert from 'node:assert/strict'
import { mkdir, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium, expect as playwrightExpect } from '@playwright/test'
import { SCHOOL_SHARING_VERSION } from '../src/lib/schoolSharing.js'
import { assertSharedUX } from './fixtures/assert-shared-ux.mjs'

const base = process.env.PROFILE_TEST_URL || 'http://127.0.0.1:5187'
const expect = playwrightExpect.configure({ timeout: 20000 })
const output = join(tmpdir(), 'zelia-profile-tests')
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ headless: true })
const avatar = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="25" fill="#fbe0fd"/><circle cx="50" cy="40" r="22" fill="#dcae86"/><path d="M20 100q0-42 30-42t30 42" fill="#c1ff72"/><path d="M28 34q0-30 22-25t22 25" fill="#744a31"/><circle cx="43" cy="39" r="2"/><circle cx="57" cy="39" r="2"/><path d="M44 50q6 5 12 0" fill="none" stroke="#744a31" stroke-width="2"/></svg>'
const poster = `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="640" viewBox="0 0 360 640"><rect width="360" height="640" rx="24" fill="#c1ff72"/><text x="180" y="75" text-anchor="middle" font-family="sans-serif" font-size="26" font-weight="bold">MON PROFIL ZELIA</text><circle cx="180" cy="260" r="90" fill="#fbe0fd"/><text x="180" y="270" text-anchor="middle" font-family="sans-serif" font-size="60">Z.</text><text x="180" y="430" text-anchor="middle" font-family="sans-serif" font-size="30" font-weight="bold">L'Explorateur</text><text x="180" y="490" text-anchor="middle" font-family="sans-serif" font-size="18">Curieux. Libre. Toujours en route.</text></svg>`

async function prepare(width, options = {}) {
  const context = await browser.newContext({ viewport: { width, height: 960 }, reducedMotion: 'reduce', acceptDownloads: true })
  const page = await context.newPage()
  page.setDefaultTimeout(20000)
  const state = {
    profile: { id: 'profile-fixture', first_name: 'Camille', last_name: 'Martin', age: 18, gender: 'Non précisé', department: '75', school: 'Lycée des possibles', phone_number: '0600000000', avatar_url: `${base}/profile-fixture-avatar.svg` },
    errors: [], updates: [], grants: [], blocks: [], granted: true, blocked: false,
    ...options
  }
  page.on('pageerror', (error) => state.errors.push(error.message))
  await context.addInitScript(() => {
    localStorage.setItem('token', 'profile-fixture-token')
    window.tailwind = { config: {} }
  })
  await context.route('**/*', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (url.pathname === '/profile-fixture-avatar.svg') return route.fulfill({ contentType: 'image/svg+xml', body: avatar })
    if (url.pathname === '/profile-fixture-story.svg') return route.fulfill({ contentType: 'image/svg+xml', body: poster })
    if (url.pathname === '/profile-fixture-cv.pdf') return route.fulfill({ contentType: 'application/pdf', body: '%PDF-1.4 fixture CV' })
    if (url.pathname.includes('/auth/v1/')) return route.fulfill({ json: { user: null } })
    if (url.pathname.includes('/api/')) {
      const path = url.pathname.replace(/^.*\/api/, '')
      if (state.failure === path) return route.fulfill({ status: 503, json: { message: 'Service temporairement indisponible', error: 'Service temporairement indisponible' } })
      let data
      if (path === '/users/profile') {
        if (request.method() === 'PUT') {
          state.updates.push(request.postDataJSON())
          if (state.failSave) return route.fulfill({ status: 503, json: { error: 'Modification impossible pour le moment.' } })
          Object.assign(state.profile, request.postDataJSON())
        }
        data = { profile: state.profile }
      } else if (path === '/users/me') data = { user: { id: state.profile.id, email: state.longEmail ? `${'adresse'.repeat(12)}@example.com` : 'camille@example.com' } }
      else if (path === '/users/profile/extra-info') data = { entries: state.cv === 'empty' ? [] : state.cv === 'draft' ? [{ question_id: 'cv_data', answer_text: JSON.stringify({ name: 'Camille Martin', targetJob: 'Designer', summary: 'Un parcours créatif et curieux.' }) }] : [{ question_id: 'cv_pdf_url', answer_text: `${base}/profile-fixture-cv.pdf` }] }
      else if (path === '/analysis/my-results') {
        if (state.noAnalysis) return route.fulfill({ status: 404, json: { error: 'Aucun bilan' } })
        data = { results: { personalityType: "L'Explorateur", personalityAnalysis: 'Un profil curieux.', shareImageUrl: `${base}/profile-fixture-story.svg`, updatedAt: '2026-10-01T10:00:00Z' } }
      } else if (path === '/users/school-sharing') {
        if (request.method() === 'POST') {
          state.grants.push(request.postDataJSON())
          if (state.failSharing) return route.fulfill({ status: 503, json: { message: 'Partage non enregistré.' } })
          state.granted = request.postDataJSON().granted
        }
        data = { consent: state.granted ? { version: SCHOOL_SHARING_VERSION, revoked_at: null } : null, schools: state.noSchools ? [] : [{ id: 'school-fixture', name: 'École des possibles', blocked: state.blocked }] }
      } else if (path === '/users/school-sharing/school-fixture') {
        state.blocks.push(request.postDataJSON())
        state.blocked = request.postDataJSON().blocked
        data = { saved: true }
      } else {
        state.errors.push(`Unexpected request: ${request.method()} ${path}`)
        return route.fulfill({ status: 404, json: { error: 'Unexpected fixture request' } })
      }
      return route.fulfill({ json: data })
    }
    return url.origin === new URL(base).origin || url.hostname === 'cdn.tailwindcss.com' ? route.continue() : route.abort()
  })
  await page.goto(`${base}/app/profile`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  return { context, page, state }
}

async function checkLayout(page) {
  await expect(page.getByRole('heading', { name: /Mon profil,\s*tout moi\./ })).toBeVisible()
  await assertSharedUX(page)
  const dimensions = await page.evaluate(() => {
    const main = document.querySelector('.zelia-app-main main')
    const profile = document.querySelector('.zelia-profile')
    return {
      viewport: innerWidth, document: document.documentElement.scrollWidth,
      main: [main.clientWidth, main.scrollWidth], profile: [profile.clientWidth, profile.scrollWidth],
      overflowing: [...profile.querySelectorAll('*')].filter(el => el.getBoundingClientRect().right > profile.getBoundingClientRect().right + 1).slice(0, 8).map(el => el.className)
    }
  })
  assert.ok(dimensions.document <= dimensions.viewport + 1 && dimensions.main[1] <= dimensions.main[0] + 1 && dimensions.profile[1] <= dimensions.profile[0] + 1, `No horizontal overflow: ${JSON.stringify(dimensions)}`)
  await expect(page.locator('.ss-toggle')).toHaveCSS('width', '46px')
  await expect(page.locator('.ss-toggle')).toHaveCSS('height', '28px')
  await expect(page.locator('.ss-intro')).toHaveCSS('font-size', '13px')
  await expect(page.locator('.ss-details p')).toHaveCSS('font-size', '11px')
  await expect(page.locator('.zp-identity-art')).toHaveCSS('background-color', 'rgb(193, 255, 114)')
}

try {
  for (const width of [1920, 1440, 1000, 768, 390, 320]) {
    const { context, page, state } = await prepare(width, { longEmail: width === 320 })
    await expect(page.getByRole('checkbox', { name: /Autoriser les écoles/ })).toBeChecked()
    await expect(page.getByRole('img', { name: 'Aperçu du visuel Zélia' })).toBeVisible()
    await page.screenshot({ path: join(output, `profile-${width}.png`), fullPage: false })
    await checkLayout(page)
    await page.getByRole('link', { name: 'Mes autorisations', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Mes autorisations', exact: true })).toBeInViewport()
    if (width === 1440 || width === 390) {
      await page.screenshot({ path: join(output, `sharing-${width}.png`) })
      await page.getByRole('link', { name: 'Mon visuel Zélia', exact: true }).click()
      await page.screenshot({ path: join(output, `story-${width}.png`) })
    }
    assert.deepEqual(state.errors, [])
    await context.close()
  }

  {
    const { context, page, state } = await prepare(390)
    const form = page.getByRole('form', { name: 'Informations personnelles' })
    await page.getByRole('button', { name: 'Modifier', exact: true }).click()
    await expect(page.getByLabel('Prénom', { exact: true })).toBeFocused()
    await page.getByLabel('Prénom', { exact: true }).fill('Prénom temporaire')
    await page.getByRole('button', { name: 'Annuler', exact: true }).click()
    await expect(form).not.toContainText('Prénom temporaire')
    assert.equal(state.updates.length, 0)
    await page.getByRole('button', { name: 'Modifier', exact: true }).click()
    await page.getByLabel('Prénom', { exact: true }).fill('Lou')
    await page.getByLabel('Âge', { exact: true }).fill('19')
    await page.getByLabel('Téléphone', { exact: true }).fill('0612345678')
    state.failSave = true
    await page.getByRole('button', { name: 'Enregistrer', exact: true }).click()
    await expect(page.getByRole('alert')).toHaveText('Modification impossible pour le moment.')
    await expect(page.getByLabel('Prénom', { exact: true })).toHaveValue('Lou')
    await expect(page.getByRole('status')).toHaveCount(0)
    state.failSave = false
    await page.getByRole('button', { name: 'Enregistrer', exact: true }).click()
    await expect(page.getByRole('status')).toContainText('Profil mis à jour avec succès.')
    assert.deepEqual(state.updates.at(-1), { first_name: 'Lou', last_name: 'Martin', age: 19, gender: 'Non précisé', department: '75', school: 'Lycée des possibles', phone_number: '0612345678' })
    await expect(page.getByRole('heading', { name: 'Lou Martin' })).toBeVisible()
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Lou Martin' })).toBeVisible()
    await page.getByText('Informations du compte', { exact: true }).click()
    await expect(page.getByText('profile-fixture', { exact: true })).toBeVisible()
    await checkLayout(page)
    assert.deepEqual(state.errors, [])
    await context.close()
  }

  {
    const { context, page, state } = await prepare(1440)
    const sharing = page.getByRole('region', { name: 'Partage avec les écoles' })
    const consent = sharing.getByRole('checkbox')
    await expect(consent).toBeChecked()
    state.failSharing = true
    await consent.click()
    await expect(sharing.getByRole('alert')).toHaveText('Partage non enregistré.')
    await expect(consent).toBeChecked()
    state.failSharing = false
    await consent.click()
    await expect(consent).not.toBeChecked()
    assert.deepEqual(state.grants.at(-1), { granted: false, version: SCHOOL_SHARING_VERSION })
    assert.equal(state.blocked, false, 'Revoking general consent must not block a school-specific agreement')
    await sharing.getByRole('button', { name: 'Retirer tout partage avec cette école' }).click()
    await expect(sharing.getByText('Partage retiré', { exact: true })).toBeVisible()
    await sharing.getByRole('button', { name: 'Rétablir le partage' }).click()
    await expect(sharing.getByText('Partage autorisé selon mes accords')).toBeVisible()
    assert.deepEqual(state.blocks, [{ blocked: true }, { blocked: false }])
    await consent.focus()
    await page.keyboard.press('Space')
    await expect(consent).toBeChecked()
    await sharing.getByText('Comprendre ce qui est partagé', { exact: true }).click()
    await expect(sharing.getByText(/Un export déjà téléchargé ne peut pas être rappelé/)).toBeVisible()
    const storyDownload = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Télécharger le visuel', exact: true }).click()
    assert.equal((await storyDownload).suggestedFilename(), 'zelia-story.png')
    await page.evaluate(() => Object.defineProperty(navigator, 'canShare', { value: undefined, configurable: true }))
    const sharedDownload = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Partager mon visuel', exact: true }).click()
    assert.equal((await sharedDownload).suggestedFilename(), 'zelia-story.png')
    await expect(page.getByRole('region', { name: 'Mon visuel Zélia' }).getByRole('status')).toContainText("Le partage natif n'est pas disponible")
    await page.evaluate(() => {
      const original = HTMLCanvasElement.prototype.toDataURL
      HTMLCanvasElement.prototype.toDataURL = function (...args) {
        if (this.width === 2526 && this.height === 1785) {
          const pixels = this.getContext('2d').getImageData(0, 0, this.width, this.height).data
          const capture = { width: this.width, height: this.height, dark: 0, lime: 0 }
          for (let i = 0; i < pixels.length; i += 64) {
            const [r, g, b] = pixels.subarray(i, i + 3)
            if (r < 80 && g < 80 && b < 80) capture.dark += 1
            if (r > 140 && r < 230 && g > 230 && b < 160) capture.lime += 1
          }
          window.__profileDiplomaCapture = capture
        }
        return original.apply(this, args)
      }
    })
    const diplomaDownload = page.waitForEvent('download', { timeout: 60000 })
    await page.getByRole('button', { name: 'Télécharger mon diplôme' }).click()
    const diploma = await diplomaDownload
    assert.equal(diploma.suggestedFilename(), 'diplome-zelia.pdf')
    const pdf = await readFile(await diploma.path())
    assert.equal(pdf.subarray(0, 4).toString(), '%PDF')
    const capture = await page.evaluate(() => window.__profileDiplomaCapture)
    assert.equal(capture?.width, 2526)
    assert.equal(capture?.height, 1785)
    assert.ok(capture.dark > 100 && capture.lime > 100, 'The off-screen PDF source must render actual text and Zelia colors, not a blank page')
    assert.deepEqual(state.errors, [])
    await context.close()
  }

  for (const cv of ['empty', 'draft']) {
    const { context, page, state } = await prepare(320, { cv, noAnalysis: true, noSchools: true })
    await expect(page.getByRole('link', { name: cv === 'empty' ? 'Créer mon CV' : 'Retrouver mon CV' })).toHaveAttribute('href', '/app/outils/cv')
    await expect(page.getByRole('heading', { name: 'Ton visuel se prépare' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Télécharger mon diplôme' })).toHaveCount(0)
    await expect(page.getByText(/Aucune école sollicitée/)).toBeVisible()
    await checkLayout(page)
    assert.deepEqual(state.errors, [])
    await context.close()
  }

  {
    const { context, page, state } = await prepare(390, { failure: '/users/school-sharing' })
    const sharing = page.getByRole('region', { name: 'Partage avec les écoles' })
    await expect(sharing.getByRole('alert')).toContainText('Service temporairement indisponible')
    state.failure = ''
    await sharing.getByRole('button', { name: 'Réessayer' }).click()
    await expect(sharing.getByRole('checkbox')).toBeChecked()
    assert.deepEqual(state.errors, [])
    await context.close()
  }

  {
    const { context, page, state } = await prepare(390, { failure: '/users/profile' })
    await expect(page.getByRole('alert')).toContainText('Impossible de charger les informations du profil.')
    state.failure = ''
    await page.getByRole('button', { name: 'Réessayer' }).click()
    await expect(page.getByRole('heading', { name: 'Mes informations', exact: true })).toBeVisible()
    assert.deepEqual(state.errors, [])
    await context.close()
  }

  console.log(`Profile verified: Zelia palette, 1920/1440/1000/768/390/320px, accessible editing, persistence, consent independence, failures, retries, CV states and diploma/story downloads. Screenshots: ${output}`)
} finally {
  await browser.close()
}
