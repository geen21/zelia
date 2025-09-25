import express from 'express'
import { supabase } from '../config/supabase.js'
import { authenticateToken, optionalAuth } from '../middleware/auth.js'

const router = express.Router()

// Get all activities (with optional filtering)
router.get('/', optionalAuth, async (req, res) => {
  try {
    const { category, search, limit = 50, offset = 0 } = req.query

    let query = supabase
      .from('activities')
      .select('*')
      .range(offset, offset + limit - 1)
      .order('created_at', { ascending: false })

    if (category) {
      query = query.eq('category', category)
    }

    if (search) {
      query = query.or(`title.ilike.%${search}%,description.ilike.%${search}%`)
    }

    const { data, error, count } = await query

    if (error) {
      return res.status(400).json({ error: error.message })
    }

    res.json({
      activities: data,
      total: count,
      limit: parseInt(limit),
      offset: parseInt(offset)
    })
  } catch (error) {
    console.error('Activities fetch error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Get activity by ID
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const { id } = req.params

    const { data, error } = await supabase
      .from('activities')
      .select('*')
      .eq('id', id)
      .single()

    if (error) {
      return res.status(404).json({ error: 'Activity not found' })
    }

    res.json({ activity: data })
  } catch (error) {
    console.error('Activity fetch error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Create activity (authenticated users only)
router.post('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id
    const activityData = {
      ...req.body,
      user_id: userId,
      created_at: new Date().toISOString()
    }

    const { data, error } = await supabase
      .from('activities')
      .insert([activityData])
      .select()
      .single()

    if (error) {
      return res.status(400).json({ error: error.message })
    }

    res.status(201).json({
      message: 'Activity created successfully',
      activity: data
    })
  } catch (error) {
    console.error('Activity creation error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Update activity
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
      .from('activities')
      .update(updateData)
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single()

    if (error) {
      return res.status(400).json({ error: error.message })
    }

    res.json({
      message: 'Activity updated successfully',
      activity: data
    })
  } catch (error) {
    console.error('Activity update error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Delete activity
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params
    const userId = req.user.id

    const { error } = await supabase
      .from('activities')
      .delete()
      .eq('id', id)
      .eq('user_id', userId)

    if (error) {
      return res.status(400).json({ error: error.message })
    }

    res.json({ message: 'Activity deleted successfully' })
  } catch (error) {
    console.error('Activity deletion error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
