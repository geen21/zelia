import assert from 'node:assert/strict'
import { chromium, expect } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { hasAuthParameters, isPrivatePortalPath } from '../src/lib/analytics.js'

for (const path of ['/admin/ecoles', '/espace-ecoles/activation', '/espace-ecoles/Activation', '/espace-ecoles/leads', '/espace-ecoles/securite']) assert.equal(isPrivatePortalPath(path), true)
for (const path of ['/', '/espace-ecoles', '/espace-ecoles/inscription']) assert.equal(isPrivatePortalPath(path), false)
assert.equal(hasAuthParameters({ hash: '#access_token=fixture' }), true)
assert.equal(hasAuthParameters({ search: '?token_hash=fixture' }), true)
assert.equal(hasAuthParameters({ search: '?code=public-coupon' }), false)

const base = process.env.BACKOFFICE_TEST_URL || 'http://127.0.0.1:5187'
const uuid = '11111111-1111-4111-8111-111111111111'
const claims = (aal = 'aal1') => Buffer.from(JSON.stringify({ sub: uuid, aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600, iat: Math.floor(Date.now() / 1000), aal })).toString('base64url')
const user = { id: uuid, aud: 'authenticated', email: 'school@example.com', factors: [], user_metadata: {} }
const session = { access_token: `${Buffer.from('{"alg":"HS256"}').toString('base64url')}.${claims()}.c2lnbmF0dXJl`, refresh_token: 'fixture-refresh', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, token_type: 'bearer', user }
const company = { id: 1, name: 'École Exemple', email: user.email, approved: true, approved_at: '2026-10-01', isOwner: true }
const lead = { leadKey: `user:${uuid}`, user_id: uuid, prenom: 'Camille', nom: 'Martin', email: 'camille@example.com', source: 'questionnaire', origin: 'mixed',
  inscrit_le: '2026-10-01', status: 'nouveau', note: '', detailedAllowed: false, revealed: false, formations_choisies_ecole: 'Bachelor', actions: [{ source: 'formation_france', reference: '7', title: 'Bachelor', campus: 'Paris', date: '2026-10-01' }] }
const browser = await chromium.launch({ headless: true })
const screenshots = process.env.SCHOOL_PORTAL_SCREENSHOTS
if (screenshots) await mkdir(screenshots, { recursive: true })

