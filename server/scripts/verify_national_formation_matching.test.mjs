import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createClient } from '@supabase/supabase-js'
import { parseNationalSearch, searchNationalFormations } from '../utils/nationalFormationSearch.js'
import { getNationalAcademicGrade, getNationalStudyLevels, inferNationalStudyLevel, nationalFormationMatches, nationalSearchNotice, resolveNationalDepartment } from '../../client/src/lib/nationalFormationMatching.js'
import { buildExplorerProfile, nationalExplorerCards, loadExplorerCatalog } from '../../client/src/lib/formationExplorer.js'

function fixture({ rows = [], titles = [], error = null } = {}) {
  const calls = []
  const db = createClient('http://national.fixture', 'fixture-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (input, options) => {
      const url = new URL(input)
      calls.push({ url, body: options.body ? JSON.parse(options.body) : null })
      const rpc = url.pathname.endsWith('/rpc/search_formations_simple')
      assert.ok(rpc || url.pathname.endsWith('/formation_france'))
      return new Response(JSON.stringify(error || (rpc ? titles : rows)), {
        status: error ? 400 : 200, headers: { 'Content-Type': 'application/json' }
      })
    } }
  })
  return { db, calls }
}

test('national level inference reads actual catalogue codes without changing partner rules', () => {
  for (const [nmc, level] of [['L1-Chimie', 3], ['L3-Droit', 3], ['M2-Informatique', 5], ['DNM-Numérique', 3], ['FI-BAC5', 5], ['BUT-Informatique', 3], ['BTS-SIO-App', 2], ['Doctorat biologie', 8]]) {
    assert.equal(inferNationalStudyLevel({ nmc }), level, nmc)
  }
  assert.equal(inferNationalStudyLevel({ nmc: 'BTS-SIO', aut: 'Poursuite possible en master ou doctorat' }), 2)
  assert.deepEqual(getNationalStudyLevels({ formation_preferences: ['master', 'doctorat', 'alternance'] }), [5, 8])
  assert.deepEqual(getNationalStudyLevels({ target_level: 'Doctorat' }), [8])
  assert.equal(nationalFormationMatches({ nmc: 'Master biologie' }, { formation_preferences: ['doctorat'] }), false)
  assert.equal(nationalFormationMatches({ nmc: 'Formation inconnue' }, { formation_preferences: ['doctorat'] }), false)
  assert.equal(nationalFormationMatches({ nmc: 'BUT-Informatique' }, { formation_preferences: ['licence'] }), false, 'A BUT is not silently substituted for a licence')
  assert.equal(nationalFormationMatches({ nmc: 'FI-BAC5', nm: ['Formation ingénieur grade master'] }, { formation_preferences: ['master', 'doctorat'] }), true, 'An explicitly established master grade is included without renaming the diploma')
  assert.equal(nationalFormationMatches({ nmc: 'FI-BAC5', nm: ['Formation ingénieur Bac+5'] }, { formation_preferences: ['master'] }), false, 'Bac+5 alone does not establish an academic grade')
  assert.equal(nationalFormationMatches({ nmc: 'FI-BAC5' }, { target_level: 'Bac+5' }), true, 'A level-only goal still accepts equivalent diplomas')
})

