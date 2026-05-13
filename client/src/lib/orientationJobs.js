export const AI_JOB_DECK_SIZE = 5
export const AI_FINAL_JOB_COUNT = 8

function normalizeDiversityText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function cleanDetailText(value, maxLength = 360) {
  const text = String(value || '').replace(/\s+/g, ' ').trim()
  if (!text) return ''
  return text.length > maxLength ? `${text.slice(0, maxLength - 1).trim()}...` : text
}

function compactTags(values) {
  const seen = new Set()
  return values
    .flatMap((value) => Array.isArray(value) ? value : [value])
    .map((value) => cleanDetailText(value, 70))
    .filter(Boolean)
    .filter((value) => {
      const key = value.toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, 7)
}

function normalizePercentageMatchScore(value) {
  const score = Number(value)
  if (!Number.isFinite(score) || score <= 0) return null
  const percent = score <= 1 ? score * 100 : score
  return Math.max(1, Math.min(100, Math.round(percent)))
}

function getAnalysisBlock(results) {
  return results?.inscriptionResults || results || null
}

function pickJobTitle(job) {
  if (!job) return ''
  return job.title || job.intitule || String(job || '')
}

function aiJobSlug(value, index) {
  const slug = normalizeDiversityText(value).replace(/\s+/g, '-')
  return slug || `metier-${index}`
}

function getCandidateJobDecisionKey(candidate) {
  if (candidate?.type !== 'metier') return ''
  return normalizeDiversityText(candidate.title || candidate.raw?.intitule || '')
}

function normalizeAiJobCandidate(item, index) {
  const title = cleanDetailText(item?.title || item?.metier || item?.job || item?.name, 90)
  if (!title) return null

  const summary = cleanDetailText(item?.summary || item?.description || item?.why || item?.reason, 220)
  const why = cleanDetailText(item?.why || item?.reason || item?.fit || '', 260)
  const skills = compactTags([item?.skills, item?.competences, item?.strengths]).slice(0, 5)
  const constraints = compactTags([item?.constraints, item?.contraintes, item?.watchOut, item?.points_attention]).slice(0, 4)
  const training = cleanDetailText(item?.training || item?.studies || item?.formation || item?.access || '', 160)
  const subtitle = cleanDetailText([
    summary,
    skills.length ? skills.slice(0, 3).join(' · ') : ''
  ].filter(Boolean).join(' - '), 180)

  return {
    id: `ai-metier-${aiJobSlug(title, index)}-${index}`,
    rawId: null,
    type: 'metier',
    title,
    subtitle: subtitle || 'Métier proposé selon ton profil',
    source: 'Suggestion Zélia',
    sourceTable: 'gemini_metiers',
    logoKind: 'metier',
    matchScore: normalizePercentageMatchScore(item?.matchScore ?? item?.match_score ?? item?.score),
    raw: {
      title,
      summary,
      why,
      skills,
      constraints,
      training
    }
  }
}

export function normalizeAiJobCandidates(value, limit = AI_JOB_DECK_SIZE) {
  const items = Array.isArray(value) ? value : Array.isArray(value?.jobs) ? value.jobs : []
  const seen = new Set()
  return items
    .map(normalizeAiJobCandidate)
    .filter(Boolean)
    .filter((candidate) => {
      const key = getCandidateJobDecisionKey(candidate)
      if (!key || seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, limit)
}

export function buildAiJobDeckPrompt({ analysis, microProfile, department, count = AI_JOB_DECK_SIZE }) {
  const block = getAnalysisBlock(analysis) || {}
  return `Tu es Zélia. Propose un deck de métiers à swiper pour affiner l'orientation de l'utilisateur.
Retourne uniquement un JSON valide: un tableau de ${count} objets exactement.
Schéma obligatoire: [{"title":"Métier précis","summary":"phrase courte sur le quotidien","why":"pourquoi ce métier colle au profil","skills":["compétence 1","compétence 2"],"constraints":["point à vérifier"],"training":"voie d'accès simple","matchScore":82}].

Règles:
- Les métiers doivent correspondre au profil, pas à une base de données.
- Explore largement le monde professionnel sans privilégier par défaut les métiers de bureau, numériques ou créatifs.
- Le deck doit être assez varié pour apprendre des swipes: mélange des environnements, rythmes, niveaux d'études, gestes, responsabilités et rapports aux autres.
- N'utilise pas metier_france et ne mentionne aucune table.
- Évite les intitulés trop vagues comme manager, consultant ou commercial sans spécialité.
- Les métiers doivent être réalistes en France pour un élève ou étudiant.
- matchScore est un entier entre 55 et 96.

Analyse personnalité: ${block.personalityAnalysis || ''}
Forces: ${block.skillsAssessment || ''}
Métiers déjà suggérés dans le bilan: ${(block.jobRecommendations || []).map(pickJobTitle).filter(Boolean).join(' | ') || 'aucun'}
Contexte complémentaire: ${JSON.stringify(microProfile || {})}
Département/localisation: ${department?.name || department?.code || department?.city || 'non précisé'}`
}

export function buildAiFinalJobsPrompt({ analysis, microProfile, department, likedProposals, rejectedProposals, count = AI_FINAL_JOB_COUNT }) {
  const block = getAnalysisBlock(analysis) || {}
  const likedText = likedProposals.map((item) => `${item.title} - ${item.subtitle || item.raw?.why || ''}`).join(' | ') || 'aucun'
  const rejectedText = rejectedProposals.map((item) => `${item.title} - ${item.subtitle || item.raw?.why || ''}`).join(' | ') || 'aucun'
  const anchorInstruction = likedProposals.length
    ? `\n- ANCRAGE PRIORITAIRE: les métiers gardés priment sur l'analyse générale. Identifie toi-même leur famille métier, leur environnement réel, leurs gestes, contraintes, outils et compétences. Les ${count} métiers finaux doivent rester proches de ces matchs et ne pas partir vers une autre famille métier. Si un seul métier a été gardé, traite-le comme le signal principal.`
    : ''

  return `Tu es Zélia. Affine maintenant comme un Akinator: les métiers gardés indiquent ce qui attire l'utilisateur, les métiers refusés indiquent ce qu'il faut éviter.
Retourne uniquement un JSON valide: un tableau de ${count} métiers idéaux exactement.
Schéma obligatoire: [{"title":"Métier précis","summary":"pourquoi c'est une piste idéale","why":"lien direct avec les oui/non","skills":["compétence 1","compétence 2"],"constraints":["point à vérifier"],"training":"première voie d'accès","matchScore":88}].

Règles:
- Ne te base pas sur metier_france ni sur une base de données.
- Les métiers retournés doivent être une nouvelle liste affinée: ne recopie jamais exactement les métiers swipés, même ceux gardés.
- Utilise les métiers gardés comme signaux de famille, de compétences, d'environnement et de motivation, puis propose des métiers proches mais distincts.
- Quand au moins un métier a été gardé, l'analyse de personnalité devient secondaire: elle sert seulement à ajuster les métiers proches du match, pas à changer de domaine.${anchorInstruction}
- Considère vraiment tout le monde professionnel, sans privilégier par défaut les métiers de bureau, numériques ou créatifs.
- Ne repropose jamais un métier refusé ni un métier trop proche d'un refus.
- Si un seul métier a été gardé, propose ${count} métiers distincts qui ressemblent à ce match par les tâches, les compétences ou l'environnement.
- Si l'utilisateur a tout refusé, repars du profil et propose ${count} directions nouvelles.
- Les ${count} métiers doivent être plus précis que les propositions de swipe et distincts les uns des autres.
- Varie les niveaux d'études et les environnements seulement si cela reste cohérent avec les swipes gardés.
- matchScore est un entier entre 65 et 98.

Analyse personnalité: ${block.personalityAnalysis || ''}
Forces: ${block.skillsAssessment || ''}
Contexte complémentaire: ${JSON.stringify(microProfile || {})}
Département/localisation: ${department?.name || department?.code || department?.city || 'non précisé'}
Swipes gardés: ${likedText}
Swipes refusés: ${rejectedText}`
}
