import express from 'express'
import rateLimit from 'express-rate-limit'
import {
  accessibleCompany, auditPortal, checked, csvCell, dashboard, filtersFor, leadStatuses, notifyPortalLeads,
  pageFor, portalError, portalHandler, readAll, redactLead, requireVerifiedMfa, SHARING_VERSION
} from '../utils/schoolDashboard.js'

const identifier = (value) => {
  if (!/^[1-9]\d*$/.test(String(value))) throw portalError('Identifiant invalide.')
  return String(value)
}

export function createPartnerDashboardRouter({ db, authenticateToken, admin = false }) {
  const router = express.Router({ mergeParams: true })
  const requestedFilters = (query) => ({ ...filtersFor(query), ...(admin ? { unmasked: true } : {}) })
  if (!admin) router.use((req, res, next) => {
    if (!/^\/(?:leads|lead|stats|catalog|company|members|school-formations|activation-complete|direct-requests)(?:\/|$)/.test(req.path)) return next('router')
    next()
  })
  router.use(authenticateToken)
  if (!admin) router.post('/activation-complete', portalHandler(async (req, res) => {
    await accessibleCompany(db, req.user.id)
    await checked(db.from('school_portal_invitations').update({ status: 'accepted' }).eq('user_id', req.user.id).eq('email', req.user.email))
    res.json({ accepted: true })
  }))
  router.use(portalHandler(async (req, res, next) => {
    if (!db) throw portalError('Service indisponible.', 503)
    if (admin) {
      req.school = await checked(db.from('companies').select('*').eq('id', identifier(req.params.companyId)).single())
    } else {
      requireVerifiedMfa(req)
      req.school = await accessibleCompany(db, req.user.id)
      if (!req.school.approved_at) throw portalError('Compte en attente de validation.', 403)
    }
    next()
  }))

  router.get('/leads', portalHandler(async (req, res) => {
    const { limit, offset } = pageFor(req.query)
    const data = await dashboard(db, req.school.id, requestedFilters(req.query), limit, offset)
    res.json({ ...data, leads: data.leads.map((lead) => redactLead(lead, admin)), limit, offset })
  }))
  router.get('/stats', portalHandler(async (req, res) => {
    const { leads, ...stats } = await dashboard(db, req.school.id, requestedFilters(req.query), 1)
    res.json(stats)
  }))
  router.get('/leads/export.csv', portalHandler(async (req, res) => {
    const filters = requestedFilters(req.query)
    // A single SQL snapshot avoids offset drift while new leads arrive.
    const data = await dashboard(db, req.school.id, filters, -1)
    const rows = data.leads.map((lead) => redactLead(lead, admin))
    if (admin) await auditPortal(db, req.user.id, req.school.id, 'export')
    const columns = ['prenom', 'nom', 'email', 'origin', 'source', 'classe_actuelle', 'niveau_vise', 'budget', 'formations_choisies_ecole', 'status', 'note', 'inscrit_le']
    const csv = [columns.map(csvCell).join(';'), ...rows.map((lead) => columns.map((key) => csvCell(lead[key])).join(';'))].join('\r\n')
    res.type('text/csv; charset=utf-8').attachment(`leads-${req.school.id}.csv`).send(`\uFEFF${csv}`)
  }))
  router.get('/lead/:key', portalHandler(async (req, res) => {
    const data = await dashboard(db, req.school.id, { leadKey: req.params.key }, 1)
    const lead = data.leads[0]
    if (!lead) throw portalError('Lead introuvable ou partage retiré.', 404)
    let detail = null
    if (lead.detailedAllowed && (lead.revealed || admin)) {
      const [profile, answers, extraInfo, analysis] = await Promise.all([
        checked(db.from('profiles').select('first_name,last_name,age,gender,department,school,phone_number').eq('id', lead.user_id).maybeSingle()),
        readAll(() => db.from('user_responses').select('id,question_id,response,questions(content)').eq('user_id', lead.user_id).eq('questionnaire_type', 'inscription').order('question_id').order('id')),
        readAll(() => db.from('informations_complementaires').select('question_id,question_text,answer_text,created_at,id').eq('user_id', lead.user_id)
          .like('question_id', 'orientation_%').neq('question_id', 'orientation_final_selection').neq('question_id', 'orientation_recommendations').order('created_at', { ascending: false }).order('id', { ascending: false })),
        checked(db.from('user_results').select('personality_analysis,skills_assessment,job_recommendations,study_recommendations,updated_at').eq('user_id', lead.user_id).eq('questionnaire_type', 'inscription').order('updated_at', { ascending: false }).limit(1).maybeSingle())
      ])
      const seen = new Set()
      detail = { profile, answers, extraInfo: extraInfo.filter((entry) => !seen.has(entry.question_id) && seen.add(entry.question_id)), analysis }
    }
    if (admin) await auditPortal(db, req.user.id, req.school.id, 'view_lead', lead.leadKey)
    res.json({ lead: redactLead(lead, admin), detail, detailLocked: lead.detailedAllowed && !lead.revealed && !admin })
  }))
  router.get('/catalog', portalHandler(async (req, res) => {
    const { limit, offset } = pageFor(req.query)
    const q = admin ? String(req.query.q || '').trim().slice(0, 500) : ''
    const source = String(req.query.source || '')
    if (source && !['formation_france', 'ecoles_partenaires'].includes(source)) throw portalError('Source invalide.')
    res.json(await checked(db.rpc('school_catalog_candidates', { p_company: req.school.id, p_query: q, p_source: source, p_limit: limit, p_offset: offset })))
  }))
  router.get('/company', portalHandler(async (req, res) => {
    res.json({ company: { id: req.school.id, name: req.school.name, approved: Boolean(req.school.approved_at), isOwner: req.school.isOwner || false } })
  }))
  router.get('/school-formations', portalHandler(async (req, res) => {
    res.json({ formations: await readAll(() => db.from('custom_school_formations').select('*').eq('company_id', req.school.id).order('id')) })
  }))
  router.get('/members', portalHandler(async (req, res) => {
    const members = await readAll(() => db.from('school_portal_members').select('id,user_id,role,created_at').eq('company_id', req.school.id).order('id'))
    const identities = await Promise.all(members.map((member) => checked(db.auth.admin.getUserById(member.user_id))))
    res.json({ owner: { email: req.school.email, contactFirstName: req.school.contact_first_name, contactLastName: req.school.contact_last_name },
      members: members.map((member, index) => ({ id: member.id, userId: member.user_id, email: identities[index].user.email, role: member.role,
        createdAt: member.created_at, lastSignInAt: identities[index].user.last_sign_in_at })) })
  }))
  if (admin) {
    router.use((req, res) => res.status(405).json({ error: 'READ_ONLY', message: 'Aperçu administrateur en lecture seule.' }))
    return router
  }
  router.post('/members', invitationLimiter, portalHandler(async (req, res) => {
    if (!req.school.isOwner) throw portalError('Action réservée au propriétaire.', 403)
    res.json(await inviteSchoolAccount({ db, company: req.school, email: String(req.body.email || '').trim().toLowerCase(),
      role: 'member', clientUrl: process.env.CLIENT_URL, actor: req.user.id }))
  }))
  router.delete('/members/:id', portalHandler(async (req, res) => {
    if (!req.school.isOwner) throw portalError('Action réservée au propriétaire.', 403)
    await checked(db.rpc('school_remove_member', { p_company: req.school.id, p_member: identifier(req.params.id), p_actor: req.user.id }))
    res.json({ removed: true })
  }))
  router.use(['/direct-requests', '/leads/:id/reveal'], (req, res) => res.status(410).json({ error: 'PORTAL_ENDPOINT_REPLACED', message: 'Utilisez les nouveaux endpoints de leads et de révélation.' }))
  router.post('/lead/:key/reveal', portalHandler(async (req, res) => {
    const data = await dashboard(db, req.school.id, { leadKey: req.params.key }, 1)
    if (!data.leads.length) throw portalError('Lead introuvable ou partage retiré.', 404)
    await checked(db.from('school_lead_reveals').upsert({ company_id: req.school.id, lead_key: req.params.key }, { onConflict: 'company_id,lead_key' }))
    res.json({ revealed: true })
  }))
  router.patch('/leads/:key/status', portalHandler(async (req, res) => {
    const { status, note } = req.body
    if ((status !== undefined && !leadStatuses.includes(status)) || (note !== undefined && (typeof note !== 'string' || note.length > 2000))
      || (status === undefined && note === undefined)) throw portalError('Statut ou note invalide.')
    const data = await dashboard(db, req.school.id, { leadKey: req.params.key }, 1)
    if (!data.leads.length) throw portalError('Lead introuvable ou partage retiré.', 404)
    res.json(await checked(db.rpc('school_patch_lead', { p_company: req.school.id, p_key: req.params.key,
      p_status: status ?? null, p_note: note ?? null })))
  }))
  return router
}

