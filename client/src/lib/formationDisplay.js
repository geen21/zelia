// Display helpers shared by the public formation pages (directory + detail).
// Keep this in sync with server/utils/slug.js — the slugging algorithm must
// match so links built on the client resolve consistently with the sitemap.

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

export function getFormationTitle(formation = {}) {
  if (formation.title) return formation.title
  const nmTitle = Array.isArray(formation.nm) ? formation.nm.find(Boolean) : null
  const flTitle = Array.isArray(formation.fl) ? formation.fl.find(Boolean) : null
  if (nmTitle) return nmTitle
  if (flTitle) return flTitle
  if (formation.nmc) return String(formation.nmc).replace(/-/g, ' ').trim()
  return 'Formation'
}

export function getFormationSlug(formation = {}) {
  if (formation.slug) return formation.slug
  const title = getFormationTitle(formation)
  const parts = [title, formation.etab_nom, formation.commune].filter(Boolean).join(' ')
  const base = slugifyText(parts) || 'formation'
  return `${base}-${formation.id}`
}

// Accepts either a bare numeric id ("4968") or a full slug
// ("bts-informatique-lycee-x-paris-4968") and returns the trailing id.
export function parseFormationIdFromParam(param) {
  const match = String(param || '').match(/(\d+)\s*$/)
  return match ? match[1] : null
}

const DIPLOMA_FAMILY_PATTERNS = [
  [/^BTSA/i, 'BTSA'],
  [/^BTS/i, 'BTS'],
  [/^BUT/i, 'BUT'],
  [/^DUT/i, 'DUT'],
  [/^CPGE/i, 'CPGE'],
  [/^DCG/i, 'DCG'],
  [/^DSCG/i, 'DSCG'],
  [/^DEUST/i, 'DEUST'],
  [/^FI-/i, "Formation d'ingénieur"],
  [/^L[1-3]/i, 'Licence'],
  [/^M[12]/i, 'Master']
]

export function getDiplomaFamily(formation = {}) {
  const code = String(formation.nmc || '').trim()
  for (const [pattern, label] of DIPLOMA_FAMILY_PATTERNS) {
    if (pattern.test(code)) return label
  }
  return ''
}

export function getStatusLabel(tc) {
  const value = String(tc || '').toLowerCase()
  if (value.includes('privé') && value.includes('contrat')) return 'Privé sous contrat'
  if (value.includes('privé')) return 'Privé'
  if (value.includes('public')) return 'Public'
  return tc || ''
}

// Some free-text columns are stored as Postgres set literals, e.g.
// `{"Formations en apprentissage"}`. Strip the wrapping braces/quotes.
export function cleanBraceNote(value) {
  if (!value) return ''
  return String(value).replace(/[{}"]/g, '').trim()
}

export function isApprentissage(app) {
  return Boolean(app) && /apprentissage/i.test(String(app))
}

export function getInitials(text) {
  const words = String(text || '').trim().split(/\s+/).filter((word) => /[a-zA-Z0-9À-ÿ]/.test(word))
  if (!words.length) return 'ZL'
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[1][0]).toUpperCase()
}

export function buildMapsSearchUrl(formation = {}) {
  const query = [formation.etab_nom, formation.commune, formation.departement].filter(Boolean).join(' ')
  if (!query) return ''
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
}
