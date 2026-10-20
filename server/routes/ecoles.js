import express from 'express'
import { supabaseAdmin } from '../config/supabase.js'
import { authenticateToken } from '../middleware/auth.js'
import { scoreFormations } from '../utils/partnerMatching.js'

const router = express.Router()

const EXTRA_INFO_MATCHING_LIMIT = 250
const MAX_MATCHING_SIGNAL_LENGTH = 12000

const PARTNER_CITY_BY_DEPARTMENT_CODE = {
  '06': 'Nice',
  '14': 'Caen',
  '31': 'Toulouse',
  '33': 'Bordeaux',
  '34': 'Montpellier',
  '35': 'Rennes',
  '38': 'Grenoble',
  '44': 'Nantes',
  '49': 'Angers',
  '54': 'Nancy',
  '56': 'Vannes',
  '59': 'Lille',
  '69': 'Lyon',
  '74': 'Annecy',
  '75': 'Paris',
  '77': 'Melun',
  '78': 'St-Quentin-en-Yvelines',
  '91': 'Paris',
  '92': 'Paris',
  '93': 'Paris',
  '94': 'Paris',
  '95': 'Paris'
}

function normalizeLocationText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function sameCity(left, right) {
  const a = normalizeLocationText(left)
  const b = normalizeLocationText(right)
  if (!a || !b) return false
  return a === b || a.includes(b) || b.includes(a)
}

function getPartnerCityForDepartment(code, departmentName = '') {
  const normalizedCode = String(code || '').toUpperCase()
  if (PARTNER_CITY_BY_DEPARTMENT_CODE[normalizedCode]) return PARTNER_CITY_BY_DEPARTMENT_CODE[normalizedCode]
  const normalizedDepartment = normalizeLocationText(departmentName)
  return Object.values(PARTNER_CITY_BY_DEPARTMENT_CODE).find((city) => normalizeLocationText(city) === normalizedDepartment) || ''
}

function sanitizeMatchingEntry(entry) {
  const answerText = entry?.answer_text != null && String(entry.answer_text).length > MAX_MATCHING_SIGNAL_LENGTH
    ? String(entry.answer_text).slice(0, MAX_MATCHING_SIGNAL_LENGTH)
    : entry?.answer_text

  return {
    ...entry,
    question_id: String(entry?.question_id || ''),
    answer_text: answerText
  }
}

// The saved final selection is intentionally excluded: it contains the
// formations shown earlier, and matching on it would reinforce off-topic picks.
async function fetchExtraInfoForMatching(userId) {
  const { data, error } = await supabaseAdmin
    .from('informations_complementaires')
    .select('question_id, answer_text, created_at')
    .eq('user_id', userId)
    .neq('question_id', 'orientation_final_selection')
    .neq('question_id', 'orientation_recommendations')
    .order('created_at', { ascending: false })
    .limit(EXTRA_INFO_MATCHING_LIMIT)

  if (error) throw error

  return (data || []).map(sanitizeMatchingEntry)
}

// GET /api/ecoles/partenaires - List all partner school formations
router.get('/partenaires', authenticateToken, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('ecoles_partenaires')
      .select('*')
      .eq('is_active', true)
      .order('school_name')
      .order('city')

    if (error) throw error
    res.json({ formations: data || [] })
  } catch (e) {
    console.error('GET /ecoles/partenaires error:', e)
    res.status(500).json({ error: 'Failed to fetch formations' })
  }
})

// GET /api/ecoles/partenaires/:id - Get a single formation by id
router.get('/partenaires/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params
    const { data, error } = await supabaseAdmin
      .from('ecoles_partenaires')
      .select('*')
      .eq('id', id)
      .single()

    if (error) {
      if (error.code === 'PGRST116') return res.status(404).json({ error: 'Formation not found' })
      throw error
    }
    res.json({ formation: data })
  } catch (e) {
    console.error('GET /ecoles/partenaires/:id error:', e)
    res.status(500).json({ error: 'Failed to fetch formation' })
  }
})

// GET /api/ecoles/matched - Get formations matched to user profile
router.get('/matched', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id

    const entries = await fetchExtraInfoForMatching(userId)
    const entryMap = new Map()
    for (const entry of entries) {
      const questionId = entry?.question_id
      if (!questionId || entryMap.has(questionId)) continue
      entryMap.set(questionId, entry?.answer_text || '')
    }

    const pickFirstValue = (...questionIds) => {
      for (const questionId of questionIds) {
        const value = entryMap.get(questionId)
        if (typeof value === 'string' && value.trim()) return value.trim()
      }
      return ''
    }

    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('department, institution_data')
      .eq('id', userId)
      .maybeSingle()

    if (profileError && profileError.code !== 'PGRST116') throw profileError

    const institutionData = profile?.institution_data && typeof profile.institution_data === 'object'
      ? profile.institution_data
      : {}
    const studyLocation = pickFirstValue('orientation_study_location')
    const storedCity = pickFirstValue('orientation_city') || institutionData.city || institutionData.ville || institutionData.commune || ''
    const departmentCode = pickFirstValue('orientation_department') || profile?.department || ''
    const departmentName = pickFirstValue('orientation_department_name') || institutionData.department_name || ''
    const nearHomeCity = studyLocation === 'near_home'
      ? (storedCity || getPartnerCityForDepartment(departmentCode, departmentName))
      : ''

    const formations = []
    const pageSize = 1000
    for (let offset = 0; ; offset += pageSize) {
      const { data, error } = await supabaseAdmin
        .from('ecoles_partenaires')
        .select('*')
        .eq('is_active', true)
        .eq('show_in_results', true)
        .order('id')
        .range(offset, offset + pageSize - 1)
      if (error) throw error
      formations.push(...(data || []))
      if (!data || data.length < pageSize) break
    }

    if (formations.length === 0) {
      return res.json({ matched: [] })
    }

    const { data: analysisResult, error: analysisError } = await supabaseAdmin
      .from('user_results')
      .select('job_recommendations')
      .eq('user_id', userId)
      .eq('questionnaire_type', 'inscription')
      .maybeSingle()

    if (analysisError && analysisError.code !== 'PGRST116') throw analysisError

    const userCity = nearHomeCity || storedCity
    const matched = scoreFormations(formations, pickFirstValue, analysisResult?.job_recommendations, userCity)
    const filteredMatched = nearHomeCity
      ? matched.filter((formation) => sameCity(formation.city, nearHomeCity))
      : matched
    res.json({ matched: filteredMatched, userCity: userCity || null })
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

    const { error } = await supabaseAdmin.rpc('backoffice_submit_partner', {
      p_user_id: userId,
      p_formation_id: formation_id
    })

    if (error?.code === 'P0002') return res.status(404).json({ error: 'Cette formation n\'est plus disponible.' })
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