export function createSchoolSharingRouter({ db, authenticateToken }) {
  const router = express.Router()
  router.use(authenticateToken)
  router.get('/', portalHandler(async (req, res) => {
    const [consent, links, events, blocks] = await Promise.all([
      checked(db.from('school_sharing_consents').select('version,granted_at,revoked_at').eq('user_id', req.user.id).maybeSingle()),
      readAll(() => db.from('school_catalog_links').select('company_id,source,formation_ref,companies(name)').order('source').order('formation_ref')),
      readAll(() => db.from('school_portal_events').select('source,formation_ref,recipient_company_id,companies(name)').eq('user_id', req.user.id).order('event_key')),
      readAll(() => db.from('school_sharing_blocks').select('company_id,companies(name)').eq('user_id', req.user.id).order('company_id'))
    ])
    const eventKeys = new Set(events.filter((event) => event.recipient_company_id == null).map((event) => `${event.source}:${event.formation_ref}`))
    const recipients = [
      ...events.filter((event) => event.recipient_company_id != null).map((event) => ({ company_id: event.recipient_company_id, companies: event.companies })),
      ...links.filter((link) => eventKeys.has(`${link.source}:${link.formation_ref}`)),
      ...blocks
    ]
    const schools = [...new Map(recipients.map((recipient) => [String(recipient.company_id),
      { id: recipient.company_id, name: recipient.companies?.name, blocked: blocks.some((block) => String(block.company_id) === String(recipient.company_id)) }])).values()]
    res.json({ consent, schools })
  }))
  router.post('/', portalHandler(async (req, res) => {
    if (req.body.version !== SHARING_VERSION || typeof req.body.granted !== 'boolean') throw portalError('Confirmation de partage invalide.')
    await checked(db.rpc('school_set_sharing', { p_user: req.user.id, p_granted: req.body.granted }))
    res.json({ saved: true })
  }))
  router.post('/:companyId', portalHandler(async (req, res) => {
    if (typeof req.body.blocked !== 'boolean') throw portalError('Choix invalide.')
    const companyId = identifier(req.params.companyId)
    if (req.body.blocked) await checked(db.from('school_sharing_blocks').upsert({ user_id: req.user.id, company_id: companyId }))
    else await checked(db.from('school_sharing_blocks').delete().eq('user_id', req.user.id).eq('company_id', companyId))
    res.json({ saved: true })
  }))
  return router
}

const invitationLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 15, standardHeaders: true, legacyHeaders: false })

export async function inviteSchoolAccount({ db, company, email, role, clientUrl, actor, deliver }) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !['owner', 'member'].includes(role)) throw portalError('Email ou rôle invalide.')
  let destination
  try { destination = new URL('/espace-ecoles/activation', clientUrl) } catch {
    throw portalError('CLIENT_URL doit être configuré avant l’envoi des invitations.', 503)
  }
  if (!['https:', 'http:'].includes(destination.protocol)) throw portalError('CLIENT_URL invalide.', 503)
  const previous = await checked(db.from('school_portal_invitations').select('*').eq('company_id', company.id).eq('email', email).maybeSingle())
  if (previous && previous.role !== role) throw portalError('Cet email possède déjà une invitation avec un autre rôle.', 409)
  if (previous?.sent_at && Date.now() - Date.parse(previous.sent_at) < 60000) throw portalError('Attendez une minute avant un nouvel envoi.', 429)
  let existingUserId = previous?.user_id
  if (!existingUserId && role === 'owner' && company.owner_id) {
    const identity = await checked(db.auth.admin.getUserById(company.owner_id))
    if (identity.user.email?.toLowerCase() !== email) throw portalError('Cette école possède déjà un propriétaire.', 409)
    existingUserId = company.owner_id
  }
  const existingIdentity = await checked(db.rpc('school_find_auth_user', { p_email: email }))
  if (existingIdentity && existingIdentity !== existingUserId) {
    const membership = await checked(db.from('school_portal_members').select('company_id').eq('user_id', existingIdentity).eq('company_id', company.id).maybeSingle())
    if (role !== 'member' || !membership) throw portalError('Cet email appartient déjà à un autre compte. Utilisez une adresse professionnelle distincte.', 409)
    existingUserId = existingIdentity
  }
  if (!await checked(db.rpc('school_claim_invitation', { p_company: company.id, p_email: email, p_role: role }))) throw portalError('Invitation déjà en cours. Réessayez plus tard.', 429)
  // Generate the identity first, attach it, then deliver. Never delete a reused identity.
  const { data, error } = await db.auth.admin.generateLink({ type: existingUserId ? 'recovery' : 'invite', email,
    options: { redirectTo: destination.href, ...(existingUserId ? {} : { data: { profile_type: 'school' } }) } })
  if (error) {
    await checked(db.from('school_portal_invitations').update({ status: 'failed', error: 'AUTH_INVITATION_FAILED' }).eq('company_id', company.id).eq('email', email))
    throw portalError('Invitation impossible. Email déjà utilisé ou service Auth indisponible ; vérifiez le compte avant de réessayer.', 409)
  }
  try {
    if (!data?.user?.id || typeof data.properties?.action_link !== 'string') throw portalError('Réponse Auth incomplète.', 503)
    const userId = data.user.id
    if (existingUserId && existingUserId !== userId) throw portalError('L’identité du compte a changé. Contactez Zélia.', 409)
    if (!existingUserId && data.user.user_metadata?.profile_type !== 'school') throw portalError('Cet email appartient déjà à un autre compte. Utilisez une adresse professionnelle distincte.', 409)
    await checked(db.from('school_portal_invitations').update({ user_id: userId }).eq('company_id', company.id).eq('email', email))
    const affiliations = await accessibleCompany(db, userId).catch((failure) => {
      if (failure.status === 403) return null
      throw failure
    })
    if (affiliations && String(affiliations.id) !== String(company.id)) throw portalError('Ce compte est déjà rattaché à une autre école.', 409)
    await checked(db.rpc('school_attach_account', { p_company: company.id, p_user: userId, p_role: role }))
  } catch (failure) {
    await checked(db.from('school_portal_invitations').update({ status: 'failed', error: 'ACCOUNT_ATTACHMENT_FAILED' }).eq('company_id', company.id).eq('email', email))
    throw failure
  }
  const { sendMail } = await import('../utils/mailer.js')
  try {
    const safeLink = data.properties.action_link.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
    await (deliver || sendMail)({ to: email, subject: 'Votre accès à l’espace écoles Zélia',
      html: `<p>Votre espace école est prêt.</p><p><a href="${safeLink}">Activer mon accès et choisir mon mot de passe</a></p><p>Ce lien est personnel et temporaire.</p>` })
  } catch (failure) {
    await checked(db.from('school_portal_invitations').update({ status: 'failed', error: 'EMAIL_DELIVERY_FAILED' }).eq('company_id', company.id).eq('email', email))
    console.error('School invitation delivery failed:', failure.code || failure.message)
    throw portalError('Compte préparé, mais email non envoyé. Vérifiez SMTP/Resend puis renvoyez l’invitation.', 503)
  }
  await checked(db.from('school_portal_invitations').update({ status: 'sent', sent_at: new Date().toISOString(), error: null }).eq('company_id', company.id).eq('email', email))
  await auditPortal(db, actor, company.id, 'invite', role)
  return { sent: true }
}

