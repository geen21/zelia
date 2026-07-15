import { computePersonaFromAnswers } from '../src/lib/personas.js'

const axisDefinitions = [
  ['hands_mind', 'mains', 'tete'],
  ['solo_team', 'solo', 'equipe'],
  ['creative_structured', 'creatif', 'structure'],
  ['field_office', 'terrain', 'bureau'],
  ['risk_safety', 'audace', 'securite']
]

const questions = axisDefinitions.flatMap(([category, firstPole, secondPole], axisIndex) => (
  Array.from({ length: 4 }, (_, questionIndex) => ({
    id: axisIndex * 10 + questionIndex,
    category,
    options: [
      { label: `${category}-first-${questionIndex}`, value: firstPole },
      { label: `${category}-second-${questionIndex}`, value: secondPole }
    ]
  }))
))

const combinations = [[0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3]]
const distribution = {}

for (let seed = 0; seed < 96; seed += 1) {
  const answers = {}
  axisDefinitions.forEach(([category], axisIndex) => {
    const firstPoleIndexes = combinations[Math.floor(seed / (6 ** axisIndex)) % combinations.length]
    questions
      .filter((question) => question.category === category)
      .forEach((question, questionIndex) => {
        answers[question.id] = question.options[firstPoleIndexes.includes(questionIndex) ? 0 : 1].label
      })
  })

  const { persona } = computePersonaFromAnswers(questions, answers)
  distribution[persona.slug] = (distribution[persona.slug] || 0) + 1
}

console.log('Persona distribution for tied axis scores:', distribution)

if (Object.keys(distribution).length < 3 || (distribution['explorateur-creatif'] || 0) >= 48) {
  throw new Error('Tied answers still collapse into the Explorateur Creatif persona.')
}

const exactProfileDistribution = {}

for (let mask = 0; mask < 2 ** axisDefinitions.length; mask += 1) {
  const answers = {}
  axisDefinitions.forEach(([category], axisIndex) => {
    const optionIndex = (mask >> axisIndex) & 1
    questions
      .filter((question) => question.category === category)
      .forEach((question) => {
        answers[question.id] = question.options[optionIndex].label
      })
  })

  const { persona } = computePersonaFromAnswers(questions, answers)
  exactProfileDistribution[persona.slug] = (exactProfileDistribution[persona.slug] || 0) + 1
}

console.log('Persona distribution for all 32 exact axis profiles:', exactProfileDistribution)

const mostFrequentProfileCount = Math.max(...Object.values(exactProfileDistribution))
if (Object.keys(exactProfileDistribution).length < 10 || mostFrequentProfileCount > 5) {
  throw new Error('The persona map is not diverse enough across the full axis space.')
}