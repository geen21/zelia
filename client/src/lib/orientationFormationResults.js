import { BEST_MATCH_MIN_SCORE } from './formationRelevance.js'
import { dedupePartnerCampuses, getPartnerRankScore } from './partnerRelevance.js'

// Partners are ranked by relevance (match_score) plus the small back-office
// priority bonus. The sort is stable so the server order (user's campus first)
// is kept between equal ranks. Partners are only interleaved after national
// results: one after every third national formation, the rest at the end.
export function mixFormationResults(formations = [], partners = []) {
  const seen = new Set()
  const visible = partners
    .filter((partner) => partner?.id && partner.is_active !== false && partner.show_in_results !== false)
    .filter((partner) => {
      if (seen.has(String(partner.id))) return false
      seen.add(String(partner.id))
      return true
    })
    .sort((left, right) => getPartnerRankScore(right) - getPartnerRankScore(left))
  const selected = dedupePartnerCampuses(visible).slice(0, 3)
  const results = []
  let partnerIndex = 0
  for (const [index, formation] of formations.entries()) {
    results.push({ key: `formation-${formation.id}`, source: 'national', formation })
    if ((index + 1) % 3 === 0 && selected[partnerIndex]) {
      const partner = selected[partnerIndex++]
      results.push({ key: `partner-${partner.id}`, source: 'partner', formation: partner })
    }
  }
  while (selected[partnerIndex]) {
    const partner = selected[partnerIndex++]
    results.push({ key: `partner-${partner.id}`, source: 'partner', formation: partner })
  }
  return results
}

export function getBestFormationResultKey(results, minScore = BEST_MATCH_MIN_SCORE) {
  let bestKey = null
  let bestScore = -Infinity
  for (const { key, source, formation } of results) {
    const value = source === 'partner' ? formation.match_score : formation.matchScore
    if (typeof value !== 'number' && (typeof value !== 'string' || !value.trim())) continue
    const score = Number(value)
    if (!Number.isFinite(score) || score < minScore || score > 100) continue
    if (score > bestScore) {
      bestKey = key
      bestScore = score
    }
  }
  return bestKey
}