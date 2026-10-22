export const SHARING_VERSION = 'orientation-dossier-v1'
export const leadStatuses = ['nouveau', 'a_contacter', 'contacte', 'converti', 'archive']
export const partnerPortalMessages = {
  PARTNER_PORTAL_CONFLICT: 'Plusieurs espaces sont possibles pour ce partenaire. Vérifiez les rattachements existants avant de poursuivre.',
  PARTNER_PORTAL_ALREADY_EXISTS: 'Ce partenaire possède déjà son espace. Retrouvez-le dans Écoles et utilisez « Gérer les accès ».',
  PARTNER_PORTAL_LINK_REQUIRED: 'Les formations partenaires sont rattachées automatiquement à leur dashboard. Ce rattachement ne peut pas être retiré ou transféré.',
  PARTNER_SCHOOL_CHANGE_REQUIRES_REVIEW: 'Le changement d’école d’une formation partenaire nécessite une vérification de ses accès et consentements.'
}

export function portalError(message, status = 400) {
  return Object.assign(new Error(message), { status })
}

export async function checked(builder) {
  const { data, error } = await builder
  if (error) throw error
  return data
}

export function portalHandler(handler) {
  return async (req, res, next) => {
    res.set('Cache-Control', 'no-store')
    try {
      await handler(req, res, next)
    } catch (error) {
      const missing = ['42P01', '42703', '42883', 'PGRST202', 'PGRST205'].includes(error.code)
      const status = error.status || (missing ? 503 : error.code === '23505' ? 409
        : ['22P02', '22023', '23503', '23514'].includes(error.code) ? 400
          : ['PGRST116', 'P0002'].includes(error.code) ? 404 : 500)
      if (status >= 500) console.error('School dashboard request failed:', error.code || error.message)
      res.status(status).json({
        error: missing ? 'PORTAL_MIGRATION_REQUIRED' : 'PORTAL_REQUEST_FAILED',
        message: partnerPortalMessages[error.message] || (missing ? 'Appliquez la migration migration_partner_dashboards.sql avant d’utiliser cette fonctionnalité.'
          : error.status ? error.message : status === 409 ? 'Ce rattachement ou ce compte existe déjà.' : 'Impossible de terminer cette opération.')
      })
    }
  }
}

export async function accessibleCompany(db, userId) {
  const owned = await checked(db.from('companies').select('*').eq('owner_id', userId))
  const memberships = await checked(db.from('school_portal_members').select('company_id').eq('user_id', userId))
  const ids = [...new Set([...(owned || []).map((row) => String(row.id)), ...(memberships || []).map((row) => String(row.company_id))])]
  if (ids.length > 1) throw portalError('Plusieurs écoles sont rattachées à ce compte. Contactez Zélia.', 409)
  if (!ids.length) throw portalError('Aucun compte école associé.', 403)
  const company = owned[0] || await checked(db.from('companies').select('*').eq('id', ids[0]).single())
  return { ...company, isOwner: company.owner_id === userId, approved: Boolean(company.approved_at) }
}

export function requireVerifiedMfa(req) {
  if (!(req.user?.factors || []).some((factor) => factor.status === 'verified')) return
  // authenticateToken has already validated this exact token with Supabase.
  const token = req.headers.authorization?.split(' ')[1] || ''
  let claims
  try { claims = JSON.parse(Buffer.from(token.split('.')[1] || '', 'base64url').toString()) } catch {
    throw portalError('Session invalide.', 401)
  }
  if (claims.aal !== 'aal2') throw portalError('MFA_REQUIRED', 403)
}

