import assert from 'node:assert/strict'
import { once } from 'node:events'
import { readFile } from 'node:fs/promises'
import express from 'express'
import { PGlite } from '@electric-sql/pglite'
import { createSchoolRegistrationHandler } from '../routes/schoolRegistration.js'
import { createAdminRouter } from '../routes/admin.js'
import { createPlatformAdminGuard } from '../middleware/admin.js'

const database = new PGlite()
const admin = { id:'11111111-1111-4111-8111-111111111111',email:'admin@example.com' }
const schoolName = '\u00c9cole Num\u00e9rique'
const form = { schoolName, email:' School@Example.com ', contactFirstName:' Camille ', contactLastName:' Martin ' }
let insertError = null
let searchError = null
let server
const calls = []

const db = {
  async rpc(name, args) {
    assert.equal(name, 'search_partner_schools')
    assert.equal(args.p_limit, 20)
    return { data:[{ school_name:schoolName }], error:searchError }
  },
  from(table) {
    assert.equal(table, 'school_registration_requests')
    let search = ''
    let offset = 0
    let limit = 50
    return {
      async insert(row) {
        if (insertError) return { error:insertError }
        await database.query(`INSERT INTO public.school_registration_requests
          (school_name,email,contact_first_name,contact_last_name) VALUES ($1,$2,$3,$4)`,
        [row.school_name,row.email,row.contact_first_name,row.contact_last_name])
        return { error:null }
      },
      select(fields, options) {
        assert.equal(fields, 'id,school_name,email,contact_first_name,contact_last_name,created_at')
        assert.equal(options.count, 'exact')
        return this
      },
      order(field, options) { calls.push({ field,options }); return this },
      or(filter) {
        search = filter.match(/^school_name\.ilike\.%(.*?)%,/)?.[1]
        assert.equal(filter, ['school_name','email','contact_first_name','contact_last_name'].map((field) => `${field}.ilike.%${search}%`).join(','))
        return this
      },
      range(start, end) { offset = start; limit = end - start + 1; return this },
      then(resolve, reject) {
        const where = `WHERE concat_ws(' ',school_name,email,contact_first_name,contact_last_name) ILIKE $1`
        return Promise.all([
          database.query(`SELECT * FROM public.school_registration_requests ${where} ORDER BY created_at DESC,id LIMIT $2 OFFSET $3`, [`%${search}%`,limit,offset]),
          database.query(`SELECT count(*)::int AS total FROM public.school_registration_requests ${where}`, [`%${search}%`])
        ]).then(([page,count]) => ({ data:page.rows,count:count.rows[0].total,error:null })).then(resolve,reject)
      }
    }
  }
}

