import assert from 'node:assert/strict'
import { once } from 'node:events'
import { test } from 'node:test'
import express from 'express'
import { createSitemapRouter } from '../routes/sitemap.js'
import { buildFormationSlug } from '../utils/slug.js'

const columns = 'id, nm, nmc, fl, etab_nom, commune'
const rows = Array.from({ length: 125017 }, (_, index) => ({
  id: String(9007199254740993n + BigInt(index) * 3n),
  nm: index % 3 === 0 ? ['Formation & recherche'] : [],
  nmc: 'L1-Informatique',
  fl: index % 3 === 1 ? ['Parcours sciences'] : [],
  etab_nom: 'Ecole nationale',
  commune: 'Paris'
}))

function createDatabase(source = rows) {
  const calls = []
  return {
    calls,
    failure: null,
    beforeQuery: null,
    count: source.length,
    from(table) {
      assert.equal(table, 'formation_france')
      const db = this
      const call = { fields: null, options: null, cursor: null, offset: 0, limit: null }
      return {
        select(fields, options) {
          assert.ok(fields === 'id' || fields === columns)
          call.fields = fields
          call.options = options
          return this
        },
        order(field, options) {
          assert.equal(field, 'id')
          assert.deepEqual(options, { ascending: true })
          return this
        },
        range(from, to) {
          assert.equal(call.fields, 'id', 'Wide sitemap reads must not use OFFSET')
          assert.equal(to, from, 'The anchor must select exactly one id')
          call.offset = from
          call.limit = 1
          return this
        },
        limit(limit) {
          assert.equal(call.fields, columns)
          assert.ok(limit > 0 && limit <= 1000)
          call.limit = limit
          return this
        },
        gt(field, cursor) {
          assert.equal(field, 'id')
          assert.equal(typeof cursor, 'string', 'Do not coerce bigint cursors to numbers')
          call.cursor = cursor
          return this
        },
        async then(resolve, reject) {
          try {
            calls.push(call)
            if (db.beforeQuery) await db.beforeQuery(call)
            const error = db.failure?.(call)
            if (error) return resolve({ data: null, count: null, error })
            if (call.options?.head) {
              assert.deepEqual(call.options, { count: 'exact', head: true })
              return resolve({ data: null, count: db.count, error: null })
            }
            assert.notEqual(call.limit, null)
            let start = call.offset
            if (call.cursor != null) {
              let low = 0
              let high = source.length
              while (low < high) {
                const middle = Math.floor((low + high) / 2)
                if (BigInt(source[middle].id) <= BigInt(call.cursor)) low = middle + 1
                else high = middle
              }
              start = low
            }
            const page = source.slice(start, start + Math.min(call.limit, 1000))
            resolve({
              data: call.fields === 'id' ? page.map(({ id }) => ({ id })) : page,
              error: null
            })
          } catch (error) {
            reject(error)
          }
        }
      }
    }
  }
}

async function startServer(t, db, now) {
  const app = express()
  let received = 0
  const waiters = []
  app.use((req, res, next) => {
    received += 1
    for (const waiter of waiters) {
      if (received >= waiter.count) waiter.resolve()
    }
    next()
  })
  app.use('/api', createSitemapRouter({ db, now }))
  const server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(() => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve())
    server.closeAllConnections()
  }))
  const base = `http://127.0.0.1:${server.address().port}/api`
  return {
    request: (path) => fetch(`${base}/${path}`),
    waitForRequests(count) {
      if (received >= count) return Promise.resolve()
      return new Promise((resolve) => { waiters.push({ count, resolve }) })
    }
  }
}

