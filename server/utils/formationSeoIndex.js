// Canonical deduplication index for `public.formation_france`.
//
// `formation_france` contains historical Parcoursup snapshots across several
// years (2020–2025) as well as duplicate imports sharing the exact same
// `(etab_uai, gta)` official Parcoursup formation identifier.
//
// Exposing all 127k rows as self-canonicalized pages causes Google Search
// Console to flag tens of thousands of URLs as "Duplicate, Google chose
// different canonical than user" and "Crawled - currently not indexed".
//
// This module elects one deterministic canonical row per real-world formation
// at an establishment: highest `annee` (most recent session), then smallest
// numeric `id`.

const CACHE_TTL_MS = 60 * 60 * 1000 // 1 hour
const DB_PAGE_SIZE = 1000
const SCAN_WORKERS = 12

function isStatementTimeout(error) {
  const message = error?.message || ''
  return error?.code === '57014' || message.includes('statement timeout') || message.includes('canceling statement')
}

async function queryWithRetry(queryFn) {
  const first = await queryFn()
  if (first.error && isStatementTimeout(first.error)) {
    return queryFn()
  }
  return first
}

export function buildFormationGroupKey(row) {
  const uai = String(row?.etab_uai || '').trim().toUpperCase()
  const gta = String(row?.gta || '').trim()
  if (uai && gta) return `u:${uai}|${gta}`

  const school = String(row?.etab_nom || '').trim().toLowerCase()
  const city = String(row?.commune || '').trim().toLowerCase()
  const label = String(
    (Array.isArray(row?.nm) && row.nm.find(Boolean)) ||
    (Array.isArray(row?.fl) && row.fl.find(Boolean)) ||
    row?.nmc ||
    ''
  ).trim().toLowerCase()
  if (school || label) return `f:${school}|${city}|${label}`
  return `i:${row?.id}`
}

export function compareCanonicalFormationRows(a, b) {
  const yearA = String(a?.annee || '').trim()
  const yearB = String(b?.annee || '').trim()
  if (yearA !== yearB) {
    if (!yearA) return 1
    if (!yearB) return -1
    const cmp = yearB.localeCompare(yearA, undefined, { numeric: true })
    if (cmp !== 0) return cmp
  }
  const idA = BigInt(String(a.id))
  const idB = BigInt(String(b.id))
  return idA < idB ? -1 : idA > idB ? 1 : 0
}

export function deduplicateFormationRows(rows = []) {
  const winners = new Map()
  for (const row of rows) {
    if (!row || row.id == null) continue
    const key = buildFormationGroupKey(row)
    const current = winners.get(key)
    if (!current || compareCanonicalFormationRows(row, current) < 0) {
      winners.set(key, row)
    }
  }
  const selectedIds = new Set([...winners.values()].map((row) => String(row.id)))
  return rows.filter((row) => row && selectedIds.has(String(row.id)))
}

export function buildCanonicalIndexFromRows(rows = []) {
  const winnersByGroup = new Map()
  const groupByRowId = new Map()

  for (const row of rows) {
    if (!row || row.id == null) continue
    const id = String(row.id)
    const key = buildFormationGroupKey(row)
    groupByRowId.set(id, key)
    const current = winnersByGroup.get(key)
    if (!current || compareCanonicalFormationRows(row, current) < 0) {
      winnersByGroup.set(key, { id, annee: row.annee })
    }
  }

  const canonicalByRowId = new Map()
  for (const [id, key] of groupByRowId) {
    canonicalByRowId.set(id, winnersByGroup.get(key).id)
  }

  const canonicalIds = [...new Set(winnersByGroup.values())].map((w) => w.id)
  canonicalIds.sort((a, b) => {
    const bigA = BigInt(a)
    const bigB = BigInt(b)
    return bigA < bigB ? -1 : bigA > bigB ? 1 : 0
  })

  return {
    canonicalIds,
    canonicalIdSet: new Set(canonicalIds),
    canonicalByRowId
  }
}

