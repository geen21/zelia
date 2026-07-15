import { enforceOrientationRecommendationQuality } from '../utils/orientationRecommendationGuard.js'

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

const craneResult = enforceOrientationRecommendationQuality({
  careerAspiration: 'Je rêve d’être grutière',
  jobRecommendations: genericOfficeJobs,
  studyRecommendations: [{ degree: 'BUT Informatique', type: '' }],
  axes: { hands_mind: 'mains', field_office: 'terrain' }
})

if (!/grue|gruti/i.test(craneResult.jobRecommendations[0]?.title || '')) {
  throw new Error('A crane-operator aspiration was not anchored in the first job recommendation.')
}
if (!/caces r487|conduite de grues/i.test(craneResult.studyRecommendations[0]?.degree || '')) {
  throw new Error('A crane-operator aspiration was not anchored in the first study recommendation.')
}
const craneFieldJobCount = craneResult.jobRecommendations.filter((job) => /grue|gruti|engins?|chantier|maintenance|m[ée]can|[ée]lectric|environnement|agricult|transport|secours|sport|cuisine|soin|infirm|artisan|paysag|logistique|technicien/i.test(job.title)).length
if (craneFieldJobCount < 3) {
  throw new Error('A crane-operator aspiration did not retain field-job diversity.')
}

const lawyerResult = enforceOrientationRecommendationQuality({
  careerAspiration: 'Avocate',
  jobRecommendations: genericOfficeJobs,
  studyRecommendations: [{ degree: 'BUT Informatique', type: '' }],
  axes: { hands_mind: 'tete', field_office: 'bureau' }
})

if (!/avocat/i.test(lawyerResult.jobRecommendations[0]?.title || '')) {
  throw new Error('A lawyer aspiration was not anchored in the first job recommendation.')
}
if (!/droit/i.test(lawyerResult.studyRecommendations[0]?.degree || '')) {
  throw new Error('A lawyer aspiration was not anchored in the first study recommendation.')
}

const fieldResult = enforceOrientationRecommendationQuality({
  jobRecommendations: genericOfficeJobs,
  studyRecommendations: [],
  axes: { hands_mind: 'mains', field_office: 'terrain' }
})
const fieldJobCount = fieldResult.jobRecommendations.filter((job) => /grue|engins?|chantier|maintenance|m[ée]can|[ée]lectric|environnement|agricult|transport|secours|sport|cuisine|soin|infirm|artisan|paysag|logistique|technicien/i.test(job.title)).length

if (fieldJobCount < 3) {
  throw new Error('A hands-on field profile did not receive at least three field recommendations.')
}
const sedentaryJobCount = fieldResult.jobRecommendations.filter((job) => /developpe|data|product owner|ux designer|cybersecurite|comptable|juriste|redacteur/i.test(job.title.normalize('NFD').replace(/[\u0300-\u036f]/g, ''))).length
if (sedentaryJobCount > 2) {
  throw new Error('A hands-on field profile received too many sedentary recommendations.')
}

const constructionLeadResult = enforceOrientationRecommendationQuality({
  careerAspiration: 'Chef de chantier',
  jobRecommendations: [{ title: 'Chef ou cheffe de chantier', skills: [] }],
  studyRecommendations: [{ degree: 'BTS Bâtiment', type: '' }],
  axes: { hands_mind: 'mains', field_office: 'terrain' }
})

if (/cuisin/i.test(constructionLeadResult.jobRecommendations[0]?.title || '')) {
  throw new Error('A construction lead aspiration was incorrectly mapped to cooking.')
}

console.log('Orientation recommendation guard verified.')