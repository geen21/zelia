import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { parseArgs } from 'node:util'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mkdir, writeFile, rename } from 'node:fs/promises'
import { groupMetiers, readAllPages, METIER_MODEL, MAX_OUTPUT_TOKENS, tokenCost } from '../utils/metierPages.js'
import { MetierGemini, checked, prepareMetiers, generateSampleItem, submitMetierBatch, collectMetierBatch, applyGenerationResults } from '../utils/metierGeneration.js'
import { validateMetierSnapshot, validateMetierContent, METIER_SCHEMA_VERSION } from '../../client/src/lib/metierContent.js'
import { hasMetierEditorialSources } from '../utils/metierEditorialSources.js'
import { readRomeArchive } from '../utils/romeCatalog.js'
import { syncRomeCatalog, readCanonicalPages, needsMetierGeneration } from '../utils/metierCatalogStore.js'
import { readFile } from 'node:fs/promises'
import { quoteMetierCatalog, runMetierCatalog, readMetierProgress, budgetUsage } from '../utils/metierBatchWorkflow.js'

const server = resolve(dirname(fileURLToPath(import.meta.url)), '..')
dotenv.config({ path: resolve(server, '.env') })
const { positionals, values } = parseArgs({
  allowPositionals: true, options: {
    limit: { type: 'string' }, output: { type: 'string' }, preview: { type: 'boolean' },
    'retry-errors': { type: 'boolean' }, 'detailed-only': { type: 'boolean' },
    id: { type: 'string' }, title: { type: 'string' }, job: { type: 'string' }, reference: { type: 'string' },
    'repair-encoding': { type: 'boolean' }
  }
})
const command = positionals[0]
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Configuration Supabase serveur manquante')
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } }).schema('seo')
const all = (table, columns = '*', configure) => readAllPages(db, table, columns, configure)
const output = resolve(values.output || resolve(server, '.generated', command === 'export' ? 'metiers.json' : 'metier-inventory.json'))

async function saveJson(path, data) {
  await mkdir(dirname(path), { recursive: true })
  const temp = `${path}.${process.pid}.tmp`
  await writeFile(temp, JSON.stringify(data), 'utf8')
  await rename(temp, path)
}

