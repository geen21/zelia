import express from 'express'
import { supabaseAdmin } from '../config/supabase.js'
import { authenticateToken } from '../middleware/auth.js'

const router = express.Router()

function requireAdminClient(res) {
  if (!supabaseAdmin) {
    res.status(500).json({ error: 'Supabase admin client is required for the school portal' })
    return null
  }
  return supabaseAdmin
}

function sanitizeCompany(company) {
  if (!company) return null
  return {
    id: company.id,
    name: company.name,
    email: company.email,
    contactFirstName: company.contact_first_name || '',
    contactLastName: company.contact_last_name || '',
    createdAt: company.created_at
  }
}

function normalizeSchoolName(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
}

// Verifies the school name matches an establishment actually present in the
// database (formation_france / ecoles_partenaires), so a school account can
// only be registered against a real, matchable establishment name.
async function findKnownSchoolName(db, schoolName) {
  const { data, error } = await db.rpc('search_partner_schools', {
    p_query: schoolName,
    p_limit: 20
  })
  if (error) throw error

  const target = normalizeSchoolName(schoolName)
  const match = (data || []).find((row) => normalizeSchoolName(row.school_name) === target)
  return match ? match.school_name : null
}

// GET /api/school-portal/schools/search?q=... - autocomplete for the registration form
router.get('/schools/search', async (req, res) => {
  try {
    const db = requireAdminClient(res)
    if (!db) return

    const query = String(req.query.q || '').trim()
    const { data, error } = await db.rpc('search_partner_schools', {
      p_query: query,
      p_limit: 20
    })

    if (error) throw error
    res.json({ schools: data || [] })
  } catch (error) {
    console.error('GET /school-portal/schools/search error:', error)
    res.status(500).json({ error: 'Failed to search schools' })
  }
})

