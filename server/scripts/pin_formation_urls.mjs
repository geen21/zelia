import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, writeFile, appendFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { buildFormationSlug } from '../utils/slug.js'
import { getPinnedFormationSlug } from '../../client/src/lib/formationCanonical.js'

export function createCanonicalManifest(snapshot, backupSha256) {
  assert.equal(snapshot.table, 'formation_france')
  assert.equal(snapshot.complete, true, 'A complete pre-enrichment backup is required')
  assert.equal(snapshot.rows.length, snapshot.total_rows)
  const rows = snapshot.rows.map((row) => ({
    id: String(row.id), slug: buildFormationSlug(row),
    annee: row.annee, gta: row.gta, etab_uai: row.etab_uai
  }))
  const manifest = {
    format: 'zelia-historical-formation-canonicals-v1',
    sourceBackupSha256: backupSha256,
    backupExtractedAt: snapshot.extracted_at,
    createdAt: new Date().toISOString(),
    rows
  }
  validateCanonicalManifest(manifest)
  return manifest
}

export function validateCanonicalManifest(manifest) {
  assert.equal(manifest.format, 'zelia-historical-formation-canonicals-v1')
  assert.match(manifest.sourceBackupSha256, /^[a-f0-9]{64}$/)
  assert.ok(Array.isArray(manifest.rows) && manifest.rows.length > 0)
  const ids = new Set()
  for (const row of manifest.rows) {
    assert.match(row.id, /^[1-9]\d*$/)
    assert.ok(!ids.has(row.id), 'Duplicate historical id')
    ids.add(row.id)
    assert.ok(row.annee && row.gta && row.etab_uai, 'Missing original source identity')
    getPinnedFormationSlug({ id: row.id, canonical_slug: row.slug })
  }
}

export async function publishCanonicalManifest(db, manifest, onProgress = () => {}) {
  validateCanonicalManifest(manifest)
  // Fail before writes when the migration has not been installed.
  const check = await db.from('formation_france').select('id,canonical_slug').limit(1)
  if (check.error) throw new Error(`Apply migration_formation_canonical_urls.sql first: ${check.error.message}`)
  const totals = { updated: 0, already: 0, verified: 0 }
  for (let offset = 0; offset < manifest.rows.length; offset += 500) {
    const batch = manifest.rows.slice(offset, offset + 500)
    const result = await db.rpc('pin_formation_canonical_urls', { p_rows: batch })
      .abortSignal(AbortSignal.timeout(30000))
    if (result.error) throw new Error(`Canonical backfill stopped at ${offset}: ${result.error.message}`)
    assert.equal(result.data.updated + result.data.already, batch.length, 'Incomplete canonical backfill')
    const verified = await db.from('formation_france').select('id,canonical_slug')
      .in('id', batch.map((row) => row.id)).abortSignal(AbortSignal.timeout(30000))
    if (verified.error) throw new Error(verified.error.message)
    const byId = new Map(verified.data.map((row) => [String(row.id), row.canonical_slug]))
    assert.ok(batch.every((row) => byId.get(row.id) === row.slug), 'Persisted canonical differs from historical URL')
    totals.updated += result.data.updated
    totals.already += result.data.already
    totals.verified += batch.length
    await onProgress({ offset, ...totals })
  }
  return totals
}

async function main() {
  const { values } = parseArgs({ options: {
    backup: { type: 'string' }, output: { type: 'string' }, input: { type: 'string' },
    apply: { type: 'boolean' }, 'expected-sha256': { type: 'string' }, journal: { type: 'string' }
  } })
  if (values.backup) {
    assert.ok(values.output && !values.apply && !values.input, '--backup/--output only prepares a manifest')
    const backup = await readFile(values.backup)
    const hash = createHash('sha256').update(backup).digest('hex')
    const manifest = createCanonicalManifest(JSON.parse(backup), hash)
    const bytes = JSON.stringify(manifest)
    await writeFile(values.output, bytes, { flag: 'wx' })
    console.log(JSON.stringify({ rows: manifest.rows.length, sourceBackupSha256: hash,
      manifestSha256: createHash('sha256').update(bytes).digest('hex'), output: resolve(values.output) }))
    return
  }
  assert.ok(values.input, '--input is required')
  const bytes = await readFile(values.input)
  const hash = createHash('sha256').update(bytes).digest('hex')
  const manifest = JSON.parse(bytes)
  validateCanonicalManifest(manifest)
  console.log(JSON.stringify({ rows: manifest.rows.length, manifestSha256: hash, apply: Boolean(values.apply) }))
  if (!values.apply) return
  assert.equal(hash, values['expected-sha256'], 'Explicit expected manifest hash is required')
  assert.ok(values.journal, 'A new journal file is required')
  await writeFile(values.journal, `${JSON.stringify({ event: 'start', manifestSha256: hash })}\n`, { flag: 'wx' })
  const { supabaseAdmin } = await import('../config/supabase.js')
  assert.ok(supabaseAdmin, 'A service-role client is required')
  const totals = await publishCanonicalManifest(supabaseAdmin, manifest, async (progress) => {
    await appendFile(values.journal, `${JSON.stringify({ event: 'verified', ...progress })}\n`)
    if (progress.verified % 10000 === 0) console.log(JSON.stringify(progress))
  })
  await appendFile(values.journal, `${JSON.stringify({ event: 'complete', ...totals })}\n`)
  console.log(JSON.stringify(totals))
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => { console.error('Canonical publication stopped:', error.message); process.exitCode = 1 })
}
