import assert from 'node:assert/strict'
import { once } from 'node:events'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import express from 'express'
import { createClient } from '@supabase/supabase-js'
import { buildOrientationSearchContext, FORMATION_RECOMMENDATION_GUIDELINES } from '../utils/orientationSearchContext.js'
import { enforceOrientationRecommendationQuality } from '../utils/orientationRecommendationGuard.js'

const saved = [
  { id: 1, question_id: 'orientation_formation_preferences', answer_text: '["bts"]', created_at: '2026-01-01' },
  { id: 2, question_id: 'orientation_formation_preferences', answer_text: '["master","doctorat"]', created_at: '2026-11-04' },
  { id: 3, question_id: 'orientation_study_location', answer_text: 'near_home' },
  { id: 4, question_id: 'orientation_department', answer_text: '06' },
  { id: 5, question_id: 'orientation_department_name', answer_text: 'Alpes-Maritimes' },
  { id: 6, question_id: 'orientation_strong_subjects', answer_text: '["maths","numerique"]' }
]

test('analysis recovers the latest persisted preferences when the request lacks them', () => {
  const context = buildOrientationSearchContext({}, saved)
  assert.deepEqual(context.searchProfile.formationPreferences, ['Master', 'Doctorat'])
  assert.deepEqual(context.searchProfile.strongSubjects, ['Maths', 'Numérique'])
  assert.equal(context.searchProfile.departmentName, 'Alpes-Maritimes')
  assert.equal(context.locationLabel, 'Près de chez moi')
  assert.equal(context.formationPreference, 'Master, Doctorat')
})

test('current request values take precedence, including an explicitly cleared preference', () => {
  const context = buildOrientationSearchContext({
    searchProfile: { formationPreferences: [], strongSubjects: ['sciences'], studyLocation: 'both' }
  }, saved)
  assert.deepEqual(context.searchProfile.formationPreferences, [])
  assert.equal(context.searchProfile.studyLocation, 'both')
  assert.deepEqual(context.searchProfile.strongSubjects, ['Sciences'])
  assert.equal(context.searchProfile.department, '06')
  assert.throws(() => buildOrientationSearchContext({}, [
    { question_id: 'orientation_formation_preferences', answer_text: 'not JSON' }
  ]), /Préférence enregistrée invalide/)
})

test('study prioritisation uses the diploma title, never promises in a description', () => {
  const studies = [
    { degree: 'Licence informatique', type: 'Poursuite en doctorat après master.' },
    { degree: 'DU Informatique', type: 'Doctorat PhD et recherche.' },
    { degree: 'Mastère spécialisé informatique', type: 'Master.' },
    { degree: 'Doctorat informatique', type: 'Thèse de recherche.' },
    { degree: 'Master informatique', type: 'Diplôme national.' }
  ]
  const ranked = enforceOrientationRecommendationQuality({ studyRecommendations: studies, formationPreferences: ['master', 'doctorat'] }).studyRecommendations
  assert.deepEqual(ranked.slice(0, 2).map((study) => study.degree), ['Master informatique', 'Doctorat informatique'])
  assert.ok(FORMATION_RECOMMENDATION_GUIDELINES.includes('DU/DIU'))
  assert.ok(FORMATION_RECOMMENDATION_GUIDELINES.includes('offres vérifiées'))
  const gradeMaster = { degree: 'Diplôme Sciences Po - Grade Master', type: '' }
  assert.equal(enforceOrientationRecommendationQuality({
    studyRecommendations: [studies[0], gradeMaster],
    formationPreferences: ['master']
  }).studyRecommendations[0].degree, gradeMaster.degree)
})

