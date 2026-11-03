import assert from 'node:assert/strict'
import { once } from 'node:events'
import { test } from 'node:test'
import express from 'express'
import { createApiRateLimiters } from '../middleware/rateLimit.js'

async function fixture(t) {
  const app = express()
  app.use('/api', createApiRateLimiters())
  app.use((req, res) => {
    if (req.method === 'OPTIONS') return res.sendStatus(204)
    res.json({ ok: true })
  })
  const server = app.listen(0, '127.0.0.1')
  t.after(() => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve())
    server.closeIdleConnections()
  }))
  await once(server, 'listening')
  const base = `http://127.0.0.1:${server.address().port}`
  return async (path, method = 'GET') => {
    const response = await fetch(`${base}${path}`, { method })
    const body = await response.text()
    return { status: response.status, headers: response.headers, body }
  }
}

test('profile reads work beyond 100 requests and stop at the read quota', async (t) => {
  const call = await fixture(t)
  const paths = ['/api/users/profile', '/api/users/me', '/api/users/profile/extra-info', '/api/analysis/my-results']
  for (let index = 0; index < 1000; index++) {
    const response = await call(paths[index % paths.length], index === 999 ? 'HEAD' : 'GET')
    assert.equal(response.status, 200, `Read ${index + 1} must succeed`)
    assert.equal(response.headers.get('ratelimit-limit'), '1000')
    assert.equal(response.headers.get('ratelimit-remaining'), String(999 - index))
  }
  const blocked = await call('/api/users/profile')
  assert.equal(blocked.status, 429)
  assert.equal(JSON.parse(blocked.body).code, 'RATE_LIMIT_EXCEEDED')
  assert.match(JSON.parse(blocked.body).error, /Too many requests/)
  const retryAfter = Number(blocked.headers.get('retry-after'))
  assert.ok(retryAfter > 0 && retryAfter <= 900)
  assert.equal((await call('/api/users/profile', 'PUT')).status, 200, 'Reads must not consume the write quota')
  assert.equal((await call('/health')).status, 200)
  assert.equal((await call('/api/users/profile', 'OPTIONS')).status, 204)
  for (const path of ['/api/formations', '/api/formations/42?detail=1', '/api/sitemap.xml', '/api/sitemap-formations-1.xml']) {
    assert.equal((await call(path)).status, 200, `${path} must remain crawlable`)
    assert.equal((await call(path, 'HEAD')).status, 200)
  }
})

test('writes keep their existing quota without blocking profile reads', async (t) => {
  const call = await fixture(t)
  for (let index = 0; index < 100; index++) {
    const response = await call('/api/users/profile/extra-info', 'POST')
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('ratelimit-limit'), '100')
  }
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
    const response = await call('/api/users/profile', method)
    assert.equal(response.status, 429)
    assert.equal(JSON.parse(response.body).code, 'RATE_LIMIT_EXCEEDED')
  }
  const profile = await call('/api/users/profile')
  assert.equal(profile.status, 200)
  assert.equal(profile.headers.get('ratelimit-remaining'), '999')
  assert.equal((await call('/api/users/profile', 'HEAD')).status, 200)
  assert.equal((await call('/api/users/profile', 'OPTIONS')).status, 204)
  assert.equal((await call('/api/formations', 'POST')).status, 429, 'Crawl exemptions must never bypass the write quota')
})

test('crawl traffic, preflights and health checks do not consume API quotas', async (t) => {
  const call = await fixture(t)
  for (const path of ['/api/formations', '/api/formations/42', '/api/sitemap.xml', '/health', '/']) {
    const response = await call(path)
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('ratelimit-limit'), null)
  }
  assert.equal((await call('/api/users/profile', 'OPTIONS')).status, 204)
  for (const path of ['/api/formations-other', '/api/users/profile']) {
    const response = await call(path)
    assert.equal(response.headers.get('ratelimit-limit'), '1000')
  }
  assert.equal((await call('/api/users/profile', 'POST')).headers.get('ratelimit-remaining'), '99')
})
