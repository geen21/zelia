import assert from 'node:assert/strict'
import { once } from 'node:events'
import { test } from 'node:test'
import express from 'express'
import { createPartnerDashboardRouter, inviteSchoolAccount } from '../routes/partnerDashboard.js'

const owner = '11111111-1111-4111-8111-111111111111'
const member = '22222222-2222-4222-8222-222222222222'
const pupil = '33333333-3333-4333-8333-333333333333'

function fixture() {
  const tables = {
    companies: [{ id: 1, name: 'School A', email: 'school@example.com', owner_id: owner, approved_at: '2026-01-01' },
      { id: 2, name: 'School B', owner_id: 'other', approved_at: '2026-01-01' }],
    school_portal_members: [{ id: 7, company_id: 1, user_id: member, role: 'member' }],
    school_portal_invitations: [], school_portal_audit: [], school_lead_reveals: [],
    profiles: [{ id: pupil, first_name: 'Camille', phone_number: '0600000000' }],
    user_responses: [{ id: 1, user_id: pupil, questionnaire_type: 'inscription', question_id: 1, response: 'Sciences', questions: { content: 'Ta matière ?' } }],
    informations_complementaires: [], user_results: []
  }
  const state = { detailed: false, missing: false, profileReads: 0, generated: [], authError: null }
  const lead = { leadKey: `user:${pupil}`, user_id: pupil, prenom: 'Camille', nom: 'Martin', email: 'student@example.com',
    origin: 'natural', source: 'questionnaire', actions: [], inscrit_le: '2026-10-01', status: 'nouveau', note: '' }
  const db = {
    from(table) {
      if (table === 'profiles') state.profileReads++
      let operation = 'select', payload, single = false, offset = 0, end = Infinity
      const filters = []
      const builder = {
        select() { return this }, eq(key, value) { filters.push((row) => String(row[key]) === String(value)); return this },
        neq(key, value) { filters.push((row) => row[key] !== value); return this },
        like() { return this }, order() { return this }, limit(n) { end = n - 1; return this },
        range(a, b) { offset = a; end = b; return this }, maybeSingle() { single = true; return this },
        single() { single = true; return this },
        insert(value) { operation = 'insert'; payload = value; return this },
        upsert(value) { operation = 'upsert'; payload = value; return this },
        update(value) { operation = 'update'; payload = value; return this },
        delete() { operation = 'delete'; return this },
        then(resolve, reject) {
          return Promise.resolve().then(() => {
            const rows = tables[table] || []
            const matches = rows.filter((row) => filters.every((filter) => filter(row)))
            let result = matches
            if (operation === 'insert') { rows.push({ id: rows.length + 1, ...payload }); result = [rows.at(-1)] }
            if (operation === 'upsert') {
              const previous = rows.find((row) => row.company_id === payload.company_id && (payload.email ? row.email === payload.email : row.lead_key === payload.lead_key))
              if (previous) Object.assign(previous, payload)
              else rows.push({ id: rows.length + 1, ...payload })
              result = [previous || rows.at(-1)]
            }
            if (operation === 'update') matches.forEach((row) => Object.assign(row, payload))
            if (operation === 'delete') tables[table] = rows.filter((row) => !matches.includes(row))
            result = result.slice(offset, end + 1)
            return { data: single ? result[0] || null : result, error: null }
          }).then(resolve, reject)
        }
      }
      return builder
    },
    async rpc(name, args) {
      if (state.missing) return { error: { code: 'PGRST202' } }
      if (name === 'school_find_auth_user') return { data: args.p_email === 'student@example.com' ? pupil : args.p_email === 'school@example.com' ? owner : null }
      if (name === 'school_claim_invitation') {
        await db.from('school_portal_invitations').upsert({ company_id: args.p_company, email: args.p_email, role: args.p_role, status: 'pending' })
        return { data: true }
      }
      if (name === 'school_attach_account') return { data: null }
      if (name !== 'school_dashboard') throw new Error(`Unexpected RPC ${name}`)
      const items = String(args.p_company) === '1' && (!args.p_filters.leadKey || args.p_filters.leadKey === lead.leadKey)
        ? [{ ...lead, detailedAllowed: state.detailed, revealed: tables.school_lead_reveals.some((row) => row.lead_key === lead.leadKey) }] : []
      return { data: { leads: items, total: items.length, campuses: ['Paris'], byOrigin: { natural: items.length, sponsored: 0, mixed: 0, unknown: 0 } } }
    },
    auth: { admin: {
      async generateLink(input) {
        state.generated.push(input)
        if (state.authError) return { data: null, error: state.authError }
        return { data: { user: { id: owner, user_metadata: { profile_type: 'school' } }, properties: { action_link: 'https://auth.example/verify?token=fixture&type=invite' } } }
      },
      async getUserById(id) { return { data: { user: { id, email: id === owner ? 'school@example.com' : 'member@example.com' } } } }
    } }
  }
  return { db, state, tables, lead }
}

