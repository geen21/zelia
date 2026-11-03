// Partner (sponsored) matching for /api/ecoles/matched. The scoring lives in
// client/src/lib/partnerRelevance.js so sponsored results use exactly the same
// relevance rules as national catalog results.
import { buildPartnerMatchingProfile, rankPartnerFormations } from '../../client/src/lib/partnerRelevance.js'

export { buildPartnerMatchingProfile }

export async function fetchActivePartnerFormations(db, { resultsOnly = false } = {}) {
  const formations = []
  const pageSize = 1000
  for (let offset = 0; ; offset += pageSize) {
    let query = db.from('ecoles_partenaires').select('*').eq('is_active', true)
    if (resultsOnly) query = query.eq('show_in_results', true)
    const { data, error } = await query
      .order('school_name')
      .order('city')
      .order('id')
      .range(offset, offset + pageSize - 1)
    if (error) throw error
    formations.push(...(data || []))
    if (!data || data.length < pageSize) return formations
  }
}

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
