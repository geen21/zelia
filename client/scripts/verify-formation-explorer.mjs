import assert from 'node:assert/strict'
import { buildExplorerProfile, externalFormationHref, filterExplorerCards, loadExplorerCatalog, mixExplorerCards, nationalExplorerCards, partnerExplorerCards, sortExplorerCards } from '../src/lib/formationExplorer.js'
import { buildFormationRelevanceProfile, buildRelevanceDiscoveryQueries, scoreFormationRelevance } from '../src/lib/formationRelevance.js'
import { rankPartnerFormations } from '../src/lib/partnerRelevance.js'

const profile = buildExplorerProfile([
  { id: 1, question_id: 'orientation_formation_preferences', answer_text: '["master"]', created_at: '2026-01-01' },
  { id: 2, question_id: 'orientation_formation_preferences', answer_text: '["bts"]', created_at: '2026-02-01' },
  { id: 3, question_id: 'orientation_target_level', answer_text: 'Bac+5' },
  { question_id: 'orientation_career_domains', answer_text: '["science_numerique"]' },
  { question_id: 'orientation_final_selection', answer_text: '[{"title":"BTS Tourisme"}]' }
])
assert.deepEqual(profile.formation_preferences, ['bts'])
assert.equal(profile.target_level, '')
const analysis = { studyRecommendations: [{ degree: 'BTS SIO' }] }
const rows = [
  { id: 1, nm: ['BTS Services informatiques aux organisations'], nmc: 'BTS-SIO', etab_nom: 'Lycée', commune: 'Paris' },
  { id: 2, nm: ['BTS Tourisme'] }
]
const national = nationalExplorerCards([...rows, rows[0]], { analysis, profile })
assert.equal(national.length, 2)
assert.equal(national[0].score, scoreFormationRelevance({ type: 'formation', raw: rows[0] }, buildFormationRelevanceProfile({ analysis, profile }), { levelMatches: true }).score)
assert.equal(national[1].score, null)
assert.equal(national[0].score, 92)
assert.equal(nationalExplorerCards(rows)[0].score, null)
assert.equal(nationalExplorerCards(rows, { analysis: { studyRecommendations: [{ degree: 'BTS Tourisme' }] }, profile })[1].score, 92, 'A changed analysis is recalculated, not restored from the old selections')
const partners = Array.from({ length: 1005 }, (_, i) => ({
  id: `p-${i}`, formation_name: 'BTS Services informatiques aux organisations', school_name: 'École', city: i % 2 ? 'Lyon' : 'Paris',
  is_active: true, diploma_level: 'Bac+2', results_priority: 100
}))
partners.push({ ...partners[0], id: 'hidden', show_in_results: false }, { ...partners[0], id: 'inactive', is_active: false })
const matched = rankPartnerFormations(partners, { analysis, profile })
const cards = partnerExplorerCards([...partners, partners[0]], matched)
assert.equal(cards.length, 1006, 'No limit of three, campus deduplication, or duplicate IDs')
assert.equal(cards[0].score, national[0].score)
assert.equal(cards.find((card) => card.id === 'hidden').score, null)
assert.equal(partnerExplorerCards(partners, [])[0].score, null, 'A catalogue score is never used as a fallback')
assert.equal(filterExplorerCards(cards, { city: 'Paris' }).length, 504)
assert.equal(filterExplorerCards(cards, { q: 'ecole informatique' }).length, 1006)
const sorted = sortExplorerCards([...cards, ...national])
assert.equal(sorted.at(-1).score, null)
assert.ok(sorted.findIndex((card) => card.key === national[0].key) < sorted.findIndex((card) => card.id === 'hidden'))
assert.equal(externalFormationHref('javascript:alert(1)'), '')
assert.equal(externalFormationHref('www.example.com/formation'), 'https://www.example.com/formation')
assert.equal(externalFormationHref('/relative'), '')
assert.equal(externalFormationHref('https://example.com/formation'), 'https://example.com/formation')

const context = { analysis, profile: { formation_preferences: ['bts'] } }
const queries = buildRelevanceDiscoveryQueries(buildFormationRelevanceProfile(context))
assert.ok(queries.includes('BTS SIO'), 'Keep the original recommendation query')
assert.ok(queries.includes('services informatiques organisations'), 'Expand acronyms and remove generic diploma terms for discovery')
assert.ok(!queries.includes('bts'), 'A diploma alone is not a thematic query')

const nationalRows = Array.from({ length: 60 }, (_, i) => ({ ...rows[0], id: i + 10, etab_nom: `Lycée ${i}` }))
const requests = []
const loaded = await loadExplorerCatalog(async (params) => {
  requests.push(params)
  assert.equal(params.departement, 'Paris', 'Discovery never widens the location silently')
  if (params.q === 'BTS SIO') return { data: { items: [rows[1]], has_more: false } }
  if (params.page === 1) return { data: { items: [rows[1]], has_more: true } }
  const offset = (params.page - 2) * 24
  return { data: { items: nationalRows.slice(offset, offset + 24), has_more: offset + 24 < nationalRows.length } }
}, { context, department: 'Paris' })
assert.equal(nationalExplorerCards(loaded.rows, context).filter((card) => card.score != null).length, 24, 'Continue after an off-topic first SQL page')
assert.ok(requests.some((params) => params.page === 2))
assert.equal(requests.length, 3, 'A visit performs at most three national searches in total')
assert.deepEqual(loaded.nextQueries, [{ q: 'services informatiques organisations', page: 3 }])
assert.deepEqual(loaded.errors, [])

