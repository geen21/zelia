import assert from 'node:assert/strict'
import { once } from 'node:events'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import express from 'express'
import { createClient } from '@supabase/supabase-js'
import { parseNationalSearch, searchNationalFormations } from '../utils/nationalFormationSearch.js'

let fixtureNumber = 0

function parseOrFilter(value) {
  assert.ok(value.startsWith('(') && value.endsWith(')'))
  const contents = value.slice(1, -1)
  const matches = [...contents.matchAll(/(?:^|,)([a-z_]+)\.ilike\.("(?:[^"\\]|\\.)*")(?=,|$)/g)]
  assert.equal(matches.map((match) => match[0]).join(''), contents, 'Every OR value must be quoted, including commas and parentheses')
  return matches.map(([, column, pattern]) => ({ column, pattern: JSON.parse(pattern) }))
}

async function fixture(t) {
  const state = { calls: [], rpcError: { code: 'PGRST202', message: 'search_formations p_query absent from schema cache' }, fallbackError: null, rows: [] }
  const warnings = []
  t.mock.method(console, 'warn', (...args) => warnings.push(args))
  const db = createClient('http://catalog.fixture', 'fixture-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (input, options) => {
      const url = new URL(input)
      const call = { url, body: options.body ? JSON.parse(options.body) : null }
      state.calls.push(call)
      const rpc = url.pathname.endsWith('/rpc/search_formations')
      const titleRpc = url.pathname.endsWith('/rpc/search_formations_simple')
      assert.ok(rpc || titleRpc || url.pathname.endsWith('/formation_france'), 'No unrelated database requests')
      if (!rpc && !titleRpc) call.filters = url.searchParams.getAll('or').flatMap(parseOrFilter)
      const error = rpc ? state.rpcError : state.fallbackError
      return new Response(JSON.stringify(error || state.rows), {
        status: error ? 400 : 200, headers: { 'Content-Type': 'application/json' }
      })
    } }
  })

  // Keep the real router and PostgREST client, replacing only external adapters.
  const source = await readFile(new URL('../routes/catalog.js', import.meta.url), 'utf8')
  const offset = source.indexOf('const router =')
  const imports = source.slice(0, offset).trim().split(/\r?\n/).filter(Boolean)
  assert.equal(imports.length, 4)
  assert.ok(imports.every((line) => line.startsWith('import ')))
  const key = `catalogSearchFixture${fixtureNumber++}`
  globalThis[key] = { express, supabase: db, optionalAuth: (req, res, next) => next(), parseNationalSearch, searchNationalFormations }
  let router
  try {
    const module = await import(`data:text/javascript;base64,${Buffer.from(
      `const { express, supabase, optionalAuth, parseNationalSearch, searchNationalFormations } = globalThis.${key};\n${source.slice(offset)}`
    ).toString('base64')}`)
    router = module.default
  } finally {
    delete globalThis[key]
  }
  const app = express()
  app.use('/catalog', router)
  const server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(() => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve())
    server.closeAllConnections()
  }))
  const base = `http://127.0.0.1:${server.address().port}/catalog/formations/search`
  const call = async (params) => {
    const response = await fetch(`${base}?${new URLSearchParams(params)}`)
    return { status: response.status, body: await response.json() }
  }
  return { state, warnings, call }
}

