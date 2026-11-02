// Partner (sponsored) matching for /api/ecoles/matched. The scoring lives in
// client/src/lib/partnerRelevance.js so sponsored results use exactly the same
// relevance rules as national catalog results.
import { rankPartnerFormations } from '../../client/src/lib/partnerRelevance.js'

function parseJsonArray(value) {
  if (Array.isArray(value)) return value
  if (typeof value !== 'string' || !value.trim()) return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function toOptionValue(value) {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function parseAnswerList(raw) {
  if (!raw) return []
  let list
  try {
    const parsed = JSON.parse(raw)
    list = Array.isArray(parsed) ? parsed : [parsed]
  } catch {
    list = String(raw).split(/[,;|\n]/)
  }
  return [...new Set(list.map(toOptionValue).filter(Boolean))]
}

export function buildPartnerMatchingProfile(pickFirstValue) {
  const formationPreferences = parseAnswerList(pickFirstValue('orientation_formation_preferences'))
  return {
    career_domains: parseAnswerList(pickFirstValue('orientation_career_domains')),
    formation_preferences: formationPreferences,
    // Older flows stored a target level; the current flow derives it from the preferences.
    target_level: formationPreferences.length ? '' : pickFirstValue('orientation_target_level')
  }
}

export function matchPartnerFormations(formations, { pickFirstValue, analysisResult, userCity = '' }) {
  return rankPartnerFormations(formations, {
    analysis: {
      jobRecommendations: parseJsonArray(analysisResult?.job_recommendations),
      studyRecommendations: parseJsonArray(analysisResult?.study_recommendations)
    },
    profile: buildPartnerMatchingProfile(pickFirstValue),
    userCity: userCity || pickFirstValue('orientation_city')
  })
}
