import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium, expect } from '@playwright/test'
import { getBestFormationResultKey, mixFormationResults } from '../src/lib/orientationFormationResults.js'
import { formationHref, isPartnerFormation, recommendedFormations, selectedFormations } from '../src/lib/adminSelections.js'

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
const manyPartners = [
  ...Array.from({ length: 24 }, (_, index) => ({ id: index + 1, match_score: index })),
  { id: 24, match_score: 23 },
  { id: 25, results_priority: 100, match_score: 0 },
  { id: 26, results_priority: 100, is_active: false },
  { id: 27, results_priority: 100, show_in_results: false }
]
const manyPartnersBefore = structuredClone(manyPartners)
for (const formations of [[], nationalFixtures, Array.from({ length: 12 }, (_, index) => ({ id: index + 1 }))]) {
  const limitedResults = mixFormationResults(formations, manyPartners)
  assert.deepEqual(limitedResults.filter((entry) => entry.source === 'partner').map((entry) => entry.formation.id), [25, 24, 23])
  assert.deepEqual(limitedResults.filter((entry) => entry.source === 'national').map((entry) => entry.formation), formations)
}
assert.deepEqual(manyPartners, manyPartnersBefore)
assert.equal(partnerFixtures[0].id, 1)
assert.equal(getBestFormationResultKey(mixed),'partner-1')
assert.equal(getBestFormationResultKey(mixFormationResults([{ id:1,matchScore:99 },{ id:2,matchScore:80 }],partnerFixtures)),'formation-1')
assert.equal(getBestFormationResultKey(mixFormationResults([{ id:1,matchScore:60 },{ id:2,matchScore:98 }],[])),'formation-2')
assert.equal(getBestFormationResultKey(mixFormationResults([{ id:1,matchScore:95 }],partnerFixtures)),'formation-1')
assert.equal(getBestFormationResultKey(mixFormationResults([],[{ id:1,match_score:90 },{ id:2,match_score:90 }])),'partner-1')
assert.equal(getBestFormationResultKey(mixFormationResults([],[{ id:1,match_score:'92' }])),'partner-1')
assert.equal(getBestFormationResultKey(mixFormationResults([],[{ id:1,match_score:100,show_in_results:false },{ id:2,match_score:100,is_active:false }])) ,null)
assert.equal(getBestFormationResultKey(mixFormationResults([],[{ id:1,match_score:70,results_priority:30 },{ id:2,match_score:99,results_priority:0 }])),'partner-2')
assert.equal(getBestFormationResultKey(mixFormationResults([],[
  { id:1,match_score:70,results_priority:30 },{ id:2,match_score:80,results_priority:20 },
  { id:3,match_score:90,results_priority:10 },{ id:4,match_score:100,results_priority:0 }
])),'partner-3')
assert.equal(getBestFormationResultKey([]),null)
for (const matchScore of [undefined,null,'',false,'invalid',NaN,Infinity,-1,101]) {
  assert.equal(getBestFormationResultKey(mixFormationResults([{ id:1,matchScore }],[])),null)
}
const selectionFixtures = [
  { id:'formation-1',type:'formation',title:'BTS Informatique',requestMoreInformation:true,raw:{ etab_url:'https://example.com/formation' } },
  { id:'formation-2',type:'formation',title:'Licence Histoire',requestMoreInformation:false },
  { id:'job-1',type:'metier',title:'Developpeur',requestMoreInformation:true },
  { id:'unknown',type:'formation',requestMoreInformation:'true' },null,'Formation proposee',
  { id:'partner-recommended',type:'formation',sourceTable:'ecoles_partenaires',title:'Licence professionnelle CPMM',subtitle:'Lycée Jean Guéhenno',requestMoreInformation:true,link:'https://example.com/cpmm' },
  { id:'partner-dismissed',type:'formation',sourceTable:'ecoles_partenaires',title:'Partenaire décoché',schoolName:'ECV',city:'Bordeaux',link:'https://example.com/ecv',requestMoreInformation:false }
]
assert.deepEqual(selectedFormations(selectionFixtures),[selectionFixtures[0],selectionFixtures[6]])
assert.deepEqual(selectedFormations(JSON.stringify({ candidates:selectionFixtures })),[selectionFixtures[0],selectionFixtures[6]])
assert.deepEqual(selectedFormations('invalid json'),[])
assert.deepEqual(selectedFormations(null),[])
assert.deepEqual(recommendedFormations(selectionFixtures).filter(isPartnerFormation),[selectionFixtures[6],selectionFixtures[7]])
assert.equal(isPartnerFormation({ id:'partner-legacy' }),true)
assert.equal(isPartnerFormation({ id:'formation-1' }),false)
const recommendationFixtures = [
  ...Array.from({ length:8 },(_,index) => ({ id:`national-reco-${index}`,type:'formation',sourceTable:'formation_france',title:`Formation proposée ${index}`,schoolName:'Université Exemple',city:'Paris' })),
  selectionFixtures[6],selectionFixtures[7],
  { id:'partner-paris',type:'formation',sourceTable:'ecoles_partenaires',title:'Design graphique Paris',schoolName:'ECV',city:'Paris',link:'https://example.com/ecv-paris',requestMoreInformation:false }
]
assert.equal(formationHref({ detail:{ link:' https://example.com/formation ' } }),'https://example.com/formation')
assert.equal(formationHref({ raw:{ fiche:'https://example.com/fiche',etab_url:'https://example.com/ecole' } }),'https://example.com/fiche')
assert.equal(formationHref({ link:'https://example.com/partenaire' }),'https://example.com/partenaire')
assert.equal(formationHref({ fiche:'http://example.com/catalogue' }),'http://example.com/catalogue')
assert.equal(formationHref({ raw:{ link:'www.example.com/formation' } }),'https://www.example.com/formation')
assert.equal(formationHref({ detail:{ link:'javascript:alert(1)' },etab_url:'https://example.com/ecole' }),'https://example.com/ecole')
for (const link of ['', 'javascript:alert(1)', 'data:text/html,test', 'mailto:school@example.com', 'https://', 'https://not a host', '//example.com', '/admin']) {
  assert.equal(formationHref({ detail:{ link } }),'')
}
assert.equal(formationHref(null),'')
if (process.argv.includes('--results-only')) {
  console.log('Unique best-match badge, selected formation flags, safe links and mixed results/priority/visibility/stable ordering verified.')
  process.exit(0)
}

