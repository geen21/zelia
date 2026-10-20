import assert from 'node:assert/strict'
import test from 'node:test'
import { scoreFormations } from '../utils/partnerMatching.js'

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

test('partners without a thematic match are hidden, even with a high priority or the same city', () => {
  const matched = scoreFormations(partners, answers({
    orientation_formation_preferences: '["bachelor"]',
    orientation_career_domains: '["construction_technique"]'
  }), jobRecommendations, 'Paris')
  const ids = matched.map((formation) => formation.id)
  assert.ok(!ids.includes('escp'), 'Management is only a soft skill here, not a field signal')
  assert.ok(!ids.includes('ferrandi'))
  assert.ok(!ids.includes('same-city-only'), 'City alone must not make a partner visible')
  assert.ok(ids.includes('cprp'))
  assert.ok(ids.includes('btp'))
  assert.ok(matched.every((formation) => formation.match_score >= 45 && formation.match_score <= 100))
})

test('a relevant partner scores higher with a stronger overlap', () => {
  const matched = scoreFormations(partners, answers({ orientation_career_domains: '["construction_technique"]' }), jobRecommendations)
  const btp = matched.find((formation) => formation.id === 'btp')
  const weak = scoreFormations([
    { id: 'weak', formation_name: 'BTS Electrotechnique', domain: '', diploma_level: 'Bac+2', city: 'Lyon' }
  ], answers({}), [{ title: 'Technicien de maintenance industrielle' }])
  assert.equal(weak.length, 1, 'A related field term still qualifies')
  assert.ok(btp.match_score > weak[0].match_score)
})

test('no profile signal returns nothing', () => {
  assert.deepEqual(scoreFormations(partners, answers({ orientation_city: 'Paris' }), []), [])
})
