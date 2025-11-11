import express from 'express'
import { supabase } from '../config/supabase.js'
import { authenticateToken, optionalAuth } from '../middleware/auth.js'

const router = express.Router()

// Get all job listings
router.get('/', optionalAuth, async (req, res) => {
  try {
    const { location, category, search, limit = 50, offset = 0 } = req.query

    const parsedLimit = Math.min(Number.parseInt(limit, 10) || 50, 100)
    const parsedOffset = Math.max(Number.parseInt(offset, 10) || 0, 0)

    let query = supabase
      .from('jobs')
      .select('*')
      .range(parsedOffset, parsedOffset + parsedLimit - 1)
      .order('created_at', { ascending: false })

    if (location) {
      query = query.eq('location', location)
    }

    if (category) {
      query = query.eq('category', category)
    }

    if (search) {
      const rawWords = search
        .split(/[\s,;:/]+/)
        .map((word) => word.trim())
        .filter(Boolean)

      const sanitizedWords = Array.from(new Set(rawWords.map((word) =>
        word
          .replace(/'/g, "''")
          .replace(/,/g, '\\,')
      ).filter(Boolean)))

      const targetColumns = ['title', 'description', 'company']
      const orFilters = []

      sanitizedWords.slice(0, 6).forEach((word) => {
        targetColumns.forEach((column) => {
          orFilters.push(`${column}.ilike.%${word}%`)
        })
      })

      if (orFilters.length === 0) {
        const fallback = search
          .trim()
          .replace(/'/g, "''")
          .replace(/,/g, '\\,')
        if (fallback) {
          targetColumns.forEach((column) => {
            orFilters.push(`${column}.ilike.%${fallback}%`)
          })
        }
      }

      if (orFilters.length > 0) {
        query = query.or(orFilters.join(','))
      }
    }

    const { data, error, count } = await query

    if (error) {
      return res.status(400).json({ error: error.message })
    }

    res.json({
      jobs: data,
      total: typeof count === 'number' ? count : (Array.isArray(data) ? data.length : 0),
      limit: parsedLimit,
      offset: parsedOffset
    })
  } catch (error) {
    console.error('Jobs fetch error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Get job by ID
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const { id } = req.params

    const { data, error } = await supabase
      .from('jobs')
      .select('*')
      .eq('id', id)
      .single()

    if (error) {
      return res.status(404).json({ error: 'Job not found' })
    }

    res.json({ job: data })
  } catch (error) {
    console.error('Job fetch error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Create job listing (authenticated users only)
router.post('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id
    const jobData = {
      ...req.body,
      user_id: userId,
      created_at: new Date().toISOString()
    }

    const { data, error } = await supabase
      .from('jobs')
      .insert([jobData])
      .select()
      .single()

    if (error) {
      return res.status(400).json({ error: error.message })
    }

    res.status(201).json({
      message: 'Job created successfully',
      job: data
    })
  } catch (error) {
    console.error('Job creation error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Update job listing
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
      .from('jobs')
      .update(updateData)
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single()

    if (error) {
      return res.status(400).json({ error: error.message })
    }

    res.json({
      message: 'Job updated successfully',
      job: data
    })
  } catch (error) {
    console.error('Job update error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Delete job listing
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params
    const userId = req.user.id

    const { error } = await supabase
      .from('jobs')
      .delete()
      .eq('id', id)
      .eq('user_id', userId)

    if (error) {
      return res.status(400).json({ error: error.message })
    }

    res.json({ message: 'Job deleted successfully' })
  } catch (error) {
    console.error('Job deletion error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
