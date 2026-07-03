// Shared helpers to derive a human-friendly title and a stable, SEO-friendly
// slug for rows from the public `formation_france` table.
//
// The slug always ends with `-{id}` so the numeric id can be recovered from
// the URL even if the descriptive part of the slug drifts from the data
// (school renamed, title tweaked, etc.).

function stripDiacritics(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

function slugifyText(value) {
  const cleaned = stripDiacritics(String(value || ''))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return cleaned.slice(0, 80).replace(/-+$/g, '')
}

// Most rows only have a terse `nmc` code (e.g. "L1-Chimie"). Prefer the
// descriptive `nm`/`fl` arrays when present, and fall back to a de-slugged
// `nmc` otherwise.
export function buildFormationTitle(row = {}) {
  const nmTitle = Array.isArray(row.nm) ? row.nm.find(Boolean) : null
  const flTitle = Array.isArray(row.fl) ? row.fl.find(Boolean) : null
  if (nmTitle) return nmTitle
  if (flTitle) return flTitle
  if (row.nmc) return String(row.nmc).replace(/-/g, ' ').trim()
  return 'Formation'
}

export function buildFormationSlug(row = {}) {
  const title = buildFormationTitle(row)
  const parts = [title, row.etab_nom, row.commune].filter(Boolean).join(' ')
  const base = slugifyText(parts) || 'formation'
  return `${base}-${row.id}`
}

// Adds `title` and `slug` computed fields to a formation_france row without
// mutating the original object.
export function withFormationDisplayFields(row) {
  if (!row) return row
  return {
    ...row,
    title: buildFormationTitle(row),
    slug: buildFormationSlug(row)
  }
}
