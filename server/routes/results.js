import express from 'express'
import { supabase, supabaseAdmin } from '../config/supabase.js'
import { authenticateToken, optionalAuth } from '../middleware/auth.js'

const router = express.Router()

// Get latest results for a user
router.get('/latest', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id
    const db = supabaseAdmin || supabase

    // Pull user responses (inscription)
    const { data, error } = await db
      .from('user_responses')
      .select('question_id, response, created_at, questionnaire_type')
      .eq('user_id', userId)
      .eq('questionnaire_type', 'inscription')
      .order('created_at', { ascending: true })

    if (error) {
      return res.status(400).json({ error: error.message })
    }

    if (!data || data.length === 0) {
      return res.json({
        results: null,
        has_completed_questionnaire: false,
        message: 'No questionnaire completed yet'
      })
    }

    const responses = data.map(r => ({ question_id: r.question_id, answer: r.response }))
    const analysis = generateResultsFromResponses(responses)

    res.json({
      results: {
        questionnaire_type: 'inscription',
        submitted_at: data[data.length - 1]?.created_at,
        analysis
      },
      has_completed_questionnaire: true
    })
  } catch (error) {
    console.error('Latest results fetch error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Generate results from questionnaire responses
router.post('/generate', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id
    const { type = 'inscription' } = req.body
    const db = supabaseAdmin || supabase

    const { data: rows, error: responseError } = await db
      .from('user_responses')
      .select('question_id, response, created_at')
      .eq('user_id', userId)
      .eq('questionnaire_type', 'inscription')
      .order('created_at', { ascending: true })

    if (responseError || !rows || rows.length === 0) {
      return res.status(404).json({ error: 'No questionnaire responses found' })
    }

    const responses = rows.map(r => ({ question_id: r.question_id, answer: r.response }))
    const analysis = generateResultsFromResponses(responses)

    const { error: resultError } = await db
      .from('user_results')
      .upsert({
        user_id: userId,
        questionnaire_type: 'inscription',
        skills_data: analysis, // store analysis JSON into skills_data for now
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id,questionnaire_type' })

    if (resultError) {
      console.error('Results storage error:', resultError)
    }

    res.json({ message: 'Results generated successfully', analysis, type })
  } catch (error) {
    console.error('Results generation error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Update user avatar information
router.put('/avatar', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id
    const avatarData = req.body
    const db = supabaseAdmin || supabase

    // Fetch current data
    const { data: existing, error: fetchErr } = await db
      .from('profiles')
      .select('institution_data, avatar_json')
      .eq('id', userId)
      .single()

    if (fetchErr && fetchErr.code !== 'PGRST116') {
      return res.status(400).json({ error: fetchErr.message })
    }

    // Update both avatar fields for compatibility
    const institution_data = existing?.institution_data || {}
    const updated_institution_data = { ...institution_data, avatar: { url: avatarData.url, config: avatarData } }
    
    // Store avatar data in both places
    const updateData = {
      id: userId,
      institution_data: updated_institution_data,
      avatar_json: avatarData,
      avatar: avatarData.url || avatarData.provider || 'dicebear',
      updated_at: new Date().toISOString()
    }

    const { error: upsertErr } = await db
      .from('profiles')
      .upsert(updateData)

    if (upsertErr) {
      return res.status(400).json({ error: upsertErr.message })
    }

    res.json({ message: 'Avatar updated successfully', avatar: avatarData })
  } catch (error) {
    console.error('Avatar update error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Get user's avatar information
router.get('/avatar', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id
    const db = supabaseAdmin || supabase
    const { data, error } = await db
      .from('profiles')
      .select('institution_data, avatar_json, avatar')
      .eq('id', userId)
      .single()

    if (error && error.code !== 'PGRST116') {
      return res.status(400).json({ error: error.message })
    }

    // Try to get avatar from different sources
    const avatar = data?.institution_data?.avatar || data?.avatar_json || null
    const avatar_url = avatar?.url || data?.avatar || null
    
    res.json({
      avatar_url: avatar_url,
      avatar_config: avatar?.config || avatar || null
    })
  } catch (error) {
    console.error('Avatar fetch error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Store avatar for pre-registration (no auth required)
router.post('/avatar/temp', async (req, res) => {
  try {
    const avatarData = req.body
    // For now, just acknowledge the avatar data
    // In production, you might want to store this temporarily in a cache/session
    res.json({ 
      message: 'Avatar data received for pre-registration',
      avatar: avatarData 
    })
  } catch (error) {
    console.error('Temp avatar storage error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Helper function to generate results from questionnaire responses
function generateResultsFromResponses(responses) {
  if (!Array.isArray(responses)) {
    return {
      personality_type: 'Unknown',
      strengths: [],
      recommendations: [],
      career_matches: []
    }
  }

  // Simple analysis based on responses
  const analysis = {
    personality_type: 'Analytical',
    strengths: ['Problem Solving', 'Communication', 'Adaptability'],
    recommendations: [
      'Consider roles in technology or consulting',
      'Develop leadership skills',
      'Explore continuing education opportunities'
    ],
    career_matches: [
      { title: 'Software Developer', match_percentage: 85 },
      { title: 'Business Analyst', match_percentage: 78 },
      { title: 'Project Manager', match_percentage: 72 }
    ],
    response_count: responses.length,
    completion_date: new Date().toISOString()
  }

  return analysis
}

export default router
