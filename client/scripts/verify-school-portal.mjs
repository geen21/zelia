import assert from 'node:assert/strict'
import { chromium, expect } from '@playwright/test'
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

async function prepare(viewport) {
  const context = await browser.newContext({ viewport })
  const page = await context.newPage()
  const state = { revealed: false, detailed: false, calls: [], errors: [], fail: false, mfa: false, activated: false, sharingGranted: false, schoolBlocked: false, invitations: [] }
  page.setDefaultTimeout(20000)
  page.on('pageerror', (error) => state.errors.push(error.message))
  await context.addInitScript(({ session }) => {
    localStorage.setItem('token', 'student-marker')
    localStorage.setItem('sb-espace-ecoles-auth-token', JSON.stringify(session))
    sessionStorage.setItem('sb-zelia-admin-auth-token', JSON.stringify(session))
  }, { session })
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
      if (url.pathname.endsWith('/token')) return send(session)
      if (url.pathname.endsWith('/recover') || url.pathname.endsWith('/logout')) return send({})
      return send({ ...user, factors: state.mfa ? [{ id: 'factor-1', factor_type: 'totp', status: 'verified' }] : [] })
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
      if (url.pathname.endsWith('/me') || url.pathname.endsWith('/company')) return send({ company })
      if (state.fail) return send({ message: 'Service portail indisponible.' }, 503)
      const visibleLead = { ...lead, revealed: state.revealed, detailedAllowed: state.detailed,
        nom: state.revealed || url.pathname.includes('/admin/') ? lead.nom : 'M***',
        email: state.revealed || url.pathname.includes('/admin/') ? lead.email : '***@***' }
      if (url.pathname.endsWith('/reveal')) { state.revealed = true; return send({ revealed: true }) }
      if (url.pathname.endsWith('/export.csv')) return route.fulfill({ contentType: 'text/csv', body: 'prenom;email\r\nCamille;***@***' })
      if (url.pathname.endsWith('/leads')) return send({ leads: url.searchParams.get('origin') === 'unknown' ? [] : [visibleLead], total: url.searchParams.get('origin') === 'unknown' ? 0 : 1, campuses: ['Paris', 'Lyon'] })
      if (url.pathname.includes('/lead/')) return send({ lead: visibleLead, detailLocked: state.detailed && !state.revealed && !url.pathname.includes('/admin/'),
        detail: state.detailed && (state.revealed || url.pathname.includes('/admin/')) ? { profile: { first_name: 'Camille', phone_number: '0600000000' }, answers: [{ question_id: 1, response: 'Sciences', questions: { content: 'Ta matière préférée ?' } }], extraInfo: [], analysis: null } : null })
      if (url.pathname.endsWith('/stats')) return send({ total: 1, byOrigin: { natural: 0, sponsored: 0, mixed: 1, unknown: 0 }, bySource: { questionnaire: 1 }, byStatus: { nouveau: 1 }, campuses: ['Paris'], leadsPerWeek: [{ week: '2026-10-01', count: 1 }], topFormations: [{ name: 'Bachelor', count: 1 }] })
      if (url.pathname.endsWith('/catalog')) return send({ total: 2, natural: 1, sponsored: 1, items: [
        { source: 'formation_france', reference: '7', school: company.name, title: 'Bachelor naturel', campus: 'Paris', linked: true, linkedCompanyId: 1, active: true, recommended: true },
        { source: 'ecoles_partenaires', reference: uuid, school: company.name, title: 'Bachelor sponsorisé', campus: 'Lyon', linked: true, linkedCompanyId: 1, active: true, recommended: true }
      ] })
      if (url.pathname.endsWith('/school-formations')) return send({ formations: [] })
      if (url.pathname.endsWith('/members')) return send({ owner: { email: company.email }, members: [] })
      return send({})
    }
    if (url.hostname === 'cdn.tailwindcss.com') return route.fulfill({ contentType: 'application/javascript', body: 'window.tailwind = {}' })
    if (url.origin !== new URL(base).origin) return route.abort()
    return route.continue()
  })
  return { context, page, state }
}

try {
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    const { context, page, state } = await prepare(viewport)
    await page.goto(`${base}/espace-ecoles/leads`)
    await expect(page.getByRole('heading', { name: 'Leads pour École Exemple' })).toBeVisible()
    await expect(page.getByRole('cell', { name: '***@*** Révéler', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Ouvrir le dossier' }).click()
    await expect(page.getByText(/Dossier détaillé non autorisé/)).toBeVisible()
    await page.getByRole('button', { name: 'Révéler', exact: true }).click()
    await expect(page.getByText(lead.email, { exact: true })).toBeVisible()
    state.detailed = true
    await page.getByRole('button', { name: 'Fermer', exact: true }).click()
    await page.getByRole('button', { name: 'Ouvrir le dossier' }).click()
    await expect(page.getByText('Ta matière préférée ?', { exact: true })).toBeVisible()
    await expect(page.getByText('0600000000', { exact: true })).toBeVisible()
    await page.getByLabel('Origine du résultat').selectOption('natural')
    await expect.poll(() => state.calls.some((call) => call.query.origin === 'natural')).toBe(true)
    await page.getByLabel('Origine du résultat').selectOption('unknown')
    await expect(page.getByText(/Aucun lead pour ces filtres/)).toBeVisible()
    await page.goto(`${base}/espace-ecoles/statistiques`)
    await expect(page.locator('.sp-kpi-label').filter({ hasText: /^Mixte$/ })).toBeVisible()
    await page.goto(`${base}/espace-ecoles/formations`)
    await expect(page.getByText('Bachelor naturel', { exact: true })).toBeVisible()
    await expect(page.getByText('Bachelor sponsorisé', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Vérifier ma présence dans le catalogue national' }).click()
    await page.goto(`${base}/espace-ecoles/equipe`)
    await expect(page.getByRole('button', { name: 'Envoyer l’invitation', exact: true })).toBeVisible()
    await expect(page.getByLabel('Mot de passe temporaire')).toHaveCount(0)
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
    await expect(page.getByRole('button', { name: 'Ajouter la formation', exact: true })).toHaveCount(0)
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
    await expect(activation.page.getByRole('heading', { name: 'Leads pour École Exemple' })).toBeVisible()
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
  console.log('School portal desktop/mobile, consented dossiers, origins, account invitations, read-only preview, MFA and session isolation verified.')
} finally { await browser.close() }
