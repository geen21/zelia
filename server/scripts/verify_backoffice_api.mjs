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
const db = {
  from(table) {
    const builder = {
      select() { return this },eq() { return this },order() { return this },or() { return this },not() { return this },
      is() { return this },like() { return this },range() { return this },gte() { return this },lte() { return this },
      maybeSingle: async () => ({ data: table === 'backoffice_account_suspensions' ? suspension : null,error: statusError }),
      then(resolve) { return Promise.resolve({ data: [],count: 0,error: null }).then(resolve) }
    }
    return builder
  },
  async rpc(name,args) {
    rpcCalled = true; calls.push({ name,args })
    if (rpcError) return { data: null,error: rpcError }
    if (name === 'backoffice_account_change') return { data: { revision: '44444444-4444-4444-8444-444444444444' },error: null }
    return { data: name === 'backoffice_users' || name === 'backoffice_results' ? { items: [],total: 0 } : { id: '1' },error: null }
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
  for (const [path,method] of [['/me','GET'],['/overview','GET'],['/users','GET'],['/schools','GET'],['/formations','GET'],['/partners','GET'],['/results','GET'],['/audit','GET'],[`/users/${student.id}`,'PATCH'],['/schools/1/approve','POST'],['/partners','POST'],['/formations/custom','POST']]) {
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
  assert.equal((await request('/users?offset=-1')).status,400)
  assert.equal((await request('/users?status=unknown')).status,400)
  assert.equal((await request('/formations?source=arbitrary_table')).status,400)
  assert.equal((await request('/users/not-a-uuid')).status,400)
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
  assert.equal((await request('/partners/group-status','joris','POST',{ school_name:'School',city:'Paris',is_active:false,reason:'Test' })).status,200)
  assert.equal((await request('/results/1','joris','PATCH',{})).status,404)
  assert.equal((await request('/formations/national/1','joris','PATCH',{})).status,404)
  rpcError = { code:'PGRST202' }
  assert.equal((await request('/overview')).status,503)
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