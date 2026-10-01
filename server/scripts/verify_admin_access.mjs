import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { parse } from 'pgsql-parser'
import { getAdminIdentities } from '../config/backoffice.js'
import { createPlatformAdminGuard } from '../middleware/admin.js'
import { configureBackofficeEnvironment, resolveBackofficeIdentities } from './configure_backoffice.mjs'

const environment = {
  BACKOFFICE_JORIS_USER_ID: '11111111-1111-4111-8111-111111111111',
  BACKOFFICE_NICOLAS_USER_ID: '22222222-2222-4222-8222-222222222222'
}
const identities = getAdminIdentities(environment)
const guard = createPlatformAdminGuard(() => identities)

function checkGuard(middleware, user, headers = {}) {
  const result = { status: 200, allowed: false, headers: {} }
  const response = {
    set(name, value) { result.headers[name] = value; return this },
    status(status) { result.status = status; return this },
    json(body) { result.body = body; return this }
  }
  middleware({ user, headers }, response, () => { result.allowed = true })
  return result
}

for (const identity of identities) assert.equal(checkGuard(guard, identity).allowed, true)
assert.equal(checkGuard(guard, undefined).status, 401)
assert.equal(checkGuard(guard, { id: '33333333-3333-4333-8333-333333333333', email: identities[0].email }).status, 403)
assert.equal(checkGuard(guard, { id: identities[0].id, email: identities[1].email }).status, 403)
assert.equal(checkGuard(guard, { id: 'ordinary-user', email: 'student@example.com', user_metadata: { role: 'admin' } }).status, 403)
assert.equal(checkGuard(guard, undefined, { 'x-admin-key': 'legacy-key' }).allowed, false)
assert.equal(checkGuard(guard, { ...identities[0], email: identities[0].email.toUpperCase() }).allowed, true)
assert.equal(checkGuard(guard, identities[0]).headers['Cache-Control'], 'no-store')
assert.equal(checkGuard(createPlatformAdminGuard(() => getAdminIdentities({})), identities[0]).status, 503)
assert.throws(() => getAdminIdentities({ ...environment, BACKOFFICE_NICOLAS_USER_ID: environment.BACKOFFICE_JORIS_USER_ID }))
assert.throws(() => getAdminIdentities({ ...environment, BACKOFFICE_JORIS_USER_ID: 'invalid' }))

const originalEnv = 'SUPABASE_URL=https://fixture.supabase.co\r\nUNRELATED_SETTING=unchanged\r\n'
const configured = configureBackofficeEnvironment(originalEnv, identities)
assert.ok(configured.startsWith(originalEnv))
assert.deepEqual(getAdminIdentities((await import('dotenv')).default.parse(configured)), identities)
assert.equal(configureBackofficeEnvironment(configured, identities), configured)
assert.throws(() => configureBackofficeEnvironment('BACKOFFICE_JORIS_USER_ID=33333333-3333-4333-8333-333333333333\n', identities), /autre UUID/)
assert.throws(() => configureBackofficeEnvironment(originalEnv, identities.map((identity) => ({ ...identity, email: 'untrusted@example.com' }))), /inattendues/)
const fixtureClient = {
  rpc: async (_name, { p_query }) => ({ data: { items: identities.filter((identity) => identity.email === p_query), total: 1 } }),
  auth: { admin: { getUserById: async (id) => ({ data: { user: identities.find((identity) => identity.id === id) } }) } }
}
assert.deepEqual(await resolveBackofficeIdentities(fixtureClient), identities)
await assert.rejects(resolveBackofficeIdentities({ ...fixtureClient, rpc: async () => ({ error: { code: 'PGRST202' } }) }), /Migration/)
await assert.rejects(resolveBackofficeIdentities({ ...fixtureClient, rpc: async () => ({ data: { items: [], total: 0 } }) }), /unique compte/)
await assert.rejects(resolveBackofficeIdentities({ ...fixtureClient, rpc: async () => ({ data: { items: [{ ...identities[0], is_suspended: true }], total: 1 } }) }), /Compte bloque/)
await assert.rejects(resolveBackofficeIdentities({ ...fixtureClient, auth: { admin: { getUserById: async () => ({ data: { user: identities[1] } }) } } }), /non verifiee/)

const migration = await readFile(new URL('../database/migration_backoffice.sql', import.meta.url), 'utf8')
await parse(migration)
console.log('Back-office identity guard, safe environment provisioning and PostgreSQL migration syntax verified.')