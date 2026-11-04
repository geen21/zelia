import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { enforceOrientationRecommendationQuality } from '../utils/orientationRecommendationGuard.js'
import { buildAiJobDeckPrompt, buildAiFinalJobsPrompt } from '../../client/src/lib/orientationJobs.js'

const genericOfficeJobs = [
  'Développeur web',
  'Data analyst',
  'Product owner',
  'Développeur logiciel',
  'UX designer',
  'Analyste cybersécurité',
  'Comptable',
  'Juriste',
  'Rédacteur ou rédactrice'
].map((title) => ({ title, skills: [] }))

const studies = [{ degree: 'BUT Informatique', type: '' }]
const axesProfiles = [
  {},
  { hands_mind: 'mains', field_office: 'terrain' },
  { hands_mind: 'mains', field_office: 'bureau' },
  { hands_mind: 'tete', field_office: 'terrain' },
  { hands_mind: 'tete', field_office: 'bureau' }
]

for (const axes of axesProfiles) {
  const result = enforceOrientationRecommendationQuality({
    jobRecommendations: genericOfficeJobs,
    studyRecommendations: studies,
    axes
  })
  assert.deepEqual(result.jobRecommendations, genericOfficeJobs.slice(0, 6), 'The model order must be preserved without field quotas or office caps.')
  assert.deepEqual(result.studyRecommendations, studies)
}

for (const careerAspiration of ['Grutière', 'Avocate', 'Mécanique', 'Électricité', 'Cuisine', 'Santé', 'Sport', 'Chef de chantier']) {
  const result = enforceOrientationRecommendationQuality({
    careerAspiration,
    jobRecommendations: genericOfficeJobs,
    studyRecommendations: studies
  })
  assert.deepEqual(result.jobRecommendations, genericOfficeJobs.slice(0, 6), 'An aspiration must not trigger hardcoded job replacements.')
  assert.deepEqual(result.studyRecommendations, studies, 'An aspiration must not inject a predefined training course.')
  assert.deepEqual(enforceOrientationRecommendationQuality({
    careerAspiration,
    axes: { hands_mind: 'mains', field_office: 'terrain' }
  }), { jobRecommendations: [], studyRecommendations: [] }, 'Missing model output must stay empty so the route can retry or report an error.')
}

const mixedJobs = ['Comptable', 'Juriste', "Chargé d'affaires BTP", 'Développeur web', 'Électricien', 'Cuisinier']
  .map((title) => ({ title, skills: [] }))
const mixedResult = enforceOrientationRecommendationQuality({
  jobRecommendations: mixedJobs,
  axes: { hands_mind: 'mains', field_office: 'terrain' }
})
assert.deepEqual(mixedResult.jobRecommendations, mixedJobs, 'BTP and other field job titles must not be promoted.')

const normalized = enforceOrientationRecommendationQuality({
  jobRecommendations: [null, {}, ' ', ' Électricien ', { title: 'electricien', skills: [] }, { name: 'Comptable', skills: ['Rigueur', null] }],
  studyRecommendations: [null, {}, ' ', ' BTS Bâtiment ', { degree: 'bts batiment' }, { name: 'BUT Informatique', description: 'Formation universitaire' }]
})
assert.deepEqual(normalized.jobRecommendations, [
  { title: 'Électricien', skills: [] },
  { name: 'Comptable', title: 'Comptable', skills: ['Rigueur'] }
])
assert.deepEqual(normalized.studyRecommendations, [
  { degree: 'BTS Bâtiment', type: '' },
  { name: 'BUT Informatique', description: 'Formation universitaire', degree: 'BUT Informatique', type: 'Formation universitaire' }
])

const preferredStudies = [
  { degree: 'BUT Informatique', type: '' },
  { degree: 'BTS Bâtiment', type: '' },
  { degree: 'Licence de droit', type: '' },
  { degree: 'BTS Comptabilité et gestion', type: '' }
]
const preferencesResult = enforceOrientationRecommendationQuality({
  jobRecommendations: mixedJobs,
  studyRecommendations: preferredStudies,
  formationPreferences: ['bts']
})
assert.deepEqual(preferencesResult.jobRecommendations, mixedJobs)
assert.deepEqual(preferencesResult.studyRecommendations, [preferredStudies[1], preferredStudies[3], preferredStudies[0], preferredStudies[2]], 'Explicit user training preferences must still be respected.')

const cappedStudies = Array.from({ length: 8 }, (_, index) => ({ degree: `Formation ${index + 1}`, type: '' }))
assert.deepEqual(enforceOrientationRecommendationQuality({ studyRecommendations: cappedStudies }).studyRecommendations, cappedStudies.slice(0, 6))

const analysisSource = await readFile(new URL('../routes/analysis.js', import.meta.url), 'utf8')
assert.doesNotMatch(analysisSource, /Domaines :|N'utilise jamais développement|strictement sédentaires|trois pistes|guardAxes/)
assert.equal(analysisSource.match(/\$\{JOB_SELECTION_GUIDELINES\}/g)?.length, 3, 'All analysis prompts must use the neutral selection guidelines.')
assert.match(analysisSource, /Préférence métier explicitement exprimée : \$\{careerAspiration\}/)
assert.match(analysisSource, /La recommandation n°1 doit être ce métier s'il existe/)

const analysis = { personalityAnalysis: 'Profil analytique', skillsAssessment: 'Rigueur', jobRecommendations: mixedJobs }
const microProfile = { careerAspiration: 'Comptable' }
const deckPrompt = buildAiJobDeckPrompt({ analysis, microProfile })
const finalPrompt = buildAiFinalJobsPrompt({
  analysis,
  microProfile,
  likedProposals: [{ title: 'Comptable' }],
  rejectedProposals: [{ title: 'Cuisinier' }]
})
for (const prompt of [deckPrompt, finalPrompt]) {
  assert.match(prompt, /sans quota ni priorité sectorielle prédéfinie/)
  assert.doesNotMatch(prompt, /sans privilégier par défaut les métiers de bureau, numériques ou créatifs/)
  assert.ok(prompt.includes(JSON.stringify(microProfile)), 'User preferences must remain in the prompt.')
}
assert.match(deckPrompt, /tableau de 5 objets exactement/)
assert.match(finalPrompt, /tableau de 8 métiers idéaux exactement/)
assert.match(finalPrompt, /Swipes gardés: Comptable/)
assert.match(finalPrompt, /Swipes refusés: Cuisinier/)

console.log('Orientation recommendations verified: model order, no sector quotas or injected careers, user preferences and neutral prompts.')