export function filtersFor(query) {
  const allowed = ['source', 'origin', 'campus', 'status', 'search', 'from', 'to', 'niveauVise', 'budget', 'departement', 'classeActuelle']
  const result = {}
  for (const key of allowed) {
    if (query[key] == null || query[key] === '') continue
    if (typeof query[key] !== 'string' || query[key].length > 500) throw portalError('Filtre invalide.')
    result[key] = query[key].trim()
  }
  for (const key of ['from', 'to']) {
    if (result[key] && (!/^\d{4}-\d{2}-\d{2}$/.test(result[key]) || Number.isNaN(Date.parse(result[key]))
      || new Date(result[key]).toISOString().slice(0, 10) !== result[key])) throw portalError('Date invalide.')
  }
  if (result.from && result.to && result.from > result.to) throw portalError('Période invalide.')
  if (result.origin && !['natural', 'sponsored', 'mixed', 'unknown'].includes(result.origin)) throw portalError('Origine invalide.')
  if (result.source && !['questionnaire', 'direct_request', 'partner_submission', 'legacy_contact'].includes(result.source)) throw portalError('Canal invalide.')
  if (result.status && !leadStatuses.includes(result.status)) throw portalError('Statut invalide.')
  return result
}

export function pageFor(query, max = 200) {
  const limit = query.limit == null ? 50 : Number(query.limit)
  const offset = query.offset == null ? 0 : Number(query.offset)
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > max || !Number.isSafeInteger(offset) || offset < 0) throw portalError('Pagination invalide.')
  return { limit, offset }
}

export function redactLead(lead, admin = false) {
  if (lead.revealed || admin) return lead
  return { ...lead, nom: lead.nom ? `${lead.nom[0]}***` : '', email: '***@***' }
}

export function csvCell(value) {
  let text = value == null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value)
  if (/^[\s]*[=+\-@]/.test(text)) text = `'${text}`
  return `"${text.replace(/"/g, '""')}"`
}

export async function dashboard(db, companyId, filters = {}, limit = 50, offset = 0) {
  return checked(db.rpc('school_dashboard', { p_company: companyId, p_filters: filters, p_limit: limit, p_offset: offset }))
}

export async function auditPortal(db, actor, companyId, action, resource = null) {
  await checked(db.from('school_portal_audit').insert({ actor_id: actor, company_id: companyId, action, resource }))
}

export async function readAll(makeQuery) {
  const rows = []
  for (let offset = 0; ; offset += 1000) {
    const page = await checked(makeQuery().range(offset, offset + 999))
    rows.push(...page)
    if (page.length < 1000) return rows
  }
}

export async function notifyPortalLeads(db, { userId, requestId, companyId }) {
  const events = await readAll(() => {
    const query = db.from('school_portal_events').select('source,formation_ref').order('event_key')
    return userId ? query.eq('user_id', userId) : query.eq('request_id', requestId)
  })
  const keys = new Set(events.map((event) => `${event.source}:${event.formation_ref}`))
  const links = await readAll(() => db.from('school_catalog_links').select('company_id,source,formation_ref').order('source').order('formation_ref'))
  const companies = [...new Set(links.filter((link) => keys.has(`${link.source}:${link.formation_ref}`)).map((link) => link.company_id))]
  const leadKey = userId ? `user:${userId}` : `request:${requestId}`
  for (const id of companies) {
    if (companyId && String(companyId) !== String(id)) continue
    const company = await checked(db.from('companies').select('id,email,approved_at').eq('id', id).single())
    if (!company.approved_at || !company.email) continue
    if (!(await dashboard(db, id, { leadKey }, 1)).leads.length) continue
    if (!await checked(db.rpc('school_claim_notification', { p_company: id, p_key: leadKey }))) continue
    const { sendMail } = await import('./mailer.js')
    try {
      const url = new URL('/espace-ecoles/leads', process.env.CLIENT_URL)
      await sendMail({ to: company.email, subject: 'Un nouveau lead vous attend sur Zélia',
        html: `<p>Un élève a sollicité votre établissement.</p><p><a href="${url.href}">Consulter mes leads</a></p>` })
      await checked(db.from('school_lead_status').update({ notified_at: new Date().toISOString(), notification_error: null, notification_locked_at: null }).eq('company_id', id).eq('lead_key', leadKey))
    } catch (error) {
      await checked(db.from('school_lead_status').update({ notification_error: 'EMAIL_DELIVERY_FAILED', notification_locked_at: null }).eq('company_id', id).eq('lead_key', leadKey))
      console.error('New school lead notification failed:', error.code || error.message)
    }
  }
}
