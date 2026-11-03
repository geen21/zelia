import { createHash } from 'node:crypto'

// Synthetic test data only. Never exported as generated editorial content.
export function metierFixture(index = 0) {
  const title = ['Développeur web', 'Infirmier', 'Électricien', 'Comptable'][index % 4] + (index < 4 ? '' : ` spécialité ${index}`)
  const id = createHash('sha256').update(`fixture-${index}`).digest('hex')
  const negative = index % 4 === 3
  return {
    id, title, slug: `metier-test-${index}-${id.slice(0, 10)}`, romeCodes: ['M1805'],
    updatedAt: '2026-11-03T12:00:00.000Z',
    content: {
      summary: `${title} réalise des missions spécialisées et accompagne les besoins de son secteur.`,
      verdict: negative ? 'NON' : 'OUI',
      explanation: negative ?
        'L’intelligence artificielle automatise une grande partie des tâches routinières de ce métier. Ses perspectives dépendent surtout d’une évolution vers le conseil et les situations complexes.' :
        'L’intelligence artificielle transforme les tâches courantes, mais la compréhension des besoins et la responsabilité restent humaines. Apprendre à travailler avec ces outils renforce les perspectives du métier.',
      missions: ['Analyser les besoins', 'Réaliser et vérifier les interventions'],
      skills: ['Rigueur', 'Adaptation aux outils numériques'],
      access: ['Formation adaptée à la spécialité', 'Expérience pratique accompagnée']
    }
  }
}

export function metierSnapshot(count = 40, preview = false) {
  return { schemaVersion: 1, preview, totalCatalog: count, pages: Array.from({ length: count }, (_, index) => detailedMetierFixture(index)) }
}

export function detailedMetierFixture(index = 0) {
  const page = metierFixture(index)
  const paragraph = 'Ce paragraphe est un exemple synthétique réservé aux tests automatisés. Il ne décrit pas une situation professionnelle réelle et ne constitue pas un conseil sur les formations. Les vérifications portent sur la présence des informations, les liens documentaires, la navigation et les contrôles de cohérence, sans aucun appel facturé à un modèle ni publication de ces données de démonstration.'
  const sections = [
    ['quotidien', 'Comment se déroule une journée de travail ?'],
    ['intelligence-artificielle', 'Quelles tâches pourraient évoluer avec l’intelligence artificielle ?'],
    ['competences', 'Quelles compétences faut-il développer ?'],
    ['formation', 'Comment préparer son parcours de formation ?'],
    ['perspectives', 'Quels points vérifier avant de choisir cette voie ?']
  ]
  page.content = { ...page.content, version: 2,
    sections: sections.map(([id, heading]) => ({ id, heading, paragraphs: [paragraph, paragraph], sourceIds: ['rncp-graphiste'] })),
    faq: ['Comment explorer ce métier ?', 'Comment comparer les formations ?', 'Quelle place pour les outils numériques ?'].map((question) =>
      ({ question, answer: paragraph, sourceIds: ['oit-ia-2025'] })),
    sources: [
      { id: 'rncp-graphiste', name: 'France compétences — référence de test', url: 'https://www.francecompetences.fr/recherche/rncp/39532/', checkedAt: '2026-11-03' },
      { id: 'oit-ia-2025', name: 'OIT — référence de test', url: 'https://www.ilo.org/publications/generative-ai-and-jobs-refined-global-index-occupational-exposure', checkedAt: '2026-11-03' }
    ]
  }
  return page
}
