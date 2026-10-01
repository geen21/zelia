import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium, expect } from '@playwright/test'
import { mixFormationResults } from '../src/lib/orientationFormationResults.js'
import { selectedFormations } from '../src/lib/adminSelections.js'

const nationalFixtures = Array.from({ length: 7 }, (_, index) => ({ id: index + 1 }))
const partnerFixtures = [
  { id: 1, results_priority: 0, match_score: 95 },
  { id: 2, results_priority: 20, match_score: 80 },
  { id: 3, show_in_results: false, results_priority: 100 },
  { id: 4, is_active: false },
  { id: 2, results_priority: 20, match_score: 80 }
]
const mixed = mixFormationResults(nationalFixtures, partnerFixtures)
assert.deepEqual(mixed.filter((entry) => entry.source === 'national').map((entry) => entry.formation), nationalFixtures)
assert.deepEqual(mixed.filter((entry) => entry.source === 'partner').map((entry) => entry.formation.id), [2, 1])
assert.equal(mixed[3].key, 'partner-2')
assert.equal(mixed[7].key, 'partner-1')
assert.equal(new Set(mixed.map((entry) => entry.key)).size, mixed.length)
assert.equal(mixFormationResults([], partnerFixtures).length, 2)
assert.equal(mixFormationResults(nationalFixtures, []).length, 7)
assert.equal(mixFormationResults([], Array.from({ length: 6 }, (_, index) => ({ id: index + 1 }))).length, 3)
assert.equal(partnerFixtures[0].id, 1)
const selectionFixtures = [
  { id:'formation-1',type:'formation',title:'BTS Informatique',requestMoreInformation:true },
  { id:'formation-2',type:'formation',title:'Licence Histoire',requestMoreInformation:false },
  { id:'job-1',type:'metier',title:'Developpeur',requestMoreInformation:true },
  { id:'unknown',type:'formation',requestMoreInformation:'true' },null,'Formation proposee'
]
assert.deepEqual(selectedFormations(selectionFixtures),[selectionFixtures[0]])
assert.deepEqual(selectedFormations(JSON.stringify({ candidates:selectionFixtures })),[selectionFixtures[0]])
assert.deepEqual(selectedFormations('invalid json'),[])
assert.deepEqual(selectedFormations(null),[])
if (process.argv.includes('--results-only')) {
  console.log('Selected formation flags and mixed formation results/priority/visibility/stable ordering verified.')
  process.exit(0)
}

const base = process.env.BACKOFFICE_TEST_URL || 'http://127.0.0.1:5187'
const output = join(tmpdir(),'zelia-backoffice-tests')
await mkdir(output,{ recursive: true })
const admin = { id:'11111111-1111-4111-8111-111111111111',email:'joris.geerdes@21datas.ch' }
const user = { id:'33333333-3333-4333-8333-333333333333',email:'student@example.com',first_name:'Camille',last_name:'Martin',created_at:'2026-09-20T12:00:00Z',account_type:'student',is_suspended:false }
const partner = { id:'44444444-4444-4444-8444-444444444444',school_name:'École Numérique',formation_name:'Bachelor Développement Web',city:'Paris',diploma_level:'Bac+3',is_active:true,show_in_results:true,highlight_in_results:true,results_priority:0 }
const school = { id:1,name:'École Numérique',email:'school@example.com',owner_id:user.id,approved_at:null,contact_first_name:'Camille',contact_last_name:'Martin',created_at:'2026-09-20T12:00:00Z' }
const analysis = { id:1,user_id:user.id,email:user.email,first_name:user.first_name,last_name:user.last_name,questionnaire_type:'inscription',updated_at:'2026-09-20T12:00:00Z' }
const savedChoices = [
  { ...user,id:'orientation-1',user_id:user.id,source:'orientation',formation_name:'BTS Informatique',school_name:'Université Exemple',city:'Paris',detail:{ link:'https://example.com/formation' } },
  { ...user,id:'partner-1',user_id:user.id,source:'partner',formation_name:partner.formation_name,school_name:partner.school_name,city:partner.city },
  ...Array.from({ length:50 },(_,index) => ({ ...user,id:`choice-${index}`,user_id:`55555555-5555-4555-8555-${String(index).padStart(12,'0')}`,email:`choice-${index}@example.com`,source:'orientation',formation_name:`Formation fixture ${index}`,school_name:'Université Exemple',city:'Lyon' }))
]
const session = { access_token:'fixture-access-token',refresh_token:'fixture-refresh-token',expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,token_type:'bearer',user:admin }
const browser = await chromium.launch({ headless: true })
const mutations = []

