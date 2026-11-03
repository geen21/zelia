import { computePersonaFromAnswers } from '../../client/src/lib/personas.js'
import { INTEREST_LABELS, isDilemmaQuestion, stripAnswerStrength } from '../../client/src/lib/questionScale.js'

export function resolveInterpretation(interpretations, response) {
  if (!interpretations || typeof interpretations !== 'object') return null
  const label = stripAnswerStrength(response)
  return interpretations[response] || interpretations[label] || interpretations[`Clairement : ${label}`] || null
}

export const QUESTIONNAIRE_NUANCE_INSTRUCTION = `Le questionnaire v5 contient des phrases comparatives « je préfère une activité plutôt qu'une autre ». « Carrément » et « Plutôt oui » favorisent la première activité, nettement ou légèrement. « Pas du tout » et « Plutôt pas » favorisent l'alternative, nettement ou légèrement : ce ne sont pas des rejets des deux activités. La v4 enregistrait directement l'activité choisie ; ses premiers préfixes « Clairement : » et « Plutôt : » indiquaient une préférence nette ou légère. La v3 utilisait l'adhésion à une affirmation sans comparaison. Les anciennes réponses binaires « Plutôt : <choix> » sont fortes, « Un peu : <choix> » légères. L'activité moins choisie n'est pas détestée ni inaccessible. Croise plusieurs dilemmes avant de déprioriser une piste ; une réponse isolée ne doit jamais exclure un secteur. Un axe équilibré n'est pas un trait marqué. Ces réponses sont des préférences relatives, pas des aptitudes mesurées ni un test psychométrique validé.`

export function buildOrientationQuestionnaireContext(responses) {
  const questions = responses
    .filter((item) => item.questions)
    .map((item) => ({ ...item.questions, id: item.question_id }))
  const answers = Object.fromEntries(responses.map((item) => [item.question_id, item.response]))
  const { topInterests, lowerPriorityInterests } = computePersonaFromAnswers(questions, answers)
  const hasDilemmas = questions.some((question) => isDilemmaQuestion(question)
    || (Array.isArray(question.options) && question.options.some((option) => option.alternative)))
  const interestSummary = topInterests.map((code) => INTEREST_LABELS[code]).join(' ; ')
  const lowerPrioritySummary = lowerPriorityInterests.map((code) => INTEREST_LABELS[code]).join(' ; ')
  const interestInstruction = [
    interestSummary
      ? `Familles d'activités relativement préférées : ${interestSummary}.`
      : `Aucune famille d'activités ne se détache : garde des pistes variées.`,
    lowerPrioritySummary
      ? `Familles moins choisies sur plusieurs comparaisons : ${lowerPrioritySummary}. Dépriorise-les progressivement, sans exclusion définitive ni veto sur une préférence métier explicite.`
      : '',
    `Les familles RIASEC regroupent des activités différentes : retiens seulement celles effectivement choisies dans les réponses détaillées. Préférer transmettre, animer ou accompagner des démarches ne signifie pas vouloir soigner. Ni la famille S, ni un persona comme « Le Protecteur », ni l'envie d'être utile ne justifient un métier infirmier ou de soin sans intérêt explicite pour les soins. Une activité présente seulement dans une alternative moins choisie n'est pas une envie déclarée. Un choix de nature ne prouve pas un goût du sport, ni un choix scientifique un goût de la programmation.`,
    hasDilemmas
      ? `Le classement provient des réponses enregistrées, normalisées par le nombre de comparaisons de chaque famille. Ce n'est ni un niveau absolu d'intérêt ni une probabilité de réussite. En cas de choix contradictoires, explique l'hésitation plutôt que d'inventer une préférence nette.`
      : ''
  ].filter(Boolean).join(' ')

  return { interestSummary, lowerPrioritySummary, interestInstruction }
}