// POST /api/school-portal/register - create a school account (auth user + companies row)
router.post('/register', async (req, res) => {
  const db = requireAdminClient(res)
  if (!db) return

  const email = String(req.body?.email || '').trim().toLowerCase()
  const password = String(req.body?.password || '')
  const schoolName = String(req.body?.schoolName || '').trim()
  const contactFirstName = String(req.body?.contactFirstName || '').trim()
  const contactLastName = String(req.body?.contactLastName || '').trim()

  if (!email || !password || !schoolName || !contactFirstName || !contactLastName) {
    return res.status(400).json({ error: 'Email, mot de passe, nom de l\'école, prénom et nom sont requis' })
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Le mot de passe doit contenir au moins 6 caractères' })
  }

  let createdUserId = null

  try {
    const knownSchoolName = await findKnownSchoolName(db, schoolName)
    if (!knownSchoolName) {
      return res.status(400).json({
        error: "Établissement introuvable dans notre base. Merci de sélectionner un établissement dans la liste proposée."
      })
    }

    const { data: userResult, error: createUserError } = await db.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        profile_type: 'school',
        first_name: contactFirstName,
        last_name: contactLastName
      }
    })

    if (createUserError) {
      return res.status(400).json({ error: createUserError.message })
    }

    createdUserId = userResult?.user?.id
    if (!createdUserId) {
      return res.status(500).json({ error: 'Impossible de créer le compte' })
    }

    const { data: company, error: companyError } = await db
      .from('companies')
      .insert({
        name: knownSchoolName,
        email,
        owner_id: createdUserId,
        contact_first_name: contactFirstName,
        contact_last_name: contactLastName,
        available_licenses: 0
      })
      .select()
      .single()

    if (companyError) {
      await db.auth.admin.deleteUser(createdUserId)
      const message = companyError.code === '23505'
        ? 'Un compte existe déjà avec cet email'
        : companyError.message
      return res.status(400).json({ error: message })
    }

    res.status(201).json({
      message: 'Compte école créé avec succès',
      company: sanitizeCompany(company)
    })
  } catch (error) {
    console.error('POST /school-portal/register error:', error)
    if (createdUserId) {
      await db.auth.admin.deleteUser(createdUserId).catch(() => {})
    }
    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /api/school-portal/me - fetch the company owned by the current user
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const db = requireAdminClient(res)
    if (!db) return

    const { data: company, error } = await db
      .from('companies')
      .select('*')
      .eq('owner_id', req.user.id)
      .maybeSingle()

    if (error) throw error
    if (!company) return res.status(404).json({ error: 'Aucun compte école associé' })

    res.json({ company: sanitizeCompany(company) })
  } catch (error) {
    console.error('GET /school-portal/me error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// PUT /api/school-portal/me - update the school name / contact identity
router.put('/me', authenticateToken, async (req, res) => {
  try {
    const db = requireAdminClient(res)
    if (!db) return

    const updates = {}
    if (req.body?.schoolName !== undefined) {
      const knownSchoolName = await findKnownSchoolName(db, req.body.schoolName)
      if (!knownSchoolName) {
        return res.status(400).json({
          error: "Établissement introuvable dans notre base. Merci de sélectionner un établissement dans la liste proposée."
        })
      }
      updates.name = knownSchoolName
    }
    if (req.body?.contactFirstName !== undefined) updates.contact_first_name = String(req.body.contactFirstName).trim()
    if (req.body?.contactLastName !== undefined) updates.contact_last_name = String(req.body.contactLastName).trim()

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'Aucune donnée à mettre à jour' })
    }

    updates.updated_at = new Date().toISOString()

    const { data: company, error } = await db
      .from('companies')
      .update(updates)
      .eq('owner_id', req.user.id)
      .select()
      .single()

    if (error) {
      if (error.code === 'PGRST116') return res.status(404).json({ error: 'Aucun compte école associé' })
      throw error
    }

    res.json({ company: sanitizeCompany(company) })
  } catch (error) {
    console.error('PUT /school-portal/me error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

async function resolveOwnedCompany(db, userId) {
  const { data: company, error } = await db
    .from('companies')
    .select('*')
    .eq('owner_id', userId)
    .maybeSingle()

  if (error) throw error
  return company || null
}

// GET /api/school-portal/leads - leads matching the caller's school
router.get('/leads', authenticateToken, async (req, res) => {
  try {
    const db = requireAdminClient(res)
    if (!db) return

    const company = await resolveOwnedCompany(db, req.user.id)
    if (!company) return res.status(403).json({ error: 'Aucun compte école associé' })

    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200)
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0)

    const { data, error } = await db.rpc('rpc_school_leads', {
      p_school_name: company.name,
      p_limit: limit,
      p_offset: offset
    })

    if (error) throw error

    const leads = data || []
    const total = leads.length > 0 ? Number(leads[0].total_count) : 0

    res.json({
      leads: leads.map((lead) => {
        const { total_count, ...rest } = lead
        return rest
      }),
      total,
      limit,
      offset,
      company: sanitizeCompany(company)
    })
  } catch (error) {
    console.error('GET /school-portal/leads error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

function csvEscape(value) {
  const text = value === null || value === undefined ? '' : String(value)
  if (/[",\n;]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`
  }
  return text
}

// GET /api/school-portal/leads/export.csv - export the same leads as a CSV file
router.get('/leads/export.csv', authenticateToken, async (req, res) => {
  try {
    const db = requireAdminClient(res)
    if (!db) return

    const company = await resolveOwnedCompany(db, req.user.id)
    if (!company) return res.status(403).json({ error: 'Aucun compte école associé' })

    const { data, error } = await db.rpc('rpc_school_leads', {
      p_school_name: company.name,
      p_limit: 5000,
      p_offset: 0
    })

    if (error) throw error

    const columns = [
      'prenom', 'nom', 'email', 'genre', 'age', 'departement', 'classe_actuelle',
      'niveau_vise', 'moyenne', 'budget', 'preference_geo', 'matieres_fortes',
      'formations_choisies_ecole', 'nb_demandes_infos_ecole', 'inscrit_le'
    ]

    const rows = (data || []).map((lead) => columns.map((column) => csvEscape(lead[column])).join(';'))
    const csv = [columns.join(';'), ...rows].join('\n')

    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="leads-${company.id}.csv"`)
    res.send(`\uFEFF${csv}`)
  } catch (error) {
    console.error('GET /school-portal/leads/export.csv error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
