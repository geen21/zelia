import express from 'express'
import { supabaseAdmin } from '../config/supabase.js'
import { authenticateToken } from '../middleware/auth.js'
import { withFormationDisplayFields } from '../utils/slug.js'

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
  const role = company.role || 'owner'
  return {
    id: company.id,
    name: company.name,
    email: company.email,
    contactFirstName: company.contact_first_name || '',
    contactLastName: company.contact_last_name || '',
    approved: Boolean(company.approved_at),
    approvedAt: company.approved_at || null,
    createdAt: company.created_at,
    role,
    isOwner: role === 'owner'
  }
}

const VALID_LEAD_STATUSES = ['nouveau', 'a_contacter', 'contacte', 'converti', 'archive']

// Leads/formations reveal other students' PII, so they stay locked until an
// admin has approved the school account (server/routes/schoolPortal.js admin routes).
function requireApprovedCompany(company, res) {
  if (!company.approved_at) {
    res.status(403).json({
      error: 'PENDING_APPROVAL',
      message: 'Votre compte est en cours de validation par notre équipe. Vous serez notifié dès que l\'accès sera activé.'
    })
    return false
  }
  return true
}

function requireAdminKey(req, res, next) {
  const configuredKey = process.env.SCHOOL_PORTAL_ADMIN_KEY
  if (!configuredKey) {
    return res.status(500).json({ error: 'SCHOOL_PORTAL_ADMIN_KEY is not configured' })
  }
  const providedKey = req.headers['x-admin-key']
  if (!providedKey || providedKey !== configuredKey) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  next()
}

// Emails/names are masked server-side by default (never sent unmasked to the
// browser) — this is a real redaction, not a CSS blur a school could remove
// via devtools. A school can reveal a specific lead via the /reveal routes,
// which is recorded in school_lead_reveals so the choice persists.
function maskEmail(value) {
  const email = String(value || '')
  const at = email.indexOf('@')
  if (at <= 0) return '••••••'
  const local = email.slice(0, at)
  const domain = email.slice(at + 1)
  const dot = domain.lastIndexOf('.')
  const domainName = dot > 0 ? domain.slice(0, dot) : domain
  const tld = dot > 0 ? domain.slice(dot) : ''
  const maskPart = (part) => (part.length <= 2 ? `${part.slice(0, 1)}•••` : `${part.slice(0, 2)}${'•'.repeat(Math.max(part.length - 2, 3))}`)
  return `${maskPart(local)}@${maskPart(domainName)}${tld}`
}

function maskName(value) {
  const text = String(value || '').trim()
  if (!text) return ''
  return `${text[0].toUpperCase()}${'•'.repeat(Math.max(text.length - 1, 3))}`
}

async function fetchRevealedKeys(db, companyId) {
  const { data, error } = await db.from('school_lead_reveals').select('lead_key').eq('company_id', companyId)
  if (error) throw error
  return new Set((data || []).map((row) => row.lead_key))
}

