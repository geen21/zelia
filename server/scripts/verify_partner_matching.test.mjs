import assert from 'node:assert/strict'
import test from 'node:test'
import { buildPartnerMatchingProfile, fetchActivePartnerFormations, matchPartnerFormations } from '../utils/partnerMatching.js'
import { buildFormationRelevanceProfile, scoreFormationRelevance } from '../../client/src/lib/formationRelevance.js'
import { FORMATION_PREFERENCE_LEVELS, filterCandidatesByTargetStudyLevel, getTargetStudyLevel, inferFormationStudyLevel } from '../../client/src/lib/formationLevel.js'
import { DEPARTMENTS, getDepartmentCode } from '../../client/src/lib/departments.js'

const jobRecommendations = [
  { title: 'Ingénieur environnement', skills: ['Gestion de projet', 'Communication'] },
  { title: 'Chef de chantier BTP', skills: ['Management d\'équipe'] },
  { title: 'Technicien de maintenance industrielle', skills: ['Rigueur'] },
  { title: "Chargé d'étude en aménagement du territoire", skills: [] },
  { title: 'Géomètre-expert', skills: [] },
  { title: 'Concepteur de produit', skills: [] }
]
const partners = [
  { id: 'escp', school_name: 'ESCP', formation_name: 'Bachelor in Management (BSc)', domain: 'Management', diploma_level: 'Bac+3', city: 'Paris', results_priority: 100 },
  { id: 'ferrandi', school_name: 'Ferrandi', formation_name: 'Bachelor Arts culinaires et entrepreneuriat', domain: 'Hôtellerie restauration', diploma_level: 'Bac+3', city: 'Bordeaux', results_priority: 50 },
  { id: 'cprp', school_name: 'Lycée Jean Guéhenno', formation_name: 'BTS Conception des processus de réalisation de produits option A production unitaire (CPRP)', domain: 'Industrie', diploma_level: 'Bac+2', city: 'Flers', results_priority: 10 },
  { id: 'btp', school_name: 'Ecole BTP', formation_name: 'Bachelor Conducteur de travaux BTP', domain: 'Bâtiment', diploma_level: 'Bac+3', city: 'Lyon', results_priority: 0 },
  { id: 'same-city-only', school_name: 'Ecole Paris', formation_name: 'Bachelor Mode et luxe', domain: 'Mode', diploma_level: 'Bac+3', city: 'Paris', results_priority: 0 }
]
const answers = (values) => (...ids) => {
  for (const id of ids) if (values[id]) return values[id]
  return ''
}
const match = (formations, values, analysisResult = {}, userCity = '') => matchPartnerFormations(formations, {
  pickFirstValue: answers(values),
  analysisResult,
  userCity
})
const ids = (matched) => matched.map((formation) => formation.id)

test('all 101 registration departments resolve by code and name, including Corsica and overseas', () => {
  const expectedCodes = [
    ...Array.from({ length: 19 }, (_, index) => String(index + 1).padStart(2, '0')),
    '2A', '2B',
    ...Array.from({ length: 75 }, (_, index) => String(index + 21)),
    '971', '972', '973', '974', '976'
  ]
  assert.deepEqual(DEPARTMENTS.map(([code]) => code), expectedCodes)
  for (const entry of DEPARTMENTS) {
    assert.equal(entry.length, 2, 'The department reference must only contain code and name')
    const [code, name] = entry
    assert.ok(name.trim(), `${code} must have a name`)
    assert.equal(getDepartmentCode({ code }), code)
    assert.equal(getDepartmentCode({ name }), code)
  }
})

test('department lookup normalizes saved values without deriving a department from a city', () => {
  assert.equal(getDepartmentCode(6), '06')
  assert.equal(getDepartmentCode(' 2a '), '2A')
  assert.equal(getDepartmentCode('Haute-Garonne'), '31')
  assert.equal(getDepartmentCode('La Reunion'), '974')
  assert.equal(getDepartmentCode({ code: '31', city: 'Muret' }), '31')
  assert.equal(getDepartmentCode({ city: 'Muret' }), '')
  assert.equal(getDepartmentCode('99'), '')
  assert.equal(getDepartmentCode(null), '')
  assert.equal(getDepartmentCode({ name: ' bouches du rhone ' }), '13')
  assert.equal(getDepartmentCode({ code: 'BAS-RHIN' }), '67')
  assert.equal(getDepartmentCode({ name: "Cote-d'Or" }), '21')
  assert.equal(getDepartmentCode({ code: '13', city: ' Aix-en-Provence ' }), '13')
  assert.equal(getDepartmentCode({ code: '67', ville: 'Haguenau' }), '67')
  assert.equal(getDepartmentCode({ commune: 'Nancy' }), '')
  assert.equal(getDepartmentCode({ code: 'XX' }), '')
  assert.equal(getDepartmentCode(), '')
})

