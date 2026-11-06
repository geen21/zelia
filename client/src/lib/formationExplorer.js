import { getDiplomaFamily, getFormationSlug } from './formationDisplay.js'
import { normalizeRelevanceText } from './formationRelevance.js'
import { buildPartnerMatchingProfile, getPartnerPriorityBonus } from './partnerRelevance.js'
import { buildNationalDiscoveryQueries, buildNationalRelevanceProfile, getNationalAcademicGrade, getNationalFormationTitle, inferNationalStudyLevel, nationalFormationMatches, nationalSearchParameters, resolveNationalDepartment, scoreNationalFormation } from './nationalFormationMatching.js'

export function buildExplorerProfile(entries = [], profile = {}) {
  const latest = [...entries].sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || ''))
    || String(b.id || '').localeCompare(String(a.id || ''), undefined, { numeric: true }))
  const pick = (id) => latest.find((entry) => entry.question_id === id)?.answer_text || ''
  const institution = profile.institution_data || {}
  return {
    ...buildPartnerMatchingProfile(pick),
    strong_subjects: parseSubjectList(pick('orientation_strong_subjects')),
    study_location: pick('orientation_study_location'),
    department: pick('orientation_department_name') || institution.department_name || pick('orientation_department') || profile.department || '',
    city: pick('orientation_city') || profile.city || profile.location || institution.city || institution.ville || institution.commune || ''
  }
}

function parseSubjectList(value) {
  if (!value) return []
  try {
    const subjects = JSON.parse(value)
    if (!Array.isArray(subjects)) throw new Error('Expected a list of strong subjects')
    return subjects
  } catch (error) {
    console.warn('Invalid saved orientation subjects:', error)
    return []
  }
}

export async function loadExplorerCatalog(searchFormations, {
  context = {}, search = '', department = '', pageSize = 24, queries, signal, isCurrent = () => true
} = {}) {
  const relevanceProfile = buildNationalRelevanceProfile(context)
  const personalized = !search && relevanceProfile.groups.length > 0
  const pending = queries ? [...queries] : (search ? [search] : personalized ? buildNationalDiscoveryQueries(context) : [''])
    .map((q) => ({ q, page: 1 }))
  const rows = new Map()
  const errors = []
  const active = () => isCurrent() && !signal?.aborted
  const deadline = AbortSignal.timeout(6000)
  const requestSignal = signal ? AbortSignal.any([signal, deadline]) : deadline

  // Keep each visit/click bounded; remaining topics and pages wait for the user.
  for (let request = 0; request < 3 && pending.length; request += 1) {
    if (!active()) return null
    if (deadline.aborted) {
      errors.push(new Error('La recherche a dépassé son délai. Réessaie pour compléter les résultats.'))
      break
    }
    const current = pending.shift()
    try {
      const { data } = await searchFormations({
        q: current.q, ...nationalSearchParameters(context.profile, department), page: current.page, page_size: pageSize
      }, { signal: requestSignal })
      if (!active()) return null
      if (!Array.isArray(data?.items)) throw new Error('Invalid formation catalogue response')
      for (const row of data.items) {
        if (row.id != null) rows.set(String(row.id), row)
      }
      if (data.has_more === true) pending.push({ ...current, page: current.page + 1 })
    } catch (error) {
      if (!active()) return null
      errors.push(error)
    }
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
  const relevanceProfile = buildNationalRelevanceProfile({ analysis, profile })
  const department = profile.study_location === 'near_home' ? resolveNationalDepartment(profile.department) : ''
  const seen = new Set()
  const seenSourceRecords = new Set()
  const newest = new Map()
  for (const row of rows) {
    if (!row.nmc || !(row.etab_uai || row.etab_nom)) continue
    const key = `${row.etab_uai || row.etab_nom}|${row.commune}|${row.nmc}`
    if (String(row.annee || '') > (newest.get(key) || '')) newest.set(key, String(row.annee || ''))
  }
  return rows.filter((row) => {
    if (row.id == null || seen.has(String(row.id))) return false
    seen.add(String(row.id))
    const key = `${row.etab_uai || row.etab_nom}|${row.commune}|${row.nmc}`
    if (newest.has(key) && String(row.annee || '') < newest.get(key)) return false
    if (!nationalFormationMatches(row, profile, department)) return false
    if (row.annee && row.gta && row.etab_uai) {
      const sourceKey = [row.annee, row.gta, row.etab_uai].join('|')
      if (seenSourceRecords.has(sourceKey)) return false
      seenSourceRecords.add(sourceKey)
    }
    return true
  }).map((raw) => {
    const level = inferNationalStudyLevel(raw)
    const relevance = scoreNationalFormation(raw, relevanceProfile, profile)
    const recommended = relevance.relevant && nationalFormationMatches(raw, profile, department)
    return {
      key: `national-${raw.id}`, id: raw.id, source: 'national',
      title: getNationalFormationTitle(raw), school: raw.etab_nom, city: raw.commune || raw.departement,
      level: getNationalAcademicGrade(raw) === 'master' ? 'Grade master' : getDiplomaFamily(raw) || (level ? `Bac +${level}` : ''),
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