test('master grades and CMI use the same result list, scores, locations and pagination', async () => {
  const grade = {
    id: 5604, nmc: 'ScPo',
    nm: ["Sciences Po / Instituts d'études politiques - Sciences Humaines et Sociales - Grade Master - Cursus général"],
    fl: ["Sciences Po / Instituts d'études politiques - Sciences Humaines et Sociales - Grade Master"],
    departement: 'Paris', commune: 'Paris', annee: '2025'
  }
  const cmi = { id: 3661, nmc: 'CMI-Info', nm: ["C.M.I - Cursus Master en Ingénierie - Informatique"], departement: 'Paris', commune: 'Paris', annee: '2025' }
  const profile = { formation_preferences: ['master'] }
  assert.equal(getNationalAcademicGrade(grade), 'master')
  assert.equal(inferNationalStudyLevel(grade), 5)
  assert.equal(inferNationalStudyLevel(cmi), 5)
  assert.equal(getNationalAcademicGrade(cmi), null, 'Keep the CMI title without inventing a grade declaration')
  assert.equal(nationalFormationMatches(grade, profile), true)
  assert.equal(nationalFormationMatches(grade, { formation_preferences: ['doctorat'] }), false)
  const contradictory = {
    ...grade, id: 40359,
    nm: ['Sciences Po / Instituts d’études politiques - Grade Master - Campus de Paris, Bachelor de Sciences Po']
  }
  assert.equal(getNationalAcademicGrade(contradictory), null, 'A generic Grade Master header must not override a specific Bachelor programme')
  assert.equal(nationalFormationMatches(contradictory, profile), false)
  assert.equal(nationalFormationMatches(cmi, profile), true)
  assert.equal(nationalFormationMatches(cmi, profile, 'Alpes-Maritimes'), false)
  assert.equal(nationalFormationMatches(cmi, { formation_preferences: ['bts'] }), false)
  assert.equal(nationalFormationMatches(cmi, { formation_preferences: ['doctorat'] }), false)
  assert.equal(inferNationalStudyLevel({ nmc: 'L1-EG', nm: ['Licence - Economie et gestion - Parcours Cursus Master en Ingénierie'] }), 5)
  assert.equal(inferNationalStudyLevel({ nmc: 'BTS-SIO', nm: ['BTS Informatique - poursuite possible en Cursus Master en Ingénierie'] }), 2)
  const { db, calls } = fixture({ rows: [grade, cmi], titles: [grade, cmi] })
  const result = await searchNationalFormations(db, { q: 'politique', ...parseNationalSearch({ departement: '75', study_levels: '5', formation_formats: 'master' }) })
  assert.deepEqual(result.items.map((row) => row.id), [3661, 5604])
  assert.ok(!Object.hasOwn(result, 'pathways'), 'No separate master response channel')
  assert.equal(calls.length, 2, 'The same bounded query and title lookup as other diploma searches')
  assert.deepEqual(calls.filter((call) => call.body).map((call) => call.body.p_keyword), ['politique'])
  assert.ok(calls[0].url.searchParams.getAll('or').filter((filter) => filter.includes('ScPo*')).length >= 2, 'Both SQL level and format filters must allow explicit grade-master sources')
  assert.ok(calls[0].url.searchParams.getAll('or').filter((filter) => filter.includes('CMI*')).length >= 2, 'CMI must be eligible before limiting and pagination')
  const context = { profile, analysis: { studyRecommendations: [{ degree: 'Master sciences politiques' }, { degree: 'Master informatique' }] } }
  const cards = nationalExplorerCards(result.items, context)
  assert.equal(cards.find((card) => card.id === 5604).level, 'Grade master')
  const cmiCard = cards.find((card) => card.id === 3661)
  assert.equal(cmiCard.title, cmi.nm[0])
  assert.equal(cmiCard.level, 'Bac +5')
  assert.ok(cmiCard.score >= 80)
  const changedContext = { ...context, analysis: { studyRecommendations: [{ degree: 'Master Tourisme' }] } }
  assert.equal(nationalExplorerCards([cmi], changedContext)[0].score, null, 'CMI relevance is recalculated normally')
  const secondPage = await searchNationalFormations(db, { q: 'informatique', ...parseNationalSearch({ study_levels: '5', formation_formats: 'master' }), pageSize: 1, from: 1 })
  assert.equal(secondPage.items[0].id, cmi.id)
  assert.equal(calls.at(-1).url.searchParams.get('offset'), '1')
  const loaded = await loadExplorerCatalog(async () => ({ data: result }), { context })
  assert.ok(!Object.hasOwn(loaded, 'pathways'))
  assert.equal(loaded.rows.length, 2)
})

test('enriched diploma labels do not turn a DU, health pathway, mastère or description into a doctorate/master', () => {
  for (const row of [
    { nmc: 'DU', nm: ["Diplôme d'Université - Bachelor Business Data Science"] },
    { nmc: 'DU-Nutrition', nm: ['DU Nutrition : préparation au doctorat'] },
    { nmc: 'PASS', nm: ['Licence - Parcours accès santé'] },
    { nmc: 'MAN-MPGEM', nm: ['Mise à niveau - Classe de mise à niveau au BTS Maritime'] },
    { nmc: 'Doctorat-exercice', nm: ["Diplôme d'État de docteur en médecine"] }
  ]) {
    assert.equal(inferNationalStudyLevel(row), null, JSON.stringify(row))
    assert.equal(nationalFormationMatches(row, { formation_preferences: ['doctorat'] }), false)
  }
  const bts = { nmc: 'BTS-SIO', nm: ['BTS Informatique - poursuite en master et doctorat'] }
  assert.equal(inferNationalStudyLevel(bts), 2)
  assert.equal(nationalFormationMatches({ nmc: 'Mastère-Marketing', nm: ['Mastère spécialisé Marketing'] }, { formation_preferences: ['master'] }), false)
  assert.equal(nationalFormationMatches({ nmc: 'MBA-Marketing', nm: ['MBA Marketing'] }, { formation_preferences: ['master'] }), false)
  assert.equal(inferNationalStudyLevel({ nmc: 'PhD', nm: ['PhD Informatique'] }), 8)
  assert.equal(inferNationalStudyLevel({ nm: ['MBA Marketing - Admission après Bac+5'] }), null)
  assert.equal(inferNationalStudyLevel({ nmc: 'FECM-B4', nm: ['Formation des écoles de commerce Bac +4'] }), 4)
  assert.equal(nationalFormationMatches({
    nmc: 'FECM-BAC3',
    nm: ['Formation des écoles de commerce et de management Bac +3 - Bachelor Management']
  }, { formation_preferences: ['bachelor'] }), true)
})

