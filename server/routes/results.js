import express from 'express'
import { supabase, supabaseAdmin } from '../config/supabase.js'
import { authenticateToken, optionalAuth } from '../middleware/auth.js'

const router = express.Router()

// Get latest results for a user
router.get('/latest', authenticateToken, async (req, res) => {
  return res.status(410).json({
    error: 'Legacy simple results are disabled. Use /api/analysis/my-results.'
  })
})

// Generate results from questionnaire responses
router.post('/generate', authenticateToken, async (req, res) => {
  return res.status(410).json({
    error: 'Legacy simple results generation is disabled. Use /api/analysis/generate-analysis.'
  })
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

export default router
