import express from 'express'
import { supabase, supabaseAdmin } from '../config/supabase.js'
import { authenticateToken } from '../middleware/auth.js'

const router = express.Router()

// Get user progression
router.get('/:userId', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params
    const requestingUserId = req.user.id

    // Only allow users to access their own progression
    if (userId !== requestingUserId) {
      return res.status(403).json({ error: 'Access denied' })
    }

    const db = supabaseAdmin || supabase

    // Check if user_progression record exists
    const { data: progression, error } = await db
      .from('user_progression')
      .select('*')
      .eq('user_id', userId)
      .single()

    if (error && error.code !== 'PGRST116') {
      return res.status(400).json({ error: error.message })
    }

    // If no progression exists, create initial record
    if (!progression) {
      const { data: newProgression, error: createError } = await db
        .from('user_progression')
        .insert({
          user_id: userId,
          level: 1,
          xp: 0
        })
        .select()
        .single()

      if (createError) {
        return res.status(400).json({ error: createError.message })
      }

      return res.json({
        level: 1,
        xp: 0,
        quests: [],
        perks: []
      })
    }

    res.json({
      level: progression.level,
      xp: progression.xp,
      quests: progression.quests || [],
      perks: progression.perks || []
    })
  } catch (error) {
    console.error('Progression fetch error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Update user progression
router.post('/:userId', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params
    const requestingUserId = req.user.id
    const { level, xp, quests, perks } = req.body

    // Only allow users to update their own progression
    if (userId !== requestingUserId) {
      return res.status(403).json({ error: 'Access denied' })
    }

    const db = supabaseAdmin || supabase

    // Upsert progression record
    const { data, error } = await db
      .from('user_progression')
      .upsert({
        user_id: userId,
        level: level || 1,
        xp: xp || 0,
        quests: quests || [],
        perks: perks || [],
        updated_at: new Date().toISOString()
      })
      .select()
      .single()

    if (error) {
      return res.status(400).json({ error: error.message })
    }

    res.json({
      message: 'Progression updated successfully',
      progression: data
    })
  } catch (error) {
    console.error('Progression update error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Get progression leaderboard (optional feature)
router.get('/leaderboard', authenticateToken, async (req, res) => {
  try {
    const { limit = 10 } = req.query
    const db = supabaseAdmin || supabase

    const { data: leaderboard, error } = await db
      .from('user_progression')
      .select(`
        level,
        xp,
        profiles!inner(first_name, last_name, avatar)
      `)
      .order('level', { ascending: false })
      .order('xp', { ascending: false })
      .limit(parseInt(limit))

    if (error) {
      return res.status(400).json({ error: error.message })
    }

    res.json({ leaderboard })
  } catch (error) {
    console.error('Leaderboard fetch error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
