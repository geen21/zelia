import { getDiplomaFamily, getFormationSlug, getFormationTitle } from './formationDisplay.js'
import { FORMATION_PREFERENCE_LEVELS, candidateMatchesTargetStudyLevel, getTargetStudyLevel, inferFormationStudyLevel } from './formationLevel.js'
import { buildFormationRelevanceProfile, buildRelevanceDiscoveryQueries, normalizeRelevanceText, scoreFormationRelevance } from './formationRelevance.js'
import { buildPartnerMatchingProfile, getPartnerPriorityBonus } from './partnerRelevance.js'

export function buildExplorerProfile(entries = [], profile = {}) {
  const latest = [...entries].sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || ''))
    || String(b.id || '').localeCompare(String(a.id || ''), undefined, { numeric: true }))
  const pick = (id) => latest.find((entry) => entry.question_id === id)?.answer_text || ''
  const institution = profile.institution_data || {}
  return {
    ...buildPartnerMatchingProfile(pick),
    study_location: pick('orientation_study_location'),
    department: pick('orientation_department_name') || institution.department_name || pick('orientation_department') || profile.department || '',
    city: pick('orientation_city') || profile.city || profile.location || institution.city || institution.ville || institution.commune || ''
  }
}

export async function loadExplorerCatalog(searchFormations, {
  context = {}, search = '', department = '', pageSize = 24, queries, isCurrent = () => true
} = {}) {
  const relevanceProfile = buildFormationRelevanceProfile(context)
  const personalized = !search && relevanceProfile.groups.length > 0
  let pending = queries || (search ? [search] : personalized ? buildRelevanceDiscoveryQueries(relevanceProfile) : [''])
    .map((q) => ({ q, page: 1 }))
  const rows = new Map()
  const errors = []

  // SQL ranking is not thematic relevance: scan past off-topic pages, without
  // relaxing the student's location or level to fill the grid.
  for (let wave = 0; wave < 3 && pending.length; wave += 1) {
    const next = []
    for (let start = 0; start < pending.length; start += 3) {
      if (!isCurrent()) return null
      const batch = pending.slice(start, start + 3)
      const results = await Promise.allSettled(batch.map(async ({ q, page }) => {
        const { data } = await searchFormations({ q, departement: department, page, page_size: pageSize })
        if (!Array.isArray(data?.items)) throw new Error('Invalid formation catalogue response')
        return data
      }))
      if (!isCurrent()) return null
      results.forEach((result, index) => {
        if (result.status === 'rejected') {
          errors.push(result.reason)
          return
        }
        for (const row of result.value.items) {
          if (row.id != null) rows.set(String(row.id), row)
        }
        if (result.value.has_more === true) next.push({ ...batch[index], page: batch[index].page + 1 })
      })
    }
    pending = next
    const cards = nationalExplorerCards([...rows.values()], context)
    if (!personalized || cards.filter((card) => card.score != null).length >= pageSize) break
  }
  return { rows: [...rows.values()], nextQueries: pending, errors }
}

export function externalFormationHref(value) {
  const text = String(value || '').trim()
  const href = /^www\./i.test(text) ? `https://${text}` : text
  try {
    const url = new URL(href)
    return ['https:', 'http:'].includes(url.protocol) ? url.href : ''
  } catch {
    return ''
  }
}

export function nationalExplorerCards(rows, { analysis, profile = {} } = {}) {
  const relevanceProfile = buildFormationRelevanceProfile({ analysis, profile })
  const preferred = new Set((profile.formation_preferences || []).map((value) => FORMATION_PREFERENCE_LEVELS[value]).filter(Boolean))
  const target = getTargetStudyLevel(profile)
  if (target) preferred.add(target)
  const seen = new Set()
  return rows.filter((row) => {
    if (row.id == null || seen.has(String(row.id))) return false
    seen.add(String(row.id))
    return true
  }).map((raw) => {
    const candidate = { type: 'formation', raw }
    const level = inferFormationStudyLevel(candidate)
    const relevance = scoreFormationRelevance(candidate, relevanceProfile, { levelMatches: preferred.has(level) })
    const recommended = relevance.relevant && candidateMatchesTargetStudyLevel(candidate, target)
    return {
      key: `national-${raw.id}`, id: raw.id, source: 'national',
      title: getFormationTitle(raw), school: raw.etab_nom, city: raw.commune || raw.departement,
      level: getDiplomaFamily(raw) || (level ? `Bac +${level}` : ''),
      score: recommended ? relevance.score : null, reason: recommended ? relevance.matchedGroups[0] : '',
      href: `/formations/${getFormationSlug(raw)}`, externalHref: externalFormationHref(raw.etab_url || raw.fiche),
      raw
    }
  })
}

export function partnerExplorerCards(partners, matched = []) {
  const matches = new Map(matched.map((partner) => [String(partner.id), partner]))
  const seen = new Set()
  return partners.filter((partner) => {
    if (partner.id == null || partner.is_active === false || seen.has(String(partner.id))) return false
    seen.add(String(partner.id))
    return true
  }).map((raw) => {
    const match = raw.show_in_results !== false ? matches.get(String(raw.id)) : null
    const score = match?.match_score
    return {
      key: `partner-${raw.id}`, id: raw.id, source: 'partner',
      title: raw.formation_name, school: raw.school_name, city: raw.city, level: raw.diploma_level,
      score: typeof score === 'number' && Number.isFinite(score) && score >= 0 && score <= 100 ? score : null,
      reason: '', href: `/app/ecoles-partenaires/${raw.id}`, externalHref: externalFormationHref(raw.link), raw
    }
  })
}

export function sortExplorerCards(cards) {
  return [...cards].sort((a, b) => {
    if (a.score == null || b.score == null) {
      if (a.score != null) return -1
      if (b.score != null) return 1
    } else {
      if (a.score !== b.score) return b.score - a.score
      if (a.source === 'partner' && b.source === 'partner') {
        const priority = getPartnerPriorityBonus(b.raw) - getPartnerPriorityBonus(a.raw)
        if (priority) return priority
      }
    }
    if (a.source !== b.source) return a.source === 'national' ? -1 : 1
    return String(a.school || '').localeCompare(String(b.school || ''), 'fr') || a.key.localeCompare(b.key)
  })
}

export function mixExplorerCards(cards) {
  const sorted = sortExplorerCards(cards)
  return [true, false].flatMap((recommended) => {
    const group = sorted.filter((card) => (card.score != null) === recommended)
    const nationals = group.filter((card) => card.source === 'national')
    const partners = group.filter((card) => card.source === 'partner')
    const mixed = []
    let nationalIndex = 0
    let partnerIndex = 0
    while (nationalIndex < nationals.length || partnerIndex < partners.length) {
      mixed.push(...nationals.slice(nationalIndex, nationalIndex + 3))
      nationalIndex += 3
      if (partnerIndex < partners.length) mixed.push(partners[partnerIndex++])
    }
    return mixed
  })
}

export function filterExplorerCards(cards, { q = '', city = '' } = {}) {
  const words = normalizeRelevanceText(q).split(' ').filter(Boolean)
  return cards.filter((card) => (!city || card.city === city)
    && words.every((word) => normalizeRelevanceText([card.title, card.school, card.city, card.level, card.raw.domain].join(' ')).includes(word)))
}
