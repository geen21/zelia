import assert from 'node:assert/strict'
import { computePersonaFromAnswers, PERSONAS } from '../src/lib/personas.js'
import { getAnswerChoices } from '../src/lib/questionScale.js'

const axisDefinitions = [
  ['hands_mind', 'mains', 'tete'],
  ['solo_team', 'solo', 'equipe'],
  ['creative_structured', 'creatif', 'structure'],
  ['field_office', 'terrain', 'bureau'],
  ['risk_safety', 'audace', 'securite']
]
const interestCodes = ['R', 'S', 'A', 'I', 'E']

function buildAxisQuestions(perAxis) {
  return axisDefinitions.flatMap(([category, firstPole, secondPole], axisIndex) => (
    Array.from({ length: perAxis }, (_, questionIndex) => ({
      id: axisIndex * 10 + questionIndex,
      category,
      options: [
        { label: `${category}-first-${questionIndex}`, value: firstPole },
        { label: `${category}-second-${questionIndex}`, value: secondPole }
      ]
    }))
  ))
}

const interestQuestions = interestCodes.map((code, index) => ({
  id: 100 + index,
  category: 'interest',
  options: ['Pas du tout', 'Plutôt pas', 'Plutôt oui', 'Carrément'].map((label, level) => ({ label, value: code, level }))
}))

const v2Questions = [...buildAxisQuestions(3), ...interestQuestions]

function answerAxis(answers, questions, category, choiceIndexes) {
  questions
    .filter((question) => question.category === category)
    .forEach((question, index) => {
      answers[question.id] = getAnswerChoices(question)[choiceIndexes[index % choiceIndexes.length]].answer
    })
}

function answerInterests(answers, levels) {
  interestQuestions.forEach((question) => {
    const level = levels[question.options[0].value] ?? 1
    answers[question.id] = getAnswerChoices(question)[level].answer
  })
}

// 1) Every clear axis profile maps to a varied set of personas.
const exactProfileDistribution = {}
for (let mask = 0; mask < 2 ** axisDefinitions.length; mask += 1) {
  const answers = {}
  axisDefinitions.forEach(([category], axisIndex) => {
    answerAxis(answers, v2Questions, category, [((mask >> axisIndex) & 1) ? 3 : 0])
  })
  answerInterests(answers, {})
  const { persona } = computePersonaFromAnswers(v2Questions, answers)
  exactProfileDistribution[persona.slug] = (exactProfileDistribution[persona.slug] || 0) + 1
}
console.log('Persona distribution for all 32 clear axis profiles:', exactProfileDistribution)
const mostFrequentProfileCount = Math.max(...Object.values(exactProfileDistribution))
assert.ok(Object.keys(exactProfileDistribution).length >= 10, 'The persona map is not diverse enough across the full axis space.')
assert.ok(mostFrequentProfileCount <= 5, 'One persona absorbs too many axis profiles.')

// 2) Every persona's own signature (clear answers) gives that persona.
for (const persona of PERSONAS) {
  const answers = {}
  axisDefinitions.forEach(([category, firstPole]) => {
    answerAxis(answers, v2Questions, category, [persona.signature[category] === firstPole ? 0 : 3])
  })
  answerInterests(answers, {})
  assert.equal(computePersonaFromAnswers(v2Questions, answers).persona.slug, persona.slug, `Signature of ${persona.slug} does not map back to it.`)
}

// 3) A balanced axis is reported as such and its pole is not picked from the answer pattern.
{
  const base = {}
  axisDefinitions.forEach(([category]) => answerAxis(base, v2Questions, category, [0]))
  answerInterests(base, {})
  const balancedA = { ...base }
  const balancedB = { ...base }
  answerAxis(balancedA, v2Questions, 'risk_safety', [0, 2, 2])
  answerAxis(balancedB, v2Questions, 'risk_safety', [2, 0, 2])
  const resultA = computePersonaFromAnswers(v2Questions, balancedA)
  const resultB = computePersonaFromAnswers(v2Questions, balancedB)
  assert.equal(resultA.axisStrength.risk_safety, 'equilibre')
  assert.equal(resultA.persona.slug, resultB.persona.slug, 'Equivalent balanced answers gave different personas.')
  assert.equal(resultA.profile.risk_safety, resultA.persona.signature.risk_safety)
}

