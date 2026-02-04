import { progressionAPI } from './api'

export const MAX_LEVEL = 40
export const PAYWALL_LEVEL = 10
export const XP_PER_LEVEL = 100

const CORE_QUEST_SEQUENCE = [
  { id: 'explore_interests', label: "Exploration métiers et intérêts" },
  { id: 'watch_intro', label: "L’importance de l’orientation (vidéo)" },
  { id: 'strengths_quiz', label: 'Apprendre à se présenter' },
  { id: 'personality_test', label: 'Apprendre à se connaître' },
  { id: 'values_exploration', label: "Test d’anglais" },
  { id: 'job_research', label: 'Recherche formations et études' },
  { id: 'salary_analysis', label: 'Matching métier' },
  { id: 'job_videos', label: 'La diversité des métiers (vidéo)' },
  { id: 'schedule_meeting', label: 'Recherche métiers' },
  { id: 'prepare_questions', label: 'Bilan numéro 1' },
  { id: 'company_visit', label: 'Explorer ses options : valeurs' },
  { id: 'soft_skills_assessment', label: 'Explorer ses options : compétences' },
  { id: 'star_method', label: 'Explorer des métiers possibles' },
  { id: 'leadership_test', label: 'Comparer les formations possibles' },
  { id: 'cv_builder', label: 'Valider ses choix : points forts' },
  { id: 'cover_letter', label: 'Valider ses choix : points faibles' },
  { id: 'cv_review', label: 'Échanger avec des pros' },
  { id: 'projet_motive', label: 'Confirmer sa motivation' },
  { id: 'voeux_strategy', label: 'Affiner ses préférences' },
  { id: 'calendar_planning', label: 'Bilan numéro 2' },
  { id: 'pitch_practice', label: 'Choisir une voie d’études' },
  { id: 'interview_simulation', label: 'Panorama des études' },
  { id: 'confidence_building', label: 'Construire son plan d’action' },
  { id: 'portfolio_review', label: 'Statistiques et réalité' },
  { id: 'coherence_check', label: 'Vidéo : études post-bac' },
  { id: 'final_polish', label: 'Préparer Parcoursup' },
  { id: 'mentor_others', label: 'Organiser ses candidatures' },
  { id: 'success_story', label: 'Préparer les entretiens' },
  { id: 'expert_badge', label: 'Se présenter avec impact' },
  { id: 'level_30', label: 'Bilan numéro 3' },
  { id: 'level_31', label: 'Débouchés et marché' },
  { id: 'level_32', label: 'Mini-projets étudiants' },
  { id: 'level_33', label: 'Lettre à soi-même' },
  { id: 'level_34', label: 'Gérer son stress' },
  { id: 'level_35', label: 'Vidéo motivation' },
  { id: 'level_36', label: 'Soft skill : intelligence émotionnelle' },
  { id: 'level_37', label: 'Soft skill : résolution de problème' },
  { id: 'level_38', label: 'Soft skill : adaptabilité' },
  { id: 'level_39', label: 'Retours utilisateurs' },
  { id: 'level_40', label: 'Bilan final' }
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
const QUEST_LABEL_BY_ID = new Map([
  ['complete_test', "Test d'orientation"],
  ...LEVEL_QUEST_ENTRIES.map((entry) => [entry.id, entry.label])
])

export const ALL_QUEST_IDS = ['complete_test', ...LEVEL_QUEST_ENTRIES.map((entry) => entry.id)]

const DEFAULT_PROGRESSION = {
  level: 1,
  xp: 0,
  quests: [],
  perks: []
}

function normalizeLevelValue(level) {
  const numericLevel = Number(level)
  if (!Number.isFinite(numericLevel)) return 1
  return Math.max(1, Math.min(Math.floor(numericLevel), MAX_LEVEL))
}

function clampXpForLevel(level, xp) {
  const baseXp = Math.max(0, (level - 1) * XP_PER_LEVEL)
  const topXp = Math.min(baseXp + XP_PER_LEVEL, MAX_LEVEL * XP_PER_LEVEL)
  const numericXp = Number(xp)
  if (!Number.isFinite(numericXp)) return baseXp
  return Math.min(Math.max(numericXp, baseXp), topXp)
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
    const payload = response?.data || {}
    const cleanLevel = normalizeLevelValue(payload.level ?? DEFAULT_PROGRESSION.level)
    const cleanXp = clampXpForLevel(cleanLevel, payload.xp ?? DEFAULT_PROGRESSION.xp)

    return {
      ...DEFAULT_PROGRESSION,
      ...payload,
      level: cleanLevel,
      xp: cleanXp
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

  const rewardNumeric = Number(xpReward)
  const safeReward = Number.isFinite(rewardNumeric) && rewardNumeric > 0
    ? Math.min(Math.round(rewardNumeric), XP_PER_LEVEL)
    : XP_PER_LEVEL

  const baseXpForLevel = Math.max(0, (nextLevel - 1) * XP_PER_LEVEL)
  const newXpValue = Math.min(baseXpForLevel + safeReward, MAX_LEVEL * XP_PER_LEVEL)

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