async function prepare(viewport, options = {}) {
  const context = await browser.newContext({ viewport })
  const page = await context.newPage()
  const state = { revealed: false, detailed: false, calls: [], errors: [], fail: false, mfa: false, requireMfa: false, activated: false, sharingGranted: false, schoolBlocked: false, invitations: [], status: 'nouveau', note: '', total: 1, customFormations: [], members: [], company: { ...company }, ...options }
  page.setDefaultTimeout(20000)
  page.on('pageerror', (error) => state.errors.push(error.message))
  await context.addInitScript(({ session, noSession, requireMfa }) => {
    localStorage.setItem('token', 'student-marker')
    if (!noSession) localStorage.setItem('sb-espace-ecoles-auth-token', JSON.stringify({ ...session, user: { ...session.user, factors: requireMfa ? [{ id: 'factor-1', factor_type: 'totp', status: 'verified' }] : [] } }))
    sessionStorage.setItem('sb-zelia-admin-auth-token', JSON.stringify(session))
  }, { session, noSession: options.noSession, requireMfa: options.requireMfa })
  await context.route('**/*', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const send = (data, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) })
    if (url.pathname.includes('/auth/v1/')) {
      if (url.pathname.endsWith('/factors') && request.method() === 'POST') return send({ id: 'factor-1', type: 'totp', totp: { qr_code: '<svg xmlns="http://www.w3.org/2000/svg"></svg>', secret: 'FIXTURE' } })
      if (url.pathname.endsWith('/challenge')) return send({ id: 'challenge-1', expires_at: Math.floor(Date.now() / 1000) + 300 })
      if (url.pathname.endsWith('/verify') && request.method() === 'POST') {
        state.mfa = true
        return send({ ...session, access_token: `${Buffer.from('{"alg":"HS256"}').toString('base64url')}.${claims('aal2')}.c2lnbmF0dXJl`, user: { ...user, factors: [{ id: 'factor-1', factor_type: 'totp', status: 'verified' }] } })
      }
      if (url.pathname.endsWith('/token')) return state.failLogin ? send({ msg: 'Identifiants invalides.' }, 400) : send({ ...session, user: { ...user, factors: state.requireMfa ? [{ id: 'factor-1', factor_type: 'totp', status: 'verified' }] : [] } })
      if (url.pathname.endsWith('/recover') || url.pathname.endsWith('/logout')) return send({})
      return send({ ...user, factors: state.mfa || state.requireMfa ? [{ id: 'factor-1', factor_type: 'totp', status: 'verified' }] : [] })
    }
    if (url.pathname.includes('/api/')) {
      state.calls.push({ path: url.pathname, query: Object.fromEntries(url.searchParams), method: request.method(), body: request.postData() ? request.postDataJSON() : null })
      if (url.pathname.endsWith('/users/school-sharing/1')) { state.schoolBlocked = request.postDataJSON().blocked; return send({ saved: true }) }
      if (url.pathname.endsWith('/users/school-sharing')) {
        if (request.method() === 'POST') { state.sharingGranted = request.postDataJSON().granted; return send({ saved: true }) }
        return send({ consent: state.sharingGranted ? { version: 'orientation-dossier-v1', revoked_at: null } : null, schools: [{ id: 1, name: company.name, blocked: state.schoolBlocked }] })
      }
      if (url.pathname.endsWith('/users/profile')) return send({ profile: { id: uuid, first_name: 'Camille', last_name: 'Martin' } })
      if (url.pathname.endsWith('/users/me')) return send({ user })
      if (url.pathname.endsWith('/analysis/my-results')) return send({ results: null })
      if (url.pathname.endsWith('/users/profile/extra-info')) return send({ entries: [] })
      if (url.pathname.endsWith('/activation-complete')) { state.activated = true; return send({ accepted: true }) }
      if (url.pathname.endsWith('/api/admin/me')) return send({ user })
      if (url.pathname.endsWith('/api/admin/schools')) return send({ items: [{ ...company, email: null, owner_id: null }], total: 1 })
      if (url.pathname.endsWith('/api/admin/partners')) return send({ items: [{ id: uuid, school_name: company.name, formation_name: 'Bachelor partenaire', city: 'Paris', is_active: true, portal_company_id: 1 }], total: 1 })
      if (url.pathname.endsWith('/api/admin/school-options')) return send({ items: [{ school_name: company.name, source: 'ecoles_partenaires' }] })
      if (url.pathname.endsWith('/api/admin/schools/1')) return send({ item: { ...company, email: null, owner_id: null }, accounts: [], members: [] })
      if (url.pathname.endsWith('/invitations')) return send({ items: state.invitations, notificationFailures: 0, recentAudit: [] })
      if (url.pathname.endsWith('/invite')) { state.invitations.push({ id: 1, ...request.postDataJSON(), status: 'sent' }); return send({ sent: true }) }
      if (url.pathname.endsWith('/me') || url.pathname.endsWith('/company')) {
        if (state.expired) return send({ message: 'Session expirée.' }, 401)
        if (state.denied) return send({ message: 'Accès refusé.' }, 403)
        if (state.requireMfa && !state.mfa) return send({ message: 'MFA_REQUIRED' }, 403)
        return send({ company: state.company })
      }
      if (state.fail) return send({ message: 'Service portail indisponible.' }, 503)
      const visibleLead = { ...lead, ...state.leadOverrides, revealed: state.revealed, detailedAllowed: state.detailed, status: state.status, note: state.note, preference_geo: 'near_home', matieres_fortes: '["maths","eco","anglais"]',
        nom: state.revealed || url.pathname.includes('/admin/') ? state.leadOverrides?.nom || lead.nom : 'M***',
        email: state.revealed || url.pathname.includes('/admin/') ? state.leadOverrides?.email || lead.email : '***@***' }
      if (url.pathname.endsWith('/reveal')) { state.revealed = true; return send({ revealed: true }) }
      if (url.pathname.endsWith('/status')) {
        const body = request.postDataJSON()
        if (body.status) state.status = body.status
        if (body.note !== undefined) state.note = body.note
        return send({ saved: true })
      }
      if (url.pathname.endsWith('/export.csv')) return route.fulfill({ contentType: 'text/csv', body: 'prenom;email\r\nCamille;***@***' })
      if (url.pathname.endsWith('/leads')) {
        const total = url.searchParams.get('origin') === 'unknown' ? 0 : state.total
        const offset = Number(url.searchParams.get('offset') || 0)
        return send({ leads: Array.from({ length: Math.min(50, Math.max(0, total - offset)) }, (_, index) => offset + index === 0 ? visibleLead : { ...visibleLead, leadKey: `request:${offset + index}`, prenom: `Camille ${offset + index + 1}` }), total, campuses: ['Paris', 'Lyon'] })
      }
      if (url.pathname.includes('/lead/')) return send({ lead: visibleLead, detailLocked: state.detailed && !state.revealed && !url.pathname.includes('/admin/'),
        detail: state.detailed && (state.revealed || url.pathname.includes('/admin/')) ? { profile: { first_name: 'Camille', phone_number: '0600000000' }, answers: [{ question_id: 1, response: 'Sciences', questions: { content: 'Ta matière préférée ?' } }], extraInfo: [], analysis: null } : null })
      if (url.pathname.endsWith('/stats')) return send({ total: 1, byOrigin: { natural: 0, sponsored: 0, mixed: 1, unknown: 0 }, bySource: { questionnaire: 1 }, byStatus: { nouveau: 1 }, campuses: ['Paris'], leadsPerWeek: [{ week: '2026-10-01', count: 1 }], topFormations: [{ name: 'Bachelor', count: 1 }] })
      if (url.pathname.endsWith('/catalog')) return send({ total: 2, natural: 1, sponsored: 1, items: [
        { source: 'formation_france', reference: '7', school: company.name, title: 'Bachelor naturel', campus: 'Paris', linked: true, linkedCompanyId: 1, active: true, recommended: true },
        { source: 'ecoles_partenaires', reference: uuid, school: company.name, title: 'Bachelor sponsorisé', campus: 'Lyon', linked: true, linkedCompanyId: 1, active: true, recommended: true }
      ] })
      if (url.pathname.endsWith('/school-formations') && request.method() === 'POST') { state.customFormations.push({ id: 7, ...request.postDataJSON() }); return send({ saved: true }) }
      if (/\/school-formations\/7$/.test(url.pathname)) {
        state.customFormations = request.method() === 'DELETE' ? [] : [{ id: 7, ...request.postDataJSON() }]
        return send({ saved: true })
      }
      if (url.pathname.endsWith('/school-formations')) return send({ formations: state.customFormations })
      if (/\/members\/7$/.test(url.pathname)) { state.members = []; return send({ saved: true }) }
      if (url.pathname.endsWith('/members')) {
        if (request.method() === 'POST') state.members.push({ id: 7, email: request.postDataJSON().email, createdAt: '2026-10-01' })
        return send({ owner: { email: company.email }, members: state.members })
      }
      return send({})
    }
    if (url.hostname === 'cdn.tailwindcss.com') return route.fulfill({ contentType: 'application/javascript', body: 'window.tailwind = {}' })
    if (url.origin !== new URL(base).origin) return route.abort()
    return route.continue()
  })
  return { context, page, state }
}

