import assert from 'node:assert/strict'
import { createClient } from '@supabase/supabase-js'
import { test } from 'node:test'
import { prepareRepairBatches, publishRepairBatch, verifyPublishedCatalog } from './publish_formation_repairs.mjs'

const row = { id: 25, annee: '2025', gta: '21092', etab_uai: '9730429D', nmc: 'L1-Info', nm: null }
const change = {
  id: 25, identity: { annee: '2025', gta: '21092', etab_uai: '9730429D' },
  before: { nm: null }, after: { nm: ['Licence Informatique'] },
  classification: { status: 'source_label' }
}
const plan = { format: 'zelia-formation-repair-preview-v1', changes: [change] }
const snapshot = { table: 'formation_france', complete: true, total_rows: 1, rows: [row] }

function fixture(current = structuredClone(row), patchRows) {
  const calls = []
  const db = createClient('http://formation-publication.fixture', 'fixture-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (input, options) => {
      const url = new URL(input)
      const method = options.method || 'GET'
      calls.push({ method, url, body: options.body && JSON.parse(options.body) })
      assert.equal(url.pathname, '/rest/v1/formation_france')
      assert.ok(['GET', 'PATCH'].includes(method), 'No insert, delete or table replacement is allowed')
      const data = method === 'PATCH' ? patchRows ?? [{ id: row.id, nm: change.after.nm }] : [current]
      return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } })
    } }
  })
  return { db, calls }
}

test('publication refuses incomplete backups, changed fields and existing values', () => {
  assert.throws(() => prepareRepairBatches(plan, { ...snapshot, complete: false }), /complete backup/)
  assert.throws(() => prepareRepairBatches({ ...plan, changes: [{ ...change, after: { id: 4 }, before: { id: 25 } }] }, snapshot), /Forbidden/)
  assert.throws(() => prepareRepairBatches({ ...plan, changes: [{ ...change, before: { nm: ['Old'] } }] }, { ...snapshot, rows: [{ ...row, nm: ['Old'] }] }), /Only missing/)
  assert.throws(() => prepareRepairBatches({ ...plan, changes: [{ ...change, classification: { status: 'needs_review' } }] }, snapshot), /Unreviewed/)
  assert.throws(() => prepareRepairBatches({ ...plan, changes: [{ ...change, after: { nm: 'string' } }] }, snapshot), /legacy type/)
})

test('atomic PATCH checks every identity field and the missing original value', async () => {
  const { db, calls } = fixture()
  const [batch] = prepareRepairBatches(plan, snapshot)
  assert.deepEqual(await publishRepairBatch(db, batch), { updated: [25], already: [] })
  assert.equal(calls.length, 2)
  assert.deepEqual(calls[1].body, change.after)
  assert.equal(calls[1].url.searchParams.get('nm'), 'is.null')
  const guard = calls[1].url.searchParams.get('or')
  for (const part of ['id.eq.25', 'annee.eq."2025"', 'gta.eq."21092"', 'etab_uai.eq."9730429D"', 'nmc.eq."L1-Info"']) assert.ok(guard.includes(part))
})

test('an interrupted publication is safely resumable without replacing data', async () => {
  const { db, calls } = fixture({ ...row, nm: change.after.nm })
  const [batch] = prepareRepairBatches(plan, snapshot)
  assert.deepEqual(await publishRepairBatch(db, batch), { updated: [], already: [25] })
  assert.equal(calls.length, 1)
})

test('concurrent changes and missing rows stop publication before writes', async () => {
  for (const current of [{ ...row, nm: ['Concurrent'] }, { ...row, gta: 'other' }]) {
    const { db, calls } = fixture(current)
    const [batch] = prepareRepairBatches(plan, snapshot)
    await assert.rejects(publishRepairBatch(db, batch), /Concurrent edit|Identity changed/)
    assert.equal(calls.length, 1)
  }
})

test('a concurrent change between reading and PATCH is detected in the response', async () => {
  const { db } = fixture(row, [])
  const [batch] = prepareRepairBatches(plan, snapshot)
  await assert.rejects(publishRepairBatch(db, batch), /Atomic guard rejected/)
})

test('rollback only restores original fields if the published value is still unchanged', async () => {
  const { db, calls } = fixture({ ...row, nm: change.after.nm }, [{ id: 25, nm: null }])
  const [batch] = prepareRepairBatches(plan, snapshot)
  assert.deepEqual(await publishRepairBatch(db, batch, { rollback: true }), { updated: [25], already: [] })
  assert.deepEqual(calls[1].body, { nm: null })
  assert.equal(calls[1].url.searchParams.get('nm'), 'eq.{"Licence Informatique"}')
})

test('whole-catalog verification checks every id, patched value and unrelated column', () => {
  const after = { ...snapshot, rows: [{ ...row, ...change.after }] }
  assert.equal(verifyPublishedCatalog(plan, snapshot, after).rowsVerified, 1)
  assert.throws(() => verifyPublishedCatalog(plan, snapshot, { ...after, rows: [{ ...after.rows[0], gta: 'changed' }] }), /expected state/)
  assert.throws(() => verifyPublishedCatalog(plan, snapshot, snapshot), /expected state/)
  assert.throws(() => verifyPublishedCatalog(plan, snapshot, { ...after, rows: [{ ...after.rows[0], id: 2 }] }), /new id/)
})
