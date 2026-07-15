import express from 'express'
import { supabase, supabaseAdmin } from '../config/supabase.js'
import { authenticateToken } from '../middleware/auth.js'
import { sendMailSafe } from '../utils/mailer.js'

const router = express.Router()

const FINAL_SELECTION_QUESTION_ID = 'orientation_final_selection'
const EXTRA_INFO_LIMIT = 250
const FINAL_SELECTION_LIMIT = 16
const MAX_ANSWER_TEXT_LENGTH = 12000

function normalizeSchoolNameForMatch(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
}

function extractSchoolNameFromCandidate(candidate) {
  if (!candidate || candidate.type !== 'formation') return ''
  const raw = candidate.raw || {}
  const subtitle = typeof candidate.subtitle === 'string' ? candidate.subtitle : ''
  return String(raw.etab_nom || raw.school_name || subtitle.split(' - ')[0] || '').trim()
}

// Best-effort email notification: when a student saves a final-selection
// including a school with an approved school-portal account, let that school
// know a new lead is waiting. Deduped per company+lead via
// school_lead_status.notified_at so re-saving the same selection doesn't spam.
async function notifySchoolsFromFinalSelection(db, userId, answerText) {
  try {
    const candidates = JSON.parse(answerText || '[]')
    if (!Array.isArray(candidates) || !candidates.length) return

    const schoolNames = Array.from(new Set(candidates.map(extractSchoolNameFromCandidate).filter(Boolean)))
    if (!schoolNames.length) return

    const { data: approvedCompanies } = await db
      .from('companies')
      .select('id, name, email, contact_first_name')
      .not('approved_at', 'is', null)
    if (!approvedCompanies?.length) return

    const normalizedTargets = schoolNames.map(normalizeSchoolNameForMatch)
    const matchingCompanies = approvedCompanies.filter((company) => {
      const normalizedCompanyName = normalizeSchoolNameForMatch(company.name)
      return normalizedTargets.some((target) => target && normalizedCompanyName.includes(target))
    })
    if (!matchingCompanies.length) return

    const { data: profile } = await db.from('profiles').select('first_name, last_name').eq('id', userId).maybeSingle()
    const leadName = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || 'Unélève Zélia'
    const leadKey = `user:${userId}`

    for (const company of matchingCompanies) {
      const { data: existingStatus } = await db
        .from('school_lead_status')
        .select('notified_at')
        .eq('company_id', company.id)
        .eq('lead_key', leadKey)
        .maybeSingle()
      if (existingStatus?.notified_at) continue

      const sent = await sendMailSafe({
        to: company.email,
        subject: "Nouveau lead Zélia – un élève s'intéresse à votre établissement",
        html: `<p>Bonjour${company.contact_first_name ? ` ${company.contact_first_name}` : ''},</p>
          <p><strong>${leadName}</strong> a sélectionné votre établissement dans son parcours d'orientation sur Zélia.</p>
          <p><a href="https://zelia.io/espace-ecoles/leads">Consulter mes leads</a></p>`
      })

      if (sent) {
        await db.from('school_lead_status').upsert(
          { company_id: company.id, lead_key: leadKey, notified_at: new Date().toISOString() },
          { onConflict: 'company_id,lead_key' }
        )
      }
    }
  } catch (notifyError) {
    console.warn('notifySchoolsFromFinalSelection failed:', notifyError.message)
  }
}

function firstTextValue(...values) {
  for (const value of values) {
    if (value == null) continue
    const text = String(value).trim()
    if (text) return text
  }
  return ''
}

function compactFinalSelectionCandidate(candidate) {
  const raw = candidate && typeof candidate.raw === 'object' ? candidate.raw : {}
  const detail = candidate && typeof candidate.detail === 'object' ? candidate.detail : {}
  const compact = {
    id: firstTextValue(candidate?.id, raw.id, raw.nm, raw.nmc),
    type: firstTextValue(candidate?.type, raw.type),
    title: firstTextValue(
      detail.title,
      candidate?.title,
      candidate?.name,
      candidate?.formation_name,
      raw.nm,
      raw.nmc,
      raw.formation_name,
      raw.nom_formation
    ),
    subtitle: firstTextValue(detail.subtitle, candidate?.subtitle, candidate?.description, raw.etab_nom, raw.school_name, raw.commune),
    sourceTable: firstTextValue(candidate?.sourceTable, raw.source_table, raw.sourceTable),
    schoolName: firstTextValue(candidate?.schoolName, candidate?.school, raw.etab_nom, raw.school_name),
    city: firstTextValue(candidate?.city, raw.commune, raw.city),
    region: firstTextValue(candidate?.region, raw.region),
    matchScore: firstTextValue(candidate?.matchScore, candidate?.match_score, raw.match_score),
    link: firstTextValue(detail.link, candidate?.link, raw.etab_url, raw.fiche, raw.contact_urlpostulation),
    linkLabel: firstTextValue(detail.linkLabel, candidate?.linkLabel)
  }

  const cleaned = Object.fromEntries(Object.entries(compact).filter(([, value]) => value !== ''))
  if (candidate?.requestMoreInformation === true) cleaned.requestMoreInformation = true
  return cleaned
}

