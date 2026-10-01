import express from 'express'
import { identifier, pagination, searchText, validatePatch, mutationReason, invalid } from '../utils/adminInput.js'
import { withFormationDisplayFields } from '../utils/slug.js'

const profileFields = ['first_name','last_name','age','gender','department','school','phone_number']
const schoolFields = ['name','email','contact_first_name','contact_last_name']
const customFields = ['company_id','title','description','diploma_level','city','domain','image_url','link','contact_email','is_published']
const partnerFields = ['school_name','formation_name','city','domain','diploma_level','description','link','contact_email','is_active']

export function createAdminRouter({ db, authenticateToken, requirePlatformAdmin, isProtectedAdmin }) {
  const router = express.Router()
  router.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next() })
  router.use(authenticateToken, requirePlatformAdmin)
  router.use((req, res, next) => {
    if (!db) return res.status(503).json({ error: 'ADMIN_SERVICE_UNAVAILABLE', message: 'Service administrateur indisponible.' })
    next()
  })

  const run = (handler) => async (req, res) => {
    try { await handler(req, res) } catch (error) {
      const code = error.code || ''
      const missingMigration = ['42P01','42883','PGRST202','PGRST205'].includes(code)
      const status = error.status || (missingMigration ? 503 : ['P0002','PGRST116'].includes(code) ? 404
        : code === '42501' ? 403 : ['23505','40001'].includes(code) ? 409
          : ['22023','22P02','23503','23502','23514'].includes(code) ? 400 : 500)
      const message = error.status === 400 ? error.message : missingMigration
        ? 'La migration SQL du back-office doit etre appliquee.' : status === 404 ? 'Element introuvable.'
          : status === 409 ? 'Modification concurrente ou doublon. Actualisez puis reessayez.'
            : status === 403 ? 'Cette action est interdite.' : 'Impossible de terminer cette operation.'
      if (status >= 500) console.error('Back-office request failed:', code || error.message)
      res.status(status).json({ error: missingMigration ? 'BACKOFFICE_MIGRATION_REQUIRED' : 'ADMIN_REQUEST_FAILED', message })
    }
  }
  const query = async (builder) => {
    let response = await builder
    if (response.error?.code === '57014') response = await builder
    if (response.error) throw response.error
    return response
  }
  const rpc = async (name, args = {}) => (await query(db.rpc(name, args))).data
  const change = (req, kind, id, patch) => rpc('backoffice_change', {
    p_actor: req.user.id, p_kind: kind, p_id: id, p_patch: patch, p_reason: mutationReason(req.body)
  })
  const list = async (builder, req, res, map = (row) => row) => {
    const { limit, offset } = pagination(req.query)
    if (req.query.from) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(req.query.from)) throw invalid('Date invalide.')
      builder = builder.gte('created_at', `${req.query.from}T00:00:00Z`)
    }
    if (req.query.to) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(req.query.to)) throw invalid('Date invalide.')
      builder = builder.lte('created_at', `${req.query.to}T23:59:59.999Z`)
    }
    const { data, count } = await query(builder.range(offset, offset + limit - 1))
    res.json({ items: (data || []).map(map), total: count || 0, limit, offset })
  }

  router.get('/me', run(async (req, res) => res.json({ user: { id: req.user.id, email: req.user.email } })))
  router.get('/overview', run(async (req, res) => res.json(await rpc('backoffice_overview'))))
  router.get('/users', run(async (req, res) => {
    const { limit, offset } = pagination(req.query)
    const status = req.query.status || 'all'
    const type = req.query.type || 'all'
    if (!['all','active','suspended'].includes(status) || !['all','school','student'].includes(type)) throw invalid('Filtre invalide.')
    res.json({ ...await rpc('backoffice_users', { p_query: searchText(req.query.q), p_status: status, p_type: type, p_limit: limit, p_offset: offset }), limit, offset })
  }))
  router.get('/users/:id', run(async (req, res) => {
    const id = identifier(req.params.id, true)
    const users = await rpc('backoffice_users', { p_user_id: id })
    if (!users.items.length) return res.status(404).json({ message: 'Compte introuvable.' })
    const [profile, extraInfo, schools, memberships] = await Promise.all([
      query(db.from('profiles').select('id,first_name,last_name,age,gender,department,school,phone_number,contact_preference,created_at').eq('id', id).maybeSingle()),
      query(db.from('informations_complementaires').select('question_id,answer_text').eq('user_id', id).like('question_id', 'orientation_%')),
      query(db.from('companies').select('id,name,approved_at').eq('owner_id', id)),
      query(db.from('school_portal_members').select('id,company_id,role').eq('user_id', id))
    ])
    res.json({ user: users.items[0], profile: profile.data, extraInfo: extraInfo.data || [], schools: schools.data || [], memberships: memberships.data || [], protectedAdmin: isProtectedAdmin(id) })
  }))
  router.patch('/users/:id', run(async (req, res) => {
    const id = identifier(req.params.id, true)
    res.json({ item: await change(req, 'profile', id, validatePatch(req.body, profileFields)) })
  }))
  router.post('/users/:id/:action(suspend|reactivate)', run(async (req, res) => {
    const id = identifier(req.params.id, true)
    if (isProtectedAdmin(id)) return res.status(403).json({ message: 'Les comptes administrateurs sont proteges.' })
    const reason = mutationReason(req.body, true)
    const suspended = req.params.action === 'suspend'
    const args = { p_actor: req.user.id, p_user_id: id, p_suspended: suspended, p_reason: reason }
    const pending = await rpc('backoffice_account_change', args)
    const { error } = await db.auth.admin.updateUserById(id, { ban_duration: suspended ? '876000h' : 'none' })
    if (error) return res.status(502).json({ error: 'AUTH_SYNC_PENDING', message: 'Le compte reste bloque. La synchronisation Auth a echoue ; reessayez cette action.' })
    res.json({ item: await rpc('backoffice_account_change', { ...args, p_revision: pending.revision }) })
  }))

  router.get('/school-options', run(async (req, res) => res.json({ items: await rpc('search_partner_schools', { p_query: searchText(req.query.q),p_limit: 20 }) })))
  router.get('/schools', run(async (req, res) => {
    let builder = db.from('companies').select('id,name,email,owner_id,contact_first_name,contact_last_name,approved_at,created_at', { count: 'exact' }).order('created_at', { ascending: false }).order('id')
    const search = searchText(req.query.q)
    if (search) builder = builder.or(`name.ilike.%${search}%,email.ilike.%${search}%`)
    if (req.query.status === 'active') builder = builder.not('approved_at', 'is', null)
    else if (req.query.status === 'inactive') builder = builder.is('approved_at', null)
    else if (req.query.status && req.query.status !== 'all') throw invalid('Statut invalide.')
    await list(builder, req, res)
  }))
  router.get('/schools/:id', run(async (req, res) => {
    const id = identifier(req.params.id)
    const company = await query(db.from('companies').select('id,name,email,owner_id,contact_first_name,contact_last_name,approved_at,created_at').eq('id', id).single())
    const members = await query(db.from('school_portal_members').select('id,user_id,role,created_at').eq('company_id', id))
    const identities = await Promise.all([company.data.owner_id, ...(members.data || []).map((member) => member.user_id)].filter(Boolean).map(async (userId) => {
      const data = await rpc('backoffice_users', { p_user_id: userId })
      return data.items[0]
    }))
    res.json({ item: company.data, members: members.data || [], accounts: identities.filter(Boolean) })
  }))
  router.patch('/schools/:id', run(async (req, res) => res.json({ item: await change(req,'school',identifier(req.params.id),validatePatch(req.body,schoolFields)) })))
  router.post('/schools/:id/:action(approve|revoke)', run(async (req, res) => {
    mutationReason(req.body, true)
    res.json({ item: await change(req,`school_${req.params.action}`,identifier(req.params.id),{}) })
  }))

  router.get('/formations', run(async (req, res) => {
    const source = req.query.source || 'national'
    const search = searchText(req.query.q)
    let builder
    if (source === 'national') {
      builder = db.from('formation_france').select('id,nm,fl,nmc,etab_nom,commune,departement,region,fiche,etab_url', { count: 'exact' }).order('id')
      if (search) builder = builder.or(`nmc.ilike.%${search}%,etab_nom.ilike.%${search}%,commune.ilike.%${search}%`)
    } else if (source === 'custom') {
      builder = db.from('custom_school_formations').select('*', { count: 'exact' }).order('created_at', { ascending: false }).order('id')
      if (search) builder = builder.or(`title.ilike.%${search}%,city.ilike.%${search}%`)
      if (req.query.company_id) builder = builder.eq('company_id',identifier(req.query.company_id))
    } else throw invalid('Source invalide.')
    await list(builder, req, res, source === 'national' ? withFormationDisplayFields : (row) => row)
  }))
  router.post('/formations/custom', run(async (req, res) => res.status(201).json({ item: await change(req,'custom',null,validatePatch(req.body,customFields,['company_id','title'])) })))
  router.patch('/formations/custom/:id', run(async (req, res) => res.json({ item: await change(req,'custom',identifier(req.params.id),validatePatch(req.body,customFields.filter((field) => field !== 'company_id'))) })))

  router.get('/partners/group-count', run(async (req, res) => {
    const { school_name, city } = validatePatch(req.query,['school_name','city'],['school_name','city'])
    const response = await query(db.from('ecoles_partenaires').select('id', { count: 'exact', head: true }).eq('school_name', school_name).eq('city', city))
    res.json({ total: response.count })
  }))
  router.post('/partners/group-status', run(async (req, res) => {
    mutationReason(req.body, true)
    const patch = validatePatch(req.body,['school_name','city','is_active'],['school_name','city'])
    if (typeof patch.is_active !== 'boolean') throw invalid('Statut requis.')
    res.json({ item: await change(req,'partner_group',null,patch) })
  }))
  router.get('/partners', run(async (req, res) => {
    let builder = db.from('ecoles_partenaires').select('*', { count: 'exact' }).order('school_name').order('city').order('id')
    const search = searchText(req.query.q)
    if (search) builder = builder.or(`school_name.ilike.%${search}%,formation_name.ilike.%${search}%,city.ilike.%${search}%`)
    if (['active','inactive'].includes(req.query.status)) builder = builder.eq('is_active',req.query.status === 'active')
    else if (req.query.status && req.query.status !== 'all') throw invalid('Statut invalide.')
    await list(builder, req, res)
  }))
  router.get('/partners/:id', run(async (req, res) => res.json({ item: (await query(db.from('ecoles_partenaires').select('*').eq('id',identifier(req.params.id,true)).single())).data })))
  router.post('/partners', run(async (req, res) => res.status(201).json({ item: await change(req,'partner',null,validatePatch(req.body,partnerFields,['school_name','formation_name','city'])) })))
  router.patch('/partners/:id', run(async (req, res) => res.json({ item: await change(req,'partner',identifier(req.params.id,true),validatePatch(req.body,partnerFields)) })))

  router.get('/results', run(async (req, res) => {
    const { limit, offset } = pagination(req.query)
    res.json({ ...await rpc('backoffice_results', { p_query: searchText(req.query.q), p_type: searchText(req.query.type), p_user_id: req.query.user_id ? identifier(req.query.user_id,true) : null, p_limit: limit, p_offset: offset }), limit, offset })
  }))
  router.get('/results/:id', run(async (req, res) => {
    const result = (await query(db.from('user_results').select('*').eq('id',identifier(req.params.id)).single())).data
    const [users, selection] = await Promise.all([
      rpc('backoffice_users',{ p_user_id: result.user_id }),
      query(db.from('informations_complementaires').select('answer_text,created_at').eq('user_id',result.user_id).eq('question_id','orientation_final_selection').order('created_at',{ ascending: false }).limit(1))
    ])
    let selections = []
    try {
      const raw = selection.data?.[0]?.answer_text
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
      selections = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.candidates) ? parsed.candidates : []
    } catch { selections = [] }
    selections = selections.filter((candidate) => typeof candidate === 'string' || (candidate && typeof candidate === 'object' && !Array.isArray(candidate))).slice(0,16)
    res.json({ item: result, user: users.items[0], selections, selectionRecorded: Boolean(selection.data?.length) })
  }))
  router.get('/audit', run(async (req, res) => {
    let builder = db.from('backoffice_audit').select('*', { count: 'exact' }).order('created_at', { ascending: false }).order('id', { ascending: false })
    const search = searchText(req.query.q)
    if (search) builder = builder.or(`action.ilike.%${search}%,resource_id.ilike.%${search}%`)
    if (req.query.actor_id) builder = builder.eq('actor_id',identifier(req.query.actor_id,true))
    await list(builder, req, res)
  }))
  return router
}