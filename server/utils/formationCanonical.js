export function canonicalUrlsEnabled() {
  return process.env.FORMATION_CANONICAL_URLS_ENABLED === 'true'
}

export function canonicalFormationColumns(columns) {
  return canonicalUrlsEnabled() ? columns.replace(/^id\b/, 'id,canonical_slug') : columns
}

export function requireFormationCanonicals(rows) {
  if (!canonicalUrlsEnabled()) return
  for (const row of rows) {
    if (!getPinnedFormationSlug(row)) throw new Error('Formation canonical backfill is incomplete; do not activate the feature yet')
  }
}

export async function attachFormationCanonicals(db, rows = []) {
  if (!canonicalUrlsEnabled()) return rows
  const missing = rows.filter((row) => row.canonical_slug === undefined)
  if (!missing.length) {
    requireFormationCanonicals(rows)
    return rows
  }
  const { data, error } = await db.from('formation_france')
    .select('id,canonical_slug')
    .in('id', missing.map((row) => row.id))
    .abortSignal(AbortSignal.timeout(2500))
  if (error) throw new Error(`Formation canonical migration/read required: ${error.message}`)
  const slugs = new Map((data || []).map((row) => [String(row.id), row.canonical_slug]))
  if (missing.some((row) => !slugs.has(String(row.id)))) throw new Error('Missing formation canonical records')
  const hydrated = rows.map((row) => row.canonical_slug === undefined
    ? { ...row, canonical_slug: slugs.get(String(row.id)) }
    : row)
  requireFormationCanonicals(hydrated)
  return hydrated
}
import { getPinnedFormationSlug } from '../../client/src/lib/formationCanonical.js'