test('department codes resolve to names, never a reference city or substring', () => {
  assert.equal(resolveNationalDepartment('06'), 'Alpes-Maritimes')
  assert.equal(resolveNationalDepartment('2A'), 'Corse-du-Sud')
  assert.equal(resolveNationalDepartment('971'), 'Guadeloupe')
  assert.equal(resolveNationalDepartment('75'), 'Paris')
  assert.equal(resolveNationalDepartment('inconnu'), '')
  assert.equal(nationalFormationMatches({ departement: 'Isère', commune: 'Seyssinet-Pariset' }, {}, 'Paris'), false)
  assert.throws(() => parseNationalSearch({ departement: 'inconnu' }), /Département inconnu/)
  assert.throws(() => parseNationalSearch({ study_levels: '4,100' }), /Niveau/)
})

test('a sparse L1-Info licence is still relevant to informatique', () => {
  const cards = nationalExplorerCards([{ id: 4785, nmc: 'L1-Info', departement: 'Paris' }], {
    analysis: { studyRecommendations: [{ degree: 'Licence informatique' }] },
    profile: { formation_preferences: ['licence'], study_location: 'near_home', department: '75' }
  })

  test('historical duplicate database ids do not show the same exact source record twice', () => {
    const row = { nmc: 'BTS-SIO', nm: ['BTS Informatique'], annee: '2021', gta: '29815', etab_uai: 'TEST', departement: 'Paris' }
    const cards = nationalExplorerCards([{ ...row, id: 84993 }, { ...row, id: 106246 }], {
      analysis: { studyRecommendations: [{ degree: 'BTS Informatique' }] },
      profile: { formation_preferences: ['bts'] }
    })
    assert.equal(cards.length, 1)
    assert.equal(cards[0].id, 84993, 'Existing database ids and their links are not rewritten')
  })
  assert.equal(cards.length, 1)
  assert.ok(cards[0].score >= 80)
  assert.match(cards[0].title, /informatique/)
})

test('geography and level are applied in SQL before the bounded page, sparse nmc acronyms are searchable', async () => {
  const { db, calls } = fixture({ rows: [
    { id: 1, nmc: 'BTS-SIO-App', nm: null, app: '{"Formations en apprentissage"}', departement: 'Alpes-Maritimes', commune: 'Nice', annee: '2025' },
    { id: 2, nmc: 'BTS-SIO', departement: 'Paris' },
    { id: 3, nmc: 'Master informatique', departement: 'Alpes-Maritimes' }
  ] })
  const result = await searchNationalFormations(db, { q: 'informatique', ...parseNationalSearch({ departement: '06', study_levels: '2', formation_formats: 'bts' }), pageSize: 12 })
  assert.deepEqual(result.items.map((row) => row.id), [1])
  assert.equal(calls.length, 2, 'One constrained query plus one bounded title discovery; no retry waves')
  const query = calls[0].url.searchParams
  assert.equal(query.get('limit'), '13')
  assert.equal(query.get('order'), 'annee.desc.nullslast,id.asc')
  const filters = query.getAll('or')
  assert.ok(filters.some((filter) => filter.includes('departement.ilike."Alpes-Maritimes"')))
  assert.ok(!filters.some((filter) => filter.includes('commune.ilike')))
  assert.ok(filters.some((filter) => filter.includes('BTS*')))
  assert.ok(filters.some((filter) => filter.includes('*SIO*')))
  assert.ok(query.get('select').includes('fl,tf,app,int,aut'))
  assert.equal(calls[1].body.p_department, 'Alpes-Maritimes')
  assert.equal(calls[1].body.p_limit, 50)
})

