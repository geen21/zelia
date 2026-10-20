import assert from 'node:assert/strict'
import express from 'express'
import { once } from 'node:events'
import { readFile } from 'node:fs/promises'
import { createAdminRouter } from '../routes/admin.js'
import { createPlatformAdminGuard } from '../middleware/admin.js'
import { assertAccountActive } from '../utils/accountStatus.js'

const joris = { id: '11111111-1111-4111-8111-111111111111',email: 'joris.geerdes@21datas.ch' }
const nicolas = { id: '22222222-2222-4222-8222-222222222222',email: 'nicolas.wiegele@zelia.io' }
const student = { id: '33333333-3333-4333-8333-333333333333',email: 'student@example.com' }
const calls = []
let suspension = null
let statusError = null
let authError = null
let rpcError = null
let rpcCalled = false
let userDetailExists = false
let orientationReadError = null
let orientationResponses = [{ id: 1,question_id: 200,response: 'Construire un objet',created_at: '2026-10-01T10:00:00Z',questions: { content: 'Tu préfères quelle activité ?' } }]
let orientationAnalysis = { id: 10,job_recommendations: [{ title: 'Menuisier' },{ title: 'Mécanicien' }],updated_at: '2026-10-01T11:00:00Z' }
let recordedSelections = []
let recordedRecommendations = []
const reads = []
const db = {
  from(table) {
    const read = { table,filters: [],orders: [],exclusions:[] }
    reads.push(read)
    const builder = {
      select(fields) { read.fields = fields; return this },
      eq(field,value) { read.filters.push([field,value]); return this },
      neq(field,value) { read.exclusions.push([field,value]); return this },
      order(field,options) { read.orders.push([field,options]); return this },
      limit(value) { read.limit = value; return this },
      or() { return this },not() { return this },
      is() { return this },like() { return this },range() { return this },gte() { return this },lte() { return this },
      maybeSingle: async () => ({ data: table === 'backoffice_account_suspensions' ? suspension : table === 'user_results' ? orientationAnalysis : null,error: table === 'backoffice_account_suspensions' ? statusError : null }),
      single: async () => ({ data: { id: 1,user_id: student.id },error: null }),
      then(resolve) { return Promise.resolve({ data: table === 'user_responses' ? orientationResponses : table === 'informations_complementaires' ? read.filters.some(([field,value]) => field === 'question_id' && value === 'orientation_recommendations') ? recordedRecommendations : recordedSelections : [],count: 0,error: table === 'user_responses' ? orientationReadError : null }).then(resolve) }
    }
    return builder
  },
  async rpc(name,args) {
    rpcCalled = true; calls.push({ name,args })
    if (rpcError) return { data: null,error: rpcError }
    if (name === 'backoffice_account_change') return { data: { revision: '44444444-4444-4444-8444-444444444444' },error: null }
    if (name === 'backoffice_create_partner_campuses') return {
      data:{ items:args.p_cities.map((city,index) => ({ id:`campus-${index}`,...args.p_patch,city })),total:args.p_cities.length },error:null
    }
    if (name === 'backoffice_users' && args.p_user_id) return { data: { items: userDetailExists ? [student] : [],total: Number(userDetailExists) },error: null }
    return { data: ['backoffice_users','backoffice_results','backoffice_selections','backoffice_recommendations'].includes(name) ? { items: [],total: 0 } : { id: '1' },error: null }
  },
  auth: { admin: { async updateUserById(id,patch) { calls.push({ name: 'Auth',id,patch }); return { error: authError } } } }
}
const tokens = { joris,nicolas,student,spoof: { ...student,email: joris.email } }
const authenticateToken = async (req,res,next) => {
  const user = tokens[req.headers.authorization?.replace('Bearer ','')]
  if (!user) return res.status(401).json({ error: 'AUTH_REQUIRED' })
  try { await assertAccountActive(db,user.id); req.user = user; next() }
  catch (error) { res.status(error.status).json({ error: error.message }) }
}
const app = express()
app.use(express.json({ limit: '64kb' }))
app.use('/api/admin',createAdminRouter({ db,authenticateToken,requirePlatformAdmin: createPlatformAdminGuard(() => [joris,nicolas]),isProtectedAdmin: (id) => [joris.id,nicolas.id].includes(id) }))
const server = app.listen(0,'127.0.0.1')
await once(server,'listening')
const base = `http://127.0.0.1:${server.address().port}/api/admin`
async function request(path,token = 'joris',method = 'GET',body) {
  return fetch(`${base}${path}`,{ method,headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}),'Content-Type':'application/json' },...(body === undefined ? {} : { body: JSON.stringify(body) }) })
}

