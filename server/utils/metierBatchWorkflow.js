import { createHash, randomUUID } from 'node:crypto'
import { readFile, mkdir, writeFile, rename } from 'node:fs/promises'
import { dirname } from 'node:path'
import { setTimeout as wait } from 'node:timers/promises'
import { checked, prepareMetiers, submitMetierBatch, collectMetierBatch, applyGenerationResults } from './metierGeneration.js'
import { readCatalogState, readCanonicalPages } from './metierCatalogStore.js'
import { readAllPages, METIER_MODEL, METIER_PROMPT_VERSION, MAX_OUTPUT_TOKENS, tokenCost } from './metierPages.js'

export async function writeWorkflowJson(path, value) {
  await mkdir(dirname(path), { recursive: true })
  const temp = `${path}.${randomUUID()}.tmp`
  await writeFile(temp, JSON.stringify(value), 'utf8')
  await rename(temp, path)
}

async function ledger(db) {
  return readAllPages(db, 'metier_generation_requests',
    'id,mode,state,items,reserved_usd,actual_usd,job_name,error,processed_at,created_at')
}

export function budgetUsage(requests) {
  const committed = requests.reduce((sum, row) => sum + Math.round(Number(row.actual_usd ?? row.reserved_usd) * 1e9), 0)
  const spent = requests.reduce((sum, row) => sum + Math.round(Number(row.actual_usd || 0) * 1e9), 0)
  return { committed: committed / 1e9, spent: spent / 1e9, reserved: (committed - spent) / 1e9 }
}

export function selectBudgetedBatch(prepared, available, limit = 100) {
  let units = Math.floor(Math.max(0, available) * 1e9)
  const selected = []
  for (const item of prepared) {
    const cost = Math.round(item.maxCost * 1e9)
    if (selected.length >= limit) break
    if (cost > units) continue
    selected.push(item)
    units -= cost
  }
  return selected
}

export async function openGenerationCounter(path, provider) {
  let entries = new Map()
  try {
    const cached = JSON.parse(await readFile(path, 'utf8'))
    if (cached.schemaVersion !== 1 || !Array.isArray(cached.entries)) throw new Error('Cache de comptage incompatible')
    for (const item of cached.entries) {
      if (!/^[a-f0-9]{64}$/.test(item.id) || !/^[a-f0-9]{64}$/.test(item.hash) ||
          !Number.isSafeInteger(item.inputTokens) || item.inputTokens <= 0) throw new Error('Cache de comptage invalide')
    }
    entries = new Map(cached.entries.map((item) => [item.id, item]))
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
    console.log('Premier comptage des tokens : aucun appel de génération.')
  }
  let writes = Promise.resolve()
  let fresh = 0
  const save = () => {
    writes = writes.then(() => writeWorkflowJson(path, { schemaVersion: 1, entries: [...entries.values()] }))
    return writes
  }
  return {
    async countTokens(request, page) {
      const hash = createHash('sha256').update(JSON.stringify({ model: METIER_MODEL, request })).digest('hex')
      if (entries.get(page.id)?.hash === hash) return entries.get(page.id).inputTokens
      const inputTokens = await provider.count(request)
      entries.set(page.id, { id: page.id, hash, inputTokens })
      if (++fresh % 32 === 0) await save()
      return inputTokens
    },
    save
  }
}

async function prepareConcurrent(provider, pages, counter) {
  const prepared = new Array(pages.length)
  let next = 0
  let finished = 0
  await Promise.all(Array.from({ length: Math.min(4, pages.length) }, async () => {
    for (;;) {
      const index = next++
      if (index >= pages.length) return
      ;[prepared[index]] = await prepareMetiers(provider, [pages[index]], 'batch', { countTokens: counter.countTokens })
      if (++finished % 100 === 0) console.log(`Comptage ROME : ${finished}/${pages.length}`)
    }
  }))
  await counter.save()
  return prepared
}

export async function quoteMetierCatalog(db, provider, cachePath) {
  const { state, pages } = await readCanonicalPages(db)
  const requests = await ledger(db)
  const owned = new Set(requests.filter((row) => row.state !== 'settled').flatMap((row) => row.items.map((item) => item.id)))
  const pending = pages.filter((page) => page.content_reference_version !== page.reference_version && !owned.has(page.id))
  const counter = await openGenerationCounter(cachePath, provider)
  const prepared = await prepareConcurrent(provider, pending, counter)
  const [budget] = await checked(db.from('metier_generation_budget').select('*').eq('id', true))
  const usage = budgetUsage(requests)
  const expectedOutputTokens = 1800
  const estimatedRemaining = prepared.reduce((sum, item) => sum + tokenCost('batch', item.inputTokens, expectedOutputTokens), 0)
  const report = {
    model: METIER_MODEL, promptVersion: METIER_PROMPT_VERSION, reference: state.reference_version,
    canonical: state.expected_count, pending: prepared.length, alreadyReserved: owned.size,
    capUsd: Number(budget.limit_usd), committedUsd: usage.committed,
    estimatedRemainingUsd: estimatedRemaining, retryMarginUsd: estimatedRemaining * 0.1,
    expectedOutputTokens, maximumOutputTokens: MAX_OUTPUT_TOKENS,
    worstCaseReservationUsd: prepared.reduce((sum, item) => sum + item.maxCost, 0),
    fitsEstimatedBudget: usage.committed + estimatedRemaining * 1.1 <= Number(budget.limit_usd)
  }
  console.log(JSON.stringify(report))
  return { report, prepared, counter }
}

