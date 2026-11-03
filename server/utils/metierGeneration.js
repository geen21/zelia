import { randomUUID } from 'node:crypto'
import { METIER_MODEL, METIER_PROMPT_VERSION, MAX_OUTPUT_TOKENS, generationRequest, parseGeneration, tokenCost } from './metierPages.js'
import { metierEditorialContext } from './metierEditorialSources.js'

export async function checked(result) {
  const { data, error } = await result
  if (error) throw new Error(error.message)
  return data
}

export class MetierGemini {
  constructor(key, request = fetch) {
    if (!key) throw new Error('GEMINI_API_KEY manquant')
    this.key = key
    this.request = request
  }

  async call(path, body) {
    const response = await this.request(`https://generativelanguage.googleapis.com/v1beta/${path}`, {
      method: body ? 'POST' : 'GET',
      headers: { 'x-goog-api-key': this.key, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(60000)
    })
    if (!response.ok) throw new Error(`Gemini ${METIER_MODEL} (${path.split(':').at(-1)}) : HTTP ${response.status}. Aucun autre modèle activé.`)
    return response.json()
  }

  async verify() {
    const model = await this.call(`models/${METIER_MODEL}`)
    if (!model.supportedGenerationMethods?.includes('batchGenerateContent')) throw new Error('Modèle Batch indisponible')
  }

  async count(request) {
    const result = await this.call(`models/${METIER_MODEL}:countTokens`, {
      generateContentRequest: { model: `models/${METIER_MODEL}`, ...request }
    })
    if (!Number.isSafeInteger(result.totalTokens) || result.totalTokens <= 0) throw new Error('Comptage des tokens invalide')
    return result.totalTokens
  }

  async getJob(name) {
    if (!/^batches\/[a-zA-Z0-9_-]+$/.test(name)) throw new Error('Identifiant Batch invalide')
    return this.call(name)
  }
}

export async function prepareMetiers(provider, pages, mode) {
  const prepared = []
  for (const page of pages) {
    const editorial = metierEditorialContext(page)
    const request = generationRequest(page, editorial)
    const inputTokens = await provider.count(request)
    prepared.push({ page, request, sources: editorial.publicSources, inputTokens, maxCost: tokenCost(mode, inputTokens, MAX_OUTPUT_TOKENS) })
  }
  return prepared
}

export function responseCost(mode, item, response) {
  const usage = response?.usageMetadata
  if (!Number.isSafeInteger(usage?.promptTokenCount) || !Number.isSafeInteger(usage?.candidatesTokenCount)) return item.maxCost
  return tokenCost(mode, usage.promptTokenCount, usage.candidatesTokenCount + (usage.thoughtsTokenCount || 0))
}

export async function reserveGeneration(db, prepared, mode) {
  const id = randomUUID()
  const items = prepared.map(({ page, inputTokens, maxCost, sources }) => ({
    id: page.id, inputTokens, maxCost, sources, model: METIER_MODEL, promptVersion: METIER_PROMPT_VERSION
  }))
  const estimate = Math.ceil(prepared.reduce((sum, item) => sum + item.maxCost, 0) * 1e9) / 1e9
  const remaining = await checked(db.rpc('reserve_metier_generation', {
    p_id: id, p_mode: mode, p_reserved_usd: estimate, p_items: items
  }))
  console.log(`Réservation ${id} : ${estimate.toFixed(6)} USD ; reste ${Number(remaining).toFixed(6)} USD`)
  return { id, items, estimate }
}

export async function applyGenerationResults(db, reservation) {
  const items = new Map(reservation.items.map((item) => [item.id, item]))
  const seen = new Set()
  let errors = 0
  for (const result of reservation.results || []) {
    const id = result.metadata?.key
    if (!items.has(id) || seen.has(id)) throw new Error('Réponse Batch inconnue ou dupliquée')
    seen.add(id)
    let content
    try {
      if (result.error) throw new Error(`Erreur fournisseur : ${result.error.message || result.error.code}`)
      content = parseGeneration(result.response, items.get(id).sources)
    } catch (error) {
      console.error(`Fiche ${id} non publiable : ${error.message}`)
      await checked(db.from('metier_pages').update({ last_error: error.message }).eq('id', id))
      errors += 1
      continue
    }
    await checked(db.from('metier_pages').update({
      content, content_updated_at: reservation.created_at, model: items.get(id).model || METIER_MODEL,
      prompt_version: items.get(id).promptVersion || '1', last_error: null
    }).eq('id', id).or(`content_updated_at.is.null,content_updated_at.lt.${reservation.created_at}`))
  }
  if (seen.size !== items.size) throw new Error('Résultats incomplets : réservation conservée, aucun renvoi automatique')
  return errors
}

export async function generateSampleItem(db, provider, item) {
  const reservation = await reserveGeneration(db, [item], 'standard')
  let response
  try {
    response = await provider.call(`models/${METIER_MODEL}:generateContent`, item.request)
  } catch (error) {
    await checked(db.from('metier_generation_requests').update({ state: 'uncertain', error: error.message }).eq('id', reservation.id))
    throw error
  }
  const [stored] = await checked(db.from('metier_generation_requests').update({
    state: 'settled', actual_usd: responseCost('standard', item, response),
    results: [{ metadata: { key: item.page.id }, response }]
  }).eq('id', reservation.id).select('*'))
  return applyGenerationResults(db, stored)
}

export async function submitMetierBatch(db, provider, prepared) {
  if (!prepared.length) throw new Error('Aucune fiche à soumettre')
  const body = { batch: {
    displayName: `zelia-metiers-${'0'.repeat(36)}`,
    inputConfig: { requests: { requests: prepared.map((item) => ({
      request: item.request, metadata: { key: item.page.id }
    })) } }
  } }
  if (Buffer.byteLength(JSON.stringify(body)) >= 19 * 1024 * 1024) {
    throw new Error('Lot trop volumineux ; réduire --limit avant de réserver un budget.')
  }
  const reservation = await reserveGeneration(db, prepared, 'batch')
  body.batch.displayName = `zelia-metiers-${reservation.id}`
  let operation
  try {
    operation = await provider.call(`models/${METIER_MODEL}:batchGenerateContent`, body)
    if (!/^batches\/[a-zA-Z0-9_-]+$/.test(operation.name || '')) throw new Error('Nom du job Batch absent')
  } catch (error) {
    await checked(db.from('metier_generation_requests').update({ state: 'uncertain', error: error.message }).eq('id', reservation.id))
    throw error
  }
  await checked(db.from('metier_generation_requests').update({ state: 'submitted', job_name: operation.name }).eq('id', reservation.id))
  console.log(`Batch soumis : ${operation.name}. Utiliser collect pour suivre et récupérer les résultats.`)
  return operation.name
}

export async function collectMetierBatch(db, provider, reservation) {
  if (!reservation.job_name) throw new Error(`Réservation ${reservation.id} sans job connu : vérifier chez Google, puis utiliser attach ; ne pas resoumettre`)
  const operation = await provider.getJob(reservation.job_name)
  if (!operation.done) {
    console.log(`${reservation.job_name} : ${operation.metadata?.state || 'en cours'}`)
    return 0
  }
  if (operation.error) {
    await checked(db.from('metier_generation_requests').update({
      state: 'settled', actual_usd: reservation.reserved_usd, error: JSON.stringify(operation.error)
    }).eq('id', reservation.id))
    for (const item of reservation.items) {
      await checked(db.from('metier_pages').update({ last_error: `Batch échoué : ${reservation.job_name}` }).eq('id', item.id))
    }
    throw new Error(`Batch échoué ${reservation.job_name} ; coût maximal conservé, reprise manuelle uniquement`)
  }
  const results = operation.response?.inlinedResponses?.inlinedResponses
  if (!Array.isArray(results)) throw new Error('Résultats Batch manquants ; réservation conservée')
  const byId = new Map(reservation.items.map((item) => [item.id, item]))
  const seen = new Set()
  let actual = 0
  for (const result of results) {
    const id = result.metadata?.key
    if (!byId.has(id) || seen.has(id)) throw new Error('Clé Batch inconnue ou dupliquée')
    seen.add(id)
    actual += responseCost('batch', byId.get(id), result.response)
  }
  if (seen.size !== byId.size) throw new Error('Batch partiel : aucun renvoi ni libération de budget')
  const [stored] = await checked(db.from('metier_generation_requests').update({
    state: 'settled', actual_usd: Math.ceil(actual * 1e9) / 1e9, results
  }).eq('id', reservation.id).select('*'))
  return applyGenerationResults(db, stored)
}