try {
  for (const [path,method] of [['/me','GET'],['/overview','GET'],['/student-growth','GET'],['/selections','GET'],['/recommendations','GET'],['/users','GET'],[`/users/${student.id}`,'GET'],['/schools','GET'],['/school-registrations','GET'],['/formations','GET'],['/partners','GET'],['/results','GET'],['/audit','GET'],[`/users/${student.id}`,'PATCH'],['/schools/1/approve','POST'],['/partners','POST'],['/partners/campuses','POST'],['/formations/custom','POST']]) {
    assert.equal((await request(path,null,method,method === 'GET' ? undefined : {})).status,401)
    assert.equal((await request(path,'student',method,method === 'GET' ? undefined : {})).status,403)
  }
  assert.equal((await request('/me','spoof')).status,403)
  assert.equal((await request('/me','joris')).status,200)
  assert.equal((await request('/me','nicolas')).status,200)
  const me = await request('/me')
  assert.equal(me.headers.get('cache-control'),'no-store')
  assert.deepEqual(await me.json(),{ user: joris })
  assert.equal((await request('/users?limit=101')).status,400)
  assert.equal((await request('/student-growth?days=90')).status,200)
  assert.deepEqual(calls.find((call) => call.name === 'backoffice_student_growth').args,{ p_days:90 })
  for (const days of ['0','31','999','invalid','']) assert.equal((await request(`/student-growth?days=${days}`)).status,400)
  assert.equal((await request('/users?offset=-1')).status,400)
  assert.equal((await request(`/selections?source=partner&user_id=${student.id}&q=Bachelor&limit=5&offset=10`)).status,200)
  assert.deepEqual(calls.find((call) => call.name === 'backoffice_selections').args,{ p_query:'Bachelor',p_source:'partner',p_user_id:student.id,p_limit:5,p_offset:10 })
  for (const query of ['source=unknown','user_id=invalid','limit=101','offset=-1']) assert.equal((await request(`/selections?${query}`)).status,400)
  assert.equal((await request(`/recommendations?source=partner&user_id=${student.id}&q=ECV&limit=5&offset=10`)).status,200)
  assert.deepEqual(calls.find((call) => call.name === 'backoffice_recommendations').args,{ p_query:'ECV',p_source:'partner',p_user_id:student.id,p_limit:5,p_offset:10 })
  for (const query of ['source=orientation','user_id=invalid','limit=101','offset=-1']) assert.equal((await request(`/recommendations?${query}`)).status,400)
  assert.equal((await request('/selections','joris','POST',{})).status,404)
  assert.equal((await request('/users?status=unknown')).status,400)
  assert.equal((await request('/formations?source=arbitrary_table')).status,400)
  assert.equal((await request('/users/not-a-uuid')).status,400)
  assert.equal((await request(`/users/${student.id}`)).status,404)
  assert.equal(reads.some((read) => read.table === 'user_responses'),false)
  userDetailExists = true
  const userDetail = await request(`/users/${student.id}`)
  assert.equal(userDetail.status,200)
  assert.equal(userDetail.headers.get('cache-control'),'no-store')
  const details = await userDetail.json()
  assert.deepEqual(details.orientationResponses,orientationResponses)
  assert.deepEqual(details.orientationAnalysis,orientationAnalysis)
  const recommendationRead = reads.find((read) => read.table === 'informations_complementaires' && read.filters.some(([field,value]) => field === 'question_id' && value === 'orientation_recommendations'))
  assert.equal(recommendationRead.limit,1)
  assert.deepEqual(recommendationRead.orders,[['created_at',{ ascending:false }],['id',{ ascending:false }]])
  assert.ok(reads.some((read) => read.exclusions.some(([field,value]) => field === 'question_id' && value === 'orientation_recommendations')))
  for (const table of ['user_responses','user_results']) {
    const read = reads.find((entry) => entry.table === table)
    assert.deepEqual(read.filters,[['user_id',student.id],['questionnaire_type','inscription']])
    assert.notEqual(read.fields,'*')
  }
  const responsesRead = reads.find((read) => read.table === 'user_responses')
  assert.equal(responsesRead.fields,'id,question_id,response,created_at,questions(content)')
  assert.deepEqual(responsesRead.orders,[['question_id',undefined],['id',undefined]])
  const analysisRead = reads.find((read) => read.table === 'user_results')
  assert.equal(analysisRead.fields,'id,job_recommendations,updated_at')
  assert.deepEqual(analysisRead.orders,[['updated_at',{ ascending: false }],['id',{ ascending: false }]])
  assert.equal(analysisRead.limit,1)
  orientationResponses = []
  orientationAnalysis = null
  const emptyDetails = await (await request(`/users/${student.id}`)).json()
  assert.deepEqual(emptyDetails.orientationResponses,[])
  assert.equal(emptyDetails.orientationAnalysis,null)
  orientationReadError = { code:'XX000',message:'Fixture read failure' }
  assert.equal((await request(`/users/${student.id}`)).status,500)
  orientationReadError = null
  const fullSelection = Array.from({ length:17 },(_,index) => ({ id:`selection-${index}`,type:index < 11 ? 'formation' : 'metier',title:`Choix ${index}`,requestMoreInformation:index < 11 }))
  recordedSelections = [{ answer_text:JSON.stringify(fullSelection),created_at:'2026-10-01T11:00:00Z' }]
  const selectedResult = await request('/results/1')
  assert.equal(selectedResult.status,200)
  assert.deepEqual((await selectedResult.json()).selections,fullSelection)
  const displayedPartners = [{ id:'partner-ecv',type:'formation',sourceTable:'ecoles_partenaires',title:'Design graphique',schoolName:'ECV',requestMoreInformation:false }]
  recordedRecommendations = [{ answer_text:JSON.stringify(displayedPartners),created_at:'2026-10-01T12:00:00Z' }]
  assert.deepEqual((await (await request('/results/1')).json()).recommendations,displayedPartners)
  recordedRecommendations = [{ answer_text:'not valid JSON' }]
  assert.equal((await request('/results/1')).status,500)
  recordedRecommendations = []
  recordedSelections = []
  assert.equal((await request('/audit?from=invalid-date')).status,400)
  assert.equal((await request(`/users/${student.id}`,'joris','PATCH',{ contact_preference: true })).status,400)
  assert.equal((await request(`/users/${student.id}`,'joris','PATCH',{ email: 'change@example.com' })).status,400)
  assert.equal((await request(`/users/${student.id}`,'joris','PATCH',{ age: 999 })).status,400)
  assert.equal((await request(`/users/${student.id}`,'joris','PATCH',{ first_name:'Corrected' })).status,200)
  const mutation = calls.find((call) => call.name === 'backoffice_change')
  assert.equal(mutation.args.p_actor,joris.id)
  assert.deepEqual(mutation.args.p_patch,{ first_name:'Corrected' })
  assert.equal((await request(`/users/${student.id}`,'joris','PATCH',{ first_name:'A',actor_id: nicolas.id })).status,400)
  assert.equal((await request(`/users/${nicolas.id}/suspend`,'joris','POST',{ reason:'Forbidden' })).status,403)
  assert.equal((await request(`/users/${student.id}/suspend`,'joris','POST',{})).status,400)
  authError = { message:'Fixture failure' }
  const failure = await request(`/users/${student.id}/reactivate`,'joris','POST',{ reason:'Retry' })
  assert.equal(failure.status,502)
  assert.equal((await failure.json()).error,'AUTH_SYNC_PENDING')
  authError = null
  assert.equal((await request(`/users/${student.id}/suspend`,'joris','POST',{ reason:'Test' })).status,200)
  assert.ok(calls.some((call) => call.name === 'Auth' && call.patch.ban_duration === '876000h'))
  assert.equal((await request('/partners','joris','POST',{ school_name:'School',formation_name:'Bachelor',city:'Paris',link:'javascript:alert(1)' })).status,400)
  assert.equal((await request('/partners','joris','POST',{ school_name:'School',formation_name:'Bachelor',city:'Paris',show_in_results:false,highlight_in_results:true,results_priority:40 })).status,201)
  const displayCall = calls.filter((call) => call.name === 'backoffice_change').at(-1)
  assert.equal(displayCall.args.p_patch.show_in_results,false)
  assert.equal(displayCall.args.p_patch.results_priority,40)
  for (const results_priority of [-1,101,1.5,'20',null]) assert.equal((await request('/partners','joris','POST',{ school_name:'School',formation_name:'Bachelor',city:'Paris',results_priority })).status,400)
  assert.equal((await request('/partners','joris','POST',{ school_name:'School',formation_name:'Bachelor',city:'Paris',show_in_results:'false' })).status,400)
  const ecv = { school_name:'ECV',formation_name:'Bachelor Design graphique',domain:'Design',diploma_level:'Bac+3',show_in_results:true,highlight_in_results:false,results_priority:20 }
  const ecvResponse = await request('/partners/campuses','joris','POST',{ ...ecv,cities:[' Paris ','Bordeaux','Nantes'],reason:'Ajout ECV' })
  assert.equal(ecvResponse.status,201)
  assert.deepEqual((await ecvResponse.json()).items.map((item) => item.city),['Paris','Bordeaux','Nantes'])
  assert.deepEqual(calls.filter((call) => call.name === 'backoffice_create_partner_campuses').at(-1).args,{
    p_actor:joris.id,p_patch:ecv,p_cities:['Paris','Bordeaux','Nantes'],p_reason:'Ajout ECV'
  })
  for (const cities of [undefined,null,[],[''],['Paris',null],['Paris',12],['Paris',' paris '],Array(21).fill('Paris'),['x'.repeat(501)],'Paris,Bordeaux']) {
    assert.equal((await request('/partners/campuses','joris','POST',{ ...ecv,cities })).status,400)
  }
  for (const patch of [{ school_name:'' },{ formation_name:'' },{ city:'Paris' },{ results_priority:101 },{ link:'javascript:alert(1)' }]) {
    assert.equal((await request('/partners/campuses','joris','POST',{ ...ecv,cities:['Paris'],...patch })).status,400)
  }
  assert.equal((await request('/partners/campuses','joris','POST',{ ...ecv,cities:Array.from({ length:20 },(_,index) => `Ville ${index}`) })).status,201)
  rpcError = { code:'23505',message:'PARTNER_CAMPUS_EXISTS' }
  const duplicateCampus = await request('/partners/campuses','joris','POST',{ ...ecv,cities:['Paris','Lille'] })
  assert.equal(duplicateCampus.status,409)
  assert.match((await duplicateCampus.json()).message,/Aucun campus/)
  rpcError = { code:'PGRST202',message:'Function missing' }
  const missingCampuses = await request('/partners/campuses','joris','POST',{ ...ecv,cities:['Paris'] })
  assert.equal(missingCampuses.status,503)
  assert.match((await missingCampuses.json()).message,/migration_backoffice_partner_campuses\.sql/)
  rpcError = { code:'22023',message:'INVALID_FIELD' }
  const missingPartnerMigration = await request('/partners/44444444-4444-4444-8444-444444444444','joris','PATCH',{ show_in_results:false })
  assert.equal(missingPartnerMigration.status,503)
  const migrationResponse = await missingPartnerMigration.json()
  assert.equal(migrationResponse.error,'BACKOFFICE_MIGRATION_REQUIRED')
  assert.match(migrationResponse.message,/migration_backoffice_partner_results\.sql/)
  assert.equal((await request(`/users/${student.id}`,'joris','PATCH',{ first_name:'Valid' })).status,400)
  assert.equal((await request('/partners/44444444-4444-4444-8444-444444444444','joris','PATCH',{ formation_name:'Bachelor' })).status,400)
  rpcError = { code:'42703',message:'Missing database column' }
  const missingColumn = await request('/partners/44444444-4444-4444-8444-444444444444','joris','PATCH',{ show_in_results:false })
  assert.equal(missingColumn.status,503)
  assert.equal((await missingColumn.json()).error,'BACKOFFICE_MIGRATION_REQUIRED')
  rpcError = null
  assert.equal((await request('/partners/group-status','joris','POST',{ school_name:'School',city:'Paris',is_active:false,reason:'Test' })).status,200)
  assert.equal((await request('/results/1','joris','PATCH',{})).status,404)
  assert.equal((await request('/formations/national/1','joris','PATCH',{})).status,404)
  rpcError = { code:'PGRST202' }
  assert.equal((await request('/overview')).status,503)
  assert.equal((await request('/student-growth')).status,503)
  assert.equal((await request('/selections')).status,503)
  assert.equal((await request('/recommendations')).status,503)
  rpcError = null
  suspension = { is_suspended:true }; rpcCalled = false
  assert.equal((await request('/overview')).status,403)
  assert.equal(rpcCalled,false)
  suspension = null; statusError = { code:'42P01' }
  assert.equal((await request('/overview')).status,503)
  statusError = null
  const legacy = await readFile(new URL('../routes/schoolPortal.js',import.meta.url),'utf8')
  assert.equal(legacy.includes('requireAdminKey'),false)
  assert.equal(legacy.includes('SCHOOL_PORTAL_ADMIN_KEY'),false)
  console.log('Back-office HTTP guards, validation, protected accounts, Auth retry and migration errors verified.')
} finally {
  server.close()
  await once(server,'close')
}