async function prepare(viewport,authenticated = true,denied = false) {
  const context = await browser.newContext({ viewport })
  const page = await context.newPage()
  page.setDefaultTimeout(15000)
  const scriptErrors = []
  const tracking = []
  page.on('pageerror',(error) => scriptErrors.push(error.message))
  page.on('request',(request) => { if (/googletagmanager|hotjar/i.test(request.url())) tracking.push(request.url()) })
  await context.addInitScript(({ session,authenticated }) => {
    localStorage.setItem('token','student-session-marker')
    localStorage.setItem('sb-espace-ecoles-auth-token','school-session-marker')
    if (authenticated) sessionStorage.setItem('sb-zelia-admin-auth-token',JSON.stringify(session))
  },{ session,authenticated })
  await context.route('**/auth/v1/**',async (route) => {
    const url = route.request().url()
    await route.fulfill({ status:200,contentType:'application/json',body:JSON.stringify(url.includes('/token') ? session : {}) })
  })
  await context.route('**/api/admin/**',async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const path = url.pathname.replace(/^.*\/api\/admin/,'')
    let data = {}
    if (denied) return route.fulfill({ status:403,contentType:'application/json',body:JSON.stringify({ error:'ADMIN_ACCESS_DENIED',message:'Accès réservé aux administrateurs Zélia.' }) })
    if (request.method() !== 'GET') {
      mutations.push({ path,method:request.method(),body:request.postDataJSON() })
      if (path === `/partners/${partner.id}`) Object.assign(partner,request.postDataJSON())
      if (path.endsWith('/suspend')) user.is_suspended = true
      if (path.endsWith('/reactivate')) user.is_suspended = false
      if (path.endsWith('/approve')) school.approved_at = '2026-10-01T12:00:00Z'
      if (path.endsWith('/revoke')) school.approved_at = null
      data = { item:{ id:1 } }
    } else if (path === '/me') data = { user:admin }
    else if (path === '/overview') data = { users:51,suspendedUsers:0,schools:1,approvedSchools:0,nationalFormations:127000,customFormations:1,partnerFormations:1,results:1,recentActions:[] }
    else if (path === '/student-growth') {
      const days = Number(url.searchParams.get('days') || 30)
      const end = new Date().toISOString().slice(0,10)
      data = { periodDays:days,totalStudents:48,newStudents:18,points:Array.from({ length:days },(_,index) => ({ date:new Date(Date.parse(`${end}T00:00:00Z`) - (days-1-index)*86400000).toISOString().slice(0,10),registrations:Math.floor((index+1)*18/days)-Math.floor(index*18/days),total:30+Math.floor((index+1)*18/days) })) }
    }
    else if (path === '/users') {
      const offset = Number(url.searchParams.get('offset')) || 0
      const rows = [user,...Array.from({ length:50 },(_,index) => ({ ...user,id:`fixture-${index}`,email:`student-${index}@example.com` }))]
      data = { items:rows.slice(offset,offset+50),total:51 }
    } else if (path.startsWith('/users/')) data = { user,profile:{ ...user,age:17,phone_number:'',department:'75',school:'Lycée',contact_preference:false },extraInfo:[{ question_id:'orientation_school_level',answer_text:'Terminale' }],schools:[school],memberships:[],protectedAdmin:false }
    else if (path === '/school-options') data = { items:[{ school_name: school.name,source:'formation_france' }] }
    else if (path === '/schools') data = { items:[school],total:1 }
    else if (path.startsWith('/schools/')) data = { item:school,accounts:[user],members:[] }
    else if (path === '/partners/group-count') data = { total:4 }
    else if (path === '/partners') data = { items:[partner],total:1 }
    else if (path.startsWith('/partners/')) data = { item:partner }
    else if (path === '/formations') data = { items:url.searchParams.get('source') === 'custom' ? [{ id:1,company_id:1,title:'Formation privée',city:'Paris',is_published:true }] : [{ id:1,title:'Licence Informatique',etab_nom:'Université Exemple',commune:'Paris',region:'Île-de-France',fiche:'https://example.com/formation' }],total:1 }
    else if (path === '/selections') {
      const search = (url.searchParams.get('q') || '').toLowerCase()
      const source = url.searchParams.get('source') || 'all'
      const userId = url.searchParams.get('user_id')
      const offset = Number(url.searchParams.get('offset')) || 0
      const limit = Number(url.searchParams.get('limit')) || 50
      const rows = savedChoices.filter((row) => (!userId || row.user_id === userId) && (source === 'all' || row.source === source) && [row.formation_name,row.school_name,row.email,row.first_name,row.last_name,row.city].join(' ').toLowerCase().includes(search))
      data = { items:rows.slice(offset,offset+limit),total:rows.length,totalUsers:new Set(rows.map((row) => row.user_id)).size }
    }
    else if (path === '/results') data = { items:[analysis],total:1 }
    else if (path.startsWith('/results/')) data = { item:{ ...analysis,personality_analysis:'Profil créatif et structuré.',skills_assessment:'Analyse et travail en équipe.',job_recommendations:[{ title:'Développeur web' }],study_recommendations:[{ degree:'Licence Informatique' }] },user,selections:selectionFixtures,selectionRecorded:true }
    else if (path === '/audit') data = { items:[{ id:1,actor_id:admin.id,action:'update:profile',resource_type:'profile',resource_id:user.id,reason:'Correction',created_at:'2026-10-01T12:00:00Z' }],total:1 }
    else throw new Error(`Unexpected fixture endpoint ${path}`)
    await route.fulfill({ status:200,contentType:'application/json',body:JSON.stringify(data) })
  })
  return { context,page,scriptErrors,tracking }
}
const noOverflow = async (page) => {
  const layout = await page.evaluate(() => ({ width: window.innerWidth, scroll: document.documentElement.scrollWidth,
    offenders: [...document.querySelectorAll('.bo-app *')].map((element) => ({ tag: element.tagName,className: element.className,
      right: element.getBoundingClientRect().right,width: element.getBoundingClientRect().width })).filter((element) => element.right > window.innerWidth + 1).slice(0,12) }))
  assert.equal(layout.scroll <= layout.width + 1,true,JSON.stringify(layout))
}

