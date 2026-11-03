import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { AGREEMENT_LEVELS, getAnswerChoices, parseAnswer, stripAnswerStrength } from '../../client/src/lib/questionScale.js'
import { AXES, PERSONAS, computePersonaFromAnswers } from '../../client/src/lib/personas.js'

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

  await db.exec("UPDATE public.questions SET questionnaire_type = 'other' WHERE id = 400")
  await assert.rejects(db.exec(migration), /already used/)
  await db.exec('ROLLBACK')
  assert.equal((await db.query('SELECT questionnaire_type FROM public.questions WHERE id = 400')).rows[0].questionnaire_type, 'other')
  console.log('Orientation v3: actual 20 statements, scoring, idempotent migration and historical answers verified.')
} finally {
  await db.close()
}
