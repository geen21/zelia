// Agreement scale for the orientation questionnaire (v3).
// Shared by the client flow and server/routes/analysis.js: keep it dependency-free.
//
// Each v3 question is one statement ("J'aime faire des choses de mes mains...") answered with
// the same 4 levels. options = [{ label, value, level }] x4, where value is:
//   - the axis pole the statement describes (category = axis id), or
//   - a RIASEC code (category = 'interest').
// The stored answer is the level label ("Pas du tout" ... "Carrément").
// Legacy v1 questions have two options [{ label, value: pole }] and store the picked label.
// Legacy v2 axis answers prefix that label with "Plutôt : " or "Un peu : ".

export const INTEREST_CATEGORY = 'interest'

export const AGREEMENT_LEVELS = [
  { label: 'Pas du tout', level: 0 },
  { label: 'Plutôt pas', level: 1 },
  { label: 'Plutôt oui', level: 2 },
  { label: 'Carrément', level: 3 }
]

export const MAX_LEVEL = 3

const LEGACY_STRENGTH_PREFIX = /^(Plutôt|Un peu|Clairement)\s*:\s*/i

export function stripAnswerStrength(answer) {
  return String(answer ?? '').replace(LEGACY_STRENGTH_PREFIX, '').trim()
}

// RIASEC codes. C (organisation) is derived from the creative_structured axis.
export const INTEREST_LABELS = {
  R: 'concret, technique, nature, sport',
  I: 'sciences, numérique, comprendre comment ça marche',
  A: 'création, expression, art',
  S: 'aider, soigner, transmettre, société',
  E: 'convaincre, vendre, entreprendre',
  C: 'organisation, méthode, gestion'
}

export function isInterestQuestion(question) {
  return question?.category === INTEREST_CATEGORY
}

function getLabelledOptions(question) {
  return Array.isArray(question?.options)
    ? question.options.filter((option) => option && option.label)
    : []
}

export function isAgreementQuestion(question) {
  return getLabelledOptions(question).some((option) => option.level !== undefined && option.level !== null)
}

// Ordered choices shown to the student (left to right / top to bottom).
// `level` 0..3 drives the colour; legacy two-option questions use levels 0 and 3.
export function getAnswerChoices(question) {
  const options = getLabelledOptions(question)
  if (isAgreementQuestion(question)) {
    const value = options.find((option) => option.value)?.value || null
    return AGREEMENT_LEVELS.map((level, index) => {
      const option = options.find((candidate) => Number(candidate.level) === level.level)
      const label = option?.label || level.label
      return { index, answer: label, label, value: option?.value || value, level: level.level }
    })
  }
  return options.slice(0, 2).map((option, index) => ({
    index,
    answer: option.label,
    label: option.label,
    value: option.value,
    level: index === 0 ? 0 : MAX_LEVEL
  }))
}

// Returns { value, level, signed } where signed is the agreement with `value` on -2..+2
// (-2 = "Pas du tout", -1 = "Plutôt pas", +1 = "Plutôt oui", +2 = "Carrément").
// A legacy two-option answer is a clear choice of the picked option (signed = +2).
export function parseAnswer(question, answer) {
  if (answer === undefined || answer === null || answer === '') return null
  const text = String(answer).trim()

  if (isAgreementQuestion(question)) {
    const choice = getAnswerChoices(question).find((candidate) => candidate.answer === text)
    if (!choice?.value) return null
    return { value: choice.value, level: choice.level, signed: choice.level >= 2 ? choice.level - 1 : choice.level - 2 }
  }

  const label = stripAnswerStrength(text)
  const option = getLabelledOptions(question).find((candidate) => candidate.label === label || candidate.value === label)
  const strength = text.match(LEGACY_STRENGTH_PREFIX)?.[1].toLowerCase() === 'un peu' ? 1 : 2
  return option?.value ? { value: option.value, level: MAX_LEVEL, signed: strength } : null
}

export function getAnswerChoiceIndex(question, answer) {
  if (!answer) return -1
  const label = isAgreementQuestion(question) ? answer : stripAnswerStrength(answer)
  return getAnswerChoices(question).findIndex((choice) => choice.answer === label)
}