const nationals = nationalExplorerCards(nationalRows, context)
const highlyRankedPartners = cards.map((card) => card.score == null ? card : { ...card, score: 98 })
const mixed = mixExplorerCards([...nationals, ...highlyRankedPartners])
const firstPage = mixed.slice(0, 24)
assert.equal(firstPage.filter((card) => card.source === 'national').length, 18, 'Partner scores must not crowd national formations out of the first page')
assert.equal(firstPage.filter((card) => card.source === 'partner').length, 6)
assert.deepEqual(mixed.slice(0, 4).map((card) => card.source), ['national', 'national', 'national', 'partner'])
assert.equal(mixed.length, nationals.length + cards.length, 'Every partner and campus remains accessible')
assert.equal(new Set(mixed.map((card) => card.key)).size, mixed.length)
assert.equal(mixed.at(-1).score, null, 'Unmatched cards remain after recommendations')
assert.ok(mixed.some((card) => card.score === 98), 'Presentation never alters percentages')
assert.deepEqual(mixExplorerCards(nationals), sortExplorerCards(nationals))
assert.deepEqual(mixExplorerCards(cards), sortExplorerCards(cards))

const partial = await loadExplorerCatalog(async ({ q }) => {
  if (q === 'BTS SIO') throw new Error('Catalogue unavailable')
  return { data: { items: nationalRows.slice(0, 24), has_more: false } }
}, { context, queries: [{ q: 'BTS SIO', page: 1 }, { q: 'services informatiques organisations', page: 1 }] })
assert.equal(partial.errors.length, 1)
assert.equal(partial.rows.length, 24, 'Keep successful national searches alongside explicit errors')
const invalid = await loadExplorerCatalog(async () => ({ data: { items: null } }), { search: 'informatique' })
assert.equal(invalid.errors.length, 1, 'Invalid responses are not successful empty lists')
const cancelled = await loadExplorerCatalog(() => assert.fail('No obsolete search should start'), { context, isCurrent: () => false })
assert.equal(cancelled, null)

let browseQuery
const browse = await loadExplorerCatalog(async (params) => {
  browseQuery = params.q
  return { data: { items: rows, has_more: true } }
})
assert.equal(browseQuery, '', 'Students without a test can browse national formations too')
assert.equal(browse.rows.length, 2)
assert.ok(nationalExplorerCards(browse.rows).every((card) => card.score == null))
assert.deepEqual(browse.nextQueries, [{ q: '', page: 2 }])

const manyQueries = Array.from({ length: 10 }, (_, i) => ({ q: `topic ${i}`, page: 1 }))
const gentleRequests = []
let concurrent = 0
let maxConcurrent = 0
const gentleSearch = async (params) => {
  gentleRequests.push(params)
  concurrent += 1
  maxConcurrent = Math.max(maxConcurrent, concurrent)
  await new Promise((resolve) => setTimeout(resolve, 1))
  concurrent -= 1
  return { data: { items: [], has_more: true } }
}
const gentle = await loadExplorerCatalog(gentleSearch, { context, queries: manyQueries, department: 'Paris' })
assert.equal(gentleRequests.length, 3, 'The budget applies across every topic and page, not per topic')
assert.equal(maxConcurrent, 1, 'No parallel national requests')
assert.ok(gentleRequests.every((params) => params.page_size === 24 && params.departement === 'Paris'))
assert.deepEqual(gentle.nextQueries, [
  ...manyQueries.slice(3), ...manyQueries.slice(0, 3).map((query) => ({ ...query, page: 2 }))
])
assert.ok(manyQueries.every((query) => query.page === 1), 'The continuation never mutates its input')
const continued = await loadExplorerCatalog(gentleSearch, { context, queries: gentle.nextQueries })
assert.equal(gentleRequests.length, 6, 'The next bounded batch requires an explicit invocation')
assert.deepEqual(gentleRequests.slice(3).map(({ q }) => q), ['topic 3', 'topic 4', 'topic 5'])
assert.equal(continued.nextQueries.length, 10, 'Unvisited topics and pages remain available')

let earlyRequests = 0
const early = await loadExplorerCatalog(async () => {
  earlyRequests += 1
  return { data: { items: nationalRows.slice(0, 24), has_more: true } }
}, { context, queries: manyQueries })
assert.equal(earlyRequests, 1, 'Stop as soon as the first page of relevant formations is available')
assert.deepEqual(early.nextQueries, [...manyQueries.slice(1), { ...manyQueries[0], page: 2 }])

const controller = new AbortController()
let abortedRequests = 0
const aborted = await loadExplorerCatalog(async (params, { signal }) => {
  abortedRequests += 1
  assert.equal(signal.aborted, false)
  controller.abort()
  assert.equal(signal.aborted, true)
  throw new Error('Cancelled transport')
}, { context, signal: controller.signal })
assert.equal(aborted, null, 'Expected cancellation does not become an error or partial success')
assert.equal(abortedRequests, 1, 'An obsolete search must not start more pages or topics')
assert.equal(await loadExplorerCatalog(() => assert.fail('Aborted searches must not start'), { signal: controller.signal }), null)
console.log('Formation explorer: bounded sequential discovery, continuation, cancellation, 18/6 first-page mix, scores, all partners, errors and safe links verified.')
