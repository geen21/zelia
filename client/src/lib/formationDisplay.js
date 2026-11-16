// Display helpers shared by the public formation pages (directory + detail).
// Keep this in sync with server/utils/slug.js — the slugging algorithm must
// match so links built on the client resolve consistently with the sitemap.

import { getPinnedFormationSlug } from './formationCanonical.js'

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
  const pinned = getPinnedFormationSlug(formation)
  if (pinned) return pinned
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

export function buildFormationEditorialSummary(formation = {}) {
  const title = getFormationTitle(formation)
  const school = formation.etab_nom || ''
  const city = formation.commune || ''
  const dept = formation.departement || ''
  const region = formation.region || ''
  const status = getStatusLabel(formation.tc)
  const family = getDiplomaFamily(formation)
  const filiere = Array.isArray(formation.fl) ? formation.fl.find(Boolean) : ''
  const apprentissage = isApprentissage(formation.app)
  const internat = cleanBraceNote(formation.int)
  const modalites = Array.isArray(formation.tf) ? formation.tf.filter(Boolean) : []

  const placeParts = [city, dept ? `(${dept})` : '', region ? `en région ${region}` : ''].filter(Boolean).join(' ')
  const introSegments = [
    `La formation « ${title} »`,
    school ? `est dispensée par ${school}` : 'est référencée dans l’enseignement supérieur français',
    placeParts ? `à ${placeParts}` : ''
  ].filter(Boolean)
  let firstParagraph = `${introSegments.join(' ')}.`
  if (family || status) {
    const qualifiers = [
      family ? `un cursus de type ${family}` : '',
      status ? `au sein d’un établissement ${status.toLowerCase()}` : ''
    ].filter(Boolean).join(' ')
    firstParagraph += ` Ce parcours post-bac correspond à ${qualifiers}${filiere && filiere !== title ? ` (filière ${filiere})` : ''}.`
  }

  const secondParts = []
  if (apprentissage) {
    secondParts.push('Cette formation est accessible en apprentissage (alternance), permettant de combiner enseignements théoriques et expérience professionnelle en entreprise.')
  } else {
    secondParts.push('Ce cursus est proposé dans le cadre des admissions post-bac référencées au niveau national.')
  }
  if (internat) {
    secondParts.push(`Concernant l’hébergement : ${internat.replace(/\.$/, '')}.`)
  }
  if (modalites.length > 0 && (!family || modalites.some((m) => m !== family))) {
    secondParts.push(`Catégorie de formation : ${modalites.join(', ')}.`)
  }
  if (formation.etab_uai) {
    secondParts.push(`L’établissement est identifié sous le code UAI officiel ${formation.etab_uai}${formation.annee ? ` (données de référence rentrée ${formation.annee})` : ''}.`)
  }

  return [firstParagraph, secondParts.join(' ')].filter(Boolean)
}
