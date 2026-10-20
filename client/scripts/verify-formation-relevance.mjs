import assert from 'node:assert/strict'
import {
  BEST_MATCH_MIN_SCORE,
  buildFormationRelevanceProfile,
  buildRelevanceSearchQueries,
  scoreFormationRelevance
} from '../src/lib/formationRelevance.js'
import { getBestFormationResultKey, mixFormationResults } from '../src/lib/orientationFormationResults.js'

// Real profile reported as mismatched: field/technical jobs, bachelor preference.
const analysis = {
  jobRecommendations: [
    { title: 'Ingénieur environnement' },
    { title: 'Chef de chantier BTP' },
    { title: 'Technicien ou technicienne de maintenance industrielle' },
    { title: "Chargé d'étude en aménagement du territoire" },
    { title: 'Géomètre-expert' },
    { title: 'Concepteur de produit' }
  ],
  studyRecommendations: []
}
const profile = { formation_preferences: ['bachelor'], career_domains: ['construction_technique'] }
const relevanceProfile = buildFormationRelevanceProfile({ analysis, profile })

const row = (nm) => ({ type: 'formation', title: nm, raw: { nm: [nm] } })
const offTopic = [
  "Formations aux métiers de l'hôtellerie restauration Bac +3 - Bachelor Arts culinaires et entrepreneuriat / Option Cuisine",
  "Formations aux métiers de l'hôtellerie restauration Bac +3 - Bachelor Arts culinaires et entrepreneuriat / Option Pâtisserie",
  "Formation des écoles de commerce et de management Bac + 3 - ICN Bachelor en management (dit Sup'Est)",
  "Sciences Po / Instituts d'études politiques - Sciences Humaines et Sociales - Grade Licence - Campus de Dijon, Bachelor de Sciences Po, Mineure Union européenne, Europe centrale et orientale",
  "Formations aux métiers de l'hôtellerie restauration Bac +4 - Bachelor en Management International de l'Hôtellerie et de la restauration, parcours francophone",
  'Formation des écoles supérieure d\'art Bac + 3 - Bachelor of Arts in Fashion Design - Cursus francophone ou anglophone',
  'Bachelor in Management (BSc)'
]
for (const title of offTopic) {
  const result = scoreFormationRelevance(row(title), relevanceProfile, { levelMatches: true })
  assert.equal(result.relevant, false, `Off-topic formation must be filtered out: ${title}`)
}

const onTopic = [
  'Licence professionnelle Métiers du BTP : génie civil et construction',
  'BUT Génie civil - construction durable',
  'Bachelor Environnement et développement durable',
  'Licence Géographie et aménagement - parcours aménagement du territoire et urbanisme',
  'BTS Géomètre topographe et modélisation numérique',
  'BTS Maintenance des systèmes option systèmes de production',
  'BTS Conception des processus de réalisation de produits option A production unitaire'
]
for (const title of onTopic) {
  const result = scoreFormationRelevance(row(title), relevanceProfile)
  assert.equal(result.relevant, true, `On-topic formation must be kept: ${title}`)
  assert.ok(result.score >= 70 && result.score <= 98, `Unexpected score ${result.score} for ${title}`)
}

const fullCoverage = scoreFormationRelevance(row("Licence Aménagement du territoire"), relevanceProfile, { levelMatches: true })
const partialCoverage = scoreFormationRelevance(row('BTS Maintenance des véhicules'), relevanceProfile, { levelMatches: true })
assert.ok(fullCoverage.score >= BEST_MATCH_MIN_SCORE, 'A fully covered recommendation earns the best-match badge')
assert.ok(partialCoverage.score < BEST_MATCH_MIN_SCORE, 'A partial match must not earn the best-match badge')
assert.ok(fullCoverage.score > partialCoverage.score)

const queries = buildRelevanceSearchQueries(relevanceProfile, 8).map((entry) => entry.query)
assert.ok(queries.includes('environnement'), queries.join(' | '))
assert.ok(queries.includes('chantier btp'), queries.join(' | '))
assert.ok(queries.includes('aménagement territoire'), 'Search queries keep accents for the catalog search')
assert.ok(queries.every((query) => !/^(bachelor|bts|licence)$/i.test(query)), 'Bare diploma words are never search topics')

assert.deepEqual(scoreFormationRelevance(row('BTS Maintenance'), { groups: [] }), { relevant: false, score: null, coverage: 0, matchedGroups: [] })

assert.equal(getBestFormationResultKey(mixFormationResults([{ id: 1, matchScore: BEST_MATCH_MIN_SCORE - 1 }], [])), null)
assert.equal(getBestFormationResultKey(mixFormationResults([{ id: 1, matchScore: BEST_MATCH_MIN_SCORE }], [])), 'formation-1')

console.log('Formation relevance: off-topic catalog rows filtered, on-topic rows kept, honest scores and best-match threshold verified.')
