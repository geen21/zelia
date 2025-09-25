import express from 'express'
import { supabase, supabaseAdmin } from '../config/supabase.js'
import { authenticateToken, optionalAuth } from '../middleware/auth.js'

const router = express.Router()

// Get questionnaire questions
router.get('/questions', optionalAuth, async (req, res) => {
  try {
    const db = supabaseAdmin || supabase
    const qType = (req.query.type || req.query.questionnaire_type || 'inscription').toString()
    // Fetch up to 50 inscription questions from DB
    // Try selecting expected columns; if it fails due to column mismatch, fall back to selecting all
    let data, error
    {
      const res = await db
        .from('questions')
        .select('id, content, questionnaire_type')
        .eq('questionnaire_type', qType)
        .order('id', { ascending: true })
        .limit(50)
      data = res.data; error = res.error
    }
    if (error && /column .* does not exist/i.test(error.message || '')) {
      const res2 = await db
        .from('questions')
        .select('*')
        .order('id', { ascending: true })
        .limit(50)
      data = res2.data; error = res2.error
    }

    if (error) {
      console.error('Questions fetch error:', error)
      return res.status(500).json({
        error: 'Failed to fetch questions',
        ...(process.env.NODE_ENV !== 'production' && { details: error.message || String(error) })
      })
    }

    // Shape to match client expectations: { id, contenu }
    const questions = (data || []).map((q) => ({ id: q.id, contenu: q.content ?? q.contenu ?? q.question ?? q.text }))
    return res.json(questions)
  } catch (error) {
    console.error('Questions fetch error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Submit questionnaire responses
router.post('/submit', authenticateToken, async (req, res) => {
  try {
    const db = supabaseAdmin || supabase
    const userId = req.user.id
    const questionnaireType = (req.query.type || req.query.questionnaire_type || req.body?.questionnaireType || 'inscription').toString()
    const payloadResponses = Array.isArray(req.body?.responses)
      ? req.body.responses
      : Array.isArray(req.body?.answers)
        ? req.body.answers
        : null

    if (!payloadResponses) {
      return res.status(400).json({ error: 'An array of answers/responses is required' })
    }

    // Normalize to { question_id, answer }
    const normalized = payloadResponses
      .map((r) => ({
        question_id: Number(r.question_id),
        answer: typeof r.answer === 'string' ? r.answer : String(r.answer)
      }))
      .filter((r) => Number.isFinite(r.question_id) && r.answer)

    if (normalized.length === 0) {
      return res.status(400).json({ error: 'No valid answers provided' })
    }

    // Replace existing responses for this user and questionnaire_type
    const { error: delError } = await db
      .from('user_responses')
      .delete()
      .eq('user_id', userId)
      .eq('questionnaire_type', questionnaireType)

    if (delError) {
      console.error('Delete previous responses error:', delError)
      return res.status(500).json({ error: 'Failed to reset previous responses' })
    }

    const rows = normalized.map((r) => ({
      user_id: userId,
      question_id: r.question_id,
      response: r.answer,
      questionnaire_type: questionnaireType
    }))

    const { data, error } = await db
      .from('user_responses')
      .insert(rows)
      .select()

    if (error) {
      console.error('Insert responses error:', error)
      return res.status(400).json({ error: error.message })
    }

    return res.status(201).json({
      message: 'Questionnaire submitted successfully',
      count: data?.length || 0
    })
  } catch (error) {
    console.error('Questionnaire submission error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Submit questionnaire responses (temporary storage for pre-registration)
router.post('/submit/temp', async (req, res) => {
  try {
    const payloadResponses = Array.isArray(req.body?.responses)
      ? req.body.responses
      : Array.isArray(req.body?.answers)
        ? req.body.answers
        : null

    if (!payloadResponses) {
      return res.status(400).json({ error: 'An array of answers/responses is required' })
    }

    // Normalize responses
    const normalized = payloadResponses
      .map((r) => ({
        question_id: Number(r.question_id),
        answer: typeof r.answer === 'string' ? r.answer : String(r.answer)
      }))
      .filter((r) => Number.isFinite(r.question_id) && r.answer)

    if (normalized.length === 0) {
      return res.status(400).json({ error: 'No valid answers provided' })
    }

    // For now, just acknowledge the responses - they'll be stored during registration
    res.status(201).json({
      message: 'Questionnaire responses received for pre-registration',
      count: normalized.length,
      responses: normalized
    })
  } catch (error) {
    console.error('Temp questionnaire submission error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
