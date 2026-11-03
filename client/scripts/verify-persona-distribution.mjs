import assert from 'node:assert/strict'
import { computePersonaFromAnswers, PERSONAS } from '../src/lib/personas.js'
import { AGREEMENT_LEVELS, getAnswerChoices, getAnswerChoiceIndex, parseAnswer, stripAnswerStrength } from '../src/lib/questionScale.js'

const axisDefinitions = [
  ['hands_mind', 'mains', 'tete'],
  ['solo_team', 'solo', 'equipe'],
  ['creative_structured', 'creatif', 'structure'],
  ['field_office', 'terrain', 'bureau'],
  ['risk_safety', 'audace', 'securite']
]
const interestCodes = ['I', 'S', 'A', 'R', 'E']
const [NOT_AT_ALL, RATHER_NOT, RATHER_YES, TOTALLY] = AGREEMENT_LEVELS.map((level) => level.label)

const statement = (id, category, value) => ({
  id,
  category,
  options: AGREEMENT_LEVELS.map(({ label, level }) => ({ label, value, level }))
})

// One statement per pole of each axis + broad interest statements.
const axisStatements = axisDefinitions.flatMap(([category, firstPole, secondPole], axisIndex) => [
  statement(axisIndex * 10, category, firstPole),
  statement(axisIndex * 10 + 1, category, secondPole)
])
const interestStatements = interestCodes.map((code, index) => statement(100 + index, 'interest', code))
const v2Questions = [...axisStatements, ...interestStatements]

function answerAxis(answers, category, pole, agreeLabel, otherLabel) {
  for (const question of axisStatements.filter((candidate) => candidate.category === category)) {
    answers[question.id] = question.options[0].value === pole ? agreeLabel : otherLabel
  }
}

function answerInterests(answers, labels = {}) {
  for (const question of interestStatements) {
    answers[question.id] = labels[question.options[0].value] || RATHER_NOT
  }
}

function clearProfileAnswers(signature) {
  const answers = {}
  for (const [category] of axisDefinitions) answerAxis(answers, category, signature[category], TOTALLY, NOT_AT_ALL)
  answerInterests(answers)
  return answers
}

// 1) Every clear axis profile maps to a varied set of personas.
const exactProfileDistribution = {}
for (let mask = 0; mask < 2 ** axisDefinitions.length; mask += 1) {
  const signature = Object.fromEntries(axisDefinitions.map(([category, first, second], axisIndex) => [
    category, ((mask >> axisIndex) & 1) ? second : first
  ]))
  const { persona } = computePersonaFromAnswers(v2Questions, clearProfileAnswers(signature))
  exactProfileDistribution[persona.slug] = (exactProfileDistribution[persona.slug] || 0) + 1
}
console.log('Persona distribution for all 32 clear axis profiles:', exactProfileDistribution)
assert.ok(Object.keys(exactProfileDistribution).length >= 10, 'The persona map is not diverse enough across the full axis space.')
assert.ok(Math.max(...Object.values(exactProfileDistribution)) <= 5, 'One persona absorbs too many axis profiles.')

// 2) Every persona's own signature gives that persona, with clear axes.
for (const persona of PERSONAS) {
  const result = computePersonaFromAnswers(v2Questions, clearProfileAnswers(persona.signature))
  assert.equal(result.persona.slug, persona.slug, `Signature of ${persona.slug} does not map back to it.`)
  assert.equal(result.axisStrength.hands_mind, 'nette')
}

// 3) Agreeing with both poles of an axis = balanced axis, without randomness.
{
  const base = clearProfileAnswers(PERSONAS[0].signature)
  const balancedA = { ...base }
  const balancedB = { ...base }
  answerAxis(balancedA, 'risk_safety', 'audace', RATHER_YES, RATHER_YES)
  answerAxis(balancedB, 'risk_safety', 'audace', TOTALLY, TOTALLY)
  const resultA = computePersonaFromAnswers(v2Questions, balancedA)
  const resultB = computePersonaFromAnswers(v2Questions, balancedB)
  assert.equal(resultA.axisStrength.risk_safety, 'equilibre')
  assert.equal(resultA.persona.slug, resultB.persona.slug, 'Equivalent balanced answers gave different personas.')
  assert.equal(resultA.profile.risk_safety, resultA.persona.signature.risk_safety)

  // Someone who answers "Plutôt oui" to everything gets a stable result.
  const allYes = Object.fromEntries(v2Questions.map((question) => [question.id, RATHER_YES]))
  const first = computePersonaFromAnswers(v2Questions, allYes)
  assert.ok(Object.values(first.axisStrength).every((level) => level === 'equilibre'))
  assert.equal(computePersonaFromAnswers([...v2Questions].reverse(), allYes).persona.slug, first.persona.slug)
}