async function main() {
  if (command === 'sync-rome') {
    const path = resolve(values.reference || resolve(server, '.generated', 'rome-open-data.zip'))
    const bytes = await readFile(path)
    const reference = readRomeArchive(bytes)
    const repairFromVersion = values['repair-encoding'] ? readRomeArchive(bytes, { legacyWindows1252: true }).version : null
    const report = await syncRomeCatalog(db, reference, new Date(), { repairFromVersion })
    await saveJson(resolve(server, '.generated', 'rome-catalog-report.json'), report)
    console.log(JSON.stringify(report))
    return
  }
  if (['inventory', 'sync'].includes(command)) {
    if (command === 'sync') {
      const { count, error } = await db.from('metier_pages').select('id', { count: 'exact', head: true }).eq('catalog_kind', 'canonical')
      if (error) throw new Error(`Migration ROME nécessaire : ${error.message}`)
      if (count) throw new Error('Catalogue officiel actif : utiliser sync-rome, pas la synchronisation des variantes d’annonces')
    }
    const stats = await checked(db.rpc('refresh_metier_inventory'))
    const source = await all('metier_source_titles')
    const result = groupMetiers(source)
    await saveJson(output, { stats, ...result })
    console.log(JSON.stringify({ ...stats, metiers: result.groups.length, review: result.groups.filter((page) => page.review_reason).length, rejected: result.rejected.length }))
    if (command === 'sync') {
      const existing = new Map((await all('metier_pages', 'id,title,slug,reviewed_at,content')).map((page) => [page.id, page]))
      for (let offset = 0; offset < result.groups.length; offset += 200) {
        await checked(db.from('metier_pages').upsert(result.groups.slice(offset, offset + 200).map((page) => {
          const previous = existing.get(page.id)
          return { ...page, ...(previous ? { title: previous.title, slug: previous.slug } : {}),
            ...(previous?.reviewed_at ? { review_reason: null } : {}) }
        }), { onConflict: 'id' }))
      }
      const currentIds = new Set(result.groups.map((page) => page.id))
      const reservations = await all('metier_generation_requests', 'id,items')
      const attempted = new Set(reservations.flatMap((row) => row.items.map((item) => item.id)))
      const obsolete = [...existing.values()].filter((page) => !currentIds.has(page.id) && !page.content && !page.reviewed_at && !attempted.has(page.id))
      for (let offset = 0; offset < obsolete.length; offset += 200) {
        await checked(db.from('metier_pages').delete().in('id', obsolete.slice(offset, offset + 200).map((page) => page.id)).is('content', null).is('reviewed_at', null))
      }
      if (obsolete.length) console.log(`${obsolete.length} anciennes normalisations jamais générées ni publiées remplacées ; aucune fiche publiée supprimée.`)
      console.log('Catalogue synchronisé ; annonces et contenus conservés.')
    }
    if (result.rejected.length || Number(stats.invalid_titles)) {
      console.error('Des intitulés sources sont invalides : consulter le rapport avant publication.')
      process.exitCode = 1
    }
    return
  }
  if (command === 'review') {
    if (!values.id || !values.title || values.title.length > 180 || /[<>@]/.test(values.title)) throw new Error('review nécessite --id et --title vérifié')
    const rows = await checked(db.from('metier_pages').update({
      title: values.title, review_reason: null, reviewed_at: new Date().toISOString()
    }).eq('id', values.id).is('content', null).select('id'))
    if (rows.length !== 1) throw new Error('Métier absent ou déjà généré')
    return
  }
  if (command === 'approve-sample') {
    const pages = await all('metier_pages', 'id,content', (query) => query.not('content', 'is', null).is('review_reason', null))
    const detailed = pages.filter((page) => page.content.version === 2)
    if (detailed.length < 3) throw new Error('Valider au moins trois fiches détaillées sourcées avant la génération complète')
    detailed.forEach((page) => validateMetierContent(page.content))
    const [budget] = await checked(db.from('metier_generation_budget').update({ sample_approved_at: new Date().toISOString() }).eq('id', true).select('limit_usd'))
    console.log(`Échantillon approuvé explicitement. Les lots Batch sont désormais autorisés, sous le plafond total de ${Number(budget.limit_usd)} USD.`)
    return
  }
  if (command === 'export') {
    const { state, pages } = await readCanonicalPages(db)
    const count = state.expected_count
    let ready = pages.filter((page) => !needsMetierGeneration(page) && !page.review_reason)
    if (values['detailed-only']) ready = ready.filter((page) => page.content.version === 2)
    const snapshot = {
      schemaVersion: METIER_SCHEMA_VERSION, preview: Boolean(values.preview), totalCatalog: count,
      pages: ready.map((page) => ({ id: page.id, title: page.title, slug: page.slug, romeCodes: page.rome_codes,
        appellations: page.editorial_context.officialNames,
        content: validateMetierContent(page.content), updatedAt: page.content_updated_at }))
    }
    validateMetierSnapshot(snapshot)
    await saveJson(output, snapshot)
    console.log(`Export ${snapshot.preview ? 'PRÉVISUALISATION non indexable' : 'publication'} : ${ready.length}/${count} métiers vers ${output}`)
    return
  }
  if (command === 'budget' || command === 'status') {
    const [budget] = await all('metier_generation_budget', '*', (query) => query.eq('id', true))
    const requests = await all('metier_generation_requests', 'id,state,reserved_usd,actual_usd,job_name')
    const usage = budgetUsage(requests)
    let catalogue = {}
    if (command === 'status') {
      const current = await readMetierProgress(db)
      const ready = current.pages.filter((page) => page.content_reference_version === page.reference_version).length
      catalogue = { reference: current.state.reference_version, canonical: current.pages.length, ready,
        pending: current.pages.length - ready, failed: current.pages.filter((page) => page.last_error).length }
    }
    console.log(JSON.stringify({ ...catalogue, capUsd: Number(budget.limit_usd), committedUsd: usage.committed,
      spentUsd: usage.spent, reservedUsd: usage.reserved, remainingUsd: Number(budget.limit_usd) - usage.committed,
      unresolved: requests.filter((row) => row.state !== 'settled').map(({ id, state, job_name }) => ({ id, state, job_name })) }))
    return
  }
  const provider = new MetierGemini(process.env.GEMINI_API_KEY)
  await provider.verify()
  if (command === 'quote' || command === 'run-all') {
    const cache = resolve(server, '.generated', 'metier-token-counts.json')
    if (command === 'quote') await quoteMetierCatalog(db, provider, cache)
    else await runMetierCatalog(db, provider, cache, resolve(server, '.generated', 'metier-batch-progress.json'))
    return
  }
  if (command === 'attach') {
    if (!values.id || !values.job) throw new Error('attach nécessite --id et --job')
    const operation = await provider.getJob(values.job)
    if (operation.metadata?.displayName !== `zelia-metiers-${values.id}` || operation.metadata?.model !== `models/${METIER_MODEL}`) {
      throw new Error('Le job ne correspond pas à cette réservation')
    }
    const rows = await checked(db.from('metier_generation_requests').update({ job_name: values.job, state: 'submitted' })
      .eq('id', values.id).eq('mode', 'batch').in('state', ['reserved', 'uncertain']).select('id'))
    if (rows.length !== 1) throw new Error('Réservation Batch non récupérable')
    return
  }
  if (command === 'collect') {
    const requests = await all('metier_generation_requests')
    for (const row of requests) {
      if (row.state === 'settled' && row.results) {
        if (await applyGenerationResults(db, row)) process.exitCode = 1
      } else if (row.state !== 'settled' && row.mode === 'batch') {
        if ((await collectMetierBatch(db, provider, row)).errors) process.exitCode = 1
      } else if (row.state !== 'settled') {
        throw new Error(`Appel standard ${row.id} incertain : coût réservé, aucun nouvel appel automatique`)
      }
    }
    return
  }
  if (!['sample', 'submit', 'regenerate'].includes(command)) throw new Error('Commande : inventory, sync-rome, sample, regenerate, approve-sample, quote, run-all, submit, collect, attach, status, budget, export')
  const { pages: allCanonical } = await readCanonicalPages(db)
  const allPages = command === 'regenerate' ? allCanonical.filter((page) => page.id === values.id) : allCanonical
  const active = await all('metier_generation_requests', 'id,state,items', (query) => query.neq('state', 'settled'))
  const owned = new Set(active.flatMap((request) => request.items.map((item) => item.id)))
  let pages = allPages.filter((page) => needsMetierGeneration(page) && !page.review_reason && !owned.has(page.id) && (values['retry-errors'] || !page.last_error))
  const missingSources = pages.filter((page) => !hasMetierEditorialSources(page)).length
  if (['sample', 'submit'].includes(command)) pages = pages.filter(hasMetierEditorialSources)
  pages.sort((a, b) => b.source_count - a.source_count || a.id.localeCompare(b.id))
  const limit = Number(values.limit || (command === 'sample' ? 10 : 500))
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000) throw new Error('--limit doit être compris entre 1 et 1000')
  if (command === 'sample') {
    const remaining = Math.max(0, 10 - allPages.filter((page) => page.content).length)
    const chosen = []
    for (const pattern of [/infirmier/i, /electricien|électricien/i, /comptable/i, /developpeur|développeur/i, /graphiste/i, /aide.*domicile/i, /cuisinier/i, /enseignant/i, /vendeur/i, /mecanicien|mécanicien/i]) {
      const page = pages.find((candidate) => pattern.test(candidate.title) && !chosen.includes(candidate))
      if (page) chosen.push(page)
    }
    pages = [...chosen, ...pages.filter((page) => !chosen.includes(page))].slice(0, Math.min(limit, remaining))
  } else if (command === 'submit') {
    pages = pages.slice(0, limit)
  } else if (command === 'regenerate') {
    if (!values.id) throw new Error('Régénération explicite : --id est obligatoire')
    pages = allPages.filter((page) => page.id === values.id && page.content && !page.review_reason && !owned.has(page.id))
  }
  if (!pages.length) throw new Error('Aucun métier éligible. Consulter budget, erreurs et intitulés à vérifier.')
  const mode = ['sample', 'regenerate'].includes(command) ? 'standard' : 'batch'
  const [budget] = await all('metier_generation_budget')
  const ledger = await all('metier_generation_requests', 'id,reserved_usd,actual_usd')
  const remainingUsd = Number(budget.limit_usd) - ledger.reduce((sum, row) => sum + Number(row.actual_usd ?? row.reserved_usd), 0)
  const outputReservation = tokenCost(mode, 0, MAX_OUTPUT_TOKENS) * pages.length
  if (command === 'quote' && outputReservation > remainingUsd) {
    console.log(JSON.stringify({ metiers: pages.length, remainingUsd, outputCapReservationUsd: outputReservation,
      blockedReview: allPages.filter((page) => page.review_reason).length, missingSources }))
    throw new Error('Le devis prudent dépasse déjà le budget avec la sortie plafonnée seule. Affiner les regroupements et obtenir une décision avant la génération complète ; aucun appel payant effectué.')
  }
  if (command === 'quote' && missingSources) throw new Error(`Sources factuelles à vérifier pour ${missingSources} métiers avant le devis complet`)
  const prepared = await prepareMetiers(provider, pages, mode)
  const maxCostUsd = prepared.reduce((sum, item) => sum + item.maxCost, 0)
  console.log(JSON.stringify({ model: METIER_MODEL, mode, metiers: pages.length,
    maxCostUsd, remainingUsd, fitsBudget: maxCostUsd <= remainingUsd, capTotalUsd: Number(budget.limit_usd),
    blockedReview: allPages.filter((page) => page.review_reason).length, missingSources,
    alreadyGenerated: allPages.filter((page) => page.content).length }))
  if (command === 'quote') return
  if (command === 'submit') await submitMetierBatch(db, provider, prepared)
  else for (const item of prepared) if (await generateSampleItem(db, provider, item)) process.exitCode = 1
}

main().catch((error) => { console.error(`Pages métiers : ${error.message}`); process.exitCode = 1 })
