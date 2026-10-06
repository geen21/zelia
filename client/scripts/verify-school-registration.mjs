import assert from 'node:assert/strict'
import { chromium, expect } from '@playwright/test'

const base = process.env.BACKOFFICE_TEST_URL || 'http://127.0.0.1:5187'
const schoolName = '\u00c9cole Num\u00e9rique'
const admin = { id:'11111111-1111-4111-8111-111111111111',email:'admin@example.com' }
const session = {
  access_token:'fixture-access-token',refresh_token:'fixture-refresh-token',
  expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,token_type:'bearer',user:admin
}
const registration = {
  id:1,school_name:schoolName,email:'school@example.com',
  contact_first_name:'Camille',contact_last_name:'Martin',created_at:'2026-10-06T12:00:00Z'
}
const browser = await chromium.launch({ headless:true })

async function prepare(viewport, authenticated = false) {
  const context = await browser.newContext({ viewport })
  const page = await context.newPage()
  page.setDefaultTimeout(15000)
  const state = { submissions:[],authMutations:[],errors:[],failSubmit:false,failSearch:false,inbox:'normal' }
  page.on('pageerror',(error) => state.errors.push(error.message))
  await context.addInitScript(({ session,authenticated }) => {
    localStorage.setItem('token','student-session-marker')
    localStorage.setItem('sb-espace-ecoles-auth-token',JSON.stringify(session))
    if (authenticated) sessionStorage.setItem('sb-zelia-admin-auth-token',JSON.stringify(session))
  },{ session,authenticated })
  await context.route('**/*',async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (url.hostname === 'cdn.tailwindcss.com') {
      return route.fulfill({ contentType:'application/javascript',body:'window.tailwind = {}' })
    }
    if (url.pathname.includes('/auth/v1/')) {
      if (request.method() !== 'GET') state.authMutations.push(url.pathname)
      return route.fulfill({ contentType:'application/json',body:JSON.stringify({ user:admin }) })
    }
    if (url.pathname.endsWith('/api/school-portal/schools/search')) {
      return route.fulfill({
        status:state.failSearch ? 503 : 200,contentType:'application/json',
        body:JSON.stringify(state.failSearch ? { error:'Recherche indisponible.' } : { schools:[{ school_name:schoolName,source:'formation_france' }] })
      })
    }
    if (url.pathname.endsWith('/api/school-portal/register')) {
      state.submissions.push(request.postDataJSON())
      return route.fulfill({
        status:state.failSubmit ? 503 : 201,contentType:'application/json',
        body:JSON.stringify(state.failSubmit ? { error:'Impossible d\u2019enregistrer votre demande.' } : { message:'Demande re\u00e7ue.' })
      })
    }
    if (url.pathname.endsWith('/api/admin/me')) {
      return route.fulfill({ contentType:'application/json',body:JSON.stringify({ user:admin }) })
    }
    if (url.pathname.endsWith('/api/admin/school-registrations')) {
      if (state.inbox === 'error') return route.fulfill({ status:503,contentType:'application/json',body:JSON.stringify({ message:'Migration des inscriptions requise.' }) })
      const q = (url.searchParams.get('q') || '').toLowerCase()
      const filtered = state.inbox === 'empty' || (q && !Object.values(registration).join(' ').toLowerCase().includes(q)) ? [] : [
        registration,...Array.from({ length:50 },(_,index) => ({ ...registration,id:index+2,email:`school-${index}@example.com` }))
      ]
      const offset = Number(url.searchParams.get('offset') || 0)
      return route.fulfill({ contentType:'application/json',body:JSON.stringify({ items:filtered.slice(offset,offset+50),total:filtered.length }) })
    }
    if (url.pathname.includes('/api/')) return route.fulfill({ contentType:'application/json',body:JSON.stringify({}) })
    if (url.origin !== new URL(base).origin) return route.abort()
    return route.continue()
  })
  return { context,page,state }
}

async function selectSchool(page) {
  await page.getByLabel('\u00c9tablissement repr\u00e9sent\u00e9',{ exact:true }).fill('Num')
  await page.getByRole('button',{ name:schoolName,exact:true }).click()
}

async function checkSessions(page) {
  const stored = await page.evaluate(() => ({
    student:localStorage.getItem('token'),school:localStorage.getItem('sb-espace-ecoles-auth-token')
  }))
  assert.equal(stored.student,'student-session-marker')
  assert.deepEqual(JSON.parse(stored.school),session)
}