test('formation fallback accepts long titles, punctuation and literal wildcard characters', async (t) => {
  const { state, call } = await fixture(t)
  const titles = [
    'Master en Gestion de Projet (spécialité Construction, Logistique ou Design)',
    `Master en Gestion de Projet ${'construction et logistique '.repeat(2)}(spécialité Construction, Logistique ou Design)`,
    'Design "produit", parcours (A/B)',
    'Design 100% projet_nom \\ atelier'
  ]
  const department = 'Paris (75), centre'
  for (const q of titles) {
    state.calls = []
    state.rows = [{ id: 1, nmc: q }]
    const response = await call({ q, departement: department, region: 'Ile-de-France', page: 2, page_size: 24 })
    assert.equal(response.status, 200, q)
    assert.equal(response.body.items[0].nmc, q)
    assert.equal(response.body.has_more, false)
    assert.equal(response.body.total, null)
    assert.equal(response.body.page, 2)
    assert.equal(state.calls.length, 3, 'One RPC, its legacy signature retry, then one fallback')
    assert.equal(state.calls[0].body.p_limit, 25, 'Fetch only one bounded page plus a continuation sentinel')
    assert.equal(state.calls[0].body.p_offset, 24)
    assert.ok(state.calls[0].body.p_keywords.length <= 8)
    assert.equal(state.calls[0].body.p_query, q.trim().replace(/\s+/g, ' ').slice(0, 120))
    assert.ok(!('p_query' in state.calls[1].body))
    const fallback = state.calls[2]
    assert.equal(fallback.url.searchParams.get('limit'), '25')
    assert.equal(fallback.url.searchParams.get('offset'), '24')
    assert.equal(fallback.url.searchParams.get('order'), 'annee.desc.nullslast,id.asc')
    assert.equal(fallback.url.searchParams.get('region'), 'ilike.%Ile-de-France%')
    assert.deepEqual(fallback.filters.slice(0, 2), [
      { column: 'departement', pattern: `%${department}%` },
      { column: 'commune', pattern: `%${department}%` }
    ])
    const normalized = q.trim().replace(/\s+/g, ' ').slice(0, 120)
    const expectedPattern = `%${normalized.replace(/[\\%_]/g, '\\$&')}%`
    for (const filter of fallback.filters.slice(2, 7)) assert.equal(filter.pattern, expectedPattern)
    assert.deepEqual(fallback.filters.slice(2, 7).map(({ column }) => column), ['nmc', 'tc', 'etab_nom', 'code_formation', 'commune'])
    const cached = await call({ q, departement: department, region: 'Ile-de-France', page: 2, page_size: 24 })
    assert.deepEqual(cached, response)
    assert.equal(state.calls.length, 3, 'Repeated fallback results use the server cache')
  }
})

test('successful RPC pages stay bounded and cached', async (t) => {
  const { state, call } = await fixture(t)
  state.rpcError = null
  state.rows = Array.from({ length: 25 }, (_, id) => ({ id }))
  const response = await call({ q: 'informatique', page_size: 24 })
  assert.equal(response.status, 200)
  assert.equal(response.body.items.length, 24)
  assert.equal(response.body.has_more, true)
  assert.equal(state.calls.length, 1, 'A successful RPC never starts a fallback')
  assert.deepEqual(await call({ q: 'informatique', page_size: 24 }), response)
  assert.equal(state.calls.length, 1)
})

test('persistent database timeouts stay explicit and are never cached as empty success', async (t) => {
  const { state, warnings, call } = await fixture(t)
  state.rpcError = { code: '57014', message: 'canceling statement due to statement timeout' }
  state.fallbackError = state.rpcError
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await call({ q: 'informatique' })
    assert.equal(response.status, 503)
    assert.match(response.body.error, /temporairement indisponible/)
    assert.equal(state.calls.length, (attempt + 1) * 4, 'Retry each transport once, without an unbounded retry loop')
  }
  assert.equal(warnings.length, 2)
})

test('non-transient fallback failures remain explicit errors', async (t) => {
  const { state, call } = await fixture(t)
  state.fallbackError = { code: '42501', message: 'permission denied' }
  const response = await call({ q: 'informatique' })
  assert.equal(response.status, 400)
  assert.equal(response.body.error, 'permission denied')
  assert.equal(state.calls.length, 3)
})

test('profile search validates its constraints and caches unavailable doctorates without widening', async (t) => {
  const { state, call } = await fixture(t)
  const params = { matching: 'profile', q: 'biologie', departement: '06', study_levels: '8', formation_formats: 'doctorat' }
  assert.equal((await call({ ...params, departement: 'inconnu' })).status, 400)
  assert.equal(state.calls.length, 0)
  const responses = await Promise.all([call(params), call(params)])
  assert.ok(responses.every((response) => response.status === 200 && response.body.items.length === 0))
  assert.equal(state.calls.length, 2, 'Identical in-flight requests share one constrained query and one title lookup')
  const tableCall = state.calls.find((request) => request.url.pathname.endsWith('/formation_france'))
  assert.equal(tableCall.url.searchParams.get('limit'), '21')
  assert.ok(tableCall.url.searchParams.getAll('or').some((filter) => filter.includes('Alpes-Maritimes')))
  await call(params)
  assert.equal(state.calls.length, 2, 'Successful empty results may be cached, not database failures')
})

test('a failed profile query is not cached or retried as a broader query', async (t) => {
  const { state, call } = await fixture(t)
  t.mock.method(console, 'error', () => {})
  state.fallbackError = { code: '57014', message: 'statement timeout' }
  const params = { matching: 'profile', q: 'biologie', departement: '06', study_levels: '8', formation_formats: 'doctorat' }
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    assert.equal((await call(params)).status, 503)
    assert.equal(state.calls.length, attempt * 2)
  }
})
