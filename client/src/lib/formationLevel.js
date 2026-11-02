// Study level helpers shared by the orientation flow (national catalog) and the
// partner matching API, so both apply the same target-level rules.

export const FORMATION_PREFERENCE_LEVELS = {
  voie_pro: 1,
  bts: 2,
  but: 3,
  licence: 3,
  bachelor: 3,
  master: 5,
  doctorat: 8
}

function flattenTextParts(value) {
  if (Array.isArray(value)) return value.flatMap(flattenTextParts)
  if (value === null || value === undefined) return []
  if (typeof value === 'object') return Object.values(value).flatMap(flattenTextParts)
  return [String(value)]
}

function normalizeLevelText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export function getTargetStudyLevel(profile = {}) {
  const raw = String(profile?.target_level || '').trim().toLowerCase()
  if (raw && raw !== 'open' && !raw.includes('ouvert')) {
    if (raw.includes('8')) return 8
    if (raw.includes('5')) return 5
    if (raw.includes('3')) return 3
    if (raw.includes('2')) return 2
  }

  const selectedPreferences = Array.isArray(profile?.formation_preferences) ? profile.formation_preferences : []
  if (selectedPreferences.length !== 1) return null
  return FORMATION_PREFERENCE_LEVELS[selectedPreferences[0]] || null
}

function getFormationLevelText(candidate) {
  const raw = candidate?.raw || candidate || {}
  return flattenTextParts([
    candidate?.title,
    candidate?.subtitle,
    raw.nm,
    raw.nmc,
    raw.formation_name,
    raw.diploma_level,
    raw.tf,
    raw.fl,
    raw.tc,
    raw.app,
    raw.int,
    raw.aut,
    raw.code_formation
  ]).join(' ')
}

export function inferFormationStudyLevel(candidate) {
  const text = normalizeLevelText(getFormationLevelText(candidate))
  if (!text) return null
  if (/\b(doctorat|these|phd|internat|bac\s*8|niveau\s*8|rncp\s*8)\b/.test(text)) return 8
  if (/\b(master|mastere|mba|msc|m1|m2|dnm|miage|ingenieur|ingenierie|dipl\s*ing|dscg|dnsep|grade\s*master|bac\s*5|niveau\s*7|rncp\s*7)\b/.test(text)) return 5
  if (/\b(licence|bachelor|but|dcg|dn\s*made|dna|bac\s*3|niveau\s*6|rncp\s*6)\b/.test(text)) return 3
  if (/\b(bts|dut|deust|bpjeps|bac\s*2|niveau\s*5|rncp\s*5)\b/.test(text)) return 2
  if (/\b(cap|bac\s*pro|bac\s*professionnel|mention\s*complementaire)\b/.test(text)) return 1
  return null
}

function hasShortCycleMarker(candidate) {
  const text = normalizeLevelText(getFormationLevelText(candidate))
  return /\b(bts|dut|but|deust|bpjeps|cap|bac\s*pro|bac\s*professionnel|mention\s*complementaire|niveau\s*5|rncp\s*5)\b/.test(text)
}

export function candidateMatchesTargetStudyLevel(candidate, targetLevel) {
  if (candidate?.type !== 'formation' || !targetLevel) return true
  const inferredLevel = inferFormationStudyLevel(candidate)

  if (targetLevel >= 8) {
    return inferredLevel === null ? !hasShortCycleMarker(candidate) : inferredLevel >= 8
  }

  if (targetLevel >= 5) {
    if (inferredLevel === null) return !hasShortCycleMarker(candidate)
    return inferredLevel >= 5
  }

  if (targetLevel >= 3) {
    if (inferredLevel === null) return true
    return inferredLevel >= 3
  }

  return true
}

export function filterCandidatesByTargetStudyLevel(candidates = [], profile = {}) {
  const targetLevel = getTargetStudyLevel(profile)
  if (!targetLevel) return candidates
  return candidates.filter((candidate) => candidateMatchesTargetStudyLevel(candidate, targetLevel))
}