let fixtureIndex = 0
async function routeFixture(t, { preferencesError = false, generationTimeout = false } = {}) {
  const userId = 'orientation-analysis-fixture'
  const state = { prompts: [], writes: [], requests: [] }
  const db = createClient('http://analysis.fixture', 'fixture-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (input, options) => {
      const url = new URL(input)
      const table = url.pathname.split('/').at(-1)
      state.requests.push({ table, params: url.searchParams })
      if (options.method === 'POST') {
        assert.equal(JSON.parse(options.body).user_id, userId)
      } else {
        assert.equal(url.searchParams.get('user_id') || url.searchParams.get('id'), `eq.${userId}`, 'Reads are scoped to the authenticated user')
      }
      if (table === 'informations_complementaires') {
        return new Response(JSON.stringify(preferencesError ? { message: 'preferences unavailable', code: '57014' } : saved), {
          status: preferencesError ? 400 : 200, headers: { 'Content-Type': 'application/json' }
        })
      }
      let data
      if (table === 'profiles') data = { first_name: 'Fixture', last_name: '', gender: '', avatar_json: {} }
      else if (table === 'user_responses') data = [{
        question_id: 600, response: 'Carrément',
        questions: { content: 'Je préfère manipuler plutôt que lire.', category: 'hands_mind', options: [
          { label: 'Carrément', value: 'mains', alternative: 'tete', level: 3 }
        ], interpretations: { Carrément: 'Préférence relative pour la manipulation.' } }
      }]
      else if (table === 'user_results') {
        if (options.method === 'POST') {
          state.writes.push(JSON.parse(options.body))
          data = []
        } else data = { share_image_url: null }
      } else assert.fail(`Unexpected analysis table ${table}`)
      return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } })
    } }
  })
  const nativeFetch = globalThis.fetch
  const previousKey = process.env.GEMINI_API_KEY
  process.env.GEMINI_API_KEY = 'fixture-no-paid-calls'
  t.after(() => {
    if (previousKey === undefined) delete process.env.GEMINI_API_KEY
    else process.env.GEMINI_API_KEY = previousKey
  })
  t.mock.method(console, 'log', () => {})
  t.mock.method(console, 'error', () => {})
  t.mock.method(globalThis, 'fetch', async (input, options) => {
    if (!String(input).startsWith('https://generativelanguage.googleapis.com/')) return nativeFetch(input, options)
    assert.ok(options.signal instanceof AbortSignal)
    const payload = JSON.parse(options.body)
    assert.equal(payload.generationConfig.maxOutputTokens, 4096)
    assert.equal(payload.generationConfig.thinkingConfig.thinkingBudget, 512)
    state.prompts.push(payload.contents[0].parts[0].text)
    if (generationTimeout) throw new DOMException('Fixture generation timeout', 'TimeoutError')
    const text = `###Type de personalité###\nLe Bâtisseur\n###Analyse de personnalité###\nProfil de test.\n###Évaluation des compétences###\nRigueur.\n###Recommandations d'emploi###\n${['Chercheur', 'Biologiste', 'Physicien', 'Mathématicien', 'Ingénieur', 'Statisticien'].map((title, index) => `${index + 1}. ${title}\n - Compétences requises: Analyse, Rigueur`).join('\n')}\n###Recommandations d'études###\n1. Licence informatique\n Description: Poursuite en doctorat après master.\n2. Doctorat informatique\n Description: Recherche après un master.\n3. Master informatique\n Description: Diplôme national.`
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ thought: true, text: 'Not an answer' }, { text }] } }] }), {
      headers: { 'Content-Type': 'application/json' }
    })
  })
  const source = await readFile(new URL('../routes/analysis.js', import.meta.url), 'utf8')
  const offset = source.indexOf('// Ensure environment variables')
  const key = `analysisFixture${fixtureIndex++}`
  globalThis[key] = {
    express, dotenv: { config() {} }, supabase: db, supabaseAdmin: db,
    cloudinary: {}, isCloudinaryConfigured: () => false,
    authenticateToken: (req, res, next) => { req.user = { id: userId }; next() }
  }
  // Use native file URLs so the fixture executes the actual shared helpers.
  const moduleSource = [
    `const { express, dotenv, supabase, supabaseAdmin, cloudinary, isCloudinaryConfigured, authenticateToken } = globalThis.${key};`,
    `import { enforceOrientationRecommendationQuality, JOB_SELECTION_GUIDELINES, JOB_TITLE_GUIDELINES } from '${new URL('../utils/orientationRecommendationGuard.js', import.meta.url).href}';`,
    `import { buildOrientationQuestionnaireContext, QUESTIONNAIRE_NUANCE_INSTRUCTION, resolveInterpretation } from '${new URL('../utils/orientationQuestionnaireContext.js', import.meta.url).href}';`,
    `import { buildOrientationSearchContext, FORMATION_RECOMMENDATION_GUIDELINES } from '${new URL('../utils/orientationSearchContext.js', import.meta.url).href}';`,
    source.slice(offset)
  ].join('\n')
  let router
  try { router = (await import(`data:text/javascript;base64,${Buffer.from(moduleSource).toString('base64')}`)).default }
  finally { delete globalThis[key] }
  const app = express()
  app.use(express.json())
  app.use('/analysis', router)
  const server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(() => new Promise((resolve) => { server.close(resolve); server.closeAllConnections() }))
  return {
    state,
    request: (payload = {}) => fetch(`http://127.0.0.1:${server.address().port}/analysis/generate-analysis`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
    })
  }
}

test('real analysis route transmits stored degree/location choices and persists them, without paid model calls', async (t) => {
  const { state, request } = await routeFixture(t)
  const response = await request()
  assert.equal(response.status, 200, JSON.stringify(await response.clone().json()))
  assert.equal(state.prompts.length, 1)
  assert.ok(state.prompts[0].includes('Master, Doctorat'))
  assert.ok(state.prompts[0].includes('Près de chez moi'))
  assert.ok(state.prompts[0].includes('Alpes-Maritimes'))
  assert.ok(state.prompts[0].includes(FORMATION_RECOMMENDATION_GUIDELINES))
  assert.equal(state.writes.length, 1)
  const written = state.writes[0]
  assert.deepEqual(written.skills_data.orientationProfile.searchProfile.formationPreferences, ['Master', 'Doctorat'])
  assert.equal(written.skills_data.orientationProfile.searchProfile.department, '06')
  assert.deepEqual(written.study_recommendations.slice(0, 2).map((study) => study.degree), ['Master informatique', 'Doctorat informatique'])
})

test('failure to load saved preferences stops analysis rather than generating an unrelated profile', async (t) => {
  const { state, request } = await routeFixture(t, { preferencesError: true })
  const response = await request()
  assert.equal(response.status, 503)
  assert.equal(state.prompts.length, 0)
  assert.equal(state.writes.length, 0)
})

test('model generation deadlines surface a retryable error without persisting partial results', async (t) => {
  const { state, request } = await routeFixture(t, { generationTimeout: true })
  const response = await request()
  assert.equal(response.status, 503)
  assert.match((await response.json()).error, /trop de temps/)
  assert.equal(state.writes.length, 0)
})