test('an absent doctorate is not replaced by a master or an unknown-level formation', async () => {
  const { db, calls } = fixture({ rows: [
    { id: 1, nmc: 'Master biologie' }, { id: 2, nmc: 'Formation santé' }
  ] })
  const profile = { formation_preferences: ['doctorat'] }
  const result = await searchNationalFormations(db, { q: 'biologie', ...parseNationalSearch({ study_levels: '8', formation_formats: 'doctorat' }) })
  assert.deepEqual(result.items, [])
  assert.equal(calls.length, 2, 'One constrained query and one bounded doctorate-title lookup, without retry waves')
  assert.equal(calls[1].body.p_keyword, 'doctorat')
  assert.match(nationalSearchNotice(profile, result.items), /Aucun doctorat/)
  assert.match(nationalSearchNotice(profile, result.items), /pas des propositions de doctorat/)
  assert.equal(nationalSearchNotice(profile, [{ nmc: 'Doctorat biologie' }]), '')
})

test('accented subject words remain usable by the catalogue RPC', async () => {
  const { db, calls } = fixture()
  await searchNationalFormations(db, { q: 'génie mécanique', ...parseNationalSearch({ study_levels: '3' }) })
  const titleCall = calls.find((call) => call.body)
  assert.equal(titleCall.body.p_keyword, 'génie')
  const tableCall = calls.find((call) => !call.body)
  assert.ok(tableCall.url.searchParams.getAll('or').some((filter) => filter.includes('*mécanique*')))
})

test('descriptive nm titles can supply a doctorate even when its short code is opaque', async () => {
  const doctoral = { id: 8, nmc: 'D-BIO', nm: ['Doctorat biologie'], departement: 'Paris' }
  const { db, calls } = fixture({ titles: [doctoral], rows: [doctoral] })
  const result = await searchNationalFormations(db, { q: 'biologie', ...parseNationalSearch({ departement: '75', study_levels: '8' }) })
  assert.equal(result.items[0].id, 8)
  assert.equal(calls[1].body.p_keyword, 'doctorat')
})

test('newest programme wins across years, distinct same-year specialities remain', async () => {
  const { db } = fixture({ rows: [
    { id: 1, nmc: 'BUT-Informatique', etab_uai: 'X', commune: 'Paris', departement: 'Paris', annee: '2025' },
    { id: 2, nmc: 'BUT-Informatique', nm: ['BUT Informatique détaillé'], etab_uai: 'X', commune: 'Paris', departement: 'Paris', annee: '2021' },
    ...['Logiciels', 'Réseaux'].map((nm, i) => ({ id: i + 3, nmc: 'FI-BAC5', nm: [`Formation ingénieur ${nm}`], etab_uai: 'Y', commune: 'Paris', departement: 'Paris', annee: '2025' }))
  ] })
  const result = await searchNationalFormations(db, { q: '', ...parseNationalSearch({ departement: '75' }) })
  assert.deepEqual(result.items.map((row) => row.id), [1, 3, 4])
})

test('saved multiple formats and mobility reach every national query, without silently widening', async () => {
  const profile = buildExplorerProfile([
    { question_id: 'orientation_formation_preferences', answer_text: '["master","doctorat"]' },
    { question_id: 'orientation_department', answer_text: '06' },
    { question_id: 'orientation_study_location', answer_text: 'near_home' }
  ])
  const calls = []
  const result = await loadExplorerCatalog(async (params) => {
    calls.push(params)
    return { data: { items: [], has_more: false } }
  }, { context: { profile, analysis: { studyRecommendations: [{ degree: 'Master informatique' }] } }, department: resolveNationalDepartment(profile.department) })
  assert.ok(calls.length > 0 && calls.length <= 3)
  assert.ok(calls.every((call) => call.matching === 'profile' && call.study_levels === '5,8' && call.departement === 'Alpes-Maritimes'))
  assert.equal(result.errors.length, 0)
  assert.deepEqual(nationalExplorerCards([{ id: 2, nmc: 'L1-Informatique', departement: 'Paris' }], { profile }), [])
})

test('database failures remain explicit, never a successful empty match', async () => {
  const { db } = fixture({ error: { code: '57014', message: 'statement timeout' } })
  await assert.rejects(searchNationalFormations(db, { q: '', ...parseNationalSearch({ study_levels: '8' }) }), /statement timeout/)
})

test('an exhausted client time budget stops discovery with an explicit error and continuation', async (t) => {
  t.mock.method(AbortSignal, 'timeout', (milliseconds) => {
    assert.equal(milliseconds, 6000)
    return AbortSignal.abort(new DOMException('Deadline reached', 'TimeoutError'))
  })
  const result = await loadExplorerCatalog(() => assert.fail('A timed-out batch must not start more searches'), {
    context: { analysis: { studyRecommendations: [{ degree: 'Licence informatique' }] } }
  })
  assert.equal(result.errors.length, 1)
  assert.match(result.errors[0].message, /délai/)
  assert.ok(result.nextQueries.length > 0)
})
