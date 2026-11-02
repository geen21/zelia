// Partner (sponsored) formations go through the exact same relevance scoring as
// national catalog formations: thematic match on the formation title/domain,
// same target-level rules, same 50-98 score scale. The back-office priority is
// only a small ranking bonus between relevant partners; it never makes an
// off-topic partner visible and never changes the displayed score.
import { buildFormationRelevanceProfile, normalizeRelevanceText, scoreFormationRelevance } from './formationRelevance.js'
import { FORMATION_PREFERENCE_LEVELS, candidateMatchesTargetStudyLevel, getTargetStudyLevel, inferFormationStudyLevel } from './formationLevel.js'

export const PARTNER_PRIORITY_MAX_BONUS = 5

export function getPartnerPriorityBonus(partner) {
  const priority = Math.max(0, Math.min(100, Number(partner?.results_priority) || 0))
  return (priority / 100) * PARTNER_PRIORITY_MAX_BONUS
}

export function getPartnerRankScore(partner) {
  const score = Number(partner?.match_score)
  return (Number.isFinite(score) ? score : 0) + getPartnerPriorityBonus(partner)
}

// Keeps the first campus of each school formation so one programme offered in
// many cities does not fill every sponsored slot. Input order is preserved.
export function dedupePartnerCampuses(partners = []) {
  const seen = new Set()
  return partners.filter((partner) => {
    const name = normalizeRelevanceText(partner?.formation_name)
    const key = name ? `${normalizeRelevanceText(partner?.school_name)}|${name}` : `id:${partner?.id}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function isSameCity(left, right) {
  const a = normalizeRelevanceText(left)
  const b = normalizeRelevanceText(right)
  if (!a || !b) return false
  return a === b || a.includes(b) || b.includes(a)
}

export function rankPartnerFormations(partners = [], { analysis, profile = {}, userCity = '' } = {}) {
  const relevanceProfile = buildFormationRelevanceProfile({ analysis, profile })
  if (!relevanceProfile.groups.length) return []

  const targetLevel = getTargetStudyLevel(profile)
  const preferences = Array.isArray(profile.formation_preferences) ? profile.formation_preferences : []
  const preferredLevels = new Set([...preferences.map((value) => FORMATION_PREFERENCE_LEVELS[value]), targetLevel].filter(Boolean))

  return partners
    .map((partner) => {
      const candidate = { type: 'formation', raw: partner }
      if (!candidateMatchesTargetStudyLevel(candidate, targetLevel)) return null
      const levelMatches = preferredLevels.has(inferFormationStudyLevel(candidate))
      const relevance = scoreFormationRelevance(candidate, relevanceProfile, { levelMatches })
      if (!relevance.relevant) return null
      const ranked = { ...partner, match_score: relevance.score }
      return { partner: ranked, rank: getPartnerRankScore(ranked), local: isSameCity(userCity, partner.city) }
    })
    .filter(Boolean)
    // Same formation offered in several campuses: the user's city comes first.
    .sort((left, right) => right.rank - left.rank
      || Number(right.local) - Number(left.local)
      || String(left.partner.id).localeCompare(String(right.partner.id)))
    .map(({ partner }) => partner)
}