export function createPartnerManagementRouter({ db, clientUrl }) {
  const router = express.Router()
  router.get('/partners/:id/company', portalHandler(async (req, res) => {
    const link = await checked(db.from('school_catalog_links').select('company_id').eq('source', 'ecoles_partenaires').eq('formation_ref', req.params.id).maybeSingle())
    res.json({ companyId: link?.company_id || null })
  }))
  router.post('/schools', portalHandler(async (req, res) => {
    const { schoolName, email, firstName = '', lastName = '' } = req.body
    if (typeof schoolName !== 'string' || !schoolName.trim() || schoolName.length > 500 || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw portalError('Établissement ou email invalide.')
    const company = await checked(db.rpc('school_create_portal', { p_name: schoolName.trim(), p_email: email.trim().toLowerCase(),
      p_first: String(firstName).slice(0, 500), p_last: String(lastName).slice(0, 500), p_request: req.body.requestId == null ? null : identifier(req.body.requestId) }))
    await auditPortal(db, req.user.id, company.id, 'create_school')
    res.status(201).json({ company })
  }))
  router.post('/schools/:id/invite', invitationLimiter, portalHandler(async (req, res) => {
    const company = await checked(db.from('companies').select('*').eq('id', identifier(req.params.id)).single())
    res.json(await inviteSchoolAccount({ db, company, email: String(req.body.email || company.email).trim().toLowerCase(),
      role: req.body.role || 'owner', clientUrl, actor: req.user.id }))
  }))
  router.get('/schools/:id/invitations', portalHandler(async (req, res) => {
    const companyId = identifier(req.params.id)
    const [items, failures, audit] = await Promise.all([
      readAll(() => db.from('school_portal_invitations').select('id,email,role,status,error,sent_at,created_at,user_id').eq('company_id', companyId).order('id')),
      readAll(() => db.from('school_lead_status').select('lead_key').eq('company_id', companyId).not('notification_error', 'is', null).order('lead_key')),
      checked(db.from('school_portal_audit').select('id,actor_id,action,resource,created_at').eq('company_id', companyId).order('created_at', { ascending: false }).order('id', { ascending: false }).limit(20))
    ])
    res.json({ items, notificationFailures: failures.length, recentAudit: audit })
  }))
  router.post('/schools/:id/retry-notifications', invitationLimiter, portalHandler(async (req, res) => {
    const companyId = identifier(req.params.id)
    const failures = await readAll(() => db.from('school_lead_status').select('lead_key').eq('company_id', companyId).not('notification_error', 'is', null).order('lead_key'))
    for (const { lead_key: key } of failures) {
      const [type, id] = key.split(':')
      await notifyPortalLeads(db, type === 'user' ? { userId: id, companyId } : { requestId: id, companyId })
    }
    await auditPortal(db, req.user.id, companyId, 'retry_notifications')
    res.json({ attempted: failures.length })
  }))
  router.delete('/schools/:id/members/:memberId', portalHandler(async (req, res) => {
    const companyId = identifier(req.params.id)
    await checked(db.rpc('school_remove_member', { p_company: companyId, p_member: identifier(req.params.memberId), p_actor: req.user.id }))
    res.json({ removed: true })
  }))
  router.post('/schools/:id/catalog', portalHandler(async (req, res) => {
    const companyId = identifier(req.params.id)
    const { source, reference } = req.body
    if (!['formation_france', 'ecoles_partenaires'].includes(source) || typeof reference !== 'string' || !reference) throw portalError('Référence invalide.')
    if (source === 'formation_france' ? !/^[1-9]\d{0,18}$/.test(reference) : !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(reference)) throw portalError('Référence invalide.')
    await checked(db.rpc('school_manage_catalog', { p_company: companyId, p_source: source,
      p_ref: source === 'formation_france' ? BigInt(reference).toString() : reference.toLowerCase(), p_actor: req.user.id, p_remove: false }))
    res.json({ linked: true })
  }))
  router.delete('/schools/:id/catalog', portalHandler(async (req, res) => {
    const companyId = identifier(req.params.id)
    if (!['formation_france', 'ecoles_partenaires'].includes(req.body.source) || typeof req.body.reference !== 'string') throw portalError('Référence invalide.')
    await checked(db.rpc('school_manage_catalog', { p_company: companyId, p_source: req.body.source, p_ref: req.body.reference, p_actor: req.user.id, p_remove: true }))
    res.json({ removed: true })
  }))
  return router
}
