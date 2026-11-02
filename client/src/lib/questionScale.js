// 4-point answer scale for the orientation questionnaire (v2).
// Shared by the client flow and server/routes/analysis.js: keep it dependency-free.
//
// Axis questions (category = axis id) have two options [{label, value: pole}].
// Choices: "Plutôt A / Un peu A / Un peu B / Plutôt B".
// The stored answer is readable text: "Plutôt : <label>" (strong) or "Un peu : <label>" (mild).
// Interest questions (category = 'interest') have four options [{label, value: code, level}]
// and the stored answer is the option label ("Pas du tout" ... "Carrément").
// A bare option label (v1 binary answers) is read as a clear choice.

export const INTEREST_CATEGORY = 'interest'

export const AXIS_STRENGTH_PREFIXES = {
  2: 'Plutôt',
  1: 'Un peu'
}

export const INTEREST_LEVELS = [
  { label: 'Pas du tout', level: 0 },
  { label: 'Plutôt pas', level: 1 },
  { label: 'Plutôt oui', level: 2 },
  { label: 'Carrément', level: 3 }
]

export const INTEREST_MAX_LEVEL = 3

// RIASEC codes. C (organisation) is derived from the creative_structured axis.
export const INTEREST_LABELS = {
  R: 'concret, technique, matériaux, nature',
  I: 'sciences, recherche, comprendre comment ça marche',
  A: 'création, expression, art',
  S: 'aider, soigner, conseiller, transmettre',
  E: 'convaincre, vendre, entreprendre, diriger',
  C: 'organisation, méthode, gestion'
}

const STRENGTH_PREFIX_PATTERN = /^(Plutôt|Un peu)\s*:\s*/i

export function isInterestQuestion(question) {
  return question?.category === INTEREST_CATEGORY
}

function getLabelledOptions(question) {
  return Array.isArray(question?.options)
    ? question.options.filter((option) => option && option.label)
    : []
}

export function getAxisOptions(question) {
  const options = getLabelledOptions(question)
  return options.length >= 2 ? options.slice(0, 2) : []
}

export function getInterestOptions(question) {
  const options = getLabelledOptions(question)
  const code = options.find((option) => option.value)?.value || null
  return INTEREST_LEVELS.map((level, index) => {
    const option = options.find((candidate) => Number(candidate.level) === level.level) || options[index]
    return { label: option?.label || level.label, value: option?.value || code, level: level.level }
  })
}

export function encodeAxisAnswer(optionLabel, strength) {
  const prefix = AXIS_STRENGTH_PREFIXES[strength >= 2 ? 2 : 1]
  return `${prefix} : ${optionLabel}`
}

// Ordered choices shown to the student (left to right).
export function getAnswerChoices(question) {
  if (isInterestQuestion(question)) {
    return getInterestOptions(question).map((option, index) => ({
      index,
      answer: option.label,
      label: option.label,
      kind: 'interest',
      code: option.value,
      level: option.level
    }))
  }

  const [first, second] = getAxisOptions(question)
  if (!first || !second) return []
  return [
    { option: first, side: 'A', strength: 2 },
    { option: first, side: 'A', strength: 1 },
    { option: second, side: 'B', strength: 1 },
    { option: second, side: 'B', strength: 2 }
  ].map(({ option, side, strength }, index) => ({
    index,
    answer: encodeAxisAnswer(option.label, strength),
    label: `${AXIS_STRENGTH_PREFIXES[strength]} ${side}`,
    optionLabel: option.label,
    kind: 'axis',
    side,
    pole: option.value,
    strength
  }))
}

export function stripAnswerStrength(answer) {
  return String(answer ?? '').replace(STRENGTH_PREFIX_PATTERN, '').trim()
}

export function getAnswerStrengthPrefix(answer) {
  const match = String(answer ?? '').match(STRENGTH_PREFIX_PATTERN)
  if (!match) return null
  return match[1].toLowerCase() === 'un peu' ? AXIS_STRENGTH_PREFIXES[1] : AXIS_STRENGTH_PREFIXES[2]
}

export function parseAnswer(question, answer) {
  if (answer === undefined || answer === null || answer === '') return null
  const text = String(answer).trim()

  if (isInterestQuestion(question)) {
    const option = getInterestOptions(question).find((candidate) => candidate.label === text)
    return option ? { kind: 'interest', code: option.value, level: option.level } : null
  }

  const options = getAxisOptions(question)
  const baseLabel = stripAnswerStrength(text)
  const option = options.find((candidate) => candidate.label === baseLabel || candidate.value === baseLabel)
  if (!option?.value) return null
  const prefix = getAnswerStrengthPrefix(text)
  return {
    kind: 'axis',
    pole: option.value,
    optionLabel: option.label,
    strength: prefix === AXIS_STRENGTH_PREFIXES[1] ? 1 : 2
  }
}

export function getAnswerChoiceIndex(question, answer) {
  if (!answer) return -1
  return getAnswerChoices(question).findIndex((choice) => choice.answer === answer)
}