const base = process.env.BACKOFFICE_TEST_URL || 'http://127.0.0.1:5187'
const output = join(tmpdir(),'zelia-backoffice-tests')
await mkdir(output,{ recursive: true })
const admin = { id:'11111111-1111-4111-8111-111111111111',email:'joris.geerdes@21datas.ch' }
const user = { id:'33333333-3333-4333-8333-333333333333',email:'student@example.com',first_name:'Camille',last_name:'Martin',created_at:'2026-09-20T12:00:00Z',account_type:'student',is_suspended:false }
const partner = { id:'44444444-4444-4444-8444-444444444444',school_name:'École Numérique',formation_name:'Bachelor Développement Web',city:'Paris',diploma_level:'Bac+3',link:'https://example.com/partenaire',is_active:true,show_in_results:true,highlight_in_results:true,results_priority:0,portal_company_id:1 }
const school = { id:1,name:'École Numérique',email:'school@example.com',owner_id:user.id,approved_at:null,contact_first_name:'Camille',contact_last_name:'Martin',created_at:'2026-09-20T12:00:00Z' }
const analysis = { id:1,user_id:user.id,email:user.email,first_name:user.first_name,last_name:user.last_name,questionnaire_type:'inscription',updated_at:'2026-09-20T12:00:00Z' }
const orientationResponses = Array.from({ length:20 },(_,index) => ({ id:index+1,question_id:200+index,response:index % 2 ? 'Avec une équipe' : 'Construire un objet',questions:index === 19 ? null : { content:`Quel environnement préfères-tu pour l’activité ${index+1} ?` } }))
const userDetails = { user,profile:{ ...user,age:17,phone_number:'',department:'75',school:'Lycée',contact_preference:false },extraInfo:[{ question_id:'orientation_recommendations',answer_text:JSON.stringify(recommendationFixtures) },{ question_id:'orientation_school_level',answer_text:'Terminale' },{ question_id:'orientation_final_selection',answer_text:JSON.stringify(selectionFixtures) }],schools:[school],memberships:[],protectedAdmin:false,orientationResponses,orientationAnalysis:{ id:1,job_recommendations:[{ title:'Menuisier' },{ title:'Mécanicien' },'Électricien'],updated_at:analysis.updated_at } }
const recommendationRows = recommendationFixtures.map((item) => ({ ...user,id:item.id,user_id:user.id,source:isPartnerFormation(item) ? 'partner' : 'national',formation_name:item.title,school_name:item.schoolName || item.subtitle,city:item.city,detail:{ link:formationHref(item) } }))
const savedChoices = [
  { ...user,id:'orientation-1',user_id:user.id,source:'orientation',formation_name:'BTS Informatique',school_name:'Université Exemple',city:'Paris',link:'https://example.com/formation' },
  { ...user,id:'partner-1',user_id:user.id,source:'partner',formation_name:partner.formation_name,school_name:partner.school_name,city:partner.city,detail:{ link:partner.link } },
  { ...user,id:'orientation-partner-1',user_id:user.id,source:'orientation',formation_name:'Licence professionnelle CPMM',school_name:'Lycée Jean Guéhenno',city:'Flers',link:'https://example.com/cpmm' },
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
  const campusPartners = []
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
  await context.route('https://example.com/**',async (route) => route.fulfill({ contentType:'text/html',body:'<title>Formation de test</title>' }))
  await context.route('**/api/admin/**',async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const path = url.pathname.replace(/^.*\/api\/admin/,'')
    let data = {}
    if (denied) return route.fulfill({ status:403,contentType:'application/json',body:JSON.stringify({ error:'ADMIN_ACCESS_DENIED',message:'Accès réservé aux administrateurs Zélia.' }) })
    if (request.method() !== 'GET') {
      mutations.push({ path,method:request.method(),body:request.postDataJSON() })
      if (path === '/partners/campuses') {
        const { cities,...common } = request.postDataJSON()
        if (cities.some((city) => [partner,...campusPartners].some((row) => row.school_name === common.school_name && row.formation_name === common.formation_name && row.city.toLowerCase() === city.toLowerCase()))) {
          return route.fulfill({ status:409,json:{ message:'Cette formation existe déjà pour un des campus saisis. Aucun campus n’a été ajouté.' } })
        }
        const created = cities.map((city,index) => ({ ...common,city,id:`campus-${campusPartners.length+index}`,is_active:true,portal_company_id:1 }))
        campusPartners.push(...created)
        return route.fulfill({ status:201,json:{ items:created,total:created.length } })
      }
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
    } else if (path.startsWith('/users/')) data = userDetails
    else if (path === '/school-options') data = { items:[{ school_name: school.name,source:'formation_france' }] }
    else if (path === '/schools') data = { items:[school],total:1 }
    else if (path.endsWith('/dashboard/catalog')) data = { items:[],total:0,natural:0,sponsored:0 }
    else if (/^\/portal\/schools\/[^/]+\/invitations$/.test(path)) data = { items:[],notificationFailures:0,recentAudit:[] }
    else if (/^\/portal\/partners\/[^/]+\/company$/.test(path)) data = { companyId:null }
    else if (path.startsWith('/schools/')) data = { item:school,accounts:[user],members:[] }
    else if (path === '/partners/group-count') data = { total:4 }
    else if (path === '/partners') data = { items:[partner,...campusPartners],total:1+campusPartners.length }
    else if (path.startsWith('/partners/')) data = { item:campusPartners.find((row) => path.endsWith(`/${row.id}`)) || partner }
    else if (path === '/formations') data = { items:url.searchParams.get('source') === 'custom' ? [{ id:1,company_id:1,title:'Formation privée',city:'Paris',link:'https://example.com/privee',is_published:true }] : [{ id:1,title:'Licence Informatique',etab_nom:'Université Exemple',commune:'Paris',region:'Île-de-France',fiche:'https://example.com/formation' }],total:1 }
    else if (path === '/recommendations') {
      const source = url.searchParams.get('source') || 'all'
      const userId = url.searchParams.get('user_id')
      const search = (url.searchParams.get('q') || '').toLowerCase()
      const offset = Number(url.searchParams.get('offset')) || 0
      const limit = Number(url.searchParams.get('limit')) || 50
      const rows = recommendationRows.filter((row) => (source === 'all' || row.source === source) && (!userId || row.user_id === userId) && [row.formation_name,row.school_name,row.city,row.email].join(' ').toLowerCase().includes(search))
      data = { items:rows.slice(offset,offset+limit),total:rows.length,totalUsers:rows.length ? 1 : 0 }
    }
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
    else if (path.startsWith('/results/')) data = { item:{ ...analysis,personality_analysis:'Profil créatif et structuré.',skills_assessment:'Analyse et travail en équipe.',job_recommendations:[{ title:'Développeur web' }],study_recommendations:[{ degree:'Licence Informatique' }] },user,selections:selectionFixtures,selectionRecorded:true,recommendations:recommendationFixtures,recommendationsRecorded:true }
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
const expectFormationLink = async (link,href) => {
  await expect(link).toHaveAttribute('href',href)
  await expect(link).toHaveAttribute('target','_blank')
  await expect(link).toHaveAttribute('rel','noopener noreferrer')
  await expect(link).toHaveAttribute('title','Ouvrir la formation dans un nouvel onglet')
  await expect(link).toHaveCSS('text-decoration-line','underline')
  await expect(link.locator('svg[aria-hidden="true"]')).toHaveCount(1)
  await expect(link.locator('svg[aria-hidden="true"]')).toHaveCSS('display','inline-block')
}

try {
  const desktop = await prepare({ width:1440,height:900 })
  const page = desktop.page
  await page.goto(`${base}/admin`)
  await expect(page.getByRole('heading',{ name:'Vue d’ensemble',exact:true })).toBeVisible()
  await expect(page.locator('.bo-selections').getByRole('cell',{ name:/^BTS Informatique/ })).toBeVisible()
  const recommendedPartnerRow = page.locator('.bo-selections tbody tr').filter({ hasText:'Licence professionnelle CPMM' })
  await expect(recommendedPartnerRow).toContainText('Lycée Jean Guéhenno')
  await expect(recommendedPartnerRow).toContainText('Retenue pour informations')
  await expectFormationLink(recommendedPartnerRow.getByRole('link',{ name:'Licence professionnelle CPMM',exact:true }),'https://example.com/cpmm')
  for (const [name,href] of [['BTS Informatique','https://example.com/formation'],[partner.formation_name,partner.link]]) {
    const link = page.locator('.bo-selections').getByRole('link',{ name,exact:true })
    await expectFormationLink(link,href)
    const popupPromise = page.waitForEvent('popup')
    await link.click()
    const popup = await popupPromise
    await expect(popup).toHaveURL(href)
    assert.equal(await popup.evaluate(() => window.opener === null),true)
    await popup.close()
    await expect(page.getByRole('heading',{ name:'Vue d’ensemble',exact:true })).toBeVisible()
  }
  await expect(page.locator('.bo-selections').getByText('Lien indisponible',{ exact:true })).toHaveCount(2)
  await page.locator('.bo-selections').getByRole('link',{ name:'Camille Martin',exact:true }).first().click()
  await expect(page.getByRole('heading',{ name:'Formations sélectionnées',exact:true })).toBeVisible()
  await expect(page.getByText('3 résultats')).toBeVisible()
  await page.getByRole('button',{ name:'Tous les utilisateurs',exact:true }).click()
  await expect(page.getByText('53 résultats')).toBeVisible()
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
  await expectFormationLink(profile.getByRole('link',{ name:'BTS Informatique',exact:true }),'https://example.com/formation')
  await expectFormationLink(profile.getByRole('region',{ name:'Formations sélectionnées',exact:true }).getByRole('link',{ name:'Licence professionnelle CPMM',exact:true }),'https://example.com/cpmm')
  await expect(profile.getByRole('region',{ name:'Formations sélectionnées',exact:true }).getByText('Partenaire décoché',{ exact:true })).toHaveCount(0)
  await expectFormationLink(profile.getByRole('region',{ name:'Partenaires recommandés',exact:true }).getByRole('link',{ name:'Partenaire décoché',exact:true }),'https://example.com/ecv')
  const review = profile.getByRole('region',{ name:'Réponses et métiers',exact:true })
  await expect(review.getByRole('heading',{ name:'Métiers recommandés',exact:true })).toBeVisible()
  await expect(review.getByText('Menuisier',{ exact:true })).toBeVisible()
  await expect(review.getByText('Mécanicien',{ exact:true })).toBeVisible()
  await expect(review.getByText('Électricien',{ exact:true })).toBeVisible()
  await expect(review.getByRole('listitem')).toHaveCount(23)
  await expect(review.getByText('1. Quel environnement préfères-tu pour l’activité 1 ?',{ exact:true })).toBeVisible()
  await expect(review.getByText('20. Question 219 (intitulé indisponible)',{ exact:true })).toBeVisible()
  await expect(review.getByText('Réponse : Construire un objet',{ exact:true }).first()).toBeVisible()
  await expect(review.getByText('Réponse : Avec une équipe',{ exact:true }).first()).toBeVisible()
  await expect(review.getByRole('button')).toHaveCount(0)
  await expect(review.locator('input,textarea,select')).toHaveCount(0)
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
  await expectFormationLink(page.getByRole('link',{ name:'Licence Informatique',exact:true }),'https://example.com/formation')
  await page.getByRole('tab',{ name:'Formations privées',exact:true }).click()
  await expectFormationLink(page.getByRole('link',{ name:'Formation privée',exact:true }),'https://example.com/privee')
  await page.getByRole('button',{ name:'Ajouter',exact:true }).click()
  const formation = page.getByRole('dialog',{ name:'Ajouter une formation privée',exact:true })
  await formation.getByRole('combobox',{ name:'École de la formation',exact:true }).selectOption('1')
  await formation.getByLabel('Intitulé',{ exact:true }).fill('Formation de test')
  await formation.getByRole('button',{ name:'Enregistrer',exact:true }).click()
  await expect(formation).not.toBeVisible()
  await page.getByRole('link',{ name:'Partenaires',exact:true }).first().click()
  await expectFormationLink(page.getByRole('link',{ name:partner.formation_name,exact:true }),partner.link)
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
  await expect(page.getByText('51–53')).toBeVisible()
  await page.getByRole('button',{ name:'Page précédente',exact:true }).click()
  await page.getByRole('combobox',{ name:'Origine des sélections',exact:true }).selectOption('partner')
  await expect(page.getByText('1 résultat',{ exact:false })).toBeVisible()
  await expect(page.getByText('Demande envoyée',{ exact:true })).toBeVisible()
  await expectFormationLink(page.getByRole('link',{ name:partner.formation_name,exact:true }),partner.link)
  await page.getByRole('combobox',{ name:'Origine des sélections',exact:true }).selectOption('all')
  const searchedChoices = page.waitForResponse((response) => { const url = new URL(response.url()); return url.pathname.endsWith('/admin/selections') && url.searchParams.get('q') === 'BTS' && url.searchParams.get('source') === 'all' })
  await page.getByRole('searchbox',{ name:'Rechercher dans formations sélectionnées',exact:true }).fill('BTS')
  await searchedChoices
  await expect(page.locator('.bo-table tbody tr')).toHaveCount(1)
  await expect(page.getByRole('cell',{ name:'BTS Informatique',exact:true })).toBeVisible()
  await expectFormationLink(page.getByRole('link',{ name:'BTS Informatique',exact:true }),'https://example.com/formation')
  await expect(page.getByRole('searchbox',{ name:'Rechercher dans formations sélectionnées',exact:true })).toHaveCSS('padding-left','38px')
  await page.screenshot({ path:join(output,'selections-desktop.png'),fullPage:true })
  await page.getByRole('button',{ name:`Ouvrir la fiche ${user.email}`,exact:true }).click()
  await expect(page.getByRole('dialog',{ name:'BTS Informatique',exact:true })).toBeVisible()
  await expect(page.getByRole('dialog').getByRole('link',{ name:'Fiche de la formation',exact:true })).toHaveAttribute('href','https://example.com/formation')
  assert.equal(await page.getByRole('dialog').getByRole('button',{ name:/Enregistrer|Générer/ }).count(),0)
  await page.getByRole('link',{ name:'Analyses de cet utilisateur',exact:true }).click()
  await expect(page.getByRole('heading',{ name:'Analyses',exact:true })).toBeVisible()
  await page.getByRole('button',{ name:`Ouvrir la fiche ${user.email}`,exact:true }).click()
  await expect(page.getByRole('dialog').getByText('Demande d’informations',{ exact:true })).toHaveCount(2)
  await expect(page.getByRole('dialog').getByText('BTS Informatique',{ exact:true })).toBeVisible()
  await expectFormationLink(page.getByRole('dialog').getByRole('link',{ name:'BTS Informatique',exact:true }),'https://example.com/formation')
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
  await expectFormationLink(mobile.page.locator('.bo-selections').getByRole('link',{ name:'BTS Informatique',exact:true }),'https://example.com/formation')
  await expectFormationLink(mobile.page.locator('.bo-selections').getByRole('link',{ name:partner.formation_name,exact:true }),partner.link)
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
  await expectFormationLink(mobile.page.getByRole('link',{ name:'BTS Informatique',exact:true }),'https://example.com/formation')
  await expect(mobile.page.getByRole('searchbox',{ name:'Rechercher dans formations sélectionnées',exact:true })).toHaveCSS('padding-left','38px')
  await expect(mobile.page.locator('.bo-selection-table')).toHaveCSS('min-width','940px')
  await noOverflow(mobile.page)
  await mobile.page.screenshot({ path:join(output,'selections-mobile.png'),fullPage:true })
  await mobile.page.getByRole('button',{ name:`Ouvrir la fiche ${user.email}`,exact:true }).click()
  await expect(mobile.page.getByRole('dialog',{ name:'BTS Informatique',exact:true })).toBeVisible()
  await noOverflow(mobile.page)
  await mobile.page.getByRole('button',{ name:'Fermer la fiche',exact:true }).click()
  await mobile.page.goto(`${base}/admin/utilisateurs`)
  await mobile.page.getByRole('button',{ name:`Ouvrir la fiche ${user.email}`,exact:true }).click()
  const mobileReview = mobile.page.getByRole('region',{ name:'Réponses et métiers',exact:true })
  await expect(mobileReview.getByRole('listitem')).toHaveCount(23)
  await expect(mobileReview.getByText('Menuisier',{ exact:true })).toBeVisible()
  await noOverflow(mobile.page)
  await mobile.page.screenshot({ path:join(output,'orientation-review-mobile.png'),fullPage:true })
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
  const noLinks = await prepare({ width:390,height:844 })
  await noLinks.context.route('**/api/admin/selections**',async (route) => route.fulfill({ json:{ items:[
    { ...savedChoices[0],formation_name:'Formation sans lien',detail:null,link:null,raw:null,fiche:null,etab_url:null },
    { ...savedChoices[1],formation_name:'Formation avec lien invalide',detail:{ link:'javascript:alert(1)' },link:null,raw:null,fiche:null,etab_url:null },
    { ...savedChoices[0],id:'fallback-link-fixture',formation_name:'Formation avec lien de secours',detail:{ link:'javascript:alert(1)' } }
  ],total:3,totalUsers:1 } }))
  await noLinks.page.goto(`${base}/admin`)
  await expect(noLinks.page.locator('.bo-selections').getByText('Lien indisponible',{ exact:true })).toHaveCount(2)
  await expect(noLinks.page.getByRole('link',{ name:/Formation sans lien|Formation avec lien invalide/ })).toHaveCount(0)
  await expectFormationLink(noLinks.page.getByRole('link',{ name:'Formation avec lien de secours',exact:true }),'https://example.com/formation')
  await noOverflow(noLinks.page)
  assert.deepEqual(noLinks.scriptErrors,[])
  await noLinks.context.close()
  for (const [name,orientationAnalysis,error] of [
    ['empty',null,false],
    ['legacy',{ job_recommendations:JSON.stringify([{ title:'Menuisier' },'Mécanicien']),updated_at:analysis.updated_at },false],
    ['invalid',{ job_recommendations:'invalid json',updated_at:analysis.updated_at },true]
  ]) {
    const fixture = await prepare({ width:390,height:844 })
    await fixture.context.route(`**/api/admin/users/${user.id}`,async (route) => route.fulfill({ json:{ ...userDetails,orientationResponses:[],orientationAnalysis } }))
    await fixture.page.goto(`${base}/admin/utilisateurs`)
    await fixture.page.getByRole('button',{ name:`Ouvrir la fiche ${user.email}`,exact:true }).click()
    const review = fixture.page.getByRole('region',{ name:'Réponses et métiers',exact:true })
    await expect(review.getByText('Aucune réponse d’orientation enregistrée.',{ exact:true })).toBeVisible()
    if (error) await expect(review.getByRole('alert')).toHaveText('Recommandations enregistrées dans un format illisible.')
    else if (name === 'legacy') {
      await expect(review.getByText('Menuisier',{ exact:true })).toBeVisible()
      await expect(review.getByText('Mécanicien',{ exact:true })).toBeVisible()
    } else await expect(review.getByText('Non enregistré',{ exact:true })).toBeVisible()
    await noOverflow(fixture.page)
    assert.deepEqual(fixture.scriptErrors,[])
    await fixture.context.close()
  }
  for (const [name,viewport] of [['desktop',{ width:1440,height:900 }],['mobile',{ width:390,height:844 }]]) {
    const fixture = await prepare(viewport)
    const page = fixture.page
    const before = mutations.length
    try {
      await page.goto(`${base}/admin`)
      const overview = page.locator('.bo-recommendations')
      await expect(overview).toHaveCSS('margin-bottom','28px')
      await expect(overview.locator('tbody tr')).toHaveCount(3)
      await expectFormationLink(overview.getByRole('link',{ name:'Partenaire décoché',exact:true }),'https://example.com/ecv')
      await expect(overview.getByRole('cell',{ name:'ECV',exact:true })).toHaveCount(2)
      await page.screenshot({ path:join(output,`recommendations-${name}.png`),fullPage:true })
      await overview.getByRole('link',{ name:'Toutes les recommandations',exact:true }).click()
      await expect(page.getByRole('heading',{ name:'Formations recommandées',exact:true })).toBeVisible()
      const source = page.getByRole('combobox',{ name:'Origine des recommandations',exact:true })
      await expect(source).toHaveValue('partner')
      await expect(page.locator('.bo-table tbody tr')).toHaveCount(3)
      await source.selectOption('all')
      await expect(page.locator('.bo-table tbody tr')).toHaveCount(11)
      await source.selectOption('national')
      await expect(page.locator('.bo-table tbody tr')).toHaveCount(8)
      await source.selectOption('partner')
      await page.getByRole('searchbox',{ name:'Rechercher dans formations recommandées',exact:true }).fill('Bordeaux')
      await expect(page.locator('.bo-table tbody tr')).toHaveCount(1)
      await expect(page.getByRole('cell',{ name:'ECV',exact:true })).toBeVisible()
      await noOverflow(page)
      await page.getByRole('button',{ name:`Ouvrir la fiche ${user.email}`,exact:true }).click()
      const detail = page.getByRole('dialog',{ name:'Partenaire décoché',exact:true })
      await expect(detail.getByText('Présentée à l’élève, sans présumer d’une demande d’informations.',{ exact:true })).toBeVisible()
      await detail.getByRole('link',{ name:'Choix de cet élève',exact:true }).click()
      await expect(page.getByRole('heading',{ name:'Formations sélectionnées',exact:true })).toBeVisible()
      await expect(page.getByText('3 résultats')).toBeVisible()
      await expect(page.getByRole('cell',{ name:'Partenaire décoché',exact:true })).toHaveCount(0)
      assert.equal(mutations.length,before,'Reading recommendations must not create leads or selections.')
      assert.deepEqual(fixture.scriptErrors,[])
    } finally { await fixture.context.close() }
  }
  for (const [name,viewport] of [['desktop',{ width:1440,height:900 }],['mobile',{ width:390,height:844 }]]) {
    const fixture = await prepare(viewport)
    const page = fixture.page
    try {
      await page.goto(`${base}/admin/partenaires`)
      await page.getByRole('button',{ name:'Ajouter',exact:true }).click()
      const createPanel = page.getByRole('dialog',{ name:'Ajouter une formation partenaire',exact:true })
      const campusCities = createPanel.getByRole('textbox',{ name:'Villes des campus (une ville par ligne)',exact:true })
      await createPanel.getByLabel('École',{ exact:true }).fill('ECV')
      await createPanel.getByLabel('Intitulé',{ exact:true }).fill('Bachelor Design graphique')
      await createPanel.getByLabel('Domaine',{ exact:true }).fill('Design graphique')
      await createPanel.getByLabel('Lien',{ exact:true }).fill('https://example.com/ecv-design')
      await campusCities.fill('Paris\nBordeaux\nNantes')
      const creationResponse = page.waitForResponse((response) => response.url().endsWith('/partners/campuses') && response.request().method() === 'POST')
      await createPanel.getByRole('button',{ name:'Enregistrer',exact:true }).click()
      const created = await creationResponse
      assert.equal(created.status(),201)
      assert.deepEqual(created.request().postDataJSON().cities,['Paris','Bordeaux','Nantes'])
      await expect(createPanel).not.toBeVisible()
      const ecvRows = page.locator('.bo-table tbody tr').filter({ has:page.getByRole('cell',{ name:'ECV',exact:true }) })
      await expect(ecvRows).toHaveCount(3)
      for (const city of ['Paris','Bordeaux','Nantes']) {
        await expect(ecvRows.getByRole('cell',{ name:city,exact:true })).toHaveCount(1)
      }
      await ecvRows.filter({ has:page.getByRole('cell',{ name:'Bordeaux',exact:true }) }).getByRole('button',{ name:'Ouvrir la fiche Bachelor Design graphique',exact:true }).click()
      const ecvPanel = page.getByRole('dialog',{ name:'ECV',exact:true })
      await expect(ecvPanel.getByLabel('Ville',{ exact:true })).toHaveValue('Bordeaux')
      await ecvPanel.getByRole('button',{ name:'Ajouter des campus à cette formation',exact:true }).click()
      await expect(createPanel.getByLabel('École',{ exact:true })).toHaveValue('ECV')
      await expect(createPanel.getByLabel('Intitulé',{ exact:true })).toHaveValue('Bachelor Design graphique')
      await expect(createPanel.getByLabel('Domaine',{ exact:true })).toHaveValue('Design graphique')
      await expect(createPanel.getByLabel('Lien',{ exact:true })).toHaveValue('https://example.com/ecv-design')
      await expect(createPanel.getByText('Campus existant : Bordeaux. Saisis uniquement les nouvelles villes.',{ exact:true })).toBeVisible()
      await expect(campusCities).toHaveValue('')
      await campusCities.fill('Paris\nLille')
      await createPanel.getByRole('button',{ name:'Enregistrer',exact:true }).click()
      await expect(createPanel.getByRole('alert')).toContainText('Aucun campus')
      await expect(campusCities).toHaveValue('Paris\nLille')
      await expect(ecvRows).toHaveCount(3)
      await campusCities.fill('Lille')
      await createPanel.getByRole('button',{ name:'Enregistrer',exact:true }).click()
      await expect(createPanel).not.toBeVisible()
      await expect(ecvRows).toHaveCount(4)
      await expect(ecvRows.getByRole('cell',{ name:'Lille',exact:true })).toHaveCount(1)
      await noOverflow(page)
      await page.screenshot({ path:join(output,`ecv-campus-${name}.png`),fullPage:true })
      assert.deepEqual(fixture.scriptErrors,[])
    } finally { await fixture.context.close() }
  }
  assert.ok(mutations.some((entry) => entry.path === `/users/${user.id}` && entry.body.first_name === 'Camille corrigée'))
  assert.ok(mutations.some((entry) => entry.path.endsWith('/suspend') && entry.body.reason === 'Compte de test'))
  assert.ok(mutations.some((entry) => entry.path === '/partners/group-status' && entry.body.is_active === false))
  console.log(`Direct formation links/new tabs/unavailable links, user answers/jobs, selections and student growth verified desktop/mobile; privacy and isolated logout verified. Screenshots: ${output}`)
} finally { await browser.close() }