try {
  for (const viewport of [{ width:1440,height:900 },{ width:390,height:844 }]) {
    const { context,page,state } = await prepare(viewport)
    await page.goto(`${base}/espace-ecoles/inscription`)
    await expect(page.getByRole('heading',{ name:'Inscription partenaire / \u00e9cole',exact:true })).toBeVisible()
    await expect(page.getByText(/Nous vous recontacterons dans les 2 jours ouvr\u00e9s/)).toBeVisible()
    assert.equal(await page.locator('input[type=password]').count(),0)
    const submit = page.getByRole('button',{ name:"Envoyer ma demande d'inscription",exact:true })
    await expect(submit).toBeDisabled()
    state.failSearch = true
    await page.getByLabel('\u00c9tablissement repr\u00e9sent\u00e9',{ exact:true }).fill('Unavailable')
    await expect(page.getByRole('alert')).toHaveText('Recherche indisponible.')
    state.failSearch = false
    await selectSchool(page)
    await page.getByLabel('Pr\u00e9nom',{ exact:true }).fill(' Camille ')
    await page.getByLabel('Nom',{ exact:true }).fill(' Martin ')
    await page.getByLabel('Email professionnel',{ exact:true }).fill('school@example.com')
    state.failSubmit = true
    await submit.click()
    await expect(page.getByRole('alert')).toHaveText('Impossible d\u2019enregistrer votre demande.')
    await expect(page.getByLabel('Pr\u00e9nom',{ exact:true })).toHaveValue(' Camille ')
    await expect(page.getByRole('heading',{ name:'Votre demande a bien \u00e9t\u00e9 re\u00e7ue',exact:true })).toHaveCount(0)
    state.failSubmit = false
    await submit.click()
    await expect(page.getByRole('status')).toContainText('Nous vous recontacterons dans les 2 jours ouvr\u00e9s')
    assert.equal(page.url(),`${base}/espace-ecoles/inscription`)
    assert.equal(await page.getByRole('button',{ name:"Envoyer ma demande d'inscription",exact:true }).count(),0)
    assert.equal(state.submissions.length,2)
    assert.deepEqual(state.submissions[1],{ email:'school@example.com',schoolName,contactFirstName:'Camille',contactLastName:'Martin' })
    assert.deepEqual(state.authMutations,[])
    await checkSessions(page)
    assert.deepEqual(state.errors,[])
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),true)
    await context.close()
  }

  const links = await prepare({ width:1440,height:900 })
  await links.page.goto(`${base}/espace-ecoles`)
  await expect(links.page.getByRole('link',{ name:'Demander mon inscription',exact:true })).toHaveCount(2)
  await links.page.getByRole('link',{ name:'Demander mon inscription',exact:true }).first().click()
  await expect(links.page.getByRole('heading',{ name:'Inscription partenaire / \u00e9cole',exact:true })).toBeVisible()
  await links.page.goto(`${base}/espace-ecoles/connexion`)
  await expect(links.page.getByRole('link',{ name:'Demander votre inscription',exact:true })).toHaveAttribute('href','/espace-ecoles/inscription')
  await links.context.close()

  for (const viewport of [{ width:1440,height:900 },{ width:390,height:844 }]) {
    const { context,page,state } = await prepare(viewport,true)
    await page.goto(`${base}/admin/inscriptions-ecoles`)
    await expect(page.getByRole('heading',{ name:'Inscriptions \u00e9coles',exact:true })).toBeVisible()
    const menuLink = page.getByRole('link',{ name:'Inscriptions \u00e9coles',exact:true })
    await expect(menuLink).toHaveAttribute('aria-current','page')
    await expect(page.getByRole('link',{ name:'school@example.com',exact:true })).toHaveAttribute('href','mailto:school@example.com')
    await expect(page.getByText('51 r\u00e9sultats')).toBeVisible()
    await page.getByRole('button',{ name:'Page suivante',exact:true }).click()
    await expect(page.getByText('51\u201351')).toBeVisible()
    await page.getByRole('searchbox').fill('absent')
    await expect(page.getByRole('cell',{ name:'Aucun r\u00e9sultat',exact:true })).toBeVisible()
    await page.getByRole('searchbox').fill('Camille')
    await expect(page.getByText('51 r\u00e9sultats')).toBeVisible()
    state.inbox = 'empty'
    await page.getByRole('button',{ name:'Actualiser',exact:true }).click()
    await expect(page.getByRole('cell',{ name:'Aucun r\u00e9sultat',exact:true })).toBeVisible()
    state.inbox = 'error'
    await page.getByRole('button',{ name:'Actualiser',exact:true }).click()
    await expect(page.getByRole('alert')).toHaveText('Migration des inscriptions requise.')
    await expect(page.getByRole('cell',{ name:'Donn\u00e9es indisponibles',exact:true })).toBeVisible()
    assert.deepEqual(state.errors,[])
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),true)
    await checkSessions(page)
    await context.close()
  }
  console.log('School request form/confirmation/errors/links, unchanged sessions and admin inbox/search/pagination/empty/error verified on desktop and mobile.')
} finally {
  await browser.close()
}