try {
  const desktop = await prepare({ width:1440,height:900 })
  const page = desktop.page
  await page.goto(`${base}/admin`)
  await expect(page.getByRole('heading',{ name:'Vue d’ensemble',exact:true })).toBeVisible()
  await expect(page.locator('.bo-selections').getByRole('cell',{ name:/^BTS Informatique/ })).toBeVisible()
  await page.locator('.bo-selections').getByRole('link',{ name:'Camille Martin',exact:true }).first().click()
  await expect(page.getByRole('heading',{ name:'Formations sélectionnées',exact:true })).toBeVisible()
  await expect(page.getByText('2 résultats')).toBeVisible()
  await page.getByRole('button',{ name:'Tous les utilisateurs',exact:true }).click()
  await expect(page.getByText('52 résultats')).toBeVisible()
  await page.getByRole('link',{ name:'Vue d’ensemble',exact:true }).click()
  await expect(page.getByRole('heading',{ name:'Évolution des élèves',exact:true })).toBeVisible()
  await expect(page.locator('.bo-growth .apexcharts-svg')).toBeVisible()
  await expect.poll(() => page.locator('.bo-growth .apexcharts-line').evaluate((line) => { const bounds = line.getBBox(); return bounds.width > 50 && bounds.height > 5 })).toBe(true)
  await page.getByRole('combobox',{ name:'Période du graphique',exact:true }).selectOption('90')
  await expect(page.locator('.bo-growth .apexcharts-svg')).toBeVisible()
  await page.getByText('Données quotidiennes',{ exact:true }).click()
  await expect(page.locator('.bo-growth-data tbody tr')).toHaveCount(90)
  await page.getByText('Données quotidiennes',{ exact:true }).click()
  assert.equal(await page.locator('.bo-brand img').evaluate((image) => image.naturalWidth > 0),true)
  await noOverflow(page)
  await page.evaluate(() => window.scrollTo(0,0))
  await page.screenshot({ path:join(output,'desktop.png'),fullPage:true })
  await page.getByRole('link',{ name:'Utilisateurs',exact:true }).click()
  await expect(page.getByText('51 résultats')).toBeVisible()
  await page.getByRole('button',{ name:'Page suivante',exact:true }).click()
  await expect(page.getByText('51–51')).toBeVisible()
  await page.getByRole('button',{ name:'Page précédente',exact:true }).click()
  await page.getByRole('button',{ name:`Ouvrir la fiche ${user.email}`,exact:true }).click()
  const profile = page.getByRole('dialog',{ name:'Camille Martin',exact:true })
  await expect(profile.getByRole('heading',{ name:'Profil',exact:true })).toBeVisible()
  await profile.getByLabel('Prénom',{ exact:true }).fill('Camille corrigée')
  await profile.getByRole('button',{ name:'Enregistrer',exact:true }).click()
  await expect(profile.getByRole('status')).toHaveText('Modifications enregistrées.')
  await profile.getByRole('button',{ name:'Suspendre le compte',exact:true }).click()
  const confirmation = page.getByRole('dialog',{ name:'Suspendre le compte',exact:true })
  await expect(confirmation.getByRole('button',{ name:'Confirmer',exact:true })).toBeDisabled()
  await confirmation.getByLabel('Motif',{ exact:true }).fill('Compte de test')
  await confirmation.getByRole('button',{ name:'Confirmer',exact:true }).click()
  await expect(profile.getByRole('button',{ name:'Réactiver le compte',exact:true })).toBeVisible()
  await profile.getByRole('button',{ name:'Fermer la fiche',exact:true }).click()
  await page.getByRole('link',{ name:'Écoles',exact:true }).click()
  await page.getByRole('button',{ name:`Ouvrir la fiche ${school.email}`,exact:true }).click()
  await page.getByRole('button',{ name:'Valider l’accès',exact:true }).click()
  const approval = page.getByRole('dialog',{ name:'Valider l’accès',exact:true })
  await approval.getByLabel('Motif',{ exact:true }).fill('Vérification école')
  await approval.getByRole('button',{ name:'Confirmer',exact:true }).click()
  await expect(page.getByRole('button',{ name:'Retirer l’accès',exact:true })).toBeVisible()
  await page.getByRole('button',{ name:'Fermer la fiche',exact:true }).click()
  await page.getByRole('link',{ name:'Formations',exact:true }).click()
  await expect(page.getByRole('heading',{ name:'Catalogue national',exact:true })).toBeVisible()
  await page.getByRole('tab',{ name:'Formations privées',exact:true }).click()
  await page.getByRole('button',{ name:'Ajouter',exact:true }).click()
  const formation = page.getByRole('dialog',{ name:'Ajouter une formation privée',exact:true })
  await formation.getByRole('combobox',{ name:'École de la formation',exact:true }).selectOption('1')
  await formation.getByLabel('Intitulé',{ exact:true }).fill('Formation de test')
  await formation.getByRole('button',{ name:'Enregistrer',exact:true }).click()
  await expect(formation).not.toBeVisible()
  await page.getByRole('link',{ name:'Partenaires',exact:true }).first().click()
  await page.getByRole('button',{ name:`Ouvrir la fiche ${partner.formation_name}`,exact:true }).click()
  const partnerPanel = page.getByRole('dialog',{ name:partner.school_name,exact:true })
  await partnerPanel.getByLabel('Afficher dans les recommandations',{ exact:true }).uncheck()
  await partnerPanel.getByLabel('Accentuer la carte partenaire',{ exact:true }).uncheck()
  await partnerPanel.getByLabel('Priorité d’affichage',{ exact:true }).fill('40')
  const partnerSaved = page.waitForResponse((response) => response.url().endsWith(`/partners/${partner.id}`) && response.request().method() === 'PATCH')
  await partnerPanel.getByRole('button',{ name:'Enregistrer',exact:true }).click()
  await partnerSaved
  await partnerPanel.getByRole('button',{ name:'Fermer la fiche',exact:true }).click()
  await page.getByRole('button',{ name:`Ouvrir la fiche ${partner.formation_name}`,exact:true }).click()
  await expect(partnerPanel.getByLabel('Priorité d’affichage',{ exact:true })).toHaveValue('40')
  await expect(partnerPanel.getByLabel('Afficher dans les recommandations',{ exact:true })).not.toBeChecked()
  await expect(partnerPanel.getByLabel('Accentuer la carte partenaire',{ exact:true })).not.toBeChecked()
  assert.ok(mutations.some((entry) => entry.path === `/partners/${partner.id}` && entry.body.show_in_results === false && entry.body.highlight_in_results === false && entry.body.results_priority === 40))
  await expect(page.getByText('4 formations',{ exact:true })).toBeVisible()
  await page.getByRole('button',{ name:'Désactiver le campus',exact:true }).click()
  const campus = page.getByRole('dialog',{ name:'Désactiver le campus',exact:true })
  await campus.getByLabel('Motif',{ exact:true }).fill('Archivage campus test')
  await campus.getByRole('button',{ name:'Confirmer',exact:true }).click()
  await page.getByRole('button',{ name:'Fermer la fiche',exact:true }).click()
  await page.getByRole('link',{ name:'Résultats',exact:true }).click()
  const mutationCount = mutations.length
  await expect(page.getByRole('heading',{ name:'Formations sélectionnées',exact:true })).toBeVisible()
  await page.getByRole('button',{ name:'Page suivante',exact:true }).click()
  await expect(page.getByText('51–52')).toBeVisible()
  await page.getByRole('button',{ name:'Page précédente',exact:true }).click()
  await page.getByRole('combobox',{ name:'Origine des sélections',exact:true }).selectOption('partner')
  await expect(page.getByText('1 résultat',{ exact:false })).toBeVisible()
  await expect(page.getByText('Demande envoyée',{ exact:true })).toBeVisible()
  await page.getByRole('combobox',{ name:'Origine des sélections',exact:true }).selectOption('all')
  const searchedChoices = page.waitForResponse((response) => { const url = new URL(response.url()); return url.pathname.endsWith('/admin/selections') && url.searchParams.get('q') === 'BTS' && url.searchParams.get('source') === 'all' })
  await page.getByRole('searchbox',{ name:'Rechercher dans formations sélectionnées',exact:true }).fill('BTS')
  await searchedChoices
  await expect(page.locator('.bo-table tbody tr')).toHaveCount(1)
  await expect(page.getByRole('cell',{ name:'BTS Informatique',exact:true })).toBeVisible()
  await expect(page.getByRole('searchbox',{ name:'Rechercher dans formations sélectionnées',exact:true })).toHaveCSS('padding-left','38px')
  await page.screenshot({ path:join(output,'selections-desktop.png'),fullPage:true })
  await page.getByRole('button',{ name:`Ouvrir la fiche ${user.email}`,exact:true }).click()
  await expect(page.getByRole('dialog',{ name:'BTS Informatique',exact:true })).toBeVisible()
  assert.equal(await page.getByRole('dialog').getByRole('button',{ name:/Enregistrer|Générer/ }).count(),0)
  await page.getByRole('link',{ name:'Analyses de cet utilisateur',exact:true }).click()
  await expect(page.getByRole('heading',{ name:'Analyses',exact:true })).toBeVisible()
  await page.getByRole('button',{ name:`Ouvrir la fiche ${user.email}`,exact:true }).click()
  await expect(page.getByText('Demande d’informations',{ exact:true })).toBeVisible()
  await expect(page.getByRole('dialog').getByText('BTS Informatique',{ exact:true })).toBeVisible()
  assert.equal(await page.getByRole('dialog').getByText('Licence Histoire',{ exact:true }).count(),0)
  await page.getByText('Analyse et recommandations proposées',{ exact:true }).click()
  await expect(page.getByText('Développeur web',{ exact:true })).toBeVisible()
  assert.equal(await page.getByRole('dialog').getByRole('button',{ name:/Enregistrer|Générer/ }).count(),0)
  assert.equal(mutations.length,mutationCount)
  await page.getByRole('button',{ name:'Fermer la fiche',exact:true }).click()
  await page.getByRole('link',{ name:'Journal',exact:true }).click()
  await expect(page.getByText('Correction',{ exact:true })).toBeVisible()
  assert.equal(await page.locator('meta[name=robots]').getAttribute('content'),'noindex, nofollow')
  assert.deepEqual(desktop.tracking,[])
  assert.equal(await page.evaluate(() => (window.dataLayer || []).some((entry) => entry.event === 'Pageview')),false)
  await page.getByRole('button',{ name:'Se déconnecter',exact:true }).click()
  await expect(page.getByRole('heading',{ name:'Connexion',exact:true })).toBeVisible()
  assert.deepEqual(await page.evaluate(() => [localStorage.getItem('token'),localStorage.getItem('sb-espace-ecoles-auth-token')]),['student-session-marker','school-session-marker'])
  assert.deepEqual(desktop.scriptErrors,[])
  await desktop.context.close()

  const mobile = await prepare({ width:390,height:844 })
  await mobile.page.goto(`${base}/admin`)
  await expect(mobile.page.getByRole('heading',{ name:'Vue d’ensemble',exact:true })).toBeVisible()
  await expect(mobile.page.locator('.bo-growth .apexcharts-svg')).toBeVisible()
  await mobile.page.getByRole('combobox',{ name:'Période du graphique',exact:true }).selectOption('365')
  await expect(mobile.page.locator('.bo-growth .apexcharts-svg')).toBeVisible()
  await noOverflow(mobile.page)
  await mobile.page.screenshot({ path:join(output,'mobile.png'),fullPage:true })
  await mobile.page.getByRole('link',{ name:'Toutes les sélections',exact:true }).click()
  await expect(mobile.page.getByRole('heading',{ name:'Formations sélectionnées',exact:true })).toBeVisible()
  await mobile.page.getByRole('combobox',{ name:'Origine des sélections',exact:true }).selectOption('partner')
  await expect(mobile.page.getByText('Demande envoyée',{ exact:true })).toBeVisible()
  await mobile.page.getByRole('combobox',{ name:'Origine des sélections',exact:true }).selectOption('all')
  const mobileSearch = mobile.page.waitForResponse((response) => { const url = new URL(response.url()); return url.pathname.endsWith('/admin/selections') && url.searchParams.get('q') === 'BTS' && url.searchParams.get('source') === 'all' })
  await mobile.page.getByRole('searchbox',{ name:'Rechercher dans formations sélectionnées',exact:true }).fill('BTS')
  await mobileSearch
  await expect(mobile.page.locator('.bo-table tbody tr')).toHaveCount(1)
  await expect(mobile.page.getByRole('cell',{ name:'BTS Informatique',exact:true })).toBeVisible()
  await expect(mobile.page.getByRole('searchbox',{ name:'Rechercher dans formations sélectionnées',exact:true })).toHaveCSS('padding-left','38px')
  await expect(mobile.page.locator('.bo-selection-table')).toHaveCSS('min-width','940px')
  await noOverflow(mobile.page)
  await mobile.page.screenshot({ path:join(output,'selections-mobile.png'),fullPage:true })
  await mobile.page.getByRole('button',{ name:`Ouvrir la fiche ${user.email}`,exact:true }).click()
  await expect(mobile.page.getByRole('dialog',{ name:'BTS Informatique',exact:true })).toBeVisible()
  await noOverflow(mobile.page)
  await mobile.page.getByRole('button',{ name:'Fermer la fiche',exact:true }).click()
  await mobile.page.getByRole('button',{ name:'Ouvrir la navigation',exact:true }).click()
  await mobile.page.getByRole('link',{ name:'Partenaires',exact:true }).click()
  await mobile.page.getByRole('button',{ name:`Ouvrir la fiche ${partner.formation_name}`,exact:true }).click()
  await expect(mobile.page.getByRole('dialog',{ name:partner.school_name,exact:true })).toBeVisible()
  await noOverflow(mobile.page)
  await mobile.page.screenshot({ path:join(output,'mobile-partner.png'),fullPage:true })
  assert.deepEqual(mobile.scriptErrors,[])
  await mobile.context.close()

  const denied = await prepare({ width:1440,height:900 },true,true)
  await denied.page.goto(`${base}/admin`)
  await expect(denied.page.getByRole('heading',{ name:'Accès refusé',exact:true })).toBeVisible()
  assert.equal(await denied.page.getByRole('table').count(),0)
  await denied.context.close()
  const login = await prepare({ width:390,height:844 },false)
  await login.page.goto(`${base}/admin`)
  await expect(login.page.getByRole('heading',{ name:'Connexion',exact:true })).toBeVisible()
  await login.page.getByLabel('Adresse email',{ exact:true }).fill(admin.email)
  await login.page.getByLabel('Mot de passe',{ exact:true }).fill('fixture-password-not-real')
  await login.page.getByRole('button',{ name:'Se connecter',exact:true }).click()
  await expect(login.page.getByRole('heading',{ name:'Vue d’ensemble',exact:true })).toBeVisible()
  await login.context.close()
  const unavailable = await prepare({ width:390,height:844 })
  await unavailable.context.route('**/api/admin/student-growth**',async (route) => route.fulfill({ status:503,contentType:'application/json',body:JSON.stringify({ message:'Migration du graphique requise.' }) }))
  await unavailable.page.goto(`${base}/admin`)
  await expect(unavailable.page.getByRole('alert')).toHaveText('Migration du graphique requise.')
  assert.equal(await unavailable.page.locator('.bo-growth .apexcharts-svg').count(),0)
  await unavailable.context.close()
  const empty = await prepare({ width:390,height:844 })
  await empty.context.route('**/api/admin/student-growth**',async (route) => route.fulfill({ contentType:'application/json',body:JSON.stringify({ totalStudents:0,newStudents:0,points:[] }) }))
  await empty.page.goto(`${base}/admin`)
  await expect(empty.page.getByText('Aucun élève inscrit.',{ exact:true })).toBeVisible()
  await noOverflow(empty.page)
  await empty.context.close()
  const noChoices = await prepare({ width:390,height:844 })
  await noChoices.context.route('**/api/admin/selections**',async (route) => route.fulfill({ contentType:'application/json',body:JSON.stringify({ items:[],total:0,totalUsers:0 }) }))
  await noChoices.page.goto(`${base}/admin/resultats`)
  await expect(noChoices.page.getByRole('cell',{ name:'Aucun résultat',exact:true })).toBeVisible()
  await noChoices.context.close()
  const choicesUnavailable = await prepare({ width:390,height:844 })
  await choicesUnavailable.context.route('**/api/admin/selections**',async (route) => route.fulfill({ status:503,contentType:'application/json',body:JSON.stringify({ message:'Migration des selections requise.' }) }))
  await choicesUnavailable.page.goto(`${base}/admin/resultats`)
  await expect(choicesUnavailable.page.getByRole('alert')).toHaveText('Migration des selections requise.')
  await expect(choicesUnavailable.page.getByRole('cell',{ name:'Données indisponibles',exact:true })).toBeVisible()
  await choicesUnavailable.context.close()
  assert.ok(mutations.some((entry) => entry.path === `/users/${user.id}` && entry.body.first_name === 'Camille corrigée'))
  assert.ok(mutations.some((entry) => entry.path.endsWith('/suspend') && entry.body.reason === 'Compte de test'))
  assert.ok(mutations.some((entry) => entry.path === '/partners/group-status' && entry.body.is_active === false))
  console.log(`Selected formations/search/filters/pagination/read-only details and student growth verified desktop/mobile; privacy and isolated logout verified. Screenshots: ${output}`)
} finally { await browser.close() }