test('the active partner catalogue reads every page and propagates intermediate failures', async () => {
  const rows = Array.from({ length: 2005 }, (_, id) => ({ id, school_name: 'Same school', city: 'Paris' }))
  const ranges = []
  let fail = false
  let resultsOnly = false
  let department = ''
  const db = { from(table) {
    assert.equal(table, 'ecoles_partenaires')
    const orders = []
    return {
      select(columns) { assert.equal(columns, '*'); return this },
      eq(key, value) {
        if (key === 'department') { assert.equal(value, department); return this }
        assert.equal(value, true)
        assert.ok(key === 'is_active' || (key === 'show_in_results' && resultsOnly))
        return this
      },
      order(key) { orders.push(key); return this },
      range(start, end) {
        assert.deepEqual(orders, ['school_name', 'city', 'id'])
        ranges.push([start, end])
        return Promise.resolve(fail && start === 1000 ? { error: new Error('Second page unavailable') } : { data: rows.slice(start, end + 1), error: null })
      }
    }
  } }
  assert.deepEqual(await fetchActivePartnerFormations(db), rows)
  assert.deepEqual(ranges, [[0, 999], [1000, 1999], [2000, 2999]])
  resultsOnly = true
  assert.equal((await fetchActivePartnerFormations(db, { resultsOnly: true })).length, 2005)
  department = '31'
  assert.equal((await fetchActivePartnerFormations(db, { resultsOnly: true, department })).length, 2005)
  fail = true
  await assert.rejects(fetchActivePartnerFormations(db), /Second page unavailable/)
})

test('partners without a thematic match are hidden, even with a high priority or the same city', () => {
  const matched = match(partners, {
    orientation_career_domains: '["construction_technique"]'
  }, { job_recommendations: jobRecommendations }, 'Paris')
  assert.ok(!ids(matched).includes('escp'), 'Management is only a soft skill here, not a field signal')
  assert.ok(!ids(matched).includes('ferrandi'))
  assert.ok(!ids(matched).includes('same-city-only'), 'City alone must not make a partner visible')
  assert.ok(ids(matched).includes('cprp'))
  assert.ok(ids(matched).includes('btp'))
  assert.ok(matched.every((formation) => formation.match_score >= 50 && formation.match_score <= 98), 'Same 50-98 scale as national results')
})

test('the target level from the formation preferences is applied like national results', () => {
  const matched = match(partners, {
    orientation_formation_preferences: '["bachelor"]',
    orientation_career_domains: '["construction_technique"]'
  }, { job_recommendations: jobRecommendations })
  assert.deepEqual(ids(matched), ['btp'], 'A BTS is hidden when the student only wants a Bac+3')

  const legacy = match(partners, {
    orientation_target_level: 'Bac+3',
    orientation_career_domains: 'construction_technique'
  }, { job_recommendations: jobRecommendations })
  assert.deepEqual(ids(legacy), ['btp'], 'Legacy target level is used when no preference was saved')

  const both = match(partners, {
    orientation_formation_preferences: '["bts","bachelor"]',
    orientation_target_level: 'Bac+5',
    orientation_career_domains: '["construction_technique"]'
  }, { job_recommendations: jobRecommendations })
  assert.ok(ids(both).includes('cprp'), 'Saved preferences replace the stale legacy target level')
})

test('study recommendations and diploma acronyms are matched', () => {
  const formations = [
    { id: 'sio', school_name: 'MyDigitalSchool', formation_name: 'BTS SIO', diploma_level: 'Bac+2', city: 'Paris' },
    { id: 'mkt', school_name: 'MyDigitalSchool', formation_name: 'Bachelor Marketing Digital', diploma_level: 'Bac+3', city: 'Paris' }
  ]
  const matched = match(formations, { orientation_formation_preferences: '["bts"]' }, {
    job_recommendations: '[]',
    study_recommendations: JSON.stringify([{ degree: 'BTS Services informatiques aux organisations' }])
  })
  assert.deepEqual(ids(matched), ['sio'])
})

