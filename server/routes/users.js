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
  delete profileData.has_paid
  delete profileData.stripe_customer_id
  delete profileData.stripe_last_checkout_id
  delete profileData.stripe_last_payment_at
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

// Get current user's extra info entries
router.get('/profile/extra-info', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id
    const db = supabaseAdmin || supabase
    const { data, error } = await db
      .from('informations_complementaires')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })

    if (error) {
      return res.status(400).json({ error: error.message })
    }

    res.json({ entries: data || [] })
  } catch (error) {
    console.error('Extra info fetch error:', error)
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

// Save user grades by subject (Niveau 21)
router.post('/profile/notes', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id
    const { notes } = req.body || {}
    if (!Array.isArray(notes) || notes.length === 0) {
      return res.status(400).json({ error: 'notes must be a non-empty array' })
    }

    const rows = notes
      .filter(n => n && n.subject && n.grade)
      .map(n => ({
        user_id: userId,
        subject: String(n.subject).trim(),
        grade: String(n.grade).trim()
      }))

    if (rows.length === 0) {
      return res.status(400).json({ error: 'No valid notes' })
    }

    const db = supabaseAdmin || supabase
    // Delete previous notes for the user, then insert new ones
    await db.from('user_notes').delete().eq('user_id', userId)
    const { error } = await db.from('user_notes').insert(rows)
    if (error) return res.status(400).json({ error: error.message })

    res.json({ message: 'Saved' })
  } catch (error) {
    console.error('Notes save error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Get user grades
router.get('/profile/notes', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id
    const db = supabaseAdmin || supabase
    const { data, error } = await db
      .from('user_notes')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: true })

    if (error) return res.status(400).json({ error: error.message })

    res.json({ notes: data || [] })
  } catch (error) {
    console.error('Notes fetch error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Save user selected fields/filieres (Niveau 21)
router.post('/profile/fields', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id
    const { fields } = req.body || {}
    if (!Array.isArray(fields) || fields.length === 0) {
      return res.status(400).json({ error: 'fields must be a non-empty array' })
    }

    const rows = fields
      .filter(f => f && (f.type || f.field_type) && (f.degree || f.field_degree))
      .map(f => ({
        user_id: userId,
        field_type: String(f.type || f.field_type).trim(),
        field_degree: String(f.degree || f.field_degree).trim()
      }))

    if (rows.length === 0) {
      return res.status(400).json({ error: 'No valid fields' })
    }

    const db = supabaseAdmin || supabase
    // Delete previous fields for the user, then insert new ones
    await db.from('user_fields').delete().eq('user_id', userId)
    const { error } = await db.from('user_fields').insert(rows)
    if (error) return res.status(400).json({ error: error.message })

    res.json({ message: 'Saved' })
  } catch (error) {
    console.error('Fields save error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Get user selected fields/filieres
router.get('/profile/fields', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id
    const db = supabaseAdmin || supabase
    const { data, error } = await db
      .from('user_fields')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: true })

    if (error) return res.status(400).json({ error: error.message })

    res.json({ fields: data || [] })
  } catch (error) {
    console.error('Fields fetch error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Save user selected schools (Niveau 23)
router.post('/profile/schools', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id
    const { schools, contactAccepted } = req.body || {}
    if (!Array.isArray(schools) || schools.length === 0) {
      return res.status(400).json({ error: 'schools must be a non-empty array' })
    }

    const rows = schools
      .filter(s => s && s.school_name)
      .map(s => ({
        user_id: userId,
        formation_id: s.formation_id || s.id || null,
        school_name: String(s.school_name || s.etab_nom || '').trim(),
        school_data: s.school_data || s,
        contact_accepted: !!contactAccepted
      }))

    if (rows.length === 0) {
      return res.status(400).json({ error: 'No valid schools' })
    }

    const db = supabaseAdmin || supabase
    // Delete previous schools for the user, then insert new ones
    await db.from('user_schools').delete().eq('user_id', userId)
    const { error } = await db.from('user_schools').insert(rows)
    if (error) return res.status(400).json({ error: error.message })

    res.json({ message: 'Saved' })
  } catch (error) {
    console.error('Schools save error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Get user selected schools
router.get('/profile/schools', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id
    const db = supabaseAdmin || supabase
    const { data, error } = await db
      .from('user_schools')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: true })

    if (error) return res.status(400).json({ error: error.message })

    res.json({ schools: data || [] })
  } catch (error) {
    console.error('Schools fetch error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})
