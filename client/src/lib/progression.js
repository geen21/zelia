import { progressionAPI } from './api'

export const MAX_LEVEL = 10
export const XP_PER_LEVEL = 100

const CORE_QUEST_SEQUENCE = [
  { id: 'explore_interests', label: "Exploration métiers et intérêts" },
  { id: 'company_visit', label: 'Classement des domaines' },
  { id: 'strengths_quiz', label: 'Quiz idées reçues' },
  { id: 'cv_builder', label: 'Points positifs et négatifs' },
  { id: 'salary_analysis', label: 'Matching métier' },
  { id: 'soft_skills_assessment', label: 'Débouchés et marché' },
  { id: 'pitch_practice', label: 'Choisir une voie d’études' },
  { id: 'interview_simulation', label: 'Panorama des études' },
  { id: 'confidence_building', label: 'Écoles recommandées' },
  { id: 'bilan_final', label: 'Bilan final' }
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

export async function completeQuest(questId) {
  const normalizedQuestId = String(questId || '').trim()
  const current = await fetchProgression()
  const currentLevel = normalizeLevelValue(current.level ?? DEFAULT_PROGRESSION.level)
  const currentXp = clampXpForLevel(currentLevel, current.xp ?? DEFAULT_PROGRESSION.xp)
  const existingQuests = Array.isArray(current.quests) ? current.quests.filter(Boolean) : []

  if (!normalizedQuestId) {
    return {
      updated: false,
      progression: {
        ...DEFAULT_PROGRESSION,
        ...current,
        level: currentLevel,
        xp: currentXp,
        quests: existingQuests
      }
    }
  }

  if (existingQuests.includes(normalizedQuestId)) {
    return {
      updated: false,
      progression: {
        ...DEFAULT_PROGRESSION,
        ...current,
        level: currentLevel,
        xp: currentXp,
        quests: existingQuests
      }
    }
  }

  const updatedQuests = [...existingQuests, normalizedQuestId]

  await progressionAPI.update({
    level: currentLevel,
    xp: currentXp,
    quests: updatedQuests,
    perks: current.perks || []
  })

  return {
    updated: true,
    progression: {
      ...DEFAULT_PROGRESSION,
      ...current,
      level: currentLevel,
      xp: currentXp,
      quests: updatedQuests
    }
  }
}

export function isLevelAccessible({
  targetLevel,
  progression,
}) {
  const cleanLevel = Math.max(1, Math.min(Number(targetLevel) || 1, MAX_LEVEL))
  const progressionLevel = Math.max(1, Number(progression?.level) || 1)

  // Allow replay of previously reached levels
  if (cleanLevel <= progressionLevel) {
    return true
  }

  // Allow access to the immediate next level (in-progress level)
  if (cleanLevel === progressionLevel + 1) {
    return true
  }

  return false
}

export function computeNextPlayableLevel({ progression }) {
  const progressionLevel = Math.max(1, Number(progression?.level) || 1)

  if (progressionLevel > MAX_LEVEL) {
    return MAX_LEVEL
  }
  return progressionLevel
}
