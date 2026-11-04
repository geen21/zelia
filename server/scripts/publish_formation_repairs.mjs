import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { appendFile, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { isDeepStrictEqual } from 'node:util'
import { parseArgs } from 'node:util'

const ARRAY_FIELDS = new Set(['nm', 'tf', 'fl', 'amg'])
const TEXT_FIELDS = new Set(['app', 'int', 'aut'])
const IDENTITY = ['annee', 'gta', 'etab_uai', 'nmc']
const equal = isDeepStrictEqual
const quote = (value) => `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
const missing = (value) => value == null || (typeof value === 'string' && !value.trim()) || value === '{}' || (Array.isArray(value) && !value.length)
const stableJson = (object) => JSON.stringify(object, Object.keys(object).sort())

export function prepareRepairBatches(plan, snapshot, { batchSize = 20 } = {}) {
  assert.equal(plan.format, 'zelia-formation-repair-preview-v1', 'Unsupported repair-plan format')
  assert.equal(snapshot.table, 'formation_france')
  assert.equal(snapshot.complete, true, 'A complete backup is required before publication')
  assert.equal(snapshot.rows.length, snapshot.total_rows)
  const originals = new Map(snapshot.rows.map((row) => [row.id, row]))
  assert.equal(originals.size, snapshot.rows.length, 'Duplicate database ids in backup')
  const ids = new Set()
  const groups = new Map()
  for (const change of plan.changes) {
    assert.ok(Number.isSafeInteger(change.id) && !ids.has(change.id), 'Invalid or duplicate change id')
    ids.add(change.id)
    const original = originals.get(change.id)
    assert.ok(original, 'Repair id must exist in the full backup')
    const fields = Object.keys(change.after).sort()
    assert.ok(fields.length && equal(fields, Object.keys(change.before).sort()), 'Before/after fields must match')
    assert.notEqual(change.classification?.status, 'needs_review', 'Unreviewed classification cannot be published')
    for (const field of IDENTITY.slice(0, 3)) {
      assert.equal(String(original[field]), String(change.identity[field]), 'Source identity mismatch')
    }
    for (const field of fields) {
      assert.ok(ARRAY_FIELDS.has(field) || TEXT_FIELDS.has(field), `Forbidden repair field: ${field}`)
      assert.ok(equal(original[field], change.before[field]), 'Backup does not match expected original value')
      assert.ok(missing(change.before[field]), 'Only missing original values may be filled')
      const after = change.after[field]
      assert.ok(ARRAY_FIELDS.has(field)
        ? Array.isArray(after) && after.length > 0 && after.every((value) => typeof value === 'string' && value.trim())
        : typeof after === 'string' && after.trim(), `Invalid legacy type for ${field}`)
    }
    const key = JSON.stringify([original.nmc, stableJson(change.before), stableJson(change.after)])
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push({ ...change, identity: Object.fromEntries(IDENTITY.map((field) => [field, original[field]])) })
  }
  const batches = []
  for (const group of groups.values()) {
    for (let index = 0; index < group.length; index += batchSize) batches.push(group.slice(index, index + batchSize))
  }
  return batches
}

function originalFilter(value) {
  if (Array.isArray(value)) {
    return `{${value.map((part) => quote(part)).join(',')}}`
  }
  return value
}

export async function publishRepairBatch(db, changes, { rollback = false } = {}) {
  const fields = Object.keys(changes[0].after).sort()
  const current = await db.from('formation_france')
    .select(['id', ...IDENTITY, ...fields].join(','))
    .in('id', changes.map((change) => change.id))
    .abortSignal(AbortSignal.timeout(20000))
  if (current.error) throw new Error(current.error.message)
  const byId = new Map(current.data.map((row) => [row.id, row]))
  const pending = []
  const already = []
  for (const change of changes) {
    const row = byId.get(change.id)
    assert.ok(row, `Formation ${change.id} disappeared; stop instead of inserting it`)
    for (const field of IDENTITY) {
      assert.ok(equal(row[field], change.identity[field]), `Identity changed for formation ${change.id}: ${field}`)
    }
    const expected = rollback ? change.after : change.before
    const target = rollback ? change.before : change.after
    if (fields.every((field) => equal(row[field], target[field]))) {
      already.push(change.id)
    } else {
      assert.ok(fields.every((field) => equal(row[field], expected[field])), `Concurrent edit on formation ${change.id}; no overwrite`)
      pending.push(change)
    }
  }
  if (!pending.length) return { updated: [], already }
  const expected = rollback ? pending[0].after : pending[0].before
  const target = rollback ? pending[0].before : pending[0].after
  let query = db.from('formation_france').update(target)
  // Every row's stable source identity is checked again by the atomic PATCH.
  query = query.or(pending.map((change) => `and(id.eq.${change.id},${IDENTITY.map((field) =>
    `${field}.eq.${quote(change.identity[field])}`).join(',')})`).join(','))
  for (const field of fields) {
    query = expected[field] === null
      ? query.is(field, null)
      : query.eq(field, originalFilter(expected[field]))
  }
  const result = await query.select(['id', ...fields].join(',')).abortSignal(AbortSignal.timeout(20000))
  if (result.error) throw new Error(result.error.message)
  assert.equal(result.data.length, pending.length, 'Atomic guard rejected rows; inspect the journal and rerun verification')
  const updatedIds = new Set(result.data.map((row) => row.id))
  assert.ok(pending.every((change) => updatedIds.has(change.id)), 'Unexpected ids returned from publication')
  for (const row of result.data) {
    assert.ok(fields.every((field) => equal(row[field], target[field])), 'Database did not persist the requested values')
  }
  return { updated: [...updatedIds], already }
}

export async function publishRepairs(db, batches, { journal, concurrency = 4, rollback = false } = {}) {
  let index = 0
  let failure
  const totals = { updated: 0, already: 0, batches: 0 }
  await Promise.all(Array.from({ length: Math.min(concurrency, batches.length) }, async () => {
    while (!failure && index < batches.length) {
      const batch = index++
      const changes = batches[batch]
      try {
        await appendFile(journal, `${JSON.stringify({ event: 'starting', batch, ids: changes.map((change) => change.id), rollback })}\n`)
        const result = await publishRepairBatch(db, changes, { rollback })
        totals.updated += result.updated.length
        totals.already += result.already.length
        totals.batches++
        await appendFile(journal, `${JSON.stringify({ event: 'verified', batch, ...result })}\n`)
        if (totals.batches % 100 === 0) console.log(JSON.stringify({ progress: totals, totalBatches: batches.length }))
      } catch (error) {
        failure = error
        await appendFile(journal, `${JSON.stringify({ event: 'failed', batch, error: error.message })}\n`)
      }
    }
  }))
  if (failure) throw failure
  return totals
}

export function verifyPublishedCatalog(plan, before, after) {
  assert.equal(after.complete, true, 'Verification requires a complete post-publication export')
  assert.equal(after.rows.length, before.rows.length, 'Catalogue row count changed')
  const expected = new Map(before.rows.map((row) => [row.id, row]))
  const changes = new Map(plan.changes.map((change) => [change.id, change.after]))
  const actual = new Set()
  const remaining = {}
  for (const row of after.rows) {
    assert.ok(!actual.has(row.id), 'Duplicate id in post-publication export')
    actual.add(row.id)
    const original = expected.get(row.id)
    assert.ok(original, `Unexpected new id ${row.id}`)
    const patched = { ...original, ...(changes.get(row.id) || {}) }
    assert.ok(equal(row, patched), `Formation ${row.id} differs from its guarded expected state`)
    for (const field of ['nm', 'tf', 'fl', 'amg']) {
      if (missing(row[field])) remaining[field] = (remaining[field] || 0) + 1
    }
  }
  assert.equal(actual.size, expected.size, 'Missing original database ids')
  return { rowsVerified: actual.size, repairedRows: changes.size, remainingMissing: remaining, stableIds: true, unrelatedColumnsUnchanged: true }
}

async function main() {
  const { values } = parseArgs({ options: {
    plan: { type: 'string' }, backup: { type: 'string' }, journal: { type: 'string' },
    apply: { type: 'boolean' }, rollback: { type: 'boolean' }
  } })
  assert.ok(values.plan && values.backup, '--plan and --backup are required')
  const planBytes = await readFile(values.plan)
  const snapshot = JSON.parse(await readFile(values.backup, 'utf8'))
  const plan = JSON.parse(planBytes)
  const batches = prepareRepairBatches(plan, snapshot)
  const manifest = {
    planSha256: createHash('sha256').update(planBytes).digest('hex'),
    backupSha256: createHash('sha256').update(await readFile(values.backup)).digest('hex'),
    backup: resolve(values.backup), plan: resolve(values.plan),
    rows: plan.changes.length, batches: batches.length, rollback: Boolean(values.rollback),
    startedAt: new Date().toISOString()
  }
  console.log(JSON.stringify(manifest))
  if (!values.apply) {
    console.log('Dry run only. --apply and a new --journal path are required to update existing rows.')
    return
  }
  assert.ok(values.journal, '--journal is required; the backup and plan are the rollback source')
  await writeFile(values.journal, `${JSON.stringify({ event: 'manifest', ...manifest })}\n`, { flag: 'wx' })
  const { supabaseAdmin } = await import('../config/supabase.js')
  assert.ok(supabaseAdmin, 'A service-role client is required for catalogue publication')
  const totals = await publishRepairs(supabaseAdmin, batches, { journal: values.journal, rollback: values.rollback })
  await appendFile(values.journal, `${JSON.stringify({ event: 'complete', ...totals, completedAt: new Date().toISOString() })}\n`)
  console.log(JSON.stringify({ complete: true, ...totals }))
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => { console.error('Formation publication stopped:', error.message); process.exitCode = 1 })
}
