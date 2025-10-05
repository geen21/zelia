import { progressionAPI } from './api'

export const MAX_LEVEL = 50
export const PAYWALL_LEVEL = 10

const CORE_QUEST_SEQUENCE = [
  { id: 'complete_test', label: "Test d'orientation" },
  { id: 'explore_interests', label: "Explorer mes centres d'intérêt" },
  { id: 'watch_intro', label: "Vidéo d'introduction" },
  { id: 'strengths_quiz', label: 'Quiz sur mes forces' },
  { id: 'personality_test', label: 'Test de personnalité' },
  { id: 'values_exploration', label: 'Définir mes valeurs' },
  { id: 'job_research', label: 'Rechercher des métiers' },
  { id: 'salary_analysis', label: 'Analyser les salaires' },
  { id: 'job_videos', label: 'Vidéos métiers' },
  { id: 'schedule_meeting', label: 'Planifier un entretien' },
  { id: 'prepare_questions', label: 'Préparer des questions' },
  { id: 'company_visit', label: "Visite d'entreprise virtuelle" },
  { id: 'soft_skills_assessment', label: 'Éval. des soft skills' },
  { id: 'star_method', label: 'Méthode STAR' },
  { id: 'leadership_test', label: 'Test de leadership' },
  { id: 'cv_builder', label: 'Générateur de CV' },
  { id: 'cover_letter', label: 'Lettre de motivation' },
  { id: 'cv_review', label: 'Révision du CV' },
  { id: 'projet_motive', label: 'Projet motivé' },
  { id: 'voeux_strategy', label: 'Stratégie de vœux' },
  { id: 'calendar_planning', label: 'Planifier le calendrier' },
  { id: 'pitch_practice', label: 'Pitch 60s' },
  { id: 'interview_simulation', label: "Simulation d'entretien" },
  { id: 'confidence_building', label: 'Confiance en soi' },
  { id: 'portfolio_review', label: 'Révision du portfolio' },
  { id: 'coherence_check', label: 'Vérification de cohérence' },
  { id: 'final_polish', label: 'Finitions' },
  { id: 'mentor_others', label: 'Mentorat' },
  { id: 'success_story', label: 'Partager mon histoire' },
  { id: 'expert_badge', label: 'Badge expert' }
]

const LEVEL_QUEST_ENTRIES = Array.from({ length: MAX_LEVEL }, (_, index) => {
  const level = index + 1
  const base = CORE_QUEST_SEQUENCE[index]

  if (base) {
    return {
      level,
      id: base.id,
      label: base.label
    }
  }

  const padded = String(level).padStart(2, '0')
  return {
    level,
    id: `level_${padded}`,
    label: `Mission Niveau ${level}`
  }
})

const QUEST_ID_BY_LEVEL = new Map(LEVEL_QUEST_ENTRIES.map((entry) => [entry.level, entry.id]))
const QUEST_LABEL_BY_ID = new Map(LEVEL_QUEST_ENTRIES.map((entry) => [entry.id, entry.label]))

export const ALL_QUEST_IDS = LEVEL_QUEST_ENTRIES.map((entry) => entry.id)

const DEFAULT_PROGRESSION = {
  level: 1,
  xp: 0,
  quests: [],
  perks: []
}

export function questIdForLevel(level) {
  const numericLevel = Number(level)
  if (!Number.isFinite(numericLevel)) return null
  const clamped = Math.max(1, Math.min(Math.floor(numericLevel), MAX_LEVEL))
  return QUEST_ID_BY_LEVEL.get(clamped) || null
}

export function questLabel(id) {
  if (!id) return ''
  if (QUEST_LABEL_BY_ID.has(id)) return QUEST_LABEL_BY_ID.get(id)

  const match = /^level_(\d{1,3})$/.exec(String(id))
  if (match) {
    const level = Number(match[1])
    if (Number.isFinite(level)) {
      return `Mission Niveau ${level}`
    }
  }

  return id
}

export function getDefaultProgression() {
  return { ...DEFAULT_PROGRESSION }
}

export async function fetchProgression() {
  try {
    const response = await progressionAPI.get()
    return {
      ...DEFAULT_PROGRESSION,
      ...(response?.data || {})
    }
  } catch (error) {
    console.warn('fetchProgression failed, returning default progression', error)
    return getDefaultProgression()
  }
}

export async function levelUp({ minLevel = null, xpReward = 0 } = {}) {
  const current = await fetchProgression()
  const currentLevel = Number(current.level) || 1
  let nextLevel = Math.min(currentLevel + 1, MAX_LEVEL)

  if (minLevel && nextLevel < minLevel) {
    nextLevel = Math.min(minLevel, MAX_LEVEL)
  }

  const newXpValue = (Number(current.xp) || 0) + (Number(xpReward) || 0)

  const existingQuests = Array.isArray(current.quests) ? current.quests.filter(Boolean) : []
  const newlyCompletedQuests = []

  if (nextLevel > currentLevel) {
    for (let lvl = currentLevel; lvl < nextLevel; lvl += 1) {
      const questId = questIdForLevel(lvl)
      if (questId) {
        newlyCompletedQuests.push(questId)
      }
    }
  }

  const updatedQuests = Array.from(new Set([...existingQuests, ...newlyCompletedQuests]))

  await progressionAPI.update({
    level: nextLevel,
    xp: newXpValue,
    quests: updatedQuests,
    perks: current.perks || []
  })

  return {
    previousLevel: currentLevel,
    newLevel: nextLevel,
    xp: newXpValue,
    questsCompleted: newlyCompletedQuests
  }
}

export function isLevelAccessible({
  targetLevel,
  progression,
  hasPaid,
  paidGateLevel = PAYWALL_LEVEL
}) {
  const cleanLevel = Math.max(1, Math.min(Number(targetLevel) || 1, MAX_LEVEL))
  const progressionLevel = Math.max(1, Number(progression?.level) || 1)

  // Allow replay of previously reached levels
  if (cleanLevel <= progressionLevel) {
    if (cleanLevel > paidGateLevel && !hasPaid) return false
    return true
  }

  // Allow access to the immediate next level (in-progress level)
  if (cleanLevel === progressionLevel + 1) {
    if (cleanLevel > paidGateLevel && !hasPaid) return false
    return true
  }

  return false
}

export function computeNextPlayableLevel({ progression, hasPaid, paidGateLevel = PAYWALL_LEVEL }) {
  const progressionLevel = Math.max(1, Number(progression?.level) || 1)
  const maxPlayable = hasPaid ? MAX_LEVEL : paidGateLevel

  if (progressionLevel > maxPlayable) {
    return maxPlayable
  }
  return progressionLevel
}