export async function readMetierProgress(db) {
  const state = await readCatalogState(db)
  const pages = await readAllPages(db, 'metier_pages',
    'id,title,rome_code,reference_version,content_reference_version,content_updated_at,last_error',
    (query) => query.eq('catalog_kind', 'canonical'))
  if (pages.length !== state.expected_count || pages.some((page) => page.reference_version !== state.reference_version)) {
    throw new Error('Catalogue ROME modifié ou incomplet pendant la génération')
  }
  return { state, pages }
}

export async function runMetierCatalog(db, provider, cachePath, reportPath) {
  const quote = await quoteMetierCatalog(db, provider, cachePath)
  if (!quote.report.fitsEstimatedBudget) throw new Error('Le devis estimé avec marge dépasse le plafond : aucune généralisation lancée')
  let requests = await ledger(db)
  let current = await readMetierProgress(db)
  const preparedById = new Map(quote.prepared.map((item) => [item.page.id, item]))
  let announced = ''
  for (;;) {
    let completed = false
    for (const row of requests.filter((request) => request.state !== 'settled' || !request.processed_at)) {
      if (row.state === 'settled') {
        const full = await checked(db.from('metier_generation_requests').select('*').eq('id', row.id).single())
        if (full.results) await applyGenerationResults(db, full)
        else {
          if (!full.error) throw new Error(`Réservation clôturée sans résultat ni diagnostic : ${row.id}`)
          await checked(db.from('metier_generation_requests').update({ processed_at: new Date().toISOString() }).eq('id', row.id))
        }
        completed = true
      } else {
        if (row.mode !== 'batch' || !row.job_name) throw new Error(`Réservation ${row.id} incertaine : vérifier et rattacher le job, ne pas resoumettre`)
        const outcome = await collectMetierBatch(db, provider, row)
        if (!outcome.pending) completed = true
      }
    }
    if (completed) {
      requests = await ledger(db)
      current = await readMetierProgress(db)
    }
    if (current.state.reference_version !== quote.report.reference) throw new Error('Référentiel modifié : arrêter et recalculer le devis avant de poursuivre')
    const active = requests.filter((row) => row.state !== 'settled')
    const owned = new Set(active.flatMap((row) => row.items.map((item) => item.id)))
    const attempts = new Map()
    for (const row of requests) for (const item of row.items) {
      if (item.referenceVersion === current.state.reference_version && item.promptVersion === METIER_PROMPT_VERSION) {
        attempts.set(item.id, (attempts.get(item.id) || 0) + 1)
      }
    }
    const pending = current.pages.filter((page) => page.content_reference_version !== page.reference_version)
    const ready = current.pages.length - pending.length
    const usage = budgetUsage(requests)
    const [budget] = await checked(db.from('metier_generation_budget').select('limit_usd').eq('id', true))
    const report = { canonical: current.pages.length, ready, pending: pending.length, activeJobs: active.length,
      spentUsd: usage.spent, reservedUsd: usage.reserved, capUsd: Number(budget.limit_usd),
      failed: pending.filter((page) => page.last_error).map((page) => ({ id: page.id, title: page.title, error: page.last_error })) }
    const signature = JSON.stringify(report)
    if (signature !== announced) { console.log(signature); announced = signature; await writeWorkflowJson(reportPath, report) }
    if (!pending.length && !active.length) return report
    const candidates = pending.filter((page) => !owned.has(page.id) && (attempts.get(page.id) || 0) < 3)
      .sort((a, b) => Number(Boolean(b.last_error)) - Number(Boolean(a.last_error)) || a.id.localeCompare(b.id))
    if (active.length < 3 && candidates.length && (ready > 0 || !active.length)) {
      const batchSize = ready ? 100 : 5
      const selection = candidates.slice(0, batchSize)
      const stale = selection.filter((page) => !preparedById.has(page.id) || page.last_error)
      if (stale.length) {
        const rows = await checked(db.from('metier_pages').select('*').in('id', stale.map((page) => page.id)))
        if (rows.length !== stale.length) throw new Error('Métier absent ou catalogue modifié pendant la préparation')
        for (const page of rows) {
          const [prepared] = await prepareMetiers(provider, [page], 'batch', { countTokens: quote.counter.countTokens })
          preparedById.set(page.id, prepared)
        }
        await quote.counter.save()
      }
      const selected = selectBudgetedBatch(selection.map((page) => preparedById.get(page.id)), Number(budget.limit_usd) - usage.committed, batchSize)
      if (selected.length) {
        await submitMetierBatch(db, provider, selected)
        requests = await ledger(db)
        continue
      }
    }
    if (!active.length) {
      throw new Error('Génération incomplète : plafond ou tentatives atteint. Consulter le rapport ; aucun dépassement automatique.')
    }
    await wait(30000)
  }
}
