import assert from 'node:assert/strict'
import { once } from 'node:events'
import { test } from 'node:test'
import express from 'express'

process.env.SUPABASE_URL = 'https://example.invalid'
process.env.SUPABASE_ANON_KEY = 'fixture-anon-key'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'fixture-service-key'
const { supabase } = await import('../config/supabase.js')
const { default: catalogRouter } = await import('../routes/catalog.js')
const { default: formationsRouter } = await import('../routes/formations.js')
const timeout = { code: '57014', message: 'canceling statement due to statement timeout' }
const missing = { code: 'PGRST202', message: 'Could not find search_formations in the schema cache' }
const row = { id: 1, nmc: 'Astronomie', etab_nom: 'Campus', commune: 'Paris', departement: '75', tc: 'Master' }

test('formation search HTTP: timeout visibility, bounded attempts and compatibility', async (t) => {
  const fetchLocal = globalThis.fetch
  t.mock.method(globalThis, 'fetch', (input, options) => {
    assert.equal(new URL(typeof input === 'string' ? input : input.url).hostname, '127.0.0.1', 'No remote services in tests')
    return fetchLocal(input, options)
  })
  const app = express()
  app.use(express.json())
  app.use('/api/catalog', catalogRouter)
  app.use('/api/formations', formationsRouter)
  const server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())))
  const base = `http://127.0.0.1:${server.address().port}`
  const get = async (query) => {
    const response = await fetch(`${base}/api/catalog/formations/search?${query}`)
    return { status: response.status, body: await response.json() }
  }
  const post = async (body) => {
    const response = await fetch(`${base}/api/formations/search`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    })
    return { status: response.status, body: await response.json() }
  }
  function fixture(context, rpcResults, fallback = { data: [row], error: null }) {
    const calls = { rpc: [], fallback: 0 }
    context.mock.method(supabase, 'rpc', async (name, args) => {
      assert.equal(name, 'search_formations')
      calls.rpc.push(args)
      assert.ok(rpcResults.length, 'Unexpected RPC retry')
      return rpcResults.shift()
    })
    context.mock.method(supabase, 'from', (table) => {
      assert.equal(table, 'formation_france')
      calls.fallback++
      const builder = {
        select() { return this }, ilike() { return this }, or() { return this },
        order() { return this }, range() { return this }, limit() { return this },
        then(resolve, reject) { return Promise.resolve(fallback).then(resolve, reject) }
      }
      return builder
    })
    context.mock.method(console, 'warn', () => {})
    context.mock.method(console, 'error', () => {})
    context.mock.method(console, 'log', () => {})
    return calls
  }
  const expectTimeout = (result) => {
    assert.equal(result.status, 503)
    assert.equal(result.body.code, '57014')
    assert.match(result.body.error, /timed out/i)
    assert.equal(result.body.items, undefined, 'A timeout must not look like an empty search result')
    assert.equal(result.body.formations, undefined)
  }

  await t.test('catalogue timeout makes one RPC call, no fallback and is not cached', async (context) => {
    const calls = fixture(context, [{ error: timeout }, { data: [row], error: null }])
    expectTimeout(await get('q=timeout-cache'))
    assert.equal(calls.rpc.length, 1)
    assert.equal(calls.fallback, 0)
    const retry = await get('q=timeout-cache')
    assert.equal(retry.status, 200)
    assert.deepEqual(retry.body.items, [row])
    assert.deepEqual(await get('q=timeout-cache'), retry)
    assert.equal(calls.rpc.length, 2, 'Successful results should still be cached')
  })

  await t.test('legacy p_query compatibility and has_more pagination remain available', async (context) => {
    const calls = fixture(context, [{ error: missing }, { data: [row, { ...row, id: 2 }], error: null }])
    const result = await get('q=legacy-compatible&page=3&page_size=1&departement=75&region=IDF')
    assert.equal(result.status, 200)
    assert.deepEqual(result.body, { items: [row], total: null, has_more: true, page: 3, page_size: 1 })
    assert.equal(calls.rpc.length, 2)
    assert.equal(calls.rpc[0].p_query, 'legacy-compatible')
    assert.equal(calls.rpc[1].p_query, undefined)
    assert.equal(calls.rpc[1].p_offset, 2)
    assert.equal(calls.rpc[1].p_limit, 2)
    assert.equal(calls.rpc[1].p_department, '75')
    assert.equal(calls.rpc[1].p_region, 'IDF')
  })

  await t.test('catalogue legacy fallback timeout is not retried or converted to 200', async (context) => {
    const calls = fixture(context, [{ error: missing }, { error: missing }], { error: timeout })
    expectTimeout(await get('q=fallback-timeout'))
    assert.equal(calls.rpc.length, 2)
    assert.equal(calls.fallback, 1)
  })

  await t.test('catalogue stops if the legacy-compatible RPC times out', async (context) => {
    const calls = fixture(context, [{ error: missing }, { error: timeout }])
    expectTimeout(await get('q=legacy-timeout'))
    assert.equal(calls.rpc.length, 2)
    assert.equal(calls.fallback, 0)
  })

  await t.test('catalogue fallback and genuine empty results preserve their response shape', async (context) => {
    const calls = fixture(context, [{ error: missing }, { error: missing }, { data: [], error: null }])
    assert.equal((await get('q=legacy-fallback')).status, 200)
    assert.equal(calls.fallback, 1)
    assert.deepEqual((await get('q=genuinely-empty')).body,
      { items: [], total: null, has_more: false, page: 1, page_size: 20 })
  })

  await t.test('advanced search reports the initial RPC timeout without fallback', async (context) => {
    const calls = fixture(context, [{ error: timeout }])
    expectTimeout(await post({ keywords: ['astronomie'] }))
    assert.equal(calls.rpc.length, 1)
    assert.equal(calls.fallback, 0)
  })

  await t.test('advanced search reports commune and broadening timeouts', async (context) => {
    const calls = fixture(context, [{ data: [], error: null }, { error: timeout },
      { data: [], error: null }, { error: timeout }])
    expectTimeout(await post({ keywords: ['astronomie'], commune: 'Paris' }))
    expectTimeout(await post({ keywords: ['astronomie', 'master'] }))
    assert.equal(calls.rpc.length, 4)
    assert.equal(calls.fallback, 0)
  })

  await t.test('advanced legacy fallback timeout is explicit', async (context) => {
    const calls = fixture(context, [{ error: missing }], { error: timeout })
    expectTimeout(await post({ keywords: ['astronomie'] }))
    assert.equal(calls.fallback, 1)
  })

  await t.test('advanced search retains successful post-filtering and legacy fallback', async (context) => {
    const calls = fixture(context, [{ data: [row, { ...row, id: 2, commune: 'Lyon', tc: 'BTS' }], error: null },
      { error: missing }])
    assert.deepEqual((await post({ keywords: ['astronomie'], commune: 'Paris', cursus_types: ['master'], limit: 1 })).body,
      { formations: [row], total: 1 })
    assert.deepEqual((await post({ keywords: ['astronomie'] })).body, { formations: [row], total: 1 })
    assert.equal(calls.fallback, 1)
  })
})