try {
  await database.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users (id text PRIMARY KEY);
    CREATE TABLE public.companies (id int PRIMARY KEY);
    INSERT INTO auth.users VALUES ('existing-user');
    INSERT INTO public.companies VALUES (1);
    GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
  `)
  const migration = await readFile(new URL('../database/migration_school_registration_requests.sql',import.meta.url),'utf8')
  await database.exec(migration)
  await database.exec(migration)
  for (const role of ['anon','authenticated']) {
    const permissions = (await database.query(`SELECT has_table_privilege('${role}','public.school_registration_requests','SELECT,INSERT,UPDATE,DELETE') AS allowed,
      has_sequence_privilege('${role}','public.school_registration_requests_id_seq','USAGE') AS sequence_allowed`)).rows[0]
    assert.deepEqual(permissions,{ allowed:false,sequence_allowed:false })
    await database.exec(`SET ROLE ${role}`)
    await assert.rejects(database.query('SELECT * FROM public.school_registration_requests'), /permission denied/)
    await assert.rejects(database.query(`INSERT INTO public.school_registration_requests (school_name,email,contact_first_name,contact_last_name) VALUES ('School','school@example.com','First','Last')`), /permission denied/)
    await database.exec('RESET ROLE')
  }
  assert.equal((await database.query("SELECT relrowsecurity FROM pg_class WHERE oid='public.school_registration_requests'::regclass")).rows[0].relrowsecurity,true)
  await database.exec('SET ROLE service_role')
  const app = express()
  app.use(express.json())
  app.post('/api/school-portal/register',createSchoolRegistrationHandler({ db }))
  app.post('/unavailable',createSchoolRegistrationHandler({ db:null }))
  app.use('/api/admin',createAdminRouter({
    db,
    authenticateToken: (req,res,next) => {
      const token = req.headers.authorization
      if (!token) return res.status(401).json({ error:'AUTH_REQUIRED' })
      req.user = token === 'Bearer admin' ? admin : { id:'student',email:'student@example.com' }
      next()
    },
    requirePlatformAdmin:createPlatformAdminGuard(() => [admin]),
    isProtectedAdmin:() => false
  }))
  server = app.listen(0,'127.0.0.1')
  await once(server,'listening')
  const base = `http://127.0.0.1:${server.address().port}`
  const submit = (body, path = '/api/school-portal/register') => fetch(`${base}${path}`,{ method:'POST',headers:{ 'Content-Type':'application/json' },body:JSON.stringify(body) })
  const list = (query = '', token = 'admin') => fetch(`${base}/api/admin/school-registrations${query}`,{ headers:token ? { Authorization:`Bearer ${token}` } : {} })

  for (const field of Object.keys(form)) {
    const missing = { ...form }
    delete missing[field]
    assert.equal((await submit(missing)).status,400)
    assert.equal((await submit({ ...form,[field]:'   ' })).status,400)
    assert.equal((await submit({ ...form,[field]:{} })).status,400)
    assert.equal((await submit({ ...form,[field]:'x'.repeat(501) })).status,400)
  }
  for (const email of ['invalid','a@b','a b@example.com']) assert.equal((await submit({ ...form,email })).status,400)
  assert.equal((await submit({ ...form,schoolName:'Unknown school' })).status,400)
  assert.equal((await submit({ ...form,password:'must-not-be-stored' })).status,400)
  assert.equal((await submit(null)).status,400)
  assert.equal((await submit(form,'/unavailable')).status,503)
  const response = await submit({ ...form,schoolName:'ecole numerique' })
  assert.equal(response.status,201)
  assert.deepEqual(await response.json(),{ message:"Votre demande d'inscription a bien \u00e9t\u00e9 re\u00e7ue. Nous vous recontacterons dans les 2 jours ouvr\u00e9s." })
  const persisted = (await database.query('SELECT * FROM public.school_registration_requests')).rows
  assert.equal(persisted.length,1)
  assert.equal(persisted[0].school_name,schoolName)
  assert.equal(persisted[0].email,'school@example.com')
  assert.equal(persisted[0].contact_first_name,'Camille')
  assert.equal(persisted[0].contact_last_name,'Martin')
  assert.ok(persisted[0].created_at)
  assert.equal(Object.hasOwn(persisted[0],'password'),false)
  assert.equal((await list('',null)).status,401)
  assert.equal((await list('','student')).status,403)
  const inbox = await list()
  assert.equal(inbox.headers.get('cache-control'),'no-store')
  const inboxData = await inbox.json()
  assert.equal(inboxData.total,1)
  assert.equal(inboxData.items[0].email,'school@example.com')
  for (const q of ['Camille','Martin','school@example.com','Num\u00e9rique']) {
    assert.equal((await (await list(`?q=${encodeURIComponent(q)}`)).json()).total,1)
  }
  assert.equal((await (await list('?q=absent')).json()).total,0)
  assert.equal((await (await list('?limit=1&offset=1')).json()).items.length,0)
  for (const query of ['?limit=101','?offset=-1','?q=' + 'x'.repeat(151)]) assert.equal((await list(query)).status,400)
  assert.ok(calls.some((call) => call.field === 'created_at' && call.options.ascending === false))
  for (const error of [{ code:'42P01',message:'Missing migration' },{ code:'XX000',message:'Fixture database error' }]) {
    insertError = error
    const failure = await submit(form)
    assert.equal(failure.status,503)
    assert.match((await failure.json()).error,/Impossible/)
  }
  insertError = null
  searchError = { code:'XX000',message:'Fixture search error' }
  assert.equal((await submit(form)).status,503)
  assert.equal((await database.query('SELECT count(*)::int AS total FROM public.school_registration_requests')).rows[0].total,1)
  await database.exec('RESET ROLE')
  assert.equal((await database.query('SELECT count(*)::int AS total FROM auth.users')).rows[0].total,1)
  assert.equal((await database.query('SELECT count(*)::int AS total FROM public.companies')).rows[0].total,1)
  console.log('School registration persistence, two-business-day confirmation, validation, private inbox/search/pagination, RLS and existing accounts verified.')
} finally {
  if (server) await new Promise((resolve,reject) => server.close((error) => error ? reject(error) : resolve()))
  await database.close()
}