async function fits(page) {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true, `no page overflow at ${page.url()}`)
  const overflowing = await page.locator('.sp-dialog-body, .sp-table-wrap').evaluateAll((elements) => elements.some((element) => element.scrollWidth > element.clientWidth + 1))
  assert.equal(overflowing, false, 'no clipped content or horizontal scrolling inside lead panels/lists')
}

async function capture(page, name) {
  await page.evaluate(() => document.fonts.ready)
  if (name.startsWith('statistiques')) {
    await expect(page.locator('.apexcharts-svg')).toHaveCount(3)
    const sizes = await page.locator('.apexcharts-svg').evaluateAll((charts) => charts.map((chart) => ({ width: chart.getBoundingClientRect().width, height: chart.getBoundingClientRect().height })))
    assert.ok(sizes.every((size) => size.width > 200 && size.height > 200), 'charts retain their real dimensions, not icon dimensions')
  }
  await fits(page)
  if (screenshots) await page.screenshot({ path: path.join(screenshots, `${name}.png`), fullPage: await page.getByRole('dialog').count() === 0 })
}

async function openFilters(page) {
  const toggle = page.getByRole('button', { name: /^Filtres/ })
  if (await toggle.isVisible() && await toggle.getAttribute('aria-expanded') === 'false') await toggle.click()
}