async function revealLeadKey(db, companyId, leadKey) {
  const { error } = await db
    .from('school_lead_reveals')
    .upsert({ company_id: companyId, lead_key: leadKey }, { onConflict: 'company_id,lead_key' })
  if (error) throw error
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

// GET /api/school-portal/me - fetch the company owned by (or the caller is a member of)
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const db = requireAdminClient(res)
    if (!db) return

    const company = await resolveAccessibleCompany(db, req.user.id)
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

// Resolves the company a user can access: either as the owner, or as an
// invited team member (school_portal_members). Adds a `role` field so callers
// can gate owner-only actions (invite/remove members, edit school identity).
async function resolveAccessibleCompany(db, userId) {
  const owned = await resolveOwnedCompany(db, userId)
  if (owned) return { ...owned, role: 'owner' }

  const { data: membership, error: membershipError } = await db
    .from('school_portal_members')
    .select('company_id, role')
    .eq('user_id', userId)
    .maybeSingle()
  if (membershipError) throw membershipError
  if (!membership) return null

  const { data: company, error: companyError } = await db
    .from('companies')
    .select('*')
    .eq('id', membership.company_id)
    .maybeSingle()
  if (companyError) throw companyError
  if (!company) return null

  return { ...company, role: membership.role || 'member' }
}

async function fetchLeadStatuses(db, companyId) {
  const { data, error } = await db
    .from('school_lead_status')
    .select('lead_key, status, note')
    .eq('company_id', companyId)
  if (error) throw error
  const map = new Map()
  ;(data || []).forEach((row) => map.set(row.lead_key, { status: row.status, note: row.note || '' }))
  return map
}

// Merges the two lead sources (questionnaire final-selection + direct
// "demande d'infos" clicks on public formation pages) into one uniform,
// masked, status-annotated list. Both endpoints (/leads, /leads/export.csv,
// /stats) build on this so they never drift out of sync again.
async function loadMergedLeads(db, company) {
  const [questionnaireResult, directResult] = await Promise.all([
    db.rpc('rpc_school_leads', { p_school_name: company.name, p_limit: 5000, p_offset: 0 }),
    db
      .from('formation_info_requests')
      .select('*')
      .eq('school_name', company.name)
      .order('created_at', { ascending: false })
      .limit(2000)
  ])
  if (questionnaireResult.error) throw questionnaireResult.error
  if (directResult.error) throw directResult.error

  const revealedKeys = await fetchRevealedKeys(db, company.id)
  const statusMap = await fetchLeadStatuses(db, company.id)

  const questionnaireLeads = (questionnaireResult.data || []).map((lead) => {
    const { total_count, lead_key, ...rest } = lead
    const leadKey = lead_key || `user:${rest.user_id}`
    const revealed = revealedKeys.has(leadKey)
    const statusInfo = statusMap.get(leadKey) || {}
    return {
      ...rest,
      leadKey,
      formation_title: '',
      email: revealed ? rest.email : maskEmail(rest.email),
      nom: revealed ? rest.nom : maskName(rest.nom),
      revealed,
      status: statusInfo.status || 'nouveau',
      note: statusInfo.note || ''
    }
  })

  const directLeads = (directResult.data || []).map((row) => {
    const leadKey = `request:${row.id}`
    const revealed = revealedKeys.has(leadKey)
    const statusInfo = statusMap.get(leadKey) || {}
    return {
      user_id: row.user_id,
      leadKey,
      source: 'direct_request',
      prenom: row.first_name || '',
      nom: revealed ? (row.last_name || '') : maskName(row.last_name),
      email: revealed ? row.email : maskEmail(row.email),
      genre: '',
      age: null,
      departement: '',
      classe_actuelle: '',
      niveau_vise: '',
      moyenne: '',
      budget: '',
      preference_geo: '',
      matieres_fortes: '',
      accepte_etre_recontacte: null,
      metiers_proposes_par_zelia: '',
      formations_proposees_par_zelia: '',
      nb_formations_choisies_ecole: 0,
      formations_choisies_ecole: '',
      formations_choisies_ecole_liens: '',
      nb_demandes_infos_ecole: 1,
      formation_title: row.formation_title || '',
      inscrit_le: row.created_at,
      revealed,
      status: statusInfo.status || 'nouveau',
      note: statusInfo.note || ''
    }
  })

  return [...questionnaireLeads, ...directLeads].sort(
    (a, b) => new Date(b.inscrit_le || 0) - new Date(a.inscrit_le || 0)
  )
}

function applyLeadFilters(leads, query = {}) {
  let result = leads

  const eqFilter = (key, field) => {
    const value = query[key]
    if (value) result = result.filter((lead) => String(lead[field] || '') === String(value))
  }
  eqFilter('source', 'source')
  eqFilter('status', 'status')
  eqFilter('niveauVise', 'niveau_vise')
  eqFilter('budget', 'budget')
  eqFilter('departement', 'departement')
  eqFilter('classeActuelle', 'classe_actuelle')

  const search = String(query.search || '').trim().toLowerCase()
  if (search) {
    result = result.filter((lead) =>
      `${lead.prenom || ''} ${lead.nom || ''} ${lead.email || ''}`.toLowerCase().includes(search)
    )
  }

  return result
}

// GET /api/school-portal/leads - leads matching the caller's school
// GET /api/school-portal/leads - merged, filterable, status-annotated leads from
// BOTH sources: questionnaire final-selection (rpc_school_leads) AND direct
// "Demande d'infos" clicks on public formation pages (formation_info_requests).
// Previously only the first source was ever fetched here, so leads from the
// public formation page's request-info button never appeared for schools.
router.get('/leads', authenticateToken, async (req, res) => {
  try {
    const db = requireAdminClient(res)
    if (!db) return

    const company = await resolveAccessibleCompany(db, req.user.id)
    if (!company) return res.status(403).json({ error: 'Aucun compte école associé' })
    if (!requireApprovedCompany(company, res)) return

    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200)
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0)

    const allLeads = await loadMergedLeads(db, company)
    const filtered = applyLeadFilters(allLeads, req.query)
    const total = filtered.length
    const page = filtered.slice(offset, offset + limit)

    res.json({
      leads: page,
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

// GET /api/school-portal/leads/export.csv - export the same merged leads as a CSV file
router.get('/leads/export.csv', authenticateToken, async (req, res) => {
  try {
    const db = requireAdminClient(res)
    if (!db) return

    const company = await resolveAccessibleCompany(db, req.user.id)
    if (!company) return res.status(403).json({ error: 'Aucun compte école associé' })
    if (!requireApprovedCompany(company, res)) return

    const leads = applyLeadFilters(await loadMergedLeads(db, company), req.query)

    const columns = [
      'source', 'prenom', 'nom', 'email', 'genre', 'age', 'departement', 'classe_actuelle',
      'niveau_vise', 'moyenne', 'budget', 'preference_geo', 'matieres_fortes', 'formation_title',
      'formations_choisies_ecole', 'nb_demandes_infos_ecole', 'status', 'note', 'inscrit_le'
    ]

    const rows = leads.map((lead) => columns.map((column) => csvEscape(lead[column])).join(';'))
    const csv = [columns.join(';'), ...rows].join('\n')

    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="leads-${company.id}.csv"`)
    res.send(`\uFEFF${csv}`)
  } catch (error) {
    console.error('GET /school-portal/leads/export.csv error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// PATCH /api/school-portal/leads/:leadKey/status - set/update CRM status + note on a lead
router.patch('/leads/:leadKey/status', authenticateToken, async (req, res) => {
  try {
    const db = requireAdminClient(res)
    if (!db) return

    const company = await resolveAccessibleCompany(db, req.user.id)
    if (!company) return res.status(403).json({ error: 'Aucun compte école associé' })
    if (!requireApprovedCompany(company, res)) return

    const leadKey = decodeURIComponent(req.params.leadKey)
    const status = req.body?.status !== undefined ? String(req.body.status).trim() : undefined
    const note = req.body?.note !== undefined ? String(req.body.note).slice(0, 2000) : undefined

    if (status && !VALID_LEAD_STATUSES.includes(status)) {
      return res.status(400).json({ error: 'Statut invalide' })
    }
    if (status === undefined && note === undefined) {
      return res.status(400).json({ error: 'Aucune donnée à mettre à jour' })
    }

    const leads = await loadMergedLeads(db, company)
    if (!leads.some((lead) => lead.leadKey === leadKey)) {
      return res.status(404).json({ error: 'Lead introuvable pour cet établissement' })
    }

    const payload = { company_id: company.id, lead_key: leadKey, updated_at: new Date().toISOString() }
    if (status !== undefined) payload.status = status
    if (note !== undefined) payload.note = note

    const { data, error } = await db
      .from('school_lead_status')
      .upsert(payload, { onConflict: 'company_id,lead_key' })
      .select()
      .single()

    if (error) throw error

    res.json({ status: data.status, note: data.note || '' })
  } catch (error) {
    console.error('PATCH /school-portal/leads/:leadKey/status error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /api/school-portal/stats - aggregate counters for the dashboard (KPIs + charts)
router.get('/stats', authenticateToken, async (req, res) => {
  try {
    const db = requireAdminClient(res)
    if (!db) return

    const company = await resolveAccessibleCompany(db, req.user.id)
    if (!company) return res.status(403).json({ error: 'Aucun compte école associé' })
    if (!requireApprovedCompany(company, res)) return

    const leads = await loadMergedLeads(db, company)

    const bySource = { questionnaire: 0, direct_request: 0 }
    const byStatus = { nouveau: 0, a_contacter: 0, contacte: 0, converti: 0, archive: 0 }
    const formationCounts = new Map()
    const weekCounts = new Map()

    leads.forEach((lead) => {
      bySource[lead.source] = (bySource[lead.source] || 0) + 1
      byStatus[lead.status] = (byStatus[lead.status] || 0) + 1

      const formationNames = lead.source === 'direct_request'
        ? [lead.formation_title].filter(Boolean)
        : String(lead.formations_choisies_ecole || '').split('  •  ').map((name) => name.trim()).filter(Boolean)
      formationNames.forEach((name) => formationCounts.set(name, (formationCounts.get(name) || 0) + 1))

      if (lead.inscrit_le) {
        const date = new Date(lead.inscrit_le)
        if (!Number.isNaN(date.getTime())) {
          const weekStart = new Date(date)
          weekStart.setUTCHours(0, 0, 0, 0)
          weekStart.setUTCDate(weekStart.getUTCDate() - weekStart.getUTCDay())
          const key = weekStart.toISOString().slice(0, 10)
          weekCounts.set(key, (weekCounts.get(key) || 0) + 1)
        }
      }
    })

    const topFormations = Array.from(formationCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, count]) => ({ name, count }))

    const leadsPerWeek = Array.from(weekCounts.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-12)
      .map(([week, count]) => ({ week, count }))

    res.json({ total: leads.length, bySource, byStatus, topFormations, leadsPerWeek })
  } catch (error) {
    console.error('GET /school-portal/stats error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// POST /api/school-portal/leads/:userId/reveal - unmask a specific lead's email/nom (persisted)
router.post('/leads/:userId/reveal', authenticateToken, async (req, res) => {
  try {
    const db = requireAdminClient(res)
    if (!db) return

    const company = await resolveAccessibleCompany(db, req.user.id)
    if (!company) return res.status(403).json({ error: 'Aucun compte école associé' })
    if (!requireApprovedCompany(company, res)) return

    const targetUserId = req.params.userId

    const { data, error } = await db.rpc('rpc_school_leads', {
      p_school_name: company.name,
      p_limit: 5000,
      p_offset: 0
    })
    if (error) throw error

    const match = (data || []).find((lead) => lead.user_id === targetUserId)
    if (!match) return res.status(404).json({ error: 'Lead introuvable pour cet établissement' })

    await revealLeadKey(db, company.id, `user:${targetUserId}`)

    res.json({ email: match.email, nom: match.nom })
  } catch (error) {
    console.error('POST /school-portal/leads/:userId/reveal error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /api/school-portal/formations - formations/fiches available on the site for this school, with dedicated links
router.get('/formations', authenticateToken, async (req, res) => {
  try {
    const db = requireAdminClient(res)
    if (!db) return

    const company = await resolveAccessibleCompany(db, req.user.id)
    if (!company) return res.status(403).json({ error: 'Aucun compte école associé' })
    if (!requireApprovedCompany(company, res)) return

    const [nationalResult, partnerResult, customResult] = await Promise.all([
      db
        .from('formation_france')
        .select('id, nm, fl, nmc, etab_nom, commune, departement, region, etab_url, fiche')
        .eq('etab_nom', company.name)
        .limit(300),
      db
        .from('ecoles_partenaires')
        .select('id, school_name, formation_name, city, domain, diploma_level, description, link, contact_email')
        .eq('school_name', company.name)
        .limit(300),
      db
        .from('custom_school_formations')
        .select('id, title, city, diploma_level, link, contact_email')
        .eq('company_id', company.id)
        .eq('is_published', true)
        .limit(300)
    ])

    if (nationalResult.error) throw nationalResult.error
    if (partnerResult.error) throw partnerResult.error
    if (customResult.error) throw customResult.error

    const nationalFormations = (nationalResult.data || []).map((row) => {
      const withDisplay = withFormationDisplayFields(row)
      return {
        id: `formation_france:${row.id}`,
        source: 'formation_france',
        title: withDisplay.title,
        city: row.commune || '',
        diplomaLevel: '',
        link: `/formations/${withDisplay.slug}`,
        externalLink: row.etab_url || row.fiche || ''
      }
    })

    const partnerFormations = (partnerResult.data || []).map((row) => ({
      id: `ecoles_partenaires:${row.id}`,
      source: 'ecoles_partenaires',
      title: row.formation_name,
      city: row.city || '',
      diplomaLevel: row.diploma_level || '',
      link: row.link || (row.contact_email ? `mailto:${row.contact_email}` : ''),
      externalLink: row.link || ''
    }))

    const customFormations = (customResult.data || []).map((row) => ({
      id: `custom:${row.id}`,
      source: 'custom',
      title: row.title,
      city: row.city || '',
      diplomaLevel: row.diploma_level || '',
      link: row.link || (row.contact_email ? `mailto:${row.contact_email}` : ''),
      externalLink: row.link || ''
    }))

    res.json({ formations: [...nationalFormations, ...partnerFormations, ...customFormations] })
  } catch (error) {
    console.error('GET /school-portal/formations error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ---------------------------------------------------------------------------
// custom_school_formations CRUD - formation listings the school manages
// themselves from within their portal (private to the portal for now).
// ---------------------------------------------------------------------------

router.get('/school-formations', authenticateToken, async (req, res) => {
  try {
    const db = requireAdminClient(res)
    if (!db) return

    const company = await resolveAccessibleCompany(db, req.user.id)
    if (!company) return res.status(403).json({ error: 'Aucun compte école associé' })
    if (!requireApprovedCompany(company, res)) return

    const { data, error } = await db
      .from('custom_school_formations')
      .select('*')
      .eq('company_id', company.id)
      .order('created_at', { ascending: false })

    if (error) throw error
    res.json({ formations: data || [] })
  } catch (error) {
    console.error('GET /school-portal/school-formations error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.post('/school-formations', authenticateToken, async (req, res) => {
  try {
    const db = requireAdminClient(res)
    if (!db) return

    const company = await resolveAccessibleCompany(db, req.user.id)
    if (!company) return res.status(403).json({ error: 'Aucun compte école associé' })
    if (!requireApprovedCompany(company, res)) return

    const title = String(req.body?.title || '').trim()
    if (!title) return res.status(400).json({ error: 'Le titre est requis' })

    const payload = {
      company_id: company.id,
      title,
      description: String(req.body?.description || '').trim(),
      diploma_level: String(req.body?.diplomaLevel || '').trim(),
      city: String(req.body?.city || '').trim(),
      domain: String(req.body?.domain || '').trim(),
      image_url: String(req.body?.imageUrl || '').trim(),
      link: String(req.body?.link || '').trim(),
      contact_email: String(req.body?.contactEmail || '').trim(),
      is_published: req.body?.isPublished !== false
    }

    const { data, error } = await db.from('custom_school_formations').insert(payload).select().single()
    if (error) throw error

    res.status(201).json({ formation: data })
  } catch (error) {
    console.error('POST /school-portal/school-formations error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.put('/school-formations/:id', authenticateToken, async (req, res) => {
  try {
    const db = requireAdminClient(res)
    if (!db) return

    const company = await resolveAccessibleCompany(db, req.user.id)
    if (!company) return res.status(403).json({ error: 'Aucun compte école associé' })
    if (!requireApprovedCompany(company, res)) return

    const updates = { updated_at: new Date().toISOString() }
    if (req.body?.title !== undefined) updates.title = String(req.body.title).trim()
    if (req.body?.description !== undefined) updates.description = String(req.body.description).trim()
    if (req.body?.diplomaLevel !== undefined) updates.diploma_level = String(req.body.diplomaLevel).trim()
    if (req.body?.city !== undefined) updates.city = String(req.body.city).trim()
    if (req.body?.domain !== undefined) updates.domain = String(req.body.domain).trim()
    if (req.body?.imageUrl !== undefined) updates.image_url = String(req.body.imageUrl).trim()
    if (req.body?.link !== undefined) updates.link = String(req.body.link).trim()
    if (req.body?.contactEmail !== undefined) updates.contact_email = String(req.body.contactEmail).trim()
    if (req.body?.isPublished !== undefined) updates.is_published = Boolean(req.body.isPublished)

    const { data, error } = await db
      .from('custom_school_formations')
      .update(updates)
      .eq('id', req.params.id)
      .eq('company_id', company.id)
      .select()
      .maybeSingle()

    if (error) throw error
    if (!data) return res.status(404).json({ error: 'Formation introuvable' })

    res.json({ formation: data })
  } catch (error) {
    console.error('PUT /school-portal/school-formations/:id error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.delete('/school-formations/:id', authenticateToken, async (req, res) => {
  try {
    const db = requireAdminClient(res)
    if (!db) return

    const company = await resolveAccessibleCompany(db, req.user.id)
    if (!company) return res.status(403).json({ error: 'Aucun compte école associé' })
    if (!requireApprovedCompany(company, res)) return

    const { error } = await db
      .from('custom_school_formations')
      .delete()
      .eq('id', req.params.id)
      .eq('company_id', company.id)

    if (error) throw error
    res.json({ success: true })
  } catch (error) {
    console.error('DELETE /school-portal/school-formations/:id error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ---------------------------------------------------------------------------
// school_portal_members - invite/list/remove teammates who can access this
// school's leads/stats/formations. Only the owner may invite/remove; members
// have read/status-update access via resolveAccessibleCompany elsewhere.
// ---------------------------------------------------------------------------

router.get('/members', authenticateToken, async (req, res) => {
  try {
    const db = requireAdminClient(res)
    if (!db) return

    const company = await resolveAccessibleCompany(db, req.user.id)
    if (!company) return res.status(403).json({ error: 'Aucun compte école associé' })
    if (!requireApprovedCompany(company, res)) return

    const { data, error } = await db
      .from('school_portal_members')
      .select('id, user_id, role, created_at')
      .eq('company_id', company.id)
      .order('created_at', { ascending: true })

    if (error) throw error

    const memberRows = data || []
    const emailResults = await Promise.all(
      memberRows.map((row) => db.auth.admin.getUserById(row.user_id).catch(() => null))
    )

    res.json({
      owner: {
        email: company.email,
        contactFirstName: company.contact_first_name || '',
        contactLastName: company.contact_last_name || ''
      },
      members: memberRows.map((row, index) => ({
        id: row.id,
        userId: row.user_id,
        role: row.role,
        email: emailResults[index]?.data?.user?.email || '',
        createdAt: row.created_at
      }))
    })
  } catch (error) {
    console.error('GET /school-portal/members error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// POST /api/school-portal/members - owner creates a teammate account directly
// (email + temp password chosen by the owner, immediate creation - no invite
// token/email flow for this first pass).
router.post('/members', authenticateToken, async (req, res) => {
  const db = requireAdminClient(res)
  if (!db) return

  let createdUserId = null
  try {
    const company = await resolveOwnedCompany(db, req.user.id)
    if (!company) return res.status(403).json({ error: 'Aucun compte école associé' })
    if (!requireApprovedCompany(company, res)) return

    const email = String(req.body?.email || '').trim().toLowerCase()
    const password = String(req.body?.password || '')
    if (!email || !password) return res.status(400).json({ error: 'Email et mot de passe sont requis' })
    if (password.length < 6) return res.status(400).json({ error: 'Le mot de passe doit contenir au moins 6 caractères' })

    const { data: userResult, error: createUserError } = await db.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { profile_type: 'school_member' }
    })
    if (createUserError) return res.status(400).json({ error: createUserError.message })

    createdUserId = userResult?.user?.id
    if (!createdUserId) return res.status(500).json({ error: 'Impossible de créer le compte' })

    const { data: member, error: memberError } = await db
      .from('school_portal_members')
      .insert({ company_id: company.id, user_id: createdUserId, role: 'member' })
      .select()
      .single()

    if (memberError) {
      await db.auth.admin.deleteUser(createdUserId)
      const message = memberError.code === '23505' ? 'Ce compte est déjà membre de votre établissement' : memberError.message
      return res.status(400).json({ error: message })
    }

    res.status(201).json({
      member: { id: member.id, userId: createdUserId, email, role: member.role, createdAt: member.created_at }
    })
  } catch (error) {
    console.error('POST /school-portal/members error:', error)
    if (createdUserId) await db.auth.admin.deleteUser(createdUserId).catch(() => {})
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.delete('/members/:id', authenticateToken, async (req, res) => {
  try {
    const db = requireAdminClient(res)
    if (!db) return

    const company = await resolveOwnedCompany(db, req.user.id)
    if (!company) return res.status(403).json({ error: 'Aucun compte école associé' })

    const { data: member, error: fetchError } = await db
      .from('school_portal_members')
      .select('user_id')
      .eq('id', req.params.id)
      .eq('company_id', company.id)
      .maybeSingle()

    if (fetchError) throw fetchError
    if (!member) return res.status(404).json({ error: 'Membre introuvable' })

    const { error: deleteError } = await db
      .from('school_portal_members')
      .delete()
      .eq('id', req.params.id)
      .eq('company_id', company.id)

    if (deleteError) throw deleteError

    await db.auth.admin.deleteUser(member.user_id).catch(() => {})

    res.json({ success: true })
  } catch (error) {
    console.error('DELETE /school-portal/members/:id error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /api/school-portal/direct-requests - "demander plus d'informations" clicks
// on public formation pages, matched to this school. Also counted as leads.
router.get('/direct-requests', authenticateToken, async (req, res) => {
  try {
    const db = requireAdminClient(res)
    if (!db) return

    const company = await resolveAccessibleCompany(db, req.user.id)
    if (!company) return res.status(403).json({ error: 'Aucun compte école associé' })
    if (!requireApprovedCompany(company, res)) return

    const { data, error } = await db
      .from('formation_info_requests')
      .select('*')
      .eq('school_name', company.name)
      .order('created_at', { ascending: false })
      .limit(500)

    if (error) throw error

    const revealedKeys = await fetchRevealedKeys(db, company.id)

    res.json({
      requests: (data || []).map((row) => {
        const revealed = revealedKeys.has(`request:${row.id}`)
        return {
          id: row.id,
          formationTitle: row.formation_title || '',
          firstName: row.first_name || '',
          lastName: revealed ? (row.last_name || '') : maskName(row.last_name),
          email: revealed ? row.email : maskEmail(row.email),
          createdAt: row.created_at,
          revealed
        }
      })
    })
  } catch (error) {
    console.error('GET /school-portal/direct-requests error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// POST /api/school-portal/direct-requests/:id/reveal - unmask a direct request's email/nom (persisted)
router.post('/direct-requests/:id/reveal', authenticateToken, async (req, res) => {
  try {
    const db = requireAdminClient(res)
    if (!db) return

    const company = await resolveAccessibleCompany(db, req.user.id)
    if (!company) return res.status(403).json({ error: 'Aucun compte école associé' })
    if (!requireApprovedCompany(company, res)) return

    const { data: row, error } = await db
      .from('formation_info_requests')
      .select('*')
      .eq('id', req.params.id)
      .eq('school_name', company.name)
      .maybeSingle()

    if (error) throw error
    if (!row) return res.status(404).json({ error: 'Demande introuvable pour cet établissement' })

    await revealLeadKey(db, company.id, `request:${row.id}`)

    res.json({ email: row.email, lastName: row.last_name || '' })
  } catch (error) {
    console.error('POST /school-portal/direct-requests/:id/reveal error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ---------------------------------------------------------------------------
// Admin routes: approve/revoke school accounts. Protected by a shared secret
// (x-admin-key header) since there is no admin role/UI in this app yet.
// ---------------------------------------------------------------------------

// GET /api/school-portal/admin/companies?status=pending|approved|all
router.get('/admin/companies', requireAdminKey, async (req, res) => {
  try {
    const db = requireAdminClient(res)
    if (!db) return

    const status = String(req.query.status || 'pending')
    let query = db.from('companies').select('*').order('created_at', { ascending: false })
    if (status === 'pending') query = query.is('approved_at', null)
    if (status === 'approved') query = query.not('approved_at', 'is', null)

    const { data, error } = await query
    if (error) throw error

    res.json({ companies: (data || []).map(sanitizeCompany) })
  } catch (error) {
    console.error('GET /school-portal/admin/companies error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// POST /api/school-portal/admin/companies/:id/approve
router.post('/admin/companies/:id/approve', requireAdminKey, async (req, res) => {
  try {
    const db = requireAdminClient(res)
    if (!db) return

    const { data, error } = await db
      .from('companies')
      .update({ approved_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .select()
      .single()

    if (error) {
      if (error.code === 'PGRST116') return res.status(404).json({ error: 'Compte introuvable' })
      throw error
    }

    res.json({ company: sanitizeCompany(data) })
  } catch (error) {
    console.error('POST /school-portal/admin/companies/:id/approve error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// POST /api/school-portal/admin/companies/:id/revoke
router.post('/admin/companies/:id/revoke', requireAdminKey, async (req, res) => {
  try {
    const db = requireAdminClient(res)
    if (!db) return

    const { data, error } = await db
      .from('companies')
      .update({ approved_at: null })
      .eq('id', req.params.id)
      .select()
      .single()

    if (error) {
      if (error.code === 'PGRST116') return res.status(404).json({ error: 'Compte introuvable' })
      throw error
    }

    res.json({ company: sanitizeCompany(data) })
  } catch (error) {
    console.error('POST /school-portal/admin/companies/:id/revoke error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
