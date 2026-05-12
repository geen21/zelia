const STANDALONE_TOOL_SLUGS = [
  'personnalite',
  'anglais',
  'cv',
  'classement-metiers',
  'axes-amelioration',
  'quiz-orientation',
  'parcoursup',
  'pitch',
  'entretien',
  'parcours-etudes',
  'competences',
  'lettre-futur',
  'stress',
  'intelligence-emotionnelle',
  'quiz-soft-skills',
  'resolution-problemes',
  'feedback'
]

export function isStandaloneToolRoute(pathname = '') {
  const currentPath = pathname || (typeof window !== 'undefined' ? window.location?.pathname || '' : '')
  const match = currentPath.match(/^\/app\/outils\/([^/]+)/)
  return match ? STANDALONE_TOOL_SLUGS.includes(match[1]) : false
}

export function isToolCompletionText(text = '') {
  const normalized = String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u2019]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()

  if (!normalized || normalized.includes('retour aux outils')) return false

  return (
    /^valider et terminer\b/.test(normalized) ||
    /^valider (le|la|l'|ce|mon|ma|mes)?\s*(niveau|parcours|module|activite|progression)\b/.test(normalized) ||
    /^terminer\b/.test(normalized) ||
    /^passer au niveau suivant/.test(normalized) ||
    /^niveau suivant/.test(normalized) ||
    /^continuer l'aventure/.test(normalized) ||
    /^j'ai termine la video/.test(normalized) ||
    /^video suivante/.test(normalized) ||
    /^arreter le supplice/.test(normalized)
  )
}

export function buildToolModeResponse(data = {}) {
  return Promise.resolve({ data: { ...data, toolMode: true }, status: 204 })
}