async function readXml(response) {
  assert.equal(response.status, 200)
  assert.match(response.headers.get('content-type'), /^application\/xml; charset=utf-8$/i)
  assert.equal(response.headers.get('cache-control'), 'public, max-age=3600')
  const xml = await response.text()
  assert.ok(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>'))
  return xml
}

function assertChunk(xml, expected) {
  assert.match(xml, /<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/)
  const locations = [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map((match) => match[1])
  assert.deepEqual(locations, expected.map((row) => `https://zelia.io/formations/${buildFormationSlug(row)}`))
  assert.equal(new Set(locations).size, expected.length)
  assert.equal((xml.match(/<changefreq>monthly<\/changefreq>/g) || []).length, expected.length)
  assert.equal((xml.match(/<priority>0\.6<\/priority>/g) || []).length, expected.length)
}

test('deep chunks preserve all URLs, cursor boundaries, row caps and cache expiry', async (t) => {
  const db = createDatabase()
  let time = Date.UTC(2026, 9, 6)
  const { request } = await startServer(t, db, () => time)
  const index = await readXml(await request('sitemap-index.xml'))
  assert.equal((index.match(/<sitemap>/g) || []).length, 26)
  assert.ok(index.includes('<loc>https://zelia.io/sitemap-formations-26.xml</loc>'))
  assert.ok(index.includes('<lastmod>2026-10-06</lastmod>'))

  for (const chunk of [26, 25, 1]) {
    const start = (chunk - 1) * 5000
    const before = db.calls.length
    assertChunk(await readXml(await request(`sitemap-formations-${chunk}.xml`)), rows.slice(start, start + 5000))
    const calls = db.calls.slice(before)
    if (chunk > 1) {
      assert.equal(calls[0].fields, 'id')
      assert.equal(calls[0].offset, start - 1)
      assert.equal(calls[0].limit, 1)
    }
    const pages = calls.filter((call) => call.fields === columns)
    assert.equal(pages.length, Math.ceil(Math.min(5000, rows.length - start) / 1000))
    pages.forEach((call, page) => {
      assert.equal(call.offset, 0)
      assert.equal(call.limit, 1000)
      assert.equal(call.cursor, start + page * 1000 === 0 ? null : rows[start + page * 1000 - 1].id)
    })
  }

  const beforeCache = db.calls.length
  await readXml(await request('sitemap-index.xml'))
  assertChunk(await readXml(await request('sitemap-formations-25.xml')), rows.slice(120000, 125000))
  assert.equal(db.calls.length, beforeCache)
  time += 60 * 60 * 1000
  await readXml(await request('sitemap-index.xml'))
  assertChunk(await readXml(await request('sitemap-formations-26.xml')), rows.slice(125000))
  assert.equal(db.calls.length, beforeCache + 3)
  assert.equal((await request('sitemap-formations-27.xml')).status, 404)
  const beforeInvalid = db.calls.length
  for (const chunk of ['0', '-1', 'abc']) {
    assert.equal((await request(`sitemap-formations-${chunk}.xml`)).status, 404)
  }
  assert.equal(db.calls.length, beforeInvalid)
})

test('concurrent requests share count and chunk work', async (t) => {
  const db = createDatabase(rows.slice(0, 6003))
  let release
  const gate = new Promise((resolve) => { release = resolve })
  t.after(() => release())
  db.beforeQuery = () => gate
  const { request, waitForRequests } = await startServer(t, db)
  const requests = [
    ...Array.from({ length: 3 }, () => request('sitemap-index.xml')),
    ...Array.from({ length: 3 }, () => request('sitemap-formations-2.xml'))
  ]
  await waitForRequests(6)
  assert.equal(db.calls.length, 2)
  release()
  const xml = await Promise.all((await Promise.all(requests)).map(readXml))
  assert.equal(xml[0], xml[1])
  assert.equal(xml[1], xml[2])
  xml.slice(3).forEach((chunk) => assertChunk(chunk, rows.slice(5000, 6003)))
  assert.equal(db.calls.filter((call) => call.options?.head).length, 1)
  assert.equal(db.calls.filter((call) => call.fields === 'id' && !call.options?.head).length, 1)
  assert.equal(db.calls.filter((call) => call.fields === columns).length, 2)
})

test('a transient page timeout retries the same cursor without missing URLs', async (t) => {
  const db = createDatabase(rows.slice(0, 7000))
  let failed = false
  db.failure = (call) => {
    if (call.fields === columns && call.cursor === rows[5999].id && !failed) {
      failed = true
      return { code: '57014', message: 'canceling statement due to statement timeout' }
    }
    return null
  }
  const { request } = await startServer(t, db)
  assertChunk(await readXml(await request('sitemap-formations-2.xml')), rows.slice(5000, 7000))
  assert.equal(failed, true)
  assert.equal(db.calls.filter((call) => call.cursor === rows[5999].id).length, 2)
})

for (const stage of ['count', 'anchor', 'page']) {
  test(`persistent ${stage} errors are logged, not cached, and can recover`, async (t) => {
    const db = createDatabase(rows.slice(0, 10000))
    const errors = []
    t.mock.method(console, 'error', (...args) => errors.push(args))
    const isTarget = (call) => stage === 'count'
      ? call.options?.head
      : stage === 'anchor' ? call.fields === 'id' : call.fields === columns && call.cursor === rows[5999].id
    const path = stage === 'count' ? 'sitemap-index.xml' : 'sitemap-formations-2.xml'
    const { request } = await startServer(t, db)
    for (const code of ['57014', '42P01']) {
      const before = db.calls.length
      db.failure = (call) => isTarget(call) ? { code, message: 'Fixture database error' } : null
      const response = await request(path)
      assert.equal(response.status, 500)
      assert.equal(await response.text(), 'Sitemap generation error')
      assert.equal(response.headers.get('cache-control'), null)
      assert.equal(db.calls.slice(before).filter(isTarget).length, code === '57014' ? 2 : 1)
      assert.equal(errors[errors.length - 1][1].code, code)
    }
    db.failure = null
    const xml = await readXml(await request(path))
    if (stage === 'count') assert.equal((xml.match(/<sitemap>/g) || []).length, 2)
    else assertChunk(xml, rows.slice(5000, 10000))
    assert.equal(errors.length, 2)
  })
}

test('empty tables keep existing index behavior; missing counts fail explicitly', async (t) => {
  const db = createDatabase([])
  const errors = []
  t.mock.method(console, 'error', (...args) => errors.push(args))
  let time = 0
  const { request } = await startServer(t, db, () => time)
  const index = await readXml(await request('sitemap-index.xml'))
  assert.equal((index.match(/<sitemap>/g) || []).length, 1)
  assert.equal((await request('sitemap-formations-1.xml')).status, 404)
  db.count = null
  time += 60 * 60 * 1000
  assert.equal((await request('sitemap-index.xml')).status, 500)
  assert.equal(errors[0][1].message, 'Invalid formation count')
  db.count = 0
  await readXml(await request('sitemap-index.xml'))
})
