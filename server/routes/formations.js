import express from 'express'
import { supabase } from '../config/supabase.js'
import { authenticateToken, optionalAuth } from '../middleware/auth.js'

const router = express.Router()

// Get all formations/courses
router.get('/', optionalAuth, async (req, res) => {
  try {
    const { category, level, search, limit = 50, offset = 0 } = req.query

    let query = supabase
      .from('formations')
      .select('*')
      .range(offset, offset + limit - 1)
      .order('created_at', { ascending: false })

    if (category) {
      query = query.eq('category', category)
    }

    if (level) {
      query = query.eq('level', level)
    }

    if (search) {
      query = query.or(`title.ilike.%${search}%,description.ilike.%${search}%,provider.ilike.%${search}%`)
    }

    const { data, error, count } = await query

    if (error) {
      return res.status(400).json({ error: error.message })
    }

    res.json({
      formations: data,
      total: count,
      limit: parseInt(limit),
      offset: parseInt(offset)
    })
  } catch (error) {
    console.error('Formations fetch error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Get formation by ID
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const { id } = req.params

    const { data, error } = await supabase
      .from('formations')
      .select('*')
      .eq('id', id)
      .single()

    if (error) {
      return res.status(404).json({ error: 'Formation not found' })
    }

    res.json({ formation: data })
  } catch (error) {
    console.error('Formation fetch error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Create formation (authenticated users only)
router.post('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id
    const formationData = {
      ...req.body,
      user_id: userId,
      created_at: new Date().toISOString()
    }

    const { data, error } = await supabase
      .from('formations')
      .insert([formationData])
      .select()
      .single()

    if (error) {
      return res.status(400).json({ error: error.message })
    }

    res.status(201).json({
      message: 'Formation created successfully',
      formation: data
    })
  } catch (error) {
    console.error('Formation creation error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Update formation
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params
    const userId = req.user.id
    const updateData = {
      ...req.body,
      updated_at: new Date().toISOString()
    }

    // Remove fields that shouldn't be updated
    delete updateData.id
    delete updateData.user_id
    delete updateData.created_at

    const { data, error } = await supabase
      .from('formations')
      .update(updateData)
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single()

    if (error) {
      return res.status(400).json({ error: error.message })
    }

    res.json({
      message: 'Formation updated successfully',
      formation: data
    })
  } catch (error) {
    console.error('Formation update error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Delete formation
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params
    const userId = req.user.id

    const { error } = await supabase
      .from('formations')
      .delete()
      .eq('id', id)
      .eq('user_id', userId)

    if (error) {
      return res.status(400).json({ error: error.message })
    }

    res.json({ message: 'Formation deleted successfully' })
  } catch (error) {
    console.error('Formation deletion error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