// 4) Nuance matters: mild answers on an axis are weaker than clear ones.
{
  const answers = {}
  axisDefinitions.forEach(([category]) => answerAxis(answers, v2Questions, category, [1]))
  answerInterests(answers, {})
  const { axisStrength } = computePersonaFromAnswers(v2Questions, answers)
  assert.equal(axisStrength.hands_mind, 'moderee')
}

// 5) Interests are reported for the LLM but never change the persona (axes only).
{
  const answers = {}
  axisDefinitions.forEach(([category]) => answerAxis(answers, v2Questions, category, [1, 2, 1]))
  const social = { ...answers }
  const creative = { ...answers }
  answerInterests(social, { S: 3, E: 3, A: 0, I: 0, R: 0 })
  answerInterests(creative, { A: 3, R: 3, S: 0, I: 0, E: 0 })
  const socialResult = computePersonaFromAnswers(v2Questions, social)
  const creativeResult = computePersonaFromAnswers(v2Questions, creative)
  const axesOnlyResult = computePersonaFromAnswers(v2Questions, answers)
  assert.equal(socialResult.persona.slug, creativeResult.persona.slug, 'Interests must not influence the persona.')
  assert.equal(socialResult.persona.slug, axesOnlyResult.persona.slug, 'Interests must not influence the persona.')
  assert.deepEqual(socialResult.topInterests.slice(0, 2).sort(), ['E', 'S'])
  assert.deepEqual(creativeResult.topInterests.slice(0, 2).sort(), ['A', 'R'])
}

// 5b) Axis scale labels and stored answers.
{
  const [axisQuestion] = v2Questions
  const choices = getAnswerChoices(axisQuestion)
  assert.deepEqual(choices.map((choice) => choice.label), ['Plutôt A', 'Un peu A', 'Un peu B', 'Plutôt B'])
  assert.deepEqual(choices.map((choice) => choice.answer), [
    `Plutôt : ${axisQuestion.options[0].label}`,
    `Un peu : ${axisQuestion.options[0].label}`,
    `Un peu : ${axisQuestion.options[1].label}`,
    `Plutôt : ${axisQuestion.options[1].label}`
  ])
  assert.deepEqual(choices.map((choice) => choice.strength), [2, 1, 1, 2])
  assert.equal(getAnswerChoices(interestQuestions[0]).map((choice) => choice.label).join('/'), 'Pas du tout/Plutôt pas/Plutôt oui/Carrément')
}

// 6) Legacy v1 binary answers (bare labels, 4 questions per axis) still map to personas,
//    and identical axis profiles get the same persona whatever the answer order.
{
  const legacyQuestions = buildAxisQuestions(4)
  for (const persona of PERSONAS) {
    const answers = {}
    axisDefinitions.forEach(([category, firstPole]) => {
      legacyQuestions
        .filter((question) => question.category === category)
        .forEach((question, questionIndex) => {
          const majority = persona.signature[category] === firstPole ? 0 : 1
          answers[question.id] = question.options[questionIndex === 3 ? 1 - majority : majority].label
        })
    })
    const result = computePersonaFromAnswers(legacyQuestions, answers)
    assert.equal(result.persona.slug, persona.slug, `Legacy answers for ${persona.slug} do not map back to it.`)
    assert.equal(result.axisStrength.hands_mind, 'moderee')
  }

  const combinations = [[0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3]]
  const distribution = {}
  for (let seed = 0; seed < 96; seed += 1) {
    const answers = {}
    axisDefinitions.forEach(([category], axisIndex) => {
      const firstPoleIndexes = combinations[Math.floor(seed / (6 ** axisIndex)) % combinations.length]
      legacyQuestions
        .filter((question) => question.category === category)
        .forEach((question, questionIndex) => {
          answers[question.id] = question.options[firstPoleIndexes.includes(questionIndex) ? 0 : 1].label
        })
    })
    const { persona } = computePersonaFromAnswers(legacyQuestions, answers)
    distribution[persona.slug] = (distribution[persona.slug] || 0) + 1
  }
  assert.equal(Object.keys(distribution).length, 1, 'Fully balanced profiles should not depend on answer order.')
}

console.log('Persona scoring checks passed.')