try {
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    const { context, page, state } = await prepare(viewport)
    await page.goto(`${base}/espace-ecoles/leads`)
    await expect(page.getByRole('heading', { name: 'Leads', exact: true })).toBeVisible()
    await expect(page.getByText('***@***', { exact: true })).toBeVisible()
    await capture(page, `leads-${viewport.width}`)
    await page.getByRole('button', { name: 'Ouvrir le dossier' }).click()
    const panel = page.getByRole('dialog', { name: 'Dossier de Camille', exact: true })
    await expect(panel).toBeVisible()
    await page.keyboard.press('Shift+Tab')
    assert.equal(await panel.evaluate((dialog) => dialog.contains(document.activeElement)), true, 'focus stays in the modal')
    await expect(page.getByText(/Dossier détaillé non autorisé/)).toBeVisible()
    await expect(panel.getByText('Près de chez moi', { exact: true })).toBeVisible()
    await expect(panel.getByText('Maths, Éco, Anglais', { exact: true })).toBeVisible()
    await capture(page, `dossier-${viewport.width}`)
    await page.keyboard.press('Escape')
    await expect(page.getByRole('button', { name: 'Ouvrir le dossier' })).toBeFocused()
    await page.getByRole('button', { name: 'Révéler', exact: true }).click()
    await expect(page.getByText(lead.email, { exact: true })).toBeVisible()
    state.detailed = true
    await page.getByRole('button', { name: 'Ouvrir le dossier' }).click()
    await expect(page.getByText('Ta matière préférée ?', { exact: true })).toBeVisible()
    await expect(page.getByText('0600000000', { exact: true })).toBeVisible()
    await panel.getByLabel('Note interne', { exact: true }).fill('À rappeler mercredi')
    await panel.getByRole('button', { name: 'Enregistrer la note', exact: true }).click()
    await expect(panel.getByRole('status')).toHaveText('Note enregistrée.')
    assert.equal(state.note, 'À rappeler mercredi')
    await panel.getByLabel('Note interne', { exact: true }).fill('Brouillon préservé')
    await panel.getByLabel('Statut du dossier de Camille', { exact: true }).selectOption('a_contacter')
    await expect(panel.getByRole('status')).toHaveText('Statut enregistré.')
    await expect(panel.getByLabel('Note interne', { exact: true })).toHaveValue('Brouillon préservé')
    await page.keyboard.press('Escape')
    await expect(page.getByLabel('Statut de Camille', { exact: true })).toHaveValue('a_contacter')
    await page.getByLabel('Statut de Camille', { exact: true }).selectOption('contacte')
    await expect.poll(() => state.status).toBe('contacte')
    await openFilters(page)
    await page.getByRole('searchbox', { name: 'Rechercher un lead' }).fill('Camille')
    await page.getByLabel('Campus', { exact: true }).selectOption('Paris')
    await page.getByLabel('Canal d’acquisition', { exact: true }).selectOption('questionnaire')
    await page.getByLabel('Statut du lead', { exact: true }).selectOption('contacte')
    await page.getByLabel('Depuis le', { exact: true }).fill('2026-10-01')
    await page.getByLabel('Jusqu’au', { exact: true }).fill('2026-10-22')
    await page.getByLabel('Origine du résultat').selectOption('natural')
    const expectedFilters = { search: 'Camille', campus: 'Paris', source: 'questionnaire', status: 'contacte', from: '2026-10-01', to: '2026-10-22', origin: 'natural' }
    await expect.poll(() => state.calls.some((call) => call.path.endsWith('/leads') && Object.entries(expectedFilters).every(([key, value]) => call.query[key] === value))).toBe(true)
    const download = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Exporter en CSV' }).click()
    assert.equal((await download).suggestedFilename(), 'leads-1.csv')
    assert.deepEqual(state.calls.findLast((call) => call.path.endsWith('/export.csv')).query, expectedFilters)
    await page.getByRole('button', { name: 'Ouvrir le dossier' }).click()
    await page.keyboard.press('Escape')
    await expect(page.getByLabel('Campus', { exact: true })).toHaveValue('Paris')
    await expect(page.getByRole('searchbox')).toHaveValue('Camille')
    await page.getByLabel('Origine du résultat').selectOption('unknown')
    await expect(page.getByText(/Aucun lead pour ces filtres/)).toBeVisible()
    await expect(page.getByText('0–0 / 0', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Réinitialiser' }).click()
    await expect(page.getByRole('searchbox')).toHaveValue('')
    state.total = 51
    await page.getByRole('searchbox').fill('Camille')
    await expect(page.getByText('1–50 / 51', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Suivant', exact: true }).click()
    await expect(page.getByText('51–51 / 51', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Ouvrir le dossier' })).toHaveCount(1)
    await page.getByRole('button', { name: 'Ouvrir le dossier' }).click()
    await page.keyboard.press('Escape')
    await expect(page.getByText('51–51 / 51', { exact: true })).toBeVisible()
    await page.getByLabel('Origine du résultat').selectOption('natural')
    await expect(page.getByText('1–50 / 51', { exact: true })).toBeVisible()
    state.total = 1
    if (viewport.width < 900) {
      await page.getByRole('button', { name: 'Ouvrir la navigation' }).click()
      await expect(page.getByRole('dialog', { name: 'Navigation', exact: true })).toBeVisible()
      await page.keyboard.press('Escape')
      await expect(page.getByRole('button', { name: 'Ouvrir la navigation' })).toBeFocused()
      await page.getByRole('button', { name: 'Ouvrir la navigation' }).click()
      await page.getByRole('link', { name: 'Statistiques', exact: true }).click()
      await expect(page.getByRole('dialog')).toHaveCount(0)
    }
    await page.goto(`${base}/espace-ecoles/statistiques`)
    await expect(page.locator('.sp-kpi-label').filter({ hasText: /^Mixte$/ })).toBeVisible()
    await capture(page, `statistiques-${viewport.width}`)
    await page.goto(`${base}/espace-ecoles/formations`)
    await expect(page.getByText('Bachelor naturel', { exact: true })).toBeVisible()
    await expect(page.getByText('Bachelor sponsorisé', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Vérifier ma présence dans le catalogue national' }).click()
    await page.getByRole('button', { name: 'Ajouter une formation', exact: true }).click()
    const formationPanel = page.getByRole('dialog', { name: 'Ajouter une formation', exact: true })
    await formationPanel.getByLabel('Titre *', { exact: true }).fill('Bachelor personnalisé')
    await formationPanel.getByRole('button', { name: 'Ajouter la formation', exact: true }).click()
    await expect(page.getByText('Bachelor personnalisé', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Modifier', exact: true }).click()
    await page.getByRole('dialog').getByLabel('Titre *', { exact: true }).fill('Bachelor modifié')
    await page.getByRole('button', { name: 'Enregistrer les modifications', exact: true }).click()
    await expect(page.getByText('Bachelor modifié', { exact: true })).toBeVisible()
    await capture(page, `formations-${viewport.width}`)
    await page.getByRole('button', { name: 'Supprimer', exact: true }).click()
    await expect(page.getByText('Bachelor modifié', { exact: true })).toHaveCount(0)
    await page.goto(`${base}/espace-ecoles/equipe`)
    await expect(page.getByRole('button', { name: 'Envoyer l’invitation', exact: true })).toBeVisible()
    await expect(page.getByLabel('Mot de passe temporaire')).toHaveCount(0)
    await page.getByLabel('Email professionnel', { exact: true }).fill('collegue@ecole.fr')
    await page.getByRole('button', { name: 'Envoyer l’invitation', exact: true }).click()
    await expect(page.getByText('collegue@ecole.fr', { exact: true })).toBeVisible()
    await capture(page, `equipe-${viewport.width}`)
    await page.getByRole('button', { name: 'Retirer', exact: true }).click()
    await expect(page.getByText('collegue@ecole.fr', { exact: true })).toHaveCount(0)
    const before = state.calls.length
    await page.goto(`${base}/admin/partenaires`)
    await page.getByRole('link', { name: `Voir le dashboard de ${company.name}`, exact: true }).click()
    await expect(page.getByText('Aperçu administrateur — lecture seule', { exact: true })).toBeVisible()
    await expect(page.getByLabel('Statut de Camille')).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Révéler', exact: true })).toHaveCount(0)
    await page.getByRole('button', { name: 'Ouvrir le dossier' }).click()
    await expect(page.getByText('Ta matière préférée ?', { exact: true })).toBeVisible()
    await page.goto(`${base}/admin/ecoles/1/dashboard/formations`)
    await expect(page.getByText('Bachelor naturel', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Ajouter une formation', exact: true })).toHaveCount(0)
    await page.goto(`${base}/admin/ecoles/1/dashboard/equipe`)
    await expect(page.getByRole('button', { name: 'Envoyer l’invitation', exact: true })).toHaveCount(0)
    assert.ok(state.calls.slice(before).every((call) => call.method === 'GET'), 'preview never mutates partner state')
    await page.goto(`${base}/admin/ecoles`)
    await expect(page.getByText('Contact à inviter', { exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: `Voir le dashboard de ${company.name}`, exact: true })).toBeVisible()
    await page.getByRole('link', { name: `Gérer les accès de ${company.name}`, exact: true }).click()
    await page.getByLabel('Email du contact', { exact: true }).fill('responsable@mds.example')
    await page.getByRole('button', { name: 'Envoyer une invitation', exact: true }).click()
    await expect.poll(() => state.invitations.length).toBe(1)
    assert.equal(state.invitations[0].role, 'owner')
    await page.getByRole('button', { name: 'Fermer la fiche', exact: true }).click()
    await expect.poll(() => new URL(page.url()).searchParams.has('company_id')).toBe(false)
    await page.getByRole('link', { name: `Gérer les accès de ${company.name}`, exact: true }).click()
    await expect(page.getByLabel('Email du contact', { exact: true })).toBeVisible()
    assert.deepEqual(state.errors, [])
    await context.close()
    const activation = await prepare({ width: 1000, height: 900 })
    await activation.page.goto(`${base}/espace-ecoles/activation#access_token=${session.access_token}&refresh_token=fixture-refresh&type=invite`)
    await activation.page.getByLabel('Nouveau mot de passe', { exact: true }).fill('Fixture-password-2026')
    assert.equal(await activation.page.evaluate(() => Boolean(window.__zeliaPublicTrackingLoaded)), false)
    assert.deepEqual(await activation.page.evaluate(() => window.dataLayer || []), [], 'activation tokens must never enter analytics')
    await activation.page.getByLabel('Confirmer le mot de passe', { exact: true }).fill('Fixture-password-2026')
    await activation.page.getByRole('button', { name: 'Enregistrer mon mot de passe' }).click()
    await expect(activation.page.getByRole('heading', { name: 'Leads', exact: true })).toBeVisible()
    assert.equal(activation.state.activated, true)
    assert.equal(await activation.page.evaluate(() => localStorage.getItem('token')), 'student-marker')
    await activation.page.goto(`${base}/espace-ecoles/activation`)
    await expect(activation.page.getByRole('alert')).toContainText('Lien absent')
    await activation.page.goto(`${base}/espace-ecoles/mot-de-passe-oublie`)
    await activation.page.getByLabel('Email professionnel').fill('school@example.com')
    await activation.page.getByRole('button', { name: 'Envoyer le lien' }).click()
    await expect(activation.page.getByRole('status')).toContainText('Si un compte correspond')
    await activation.page.goto(`${base}/app/profile`)
    const sharing = activation.page.getByRole('checkbox', { name: /Autoriser les écoles que j’ai sollicitées/ })
    await sharing.click()
    await expect(sharing).toBeChecked()
    await expect.poll(() => activation.state.sharingGranted).toBe(true)
    await activation.page.getByRole('button', { name: 'Retirer tout partage avec cette école' }).click()
    await expect(activation.page.getByRole('button', { name: 'Rétablir le partage' })).toBeVisible()
    assert.equal(activation.state.schoolBlocked, true)
    await sharing.click()
    await expect(sharing).not.toBeChecked()
    await expect.poll(() => activation.state.sharingGranted).toBe(false)
    assert.deepEqual(activation.state.errors, [])
    await activation.context.close()
  }
  const { context, page, state } = await prepare({ width: 1000, height: 900 })
  await page.goto(`${base}/espace-ecoles/securite`)
  await expect(page.getByRole('heading', { name: 'Sécurité de mon compte', exact: true })).toBeVisible()
  await capture(page, 'securite-1000')
  await page.getByLabel('Nouveau mot de passe', { exact: true }).fill('Fixture-password-2026')
  await page.getByLabel('Confirmer le mot de passe', { exact: true }).fill('Different-password-2026')
  await page.getByRole('button', { name: 'Enregistrer mon mot de passe', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('deux mots de passe identiques')
  await page.getByLabel('Confirmer le mot de passe', { exact: true }).fill('Fixture-password-2026')
  await page.getByRole('button', { name: 'Enregistrer mon mot de passe', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('Mot de passe enregistré')
  await page.getByRole('button', { name: 'Activer une application d’authentification' }).click()
  await expect(page.getByAltText('QR code pour votre application d’authentification')).toBeVisible()
  await expect.poll(() => page.getByAltText('QR code pour votre application d’authentification').evaluate((image) => image.naturalWidth)).toBeGreaterThan(0)
  await page.getByLabel('Code de l’application').fill('123456')
  await page.getByRole('button', { name: 'Vérifier le code', exact: true }).click()
  await expect(page.getByText('Application activée', { exact: false })).toBeVisible()
  assert.equal(state.mfa, true)
  const stored = await page.evaluate(() => ({ student: localStorage.getItem('token'), admin: sessionStorage.getItem('sb-zelia-admin-auth-token') }))
  assert.equal(stored.student, 'student-marker')
  assert.equal(JSON.parse(stored.admin).access_token, session.access_token)
  assert.deepEqual(state.errors, [])
  await context.close()

  for (const entry of ['connexion', 'leads']) {
    const mfa = await prepare({ width: 1000, height: 900 }, { requireMfa: true, noSession: entry === 'connexion' })
    await mfa.page.goto(`${base}/espace-ecoles/${entry}`)
    if (entry === 'connexion') {
      await mfa.page.getByLabel('Email professionnel', { exact: true }).fill(user.email)
      await mfa.page.getByLabel('Mot de passe', { exact: true }).fill('Fixture-password-2026')
      await mfa.page.getByRole('button', { name: 'Se connecter', exact: true }).click()
    }
    await expect(mfa.page.getByRole('heading', { name: 'Vérifiez votre identité', exact: true })).toBeVisible()
    await expect(mfa.page.getByLabel('Code de l’application', { exact: true })).toBeVisible()
    assert.ok(mfa.state.calls.filter((call) => call.path.endsWith('/me')).length <= 1, 'MFA challenge does not loop through protected APIs')
    await capture(mfa.page, `mfa-${entry}`)
    await mfa.page.getByLabel('Code de l’application', { exact: true }).fill('123456')
    await mfa.page.getByRole('button', { name: 'Vérifier le code', exact: true }).click()
    await expect(mfa.page.getByRole('heading', { name: 'Leads', exact: true })).toBeVisible()
    assert.deepEqual(mfa.state.errors, [])
    await mfa.context.close()
  }

  for (const options of [{ noSession: true }, { expired: true }, { denied: true }, { company: { ...company, approved: false } }]) {
    const access = await prepare({ width: 390, height: 844 }, options)
    await access.page.goto(`${base}/espace-ecoles/leads`)
    if (options.denied) {
      await expect(access.page.getByRole('alert')).toContainText('Accès refusé.')
      await expect(access.page.getByRole('button', { name: 'Ouvrir le dossier' })).toHaveCount(0)
      access.state.denied = false
      await access.page.getByRole('button', { name: 'Réessayer' }).click()
      await expect(access.page.getByRole('heading', { name: 'Leads', exact: true })).toBeVisible()
    } else if (options.company) {
      await expect(access.page.getByRole('heading', { name: 'Compte en cours de validation', exact: true })).toBeVisible()
      assert.equal(access.state.calls.some((call) => call.path.endsWith('/leads')), false)
    } else await expect(access.page.getByRole('heading', { name: 'Connexion école', exact: true })).toBeVisible()
    await fits(access.page)
    assert.deepEqual(access.state.errors, [])
    await access.context.close()
  }

  const failures = await prepare({ width: 390, height: 844 })
  await failures.page.goto(`${base}/espace-ecoles/leads`)
  await failures.page.getByRole('button', { name: 'Ouvrir le dossier' }).click()
  const failurePanel = failures.page.getByRole('dialog')
  await failurePanel.getByLabel('Note interne', { exact: true }).fill('Ne pas perdre cette saisie')
  failures.state.fail = true
  await failurePanel.getByRole('button', { name: 'Enregistrer la note' }).click()
  await expect(failurePanel.getByRole('alert')).toContainText('Service portail indisponible.')
  await expect(failurePanel.getByLabel('Note interne', { exact: true })).toHaveValue('Ne pas perdre cette saisie')
  assert.equal(failures.state.note, '')
  await failures.page.keyboard.press('Escape')
  await failures.page.getByRole('searchbox').fill('Erreur')
  await expect(failures.page.getByRole('alert')).toContainText('Service portail indisponible.')
  await expect(failures.page.getByText('Aucun lead pour ces filtres', { exact: true })).toHaveCount(0)
  failures.state.fail = false
  await failures.page.getByRole('button', { name: 'Réessayer' }).click()
  await expect(failures.page.getByRole('button', { name: 'Ouvrir le dossier' })).toBeVisible()
  await expect(failures.page.getByRole('searchbox')).toHaveValue('Erreur')
  failures.state.fail = true
  await failures.page.goto(`${base}/espace-ecoles/statistiques`)
  await expect(failures.page.getByRole('alert')).toContainText('Service portail indisponible.')
  await expect(failures.page.getByText('Pas encore assez de données pour afficher des statistiques.', { exact: true })).toHaveCount(0)
  assert.deepEqual(failures.state.errors, [])
  await failures.context.close()

  for (const viewport of [{ width: 1920, height: 1080 }, { width: 1024, height: 768 }, { width: 360, height: 800 }]) {
    const responsive = await prepare(viewport, {
      revealed: true,
      company: { ...company, name: 'École supérieure des sciences, des technologies et des métiers de la communication internationale' },
      leadOverrides: { email: 'camille.martin.contact.professionnel.tres.long@example.com', formations_choisies_ecole: 'Bachelor en management des organisations et communication internationale' }
    })
    for (const route of ['leads', 'statistiques', 'formations', 'equipe', 'securite', 'connexion', 'inscription', 'mot-de-passe-oublie', '']) {
      await responsive.page.goto(`${base}/espace-ecoles/${route}`)
      await expect(responsive.page.getByRole('heading', { level: 1 })).toBeVisible()
      await expect(responsive.page.getByText(/Chargement|Vérification de votre session/).filter({ visible: true })).toHaveCount(0)
      await capture(responsive.page, `${route || 'accueil'}-${viewport.width}`)
      if (route === 'leads') {
        const search = responsive.page.getByRole('searchbox')
        assert.equal(await search.evaluate((input) => getComputedStyle(input).paddingLeft), '40px', 'search icon never overlaps the text despite legacy styles')
        await responsive.page.getByRole('button', { name: 'Ouvrir le dossier' }).click()
        await expect(responsive.page.getByRole('dialog')).toBeVisible()
        await capture(responsive.page, `dossier-${viewport.width}`)
        await responsive.page.keyboard.press('Escape')
      }
      if (viewport.width <= 600) {
        const metrics = await responsive.page.locator('.sp-shell input').evaluateAll((inputs) => inputs.filter((input) => input.getBoundingClientRect().height > 0).map((input) => ({ font: parseFloat(getComputedStyle(input).fontSize), height: input.getBoundingClientRect().height })))
        assert.ok(metrics.every((item) => item.font >= 16 && item.height >= 44), 'readable touch-friendly mobile inputs')
        const heights = await responsive.page.locator('.sp-shell button').evaluateAll((buttons) => buttons.filter((button) => button.getBoundingClientRect().height > 0).map((button) => button.getBoundingClientRect().height))
        assert.ok(heights.every((height) => height >= 44), 'mobile buttons meet the 44px target')
      }
    }
    assert.deepEqual(responsive.state.errors, [])
    await responsive.context.close()
  }
  console.log('School portal responsive layout, accessible drawers, filters/export/pagination, mutations/errors, registrations, read-only preview, access guards, MFA and session isolation verified.')
} finally { await browser.close() }
