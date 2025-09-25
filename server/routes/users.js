import express from 'express'
import { supabase, supabaseAdmin } from '../config/supabase.js'
import { authenticateToken } from '../middleware/auth.js'

const router = express.Router()

// Get user profile
router.get('/profile', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id

    // Use admin client when available to satisfy RLS on server-side operations
    const db = supabaseAdmin || supabase

    const { data, error } = await db
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()

    if (error && error.code !== 'PGRST116') {
      return res.status(400).json({ error: error.message })
    }

    res.json({ profile: data })
  } catch (error) {
    console.error('Profile fetch error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Update user profile
router.put('/profile', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id
    const profileData = req.body

    // Remove sensitive fields that shouldn't be updated directly
    delete profileData.id
    delete profileData.created_at
    delete profileData.updated_at
    // Use admin client when available; Express auth ensures the user can only modify their own row
    const db = supabaseAdmin || supabase

    const { data, error } = await db
      .from('profiles')
      .upsert({
        id: userId,
        ...profileData,
        updated_at: new Date().toISOString()
      })
      .select()
      .single()

    if (error) {
      return res.status(400).json({ error: error.message })
    }

    res.json({
      message: 'Profile updated successfully',
      profile: data
    })
  } catch (error) {
    console.error('Profile update error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Get current user info
router.get('/me', authenticateToken, async (req, res) => {
  try {
    res.json({ user: req.user })
  } catch (error) {
    console.error('User info error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router

// Extra info saving endpoint
router.post('/profile/extra-info', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id
    const { entries } = req.body || {}
    if (!Array.isArray(entries) || entries.length === 0) {
      return res.status(400).json({ error: 'entries must be a non-empty array' })
    }

    const rows = entries
      .filter(e => e && e.question_id && e.question_text)
      .map(e => ({
        user_id: userId,
        question_id: String(e.question_id),
        question_text: String(e.question_text),
        answer_text: e.answer_text != null ? String(e.answer_text) : null
      }))

    if (rows.length === 0) {
      return res.status(400).json({ error: 'No valid entries' })
    }

    const db = supabaseAdmin || supabase
    const { error } = await db.from('informations_complementaires').insert(rows)
    if (error) return res.status(400).json({ error: error.message })

    res.json({ message: 'Saved' })
  } catch (error) {
    console.error('Extra info save error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})