test('the back-office priority is only a small bonus between relevant partners', () => {
  const formations = [
    { id: 'informatique', school_name: 'Ecole A', formation_name: 'Bachelor Informatique', diploma_level: 'Bac+3', city: 'Lyon', results_priority: 100 },
    { id: 'dev-web', school_name: 'Ecole B', formation_name: 'Bachelor Développeur Web', diploma_level: 'Bac+3', city: 'Lyon', results_priority: 0 },
    { id: 'dev-web-boosted', school_name: 'Ecole C', formation_name: 'Bachelor Développeur Web', diploma_level: 'Bac+3', city: 'Lyon', results_priority: 40 }
  ]
  const analysisResult = { job_recommendations: [{ title: 'Développeur web' }] }
  const values = { orientation_career_domains: '["science_numerique"]' }
  const matched = match(formations, values, analysisResult)
  const byId = Object.fromEntries(matched.map((formation) => [formation.id, formation]))

  assert.deepEqual(ids(matched), ['dev-web-boosted', 'dev-web', 'informatique'], 'Priority breaks ties but never beats a clearly better match')
  assert.equal(byId['dev-web-boosted'].match_score, byId['dev-web'].match_score, 'Priority never changes the displayed score')
  assert.ok(byId['dev-web'].match_score - byId.informatique.match_score > 5)
})

test('partner scores and level eligibility equal national scores for the same formation', () => {
  const formations = [
    { id: 'bts', formation_name: 'BTS Bâtiment', results_priority: 100 },
    { id: 'bachelor', formation_name: 'Bachelor Conducteur de travaux BTP' },
    { id: 'master', formation_name: 'Master Génie civil', results_priority: 50 },
    { id: 'doctorat', formation_name: 'Doctorat Génie civil' },
    { id: 'unrelated', formation_name: 'Bachelor Management', results_priority: 100 }
  ]
  const before = structuredClone(formations)
  const analysis = { jobRecommendations, studyRecommendations: [{ degree: 'Master Génie civil' }] }
  for (const values of [
    {},
    { orientation_formation_preferences: '["bts"]' },
    { orientation_formation_preferences: '["bachelor"]' },
    { orientation_formation_preferences: '["bts","master"]' },
    { orientation_target_level: 'Bac+5' },
    { orientation_target_level: 'Bac+8' }
  ]) {
    const profile = buildPartnerMatchingProfile(answers(values))
    const relevanceProfile = buildFormationRelevanceProfile({ analysis, profile })
    const preferredLevels = new Set([
      ...profile.formation_preferences.map((value) => FORMATION_PREFERENCE_LEVELS[value]),
      getTargetStudyLevel(profile)
    ].filter(Boolean))
    const nationalCandidates = formations.map((formation) => ({
      id: formation.id, type: 'formation', raw: { nm: [formation.formation_name] }
    }))
    const expected = filterCandidatesByTargetStudyLevel(nationalCandidates, profile).flatMap((candidate) => {
      const relevance = scoreFormationRelevance(candidate, relevanceProfile, {
        levelMatches: preferredLevels.has(inferFormationStudyLevel(candidate))
      })
      return relevance.relevant ? [[candidate.id, relevance.score]] : []
    }).sort()
    const actual = match(formations, values, {
      job_recommendations: analysis.jobRecommendations,
      study_recommendations: analysis.studyRecommendations
    }).map((formation) => [formation.id, formation.match_score]).sort()
    assert.deepEqual(actual, expected, JSON.stringify(values))
  }
  assert.deepEqual(formations, before, 'Scoring must not mutate partner records')
})

test('the student campus comes first for the same formation', () => {
  const formations = [
    { id: 'a-lyon', school_name: 'Ecole', formation_name: 'Bachelor Développeur Web', diploma_level: 'Bac+3', city: 'Lyon' },
    { id: 'b-paris', school_name: 'Ecole', formation_name: 'Bachelor Développeur Web', diploma_level: 'Bac+3', city: 'Paris' }
  ]
  const matched = match(formations, {}, { job_recommendations: [{ title: 'Développeur web' }] }, 'Paris')
  assert.deepEqual(ids(matched), ['b-paris', 'a-lyon'])
})

test('saved answers are normalized, including legacy domain labels', () => {
  const profile = buildPartnerMatchingProfile(answers({
    orientation_career_domains: '["technologie numerique"]',
    orientation_formation_preferences: 'BTS; Bachelor'
  }))
  assert.deepEqual(profile.career_domains, ['technologie_numerique'])
  assert.deepEqual(profile.formation_preferences, ['bts', 'bachelor'])

  const matched = match([
    { id: 'dev', school_name: 'Ecole', formation_name: 'Bachelor Développeur Web', diploma_level: 'Bac+3', city: 'Lyon' }
  ], { orientation_career_domains: '["technologie numerique"]' })
  assert.deepEqual(ids(matched), ['dev'])
})

test('no profile signal returns nothing', () => {
  assert.deepEqual(match(partners, { orientation_city: 'Paris' }), [])
})