test('portal HTTP: isolation, consent, read-only preview, public routes and MFA', async () => {
  const { db, state, tables, lead } = fixture()
  const app = express()
  app.use(express.json())
  const auth = (req, res, next) => {
    const token = req.headers.authorization?.slice(7)
    if (!token) return res.sendStatus(401)
    req.user = { id: token === 'member' ? member : token === 'other' ? 'other' : owner, email: 'school@example.com' }
    if (token.startsWith('header.')) req.user.factors = [{ status: 'verified' }]
    next()
  }
  app.use('/school-portal', createPartnerDashboardRouter({ db, authenticateToken: auth }))
  app.get('/school-portal/schools/search', (req, res) => res.json({ public: true }))
  app.use('/admin/schools/:companyId/dashboard', (req, res, next) => {
    if (req.headers.authorization !== 'Bearer admin') return res.sendStatus(403)
    next()
  }, createPartnerDashboardRouter({ db, authenticateToken: auth, admin: true }))
  const server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const base = `http://127.0.0.1:${server.address().port}`
  const call = async (path, token = 'owner', method = 'GET', body) => fetch(`${base}${path}`, {
    method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {})
  })
  try {
    assert.equal((await call('/school-portal/leads', null)).status, 401)
    assert.equal((await call('/school-portal/schools/search', null)).status, 200)
    let response = await call('/school-portal/leads?company_id=2')
    assert.equal(response.headers.get('cache-control'), 'no-store')
    assert.equal((await response.json()).leads[0].email, '***@***')
    assert.equal((await (await call('/school-portal/leads', 'other')).json()).total, 0)
    assert.equal((await call('/school-portal/lead/user:unknown')).status, 404)
    response = await call(`/school-portal/lead/${lead.leadKey}`)
    assert.equal((await response.json()).detail, null)
    assert.equal(state.profileReads, 0, 'unauthorized detail must not even be fetched')
    state.detailed = true
    assert.equal((await (await call(`/school-portal/lead/${lead.leadKey}`)).json()).detailLocked, true)
    assert.equal(state.profileReads, 0)
    assert.equal((await call(`/school-portal/lead/${lead.leadKey}/reveal`, 'owner', 'POST')).status, 200)
    assert.equal((await (await call(`/school-portal/lead/${lead.leadKey}`)).json()).detail.profile.phone_number, '0600000000')
    assert.equal((await call('/school-portal/members/7', 'member', 'DELETE')).status, 403)
    assert.equal((await call('/admin/schools/1/dashboard/leads', 'owner')).status, 403)
    const revealedBefore = tables.school_lead_reveals.length
    assert.equal((await (await call(`/admin/schools/1/dashboard/lead/${lead.leadKey}`, 'admin')).json()).lead.email, lead.email)
    assert.equal(tables.school_lead_reveals.length, revealedBefore)
    assert.ok(tables.school_portal_audit.some((row) => row.action === 'view_lead'))
    assert.equal((await call('/admin/schools/1/dashboard/leads/x/status', 'admin', 'PATCH', { status: 'converti' })).status, 405)
    assert.equal((await call(`/school-portal/leads/${pupil}/reveal`, 'owner', 'POST')).status, 410)
    assert.equal((await call('/school-portal/direct-requests')).status, 410)
    const jwt = (aal) => `header.${Buffer.from(JSON.stringify({ aal })).toString('base64url')}.signature`
    assert.equal((await call('/school-portal/leads', jwt('aal1'))).status, 403)
    assert.equal((await call('/school-portal/leads', jwt('aal2'))).status, 200)
    tables.companies[0].approved_at = null
    assert.equal((await call('/school-portal/leads')).status, 403)
    assert.equal((await call('/admin/schools/1/dashboard/leads', 'admin')).status, 200)
    tables.companies[0].approved_at = '2026-01-01'
    state.missing = true
    assert.equal((await call('/school-portal/leads')).status, 503)
  } finally { await new Promise((resolve) => server.close(resolve)) }
})

test('invitation: failure is visible, retry reuses identity, no plaintext password', async () => {
  const { db, state, tables } = fixture()
  const company = tables.companies[0]
  const args = { db, company, email: company.email, role: 'owner', clientUrl: 'https://client.example', actor: owner }
  await assert.rejects(inviteSchoolAccount({ ...args, deliver: async () => { throw new Error('Fixture SMTP failure') } }), /email non envoyé/)
  assert.equal(tables.school_portal_invitations[0].status, 'failed')
  assert.equal(tables.school_portal_invitations[0].user_id, owner)
  const messages = []
  assert.deepEqual(await inviteSchoolAccount({ ...args, deliver: async (mail) => messages.push(mail) }), { sent: true })
  assert.equal(state.generated.at(-1).type, 'recovery')
  assert.equal(state.generated.at(-1).options.redirectTo, 'https://client.example/espace-ecoles/activation')
  assert.equal(state.generated.at(-1).password, undefined)
  assert.equal(messages.length, 1)
  assert.equal(tables.school_portal_invitations[0].status, 'sent')
  await assert.rejects(inviteSchoolAccount(args), /Attendez une minute/)
  await assert.rejects(inviteSchoolAccount({ ...args, role: 'member' }), /autre rôle/)
  const generatedBefore = state.generated.length
  await assert.rejects(inviteSchoolAccount({ ...args, email: 'student@example.com', role: 'member' }), /autre compte/)
  assert.equal(state.generated.length, generatedBefore, 'an existing student identity must not be mutated by Auth')
})