function compactFinalSelectionAnswer(answerText) {
  const text = answerText != null ? String(answerText) : ''
  if (!text) return null

  try {
    const parsed = JSON.parse(text)
    const candidates = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed?.candidates)
        ? parsed.candidates
        : []

    if (candidates.length > 0) {
      return JSON.stringify(candidates.slice(0, FINAL_SELECTION_LIMIT).map(compactFinalSelectionCandidate))
    }
  } catch {
    // Keep legacy plain-text answers, but never let a huge blob leave this API.
  }

  return text.length > MAX_ANSWER_TEXT_LENGTH
    ? `${text.slice(0, MAX_ANSWER_TEXT_LENGTH)}...`
    : text
}

function sanitizeExtraInfoEntry(entry) {
  const questionId = String(entry?.question_id || '')
  const answerText = questionId === FINAL_SELECTION_QUESTION_ID
    ? compactFinalSelectionAnswer(entry?.answer_text)
    : entry?.answer_text != null && String(entry.answer_text).length > MAX_ANSWER_TEXT_LENGTH
      ? `${String(entry.answer_text).slice(0, MAX_ANSWER_TEXT_LENGTH)}...`
      : entry?.answer_text

  return {
    ...entry,
    question_id: questionId,
    answer_text: answerText
  }
}

async function fetchExtraInfoEntries(db, userId) {
  const selectColumns = 'id, user_id, question_id, question_text, answer_text, created_at'

  const { data: regularEntries, error: regularError } = await db
    .from('informations_complementaires')
    .select(selectColumns)
    .eq('user_id', userId)
    .neq('question_id', FINAL_SELECTION_QUESTION_ID)
    .order('created_at', { ascending: false })
    .limit(EXTRA_INFO_LIMIT)

  if (regularError) throw regularError

  const { data: finalSelectionEntries, error: finalSelectionError } = await db
    .from('informations_complementaires')
    .select(selectColumns)
    .eq('user_id', userId)
    .eq('question_id', FINAL_SELECTION_QUESTION_ID)
    .order('created_at', { ascending: false })
    .limit(1)

  if (finalSelectionError) throw finalSelectionError

  return [...(finalSelectionEntries || []), ...(regularEntries || [])]
    .map(sanitizeExtraInfoEntry)
    .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
}

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
    const data = await fetchExtraInfoEntries(db, userId)

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
      .map(e => sanitizeExtraInfoEntry({
        user_id: userId,
        question_id: String(e.question_id),
        question_text: String(e.question_text),
        answer_text: e.answer_text != null ? String(e.answer_text) : null
      }))

    if (rows.length === 0) {
      return res.status(400).json({ error: 'No valid entries' })
    }

    const db = supabaseAdmin || supabase
    const replaceQuestionIds = [...new Set(rows
      .map(row => row.question_id)
      .filter(questionId => questionId === FINAL_SELECTION_QUESTION_ID))]

    if (replaceQuestionIds.length > 0) {
      const { error: deleteError } = await db
        .from('informations_complementaires')
        .delete()
        .eq('user_id', userId)
        .in('question_id', replaceQuestionIds)

      if (deleteError) return res.status(400).json({ error: deleteError.message })
    }

    const { error } = await db.from('informations_complementaires').insert(rows)
    if (error) return res.status(400).json({ error: error.message })

    const finalSelectionRow = rows.find((row) => row.question_id === FINAL_SELECTION_QUESTION_ID)
    if (finalSelectionRow?.answer_text) {
      notifySchoolsFromFinalSelection(db, userId, finalSelectionRow.answer_text).catch(() => {})
    }

    res.json({ message: 'Saved' })
  } catch (error) {
    console.error('Extra info save error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Save user grades by subject
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

// Save user selected fields/filieres
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

// Save user selected schools
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