export function createFormationSeoIndex({ db, now = Date.now }) {
  let cache = null
  let inflight = null

  async function scanBand(minId, maxId) {
    const collected = []
    let cursor = null
    while (true) {
      const { data, error } = await queryWithRetry(() => {
        let q = db
          .from('formation_france')
          .select('id, etab_uai, gta, annee')
          .lte('id', maxId)
          .order('id', { ascending: true })
          .limit(DB_PAGE_SIZE)
        if (cursor != null) q = q.gt('id', cursor)
        else q = q.gte('id', minId)
        return q
      })
      if (error) throw error
      const page = data || []
      collected.push(...page)
      if (page.length < DB_PAGE_SIZE) break
      cursor = String(page[page.length - 1].id)
    }
    return collected
  }

  async function loadAllLightweightRows() {
    const [minRes, maxRes] = await Promise.all([
      queryWithRetry(() => db.from('formation_france').select('id').order('id', { ascending: true }).limit(1)),
      queryWithRetry(() => db.from('formation_france').select('id').order('id', { ascending: false }).limit(1))
    ])
    if (minRes.error) throw minRes.error
    if (maxRes.error) throw maxRes.error
    if (!minRes.data?.length || !maxRes.data?.length) return []

    const minId = BigInt(String(minRes.data[0].id))
    const maxId = BigInt(String(maxRes.data[0].id))
    if (maxId <= minId + BigInt(DB_PAGE_SIZE)) {
      return scanBand(String(minId), String(maxId))
    }

    const totalSpan = maxId - minId + 1n
    const bandSize = (totalSpan + BigInt(SCAN_WORKERS) - 1n) / BigInt(SCAN_WORKERS)
    const bands = []
    for (let i = 0n; i < BigInt(SCAN_WORKERS); i += 1n) {
      const start = minId + i * bandSize
      if (start > maxId) break
      const end = start + bandSize - 1n > maxId ? maxId : start + bandSize - 1n
      bands.push([String(start), String(end)])
    }

    const parts = await Promise.all(bands.map(([start, end]) => scanBand(start, end)))
    return parts.flat()
  }

  function triggerLoad() {
    if (!inflight) {
      inflight = (async () => {
        const rows = await loadAllLightweightRows()
        const built = buildCanonicalIndexFromRows(rows)
        cache = { ...built, at: now() }
        return cache
      })().finally(() => {
        inflight = null
      })
    }
    return inflight
  }

  async function getSnapshot() {
    if (cache && now() - cache.at < CACHE_TTL_MS) {
      return cache
    }
    if (cache) {
      // Stale-while-revalidate so user/bot requests never block after initial warm-up.
      triggerLoad().catch((err) => console.error('Formation SEO index refresh error:', err?.message || err))
      return cache
    }
    return triggerLoad()
  }

  function peekSnapshot() {
    if (cache && now() - cache.at < CACHE_TTL_MS) return cache
    if (cache) {
      triggerLoad().catch(() => {})
      return cache
    }
    triggerLoad().catch(() => {})
    return null
  }

  async function resolveCanonicalIdForRow(row) {
    if (!row || row.id == null) return null
    const idStr = String(row.id)
    const warm = peekSnapshot()
    if (warm?.canonicalByRowId.has(idStr)) {
      return warm.canonicalByRowId.get(idStr)
    }

    if (row.etab_uai && row.gta) {
      const { data, error } = await queryWithRetry(() => db
        .from('formation_france')
        .select('id, annee')
        .eq('etab_uai', row.etab_uai)
        .eq('gta', row.gta)
        .order('annee', { ascending: false, nullsFirst: false })
        .order('id', { ascending: true })
        .limit(1)
      )
      if (!error && data?.length) {
        return String(data[0].id)
      }
    }
    return idStr
  }

  return {
    getSnapshot,
    peekSnapshot,
    resolveCanonicalIdForRow,
    warmUp() {
      return triggerLoad().catch((err) => {
        console.error('Formation SEO index warm-up warning:', err?.message || err)
        return null
      })
    }
  }
}
