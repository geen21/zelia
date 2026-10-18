import assert from 'node:assert/strict'
import { once } from 'node:events'
import express from 'express'
import { createAdminRouter } from '../routes/admin.js'
import { createPlatformAdminGuard } from '../middleware/admin.js'

process.env.SUPABASE_URL = 'https://example.invalid'
process.env.SUPABASE_ANON_KEY = 'fixture-anon-key'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'fixture-service-key'
for (const key of ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASSWORD']) process.env[key] = ''

const originalFetch = globalThis.fetch
globalThis.fetch = (input, options) => {
  assert.equal(new URL(typeof input === 'string' ? input : input.url).hostname, '127.0.0.1', 'Tests must not contact remote services')
  return originalFetch(input, options)
}

const { supabase, supabaseAdmin } = await import('../config/supabase.js')
const { authenticateToken } = await import('../middleware/auth.js')
const { default: ecolesRouter } = await import('../routes/ecoles.js')
const { default: usersRouter } = await import('../routes/users.js')
const admin = { id: '11111111-1111-4111-8111-111111111111', email: 'admin@example.com' }
const student = { id: '33333333-3333-4333-8333-333333333333', email: 'student@example.com' }
const newPartnerId = '99999999-9999-4999-8999-999999999999'
const partnerTemplate = {
  school_name: 'Ecole Exemple', formation_name: 'Bachelor Informatique Web',
  domain: 'Informatique', diploma_level: 'Bac+3', city: 'Bordeaux',
  is_active: true, show_in_results: true, results_priority: 0
}
let partners = Array.from({ length: 24 }, (_, index) => ({
  ...partnerTemplate, id: `44444444-4444-4444-8444-${String(index).padStart(12, '0')}`
}))
partners.push(
  { ...partnerTemplate, id: 'hidden', show_in_results: false },
  { ...partnerTemplate, id: 'inactive', is_active: false },
  { ...partnerTemplate, id: 'unrelated', formation_name: 'Licence Histoire', domain: 'Histoire', results_priority: 100 }
)
let entries = [{ user_id: student.id, question_id: 'orientation_career_domains', answer_text: '["technologie numerique"]' }]
let profile = { id: student.id, department: '75' }
let analysis = { id: '1', user_id: student.id, questionnaire_type: 'inscription', job_recommendations: [{ title: 'Developpeur Web' }] }
let partnerErrorOffset = null
const partnerRanges = []

function rowsFor(table) {
  switch (table) {
    case 'ecoles_partenaires': return partners
    case 'informations_complementaires': return entries
    case 'profiles': return profile ? [profile] : []
    case 'user_results': return analysis ? [analysis] : []
    case 'backoffice_account_suspensions':
    case 'companies': return []
    default: throw new Error(`Unexpected table: ${table}`)
  }
}

const db = {
  from(table) {
    const filters = []
    const orders = []
    let range
    let limit
    let deleting = false
    const matches = (row) => filters.every(([key, value, equals]) => (row[key] === value) === equals)
    const result = () => {
      if (table === 'ecoles_partenaires' && range) {
        partnerRanges.push(range)
        if (range[0] === partnerErrorOffset) return { data: null, error: { message: 'Fixture partner page failure' } }
      }
      if (deleting) {
        assert.equal(table, 'informations_complementaires')
        entries = entries.filter((row) => !matches(row))
        return { data: null, error: null }
      }
      let rows = rowsFor(table).filter(matches)
      rows.sort((left, right) => {
        for (const [key, options] of orders) {
          const comparison = String(left[key] || '').localeCompare(String(right[key] || ''))
          if (comparison) return options?.ascending === false ? -comparison : comparison
        }
        return 0
      })
      if (range) rows = rows.slice(range[0], range[1] + 1)
      if (limit) rows = rows.slice(0, limit)
      return { data: rows, error: null }
    }
    return {
      select() { return this },
      eq(key, value) { filters.push([key, value, true]); return this },
      neq(key, value) { filters.push([key, value, false]); return this },
      in(key, values) { assert.equal(values.length, 1); return this.eq(key, values[0]) },
      not() { return this },
      order(key, options) { orders.push([key, options]); return this },
      range(start, end) { range = [start, end]; return this },
      limit(value) { limit = value; return this },
      delete() { deleting = true; return this },
      async insert(rows) {
        assert.equal(table, 'informations_complementaires')
        entries.push(...rows)
        return { data: null, error: null }
      },
      async maybeSingle() { const response = result(); return { ...response, data: response.data?.[0] || null } },
      async single() { return this.maybeSingle() },
      then(resolve, reject) { return Promise.resolve(result()).then(resolve, reject) }
    }
  },
  async rpc(name, args) {
    if (name === 'backoffice_users') return { data: { items: [student], total: 1 }, error: null }
    assert.equal(name, 'backoffice_change')
    assert.equal(args.p_kind, 'partner')
    let item
    if (args.p_id) {
      item = partners.find((partner) => partner.id === args.p_id)
      assert.ok(item)
      Object.assign(item, args.p_patch)
    } else {
      item = { is_active: true, show_in_results: true, highlight_in_results: true, results_priority: 0, ...args.p_patch, id: newPartnerId }
      partners.push(item)
    }
    return { data: item, error: null }
  }
}
for (const client of [supabase, supabaseAdmin]) {
  client.from = db.from
  client.rpc = db.rpc
  client.auth.getUser = async (token) => ({ data: { user: token === 'admin' ? admin : student }, error: null })
}
const app = express()
app.use(express.json({ limit: '1mb' }))
app.use('/api/ecoles', ecolesRouter)
app.use('/api/users', usersRouter)
app.use('/api/admin', createAdminRouter({
  db, authenticateToken,
  requirePlatformAdmin: createPlatformAdminGuard(() => [admin]),
  isProtectedAdmin: (id) => id === admin.id
}))
const server = app.listen(0, '127.0.0.1')
await once(server, 'listening')
const base = `http://127.0.0.1:${server.address().port}/api`
async function request(path, method = 'GET', body, token = 'student') {
  return fetch(`${base}${path}`, {
    method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  })
}
async function matched() {
  const response = await request('/ecoles/matched')
  assert.equal(response.status, 200)
  return response.json()
}

try {
  const created = await request('/admin/partners', 'POST', {
    school_name: 'Nouvelle Ecole', formation_name: 'Bachelor Web', city: 'Nancy',
    show_in_results: true, highlight_in_results: true, results_priority: 0
  }, 'admin')
  assert.equal(created.status, 201)
  assert.equal((await created.json()).item.show_in_results, true)
  const first = await matched()
  assert.equal(first.matched.length, 25, 'All compatible partners must be returned, including beyond the previous top 12')
  assert.ok(first.matched.findIndex((formation) => formation.id === newPartnerId) >= 12, 'A newly created partner below the previous cutoff must remain visible')
  assert.ok(first.matched.every((formation) => formation.is_active && formation.show_in_results && formation.match_score > 0))
  assert.ok(!first.matched.some((formation) => ['hidden', 'inactive', 'unrelated'].includes(formation.id)))
  const prioritized = await request(`/admin/partners/${newPartnerId}`, 'PATCH', { results_priority: 75 }, 'admin')
  assert.equal(prioritized.status, 200)
  assert.equal((await matched()).matched[0].id, newPartnerId)
  entries.push(
    { user_id: student.id, question_id: 'orientation_study_location', answer_text: 'near_home' },
    { user_id: student.id, question_id: 'orientation_city', answer_text: 'Nancy' }
  )
  assert.deepEqual((await matched()).matched.map((formation) => formation.id), [newPartnerId])

  entries = []
  profile = { id: student.id }
  analysis = { ...analysis, job_recommendations: [] }
  assert.deepEqual((await matched()).matched, [], 'No profile signals must not return an unpersonalized catalog')
  entries = [{ user_id: student.id, question_id: 'orientation_career_domains', answer_text: '["technologie numerique"]' }]
  partners = Array.from({ length: 1002 }, (_, index) => ({ ...partnerTemplate, id: `partner-${String(index).padStart(4, '0')}` }))
  partnerRanges.length = 0
  assert.equal((await matched()).matched.length, 1002)
  assert.deepEqual(partnerRanges, [[0, 999], [1000, 1999]])
  partnerErrorOffset = 1000
  assert.equal((await request('/ecoles/matched')).status, 500, 'A failed page must not return partial recommendations')
  partnerErrorOffset = null

  const choices = Array.from({ length: 38 }, (_, index) => ({
    id: `choice-${index}`, type: index < 32 ? 'formation' : 'metier',
    title: `Choix ${index}`, requestMoreInformation: index < 32,
    sourceTable: index < 8 ? 'formation_france' : index < 32 ? 'ecoles_partenaires' : 'metiers',
    detail: { title: `Choix ${index}`, link: `https://example.com/formation-${index}`, description: 'Details '.repeat(300) }
  }))
  const saved = await request('/users/profile/extra-info', 'POST', { entries: [{
    question_id: 'orientation_final_selection', question_text: 'Selection finale orientation',
    answer_text: JSON.stringify(choices)
  }] })
  assert.equal(saved.status, 200)
  const stored = JSON.parse(entries.find((entry) => entry.question_id === 'orientation_final_selection').answer_text)
  assert.deepEqual(stored.map((candidate) => candidate.id), choices.map((candidate) => candidate.id))
  assert.ok(stored.slice(0, 32).every((candidate) => candidate.requestMoreInformation))
  const read = await request('/users/profile/extra-info')
  assert.equal(read.status, 200)
  const readChoices = JSON.parse((await read.json()).entries.find((entry) => entry.question_id === 'orientation_final_selection').answer_text)
  assert.equal(readChoices.length, 38)
  const adminResult = await request('/admin/results/1', 'GET', undefined, 'admin')
  assert.equal(adminResult.status, 200)
  assert.equal((await adminResult.json()).selections.length, 38)
  console.log('Partner creation -> personalized API candidates without premature cutoff, priority, visibility/city filters, pagination >1000 and 38 saved/read choices verified with local fixtures.')
} finally {
  server.close()
  await once(server, 'close')
  globalThis.fetch = originalFetch
}