// 4) Nuance: "Plutôt" answers give a moderate axis, mixed answers a light one.
{
  const moderate = clearProfileAnswers(PERSONAS[0].signature)
  answerAxis(moderate, 'hands_mind', 'mains', RATHER_YES, RATHER_NOT)
  assert.equal(computePersonaFromAnswers(v2Questions, moderate).axisStrength.hands_mind, 'moderee')
  assert.equal(computePersonaFromAnswers(v2Questions, moderate).profile.hands_mind, 'mains')

  const light = clearProfileAnswers(PERSONAS[0].signature)
  answerAxis(light, 'hands_mind', 'tete', TOTALLY, RATHER_YES)
  assert.equal(computePersonaFromAnswers(v2Questions, light).axisStrength.hands_mind, 'legere')
  assert.equal(computePersonaFromAnswers(v2Questions, light).profile.hands_mind, 'tete')
}

// 5) Interests are reported for the LLM but never change the persona.
{
  const base = clearProfileAnswers(PERSONAS[3].signature)
  const social = { ...base }
  const creative = { ...base }
  answerInterests(social, { S: TOTALLY, E: RATHER_YES, I: NOT_AT_ALL, A: NOT_AT_ALL, R: NOT_AT_ALL })
  answerInterests(creative, { A: TOTALLY, R: RATHER_YES, I: NOT_AT_ALL, S: NOT_AT_ALL, E: NOT_AT_ALL })
  const socialResult = computePersonaFromAnswers(v2Questions, social)
  const creativeResult = computePersonaFromAnswers(v2Questions, creative)
  assert.equal(socialResult.persona.slug, PERSONAS[3].slug)
  assert.equal(creativeResult.persona.slug, PERSONAS[3].slug, 'Interests must not influence the persona.')
  assert.deepEqual(socialResult.topInterests.slice(0, 2), ['S', 'E'])
  assert.deepEqual(creativeResult.topInterests.slice(0, 2), ['A', 'R'])
}

// 6) Every statement shows the same 4 answers; the answer stored is the label.
{
  const choices = getAnswerChoices(v2Questions[0])
  assert.deepEqual(choices.map((choice) => choice.label), ['Pas du tout', 'Plutôt pas', 'Plutôt oui', 'Carrément'])
  assert.deepEqual(choices.map((choice) => choice.answer), choices.map((choice) => choice.label))
}

// 7) Legacy v1 binary answers (bare labels, 4 questions per axis) still map to personas,
//    and identical axis profiles get the same persona whatever the answer order.
{
  const legacyQuestions = axisDefinitions.flatMap(([category, firstPole, secondPole], axisIndex) => (
    Array.from({ length: 4 }, (_, questionIndex) => ({
      id: 500 + axisIndex * 10 + questionIndex,
      category,
      options: [
        { label: `${category}-first-${questionIndex}`, value: firstPole },
        { label: `${category}-second-${questionIndex}`, value: secondPole }
      ]
    }))
  ))
  assert.deepEqual(getAnswerChoices(legacyQuestions[0]).map((choice) => choice.level), [0, 3])
  const legacy = legacyQuestions[0]
  for (const [prefix, strength] of [['Plutôt', 2], ['Un peu', 1], ['Clairement', 2]]) {
    const answer = `${prefix} : ${legacy.options[1].label}`
    assert.equal(parseAnswer(legacy, answer).signed, strength)
    assert.equal(parseAnswer(legacy, answer).value, legacy.options[1].value)
    assert.equal(getAnswerChoiceIndex(legacy, answer), 1)
    assert.equal(stripAnswerStrength(answer), legacy.options[1].label)
  }
  assert.equal(stripAnswerStrength(RATHER_YES), RATHER_YES)
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
