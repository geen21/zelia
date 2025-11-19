import express from 'express'
import { authenticateToken } from '../middleware/auth.js'
import { supabase, supabaseAdmin } from '../config/supabase.js'

const router = express.Router()
const db = supabaseAdmin || supabase
const TABLE = 'waitlist_requests'

function normalizeMetadata(rawMetadata, extras = {}) {
  if (!rawMetadata || typeof rawMetadata !== 'object' || Array.isArray(rawMetadata)) {
    return { ...extras }
  }
  return { ...rawMetadata, ...extras }
}

router.get('/me', authenticateToken, async (req, res) => {
  if (!db) {
    return res.status(500).json({ error: 'Database client not configured' })
  }

  try {
    const { data, error } = await db
      .from(TABLE)
      .select('*')
      .eq('user_id', req.user.id)
      .maybeSingle()

    if (error && error.code !== 'PGRST116') {
      throw error
    }

    if (!data) {
      return res.status(404).json({ error: 'Not on waitlist yet' })
    }

    res.json({ entry: data })
  } catch (err) {
    console.error('Waitlist fetch error', err)
    res.status(500).json({ error: 'Unable to retrieve waitlist entry' })
  }
})

router.post('/', authenticateToken, async (req, res) => {
  if (!db) {
    return res.status(500).json({ error: 'Database client not configured' })
  }

  try {
    const userId = req.user?.id
    const userEmail = req.user?.email || req.body?.email

    if (!userId) {
      return res.status(400).json({ error: 'Missing authenticated user' })
    }

    if (!userEmail) {
      return res.status(400).json({ error: 'Missing user email' })
    }

    const { note, metadata, source = 'niveau-10', level = 10 } = req.body || {}

    const { data: existing, error: existingError } = await db
      .from(TABLE)
      .select('id, status')
      .eq('user_id', userId)
      .maybeSingle()

    if (existingError && existingError.code !== 'PGRST116') {
      throw existingError
    }

    const { data: profile, error: profileError } = await db
      .from('profiles')
      .select('first_name, last_name, accent_color, has_paid, home_preference')
      .eq('id', userId)
      .maybeSingle()

    if (profileError && profileError.code !== 'PGRST116') {
      throw profileError
    }

    const profileSnapshot = profile
      ? {
          first_name: profile.first_name,
          last_name: profile.last_name,
          accent_color: profile.accent_color,
          has_paid: profile.has_paid,
          home_preference: profile.home_preference
        }
      : null

    const payload = {
      id: existing?.id,
      user_id: userId,
      email: userEmail,
      source,
      note: note || null,
      status: existing?.status && existing.status !== 'pending' ? existing.status : 'pending',
      metadata: normalizeMetadata(metadata, { level }),
      profile_snapshot: profileSnapshot,
      updated_at: new Date().toISOString()
    }

    const { data, error } = await db
      .from(TABLE)
      .upsert(payload, { onConflict: 'user_id' })
      .select()
      .single()

    if (error) {
      throw error
    }

    res.json({ entry: data, alreadyJoined: Boolean(existing) })
  } catch (err) {
    console.error('Waitlist upsert error', err)
    res.status(500).json({ error: 'Unable to join the waitlist' })
  }
})

export default router
