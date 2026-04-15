import express from 'express'
import { supabaseAdmin } from '../config/supabase.js'
import { authenticateToken } from '../middleware/auth.js'

const router = express.Router()

// GET /api/ecoles/partenaires - List all partner school formations
router.get('/partenaires', authenticateToken, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('ecoles_partenaires')
      .select('*')
      .order('school_name')
      .order('city')

    if (error) throw error
    res.json({ formations: data || [] })
  } catch (e) {
    console.error('GET /ecoles/partenaires error:', e)
    res.status(500).json({ error: 'Failed to fetch formations' })
  }
})

// GET /api/ecoles/matched - Get formations matched to user profile
router.get('/matched', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id

    // Fetch user's extra info for matching
    const { data: extraInfo, error: extraError } = await supabaseAdmin
      .from('user_extra_info')
      .select('question_id, answer_text')
      .eq('user_id', userId)

    if (extraError) throw extraError

    const entries = extraInfo || []
    const entryMap = new Map(entries.map((e) => [e.question_id, e.answer_text]))

    // Extract matching criteria from user data
    const topDomains = entryMap.get('niveau11_top3') || ''
    const studyLevel = entryMap.get('niveau22_study_level') || entryMap.get('niveau22_budget_etudes') || ''
    const location = entryMap.get('niveau22_location') || entryMap.get('niveau22_city_preference') || ''

    // Fetch all formations
    const { data: formations, error: formError } = await supabaseAdmin
      .from('ecoles_partenaires')
      .select('*')

    if (formError) throw formError
    if (!formations || formations.length === 0) {
      return res.json({ matched: [] })
    }

    // Simple matching algorithm: score each formation
    const scored = formations.map((f) => {
      let score = 0

      // Domain match
      if (topDomains && f.domain) {
        const domains = topDomains.toLowerCase().split(',').map((d) => d.trim())
        const fDomain = (f.domain || '').toLowerCase()
        if (domains.some((d) => fDomain.includes(d) || d.includes(fDomain))) {
          score += 40
        }
      }

      // Location match
      if (location && f.city) {
        const loc = location.toLowerCase()
        const city = f.city.toLowerCase()
        if (loc.includes(city) || city.includes(loc)) {
          score += 30
        }
      }

      // Study level match
      if (studyLevel && f.diploma_level) {
        const sl = studyLevel.toLowerCase()
        const dl = (f.diploma_level || '').toLowerCase()
        if (sl.includes(dl) || dl.includes(sl)) {
          score += 30
        }
      }

      return { ...f, match_score: score }
    })

    // Return formations with score > 0, sorted by score
    const matched = scored
      .filter((f) => f.match_score > 0)
      .sort((a, b) => b.match_score - a.match_score)
      .slice(0, 20)

    res.json({ matched })
  } catch (e) {
    console.error('GET /ecoles/matched error:', e)
    res.status(500).json({ error: 'Failed to fetch matched formations' })
  }
})

// POST /api/ecoles/submit - Submit application to a formation
router.post('/submit', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id
    const { formation_id } = req.body

    if (!formation_id) {
      return res.status(400).json({ error: 'formation_id is required' })
    }

    // Check for duplicate submission
    const { data: existing } = await supabaseAdmin
      .from('contact_submitted')
      .select('id')
      .eq('user_id', userId)
      .eq('formation_id', formation_id)
      .limit(1)

    if (existing && existing.length > 0) {
      return res.status(409).json({ error: 'Already submitted' })
    }

    const { error } = await supabaseAdmin
      .from('contact_submitted')
      .insert({
        user_id: userId,
        formation_id,
        submitted_at: new Date().toISOString()
      })

    if (error) throw error
    res.json({ success: true })
  } catch (e) {
    console.error('POST /ecoles/submit error:', e)
    res.status(500).json({ error: 'Failed to submit application' })
  }
})

// GET /api/ecoles/my-submissions - Get user's past submissions
router.get('/my-submissions', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id

    const { data, error } = await supabaseAdmin
      .from('contact_submitted')
      .select('id, formation_id, submitted_at')
      .eq('user_id', userId)
      .order('submitted_at', { ascending: false })

    if (error) throw error
    res.json({ submissions: data || [] })
  } catch (e) {
    console.error('GET /ecoles/my-submissions error:', e)
    res.status(500).json({ error: 'Failed to fetch submissions' })
  }
})

export default router
