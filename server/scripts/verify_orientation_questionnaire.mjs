import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { AGREEMENT_LEVELS, getAnswerChoices, getAnswerChoiceIndex, isDilemmaQuestion, parseAnswer, stripAnswerStrength } from '../../client/src/lib/questionScale.js'
import { AXES, PERSONAS, computePersonaFromAnswers } from '../../client/src/lib/personas.js'
import { buildOrientationQuestionnaireContext, QUESTIONNAIRE_NUANCE_INSTRUCTION, resolveInterpretation } from '../utils/orientationQuestionnaireContext.js'

const db = new PGlite()
try {
  await db.exec(`
    CREATE TABLE public.questions (
      id bigint PRIMARY KEY, content text NOT NULL, category text NOT NULL,
      questionnaire_type text NOT NULL, interpretations jsonb NOT NULL
    );
    CREATE TABLE public.user_responses (
      question_id bigint REFERENCES public.questions(id), response text NOT NULL
    );
  `)
  await db.exec(await readFile(new URL('../database/migrate_questions_v2.sql', import.meta.url), 'utf8'))
  await db.query('INSERT INTO public.user_responses VALUES ($1, $2)', [301, 'Un peu : Le préparer en groupe'])
  const originalQuestions = (await db.query('SELECT * FROM public.questions ORDER BY id')).rows
  const originalResponses = (await db.query('SELECT * FROM public.user_responses')).rows
  const migration = await readFile(new URL('../database/migrate_questions_v3.sql', import.meta.url), 'utf8')
  await db.exec(migration)
  const { rows: questions } = await db.query("SELECT * FROM public.questions WHERE questionnaire_type = 'inscription_v3' ORDER BY id")
  assert.equal(questions.length, 20)
  assert.equal(new Set(questions.map((question) => question.content)).size, 20)
  assert.deepEqual(questions.map((question) => question.id), Array.from({ length: 20 }, (_, index) => 400 + index))
  assert.equal(questions.filter((question) => question.category === 'interest').length, 10)
  for (const axis of AXES) {
    const axisQuestions = questions.filter((question) => question.category === axis.id)
    assert.equal(axisQuestions.length, 2)
    assert.deepEqual(axisQuestions.map((question) => question.options[0].value).sort(), [...axis.poles].sort())
  }
  assert.deepEqual([...new Set(questions.filter((question) => question.category === 'interest').map((question) => question.options[0].value))].sort(), ['A', 'E', 'I', 'R', 'S'])

  for (const question of questions) {
    assert.ok(question.content.length <= 95, `Statement too long: ${question.content}`)
    assert.equal(new Set(question.options.map((option) => option.value)).size, 1)
    assert.deepEqual(question.options.map(({ label, level }) => ({ label, level })), AGREEMENT_LEVELS)
    assert.deepEqual(getAnswerChoices(question).map((choice) => choice.answer), [...AGREEMENT_LEVELS].reverse().map(({ label }) => label))
    for (const { label, level } of AGREEMENT_LEVELS) {
      assert.ok(question.interpretations[label], `Missing interpretation for ${question.id}/${label}`)
      assert.equal(parseAnswer(question, label).signed, [-2, -1, 1, 2][level])
    }
    assert.equal(parseAnswer(question, 'Un peu : ancien choix'), null)
  }
  for (const persona of PERSONAS) {
    const answers = Object.fromEntries(questions.map((question) => [
      question.id,
      question.category === 'interest' || question.options[0].value === persona.signature[question.category]
        ? 'Carrément'
        : 'Pas du tout'
    ]))
    assert.equal(computePersonaFromAnswers(questions, answers).persona.slug, persona.slug)
  }

  await db.exec(migration)
  assert.deepEqual((await db.query('SELECT * FROM public.questions WHERE id < 400 ORDER BY id')).rows, originalQuestions)
  assert.deepEqual((await db.query('SELECT * FROM public.user_responses')).rows, originalResponses)
  assert.deepEqual((await db.query("SELECT * FROM public.questions WHERE questionnaire_type = 'inscription_v3' ORDER BY id")).rows, questions)
  const { rows: [historical] } = await db.query(`
    SELECT q.content, q.interpretations, r.response
    FROM public.questions q JOIN public.user_responses r ON r.question_id = q.id
  `)
  assert.equal(historical.content, 'Pour un exposé noté, tu préfères...')
  assert.ok(historical.interpretations[stripAnswerStrength(historical.response)])

  await db.query('INSERT INTO public.user_responses VALUES ($1, $2)', [400, 'Carrément'])
  const beforeV4 = (await db.query('SELECT * FROM public.questions ORDER BY id')).rows
  const responsesBeforeV4 = (await db.query('SELECT * FROM public.user_responses ORDER BY question_id')).rows
  const v4Migration = await readFile(new URL('../database/migrate_questions_v4.sql', import.meta.url), 'utf8')
  await db.exec(v4Migration)
  const { rows: dilemmas } = await db.query("SELECT * FROM public.questions WHERE questionnaire_type = 'inscription_v4' ORDER BY id")
  assert.equal(dilemmas.length, 20)
  assert.deepEqual(dilemmas.map((q) => q.id), Array.from({ length: 20 }, (_, i) => 500 + i))
  assert.equal(new Set(dilemmas.map((q) => q.content)).size, 20)
  const exposure = {}
  const sideExposure = {}
  for (const q of dilemmas) {
    assert.ok(isDilemmaQuestion(q))
    assert.ok(q.content.length <= 95, `Dilemma too long: ${q.content}`)
    const choices = getAnswerChoices(q)
    assert.equal(q.options.length, 2)
    assert.equal(choices.length, 2)
    assert.deepEqual(choices.map((c) => c.label), q.options.map((o) => o.label))
    assert.deepEqual(choices.map((c) => c.strength), [2, 2])
    assert.equal(new Set(choices.map((c) => c.value)).size, 2)
    assert.equal(new Set(choices.map((c) => c.label)).size, 2)
    for (const c of choices) {
      const parsed = parseAnswer(q, c.answer)
      assert.equal(parsed.value, c.value)
      assert.equal(parsed.signed, c.strength)
      assert.notEqual(parsed.alternative, c.value)
      assert.equal(getAnswerChoiceIndex(q, c.answer), c.index)
      assert.match(q.interpretations[c.answer], /Activité choisie/)
      assert.match(q.interpretations[c.answer], /pas un rejet absolu/)
      assert.doesNotMatch(q.interpretations[c.answer], /infirmier|métiers?\s/i)
    }
    for (const invalid of ['Carrément', 'Plutôt oui', 'inconnu', undefined]) {
      assert.equal(parseAnswer(q, invalid), null)
      assert.equal(getAnswerChoiceIndex(q, invalid), -1)
    }
    if (q.category === 'interest') {
      for (const [side, c] of choices.entries()) {
        exposure[c.value] = (exposure[c.value] || 0) + 1
        sideExposure[c.value] ||= [0, 0]
        sideExposure[c.value][side] += 1
      }
    }
  }
  assert.deepEqual(Object.keys(exposure).sort(), ['A', 'C', 'E', 'I', 'R', 'S'])
  assert.ok(Object.values(exposure).every((count) => count >= 3 && count <= 4))
  assert.ok(Object.values(sideExposure).every(([a, b]) => Math.abs(a - b) <= 1))
  for (const axis of AXES) {
    const axisQuestions = dilemmas.filter((q) => q.category === axis.id)
    assert.equal(axisQuestions.length, 2)
    assert.deepEqual(axisQuestions.map((q) => q.options[0].value).sort(), [...axis.poles].sort())
    for (const q of axisQuestions) {
      assert.deepEqual([...new Set(q.options.map((o) => o.value))].sort(), [...axis.poles].sort())
    }
  }
  for (const persona of PERSONAS) {
    const answers = Object.fromEntries(dilemmas.map((q) => [
      q.id,
      getAnswerChoices(q).find((c) => c.strength === 2 && (q.category === 'interest' || c.value === persona.signature[q.category])).answer
    ]))
    const result = computePersonaFromAnswers(dilemmas, answers)
    assert.equal(result.persona.slug, persona.slug)
    assert.ok(Object.values(result.axisStrength).every((s) => s === 'nette'))
  }
  const allFirst = Object.fromEntries(dilemmas.map((q) => [q.id, getAnswerChoices(q)[0].answer]))
  const allLast = Object.fromEntries(dilemmas.map((q) => [q.id, getAnswerChoices(q)[1].answer]))
  const firstProfile = computePersonaFromAnswers(dilemmas, allFirst)
  assert.ok(Object.values(firstProfile.axisStrength).every((s) => s === 'equilibre'))
  assert.equal(firstProfile.persona.slug, computePersonaFromAnswers(dilemmas, allLast).persona.slug)
  const care = dilemmas.find((q) => q.id === 501)
  for (const position of [0, 1]) {
    const c = getAnswerChoices(care)[position]
    const result = computePersonaFromAnswers([care], { [care.id]: c.answer })
    assert.equal(result.interests[c.value], 1)
    assert.equal(result.interests[parseAnswer(care, c.answer).alternative], 0)
    assert.deepEqual(result.lowerPriorityInterests, [], 'One choice must not deprioritize a whole family.')
  }
  // Prefer transmission/animation, but not care. The model must receive that distinction.
  const interestQuestions = dilemmas.filter((q) => q.category === 'interest')
  const relativeAnswers = Object.fromEntries(interestQuestions.map((q) => [
    q.id,
    getAnswerChoices(q).find((c) => c.strength === 2 && (q.id === 501 ? c.value === 'R' : q.options.some((o) => o.value === 'S') ? c.value === 'S' : c.index === 0)).answer
  ]))
  const evidence = interestQuestions.map((q) => ({ question_id: q.id, response: relativeAnswers[q.id], questions: q }))
  const context = buildOrientationQuestionnaireContext(evidence)
  assert.match(context.interestSummary, /transmission/)
  assert.doesNotMatch(context.interestSummary, /soin|infirmier/)
  assert.match(context.interestInstruction, /sans intérêt explicite pour les soins/)
  assert.match(context.interestInstruction, /Dépriorise-les progressivement, sans exclusion définitive/)
  assert.match(QUESTIONNAIRE_NUANCE_INSTRUCTION, /une réponse isolée ne doit jamais exclure un secteur/)
  const scored = computePersonaFromAnswers(interestQuestions, relativeAnswers)
  for (const [code, score] of Object.entries(scored.interests)) {
    const comparisons = interestQuestions.filter((q) => q.options.some((o) => o.value === code))
    const wins = comparisons.filter((q) => parseAnswer(q, relativeAnswers[q.id]).value === code).length
    assert.equal(score, wins / comparisons.length, `Unnormalised score for ${code}`)
  }
  const balanced = interestQuestions.slice(0, 1).concat(interestQuestions.slice(0, 1).map((q) => ({ ...q, id: 999 })))
  const neutral = computePersonaFromAnswers(balanced, { [balanced[0].id]: balanced[0].options[0].label, 999: balanced[1].options[1].label })
  assert.deepEqual(neutral.topInterests, [], 'Ties must not invent a dominant interest.')
  assert.deepEqual(neutral.lowerPriorityInterests, [])

  await db.exec(v4Migration)
  assert.deepEqual((await db.query('SELECT * FROM public.questions WHERE id < 500 ORDER BY id')).rows, beforeV4)
  assert.deepEqual((await db.query('SELECT * FROM public.user_responses ORDER BY question_id')).rows, responsesBeforeV4)
  assert.deepEqual((await db.query("SELECT * FROM public.questions WHERE questionnaire_type = 'inscription_v4' ORDER BY id")).rows, dilemmas)
  // An already-applied four-option v4 migration may have saved prefixed answers.
  const initialOptions = care.options.flatMap((o) => [
    { ...o, label: `Clairement : ${o.label}`, strength: 2 },
    { ...o, label: `Plutôt : ${o.label}`, strength: 1 }
  ])
  const initialQuestion = { ...care, options: initialOptions }
  assert.equal(getAnswerChoices(initialQuestion).length, 2, 'Even the initial v4 database must show only two activities.')
  const initialInterpretations = Object.fromEntries(initialOptions.map((o) => [o.label, `Interprétation de ${o.label}`]))
  for (const choice of getAnswerChoices(initialQuestion)) {
    assert.equal(parseAnswer(initialQuestion, choice.answer).signed, 2, 'A direct binary choice must not become a weak choice on the initial v4 database.')
    assert.equal(resolveInterpretation(initialInterpretations, choice.answer), initialInterpretations[`Clairement : ${choice.answer}`])
  }
  for (const option of initialOptions) {
    assert.equal(parseAnswer(initialQuestion, option.label).signed, option.strength)
    assert.equal(parseAnswer(care, option.label).signed, option.strength)
    assert.equal(getAnswerChoiceIndex(care, option.label), care.options.findIndex((o) => o.value === option.value))
  }
  const historicalV4Answer = initialOptions[1].label
  await db.query('UPDATE public.questions SET options = $1, interpretations = $2 WHERE id = $3', [
    JSON.stringify(initialOptions), JSON.stringify({ [historicalV4Answer]: 'Préférence légère pour les soins, pas une aptitude.' }), care.id
  ])
  await db.query('INSERT INTO public.user_responses VALUES ($1, $2)', [care.id, historicalV4Answer])
  await db.exec(v4Migration)
  const updatedCare = (await db.query('SELECT * FROM public.questions WHERE id = $1', [care.id])).rows[0]
  assert.equal(updatedCare.options.length, 2)
  assert.ok(updatedCare.interpretations[historicalV4Answer], 'Do not erase interpretations of existing v4 answers.')
  assert.equal(parseAnswer(updatedCare, historicalV4Answer).signed, 1)
  assert.equal((await db.query('SELECT response FROM public.user_responses WHERE question_id = $1', [care.id])).rows[0].response, historicalV4Answer)
  await db.exec("UPDATE public.questions SET questionnaire_type = 'other' WHERE id = 500")
  await assert.rejects(db.exec(v4Migration), /already used/)
  await db.exec('ROLLBACK')
  assert.equal((await db.query('SELECT questionnaire_type FROM public.questions WHERE id = 500')).rows[0].questionnaire_type, 'other')

  await db.exec("UPDATE public.questions SET questionnaire_type = 'other' WHERE id = 400")
  await assert.rejects(db.exec(migration), /already used/)
  await db.exec('ROLLBACK')
  assert.equal((await db.query('SELECT questionnaire_type FROM public.questions WHERE id = 400')).rows[0].questionnaire_type, 'other')
  console.log('Orientation v3/v4: actual questions, balanced dilemmas, weighted relative scoring, model context, idempotence and historical answers verified.')
} finally {
  await db.close()
}
