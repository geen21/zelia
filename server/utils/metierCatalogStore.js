import { buildRomeCatalog } from './romeCatalog.js'
import { checked } from './metierGeneration.js'
import { readAllPages } from './metierPages.js'

export async function readCatalogState(db) {
  const state = await checked(db.from('metier_catalog_state').select('*').eq('id', true).maybeSingle())
  if (!state?.synced_at || !Number.isSafeInteger(state.expected_count) || state.expected_count < 1) {
    throw new Error('Catalogue ROME non synchronisé : appliquer la migration puis exécuter sync-rome')
  }
  return state
}

export async function readCanonicalPages(db) {
  const state = await readCatalogState(db)
  const pages = await readAllPages(db, 'metier_pages', '*', (query) => query.eq('catalog_kind', 'canonical'))
  if (pages.length !== state.expected_count || pages.some((page) => page.reference_version !== state.reference_version)) {
    throw new Error('Catalogue ROME incomplet ou composé de versions différentes')
  }
  return { state, pages }
}

export function needsMetierGeneration(page) {
  return page.content?.version !== 2 || page.content_reference_version !== page.reference_version
}

export async function syncRomeCatalog(db, reference, now = new Date(), options = {}) {
  await checked(db.rpc('refresh_metier_inventory'))
  const inventory = []
  let cursor = null
  for (;;) {
    let query = db.rpc('metier_rome_inventory').order('rome_code', { ascending: true }).limit(1000)
    if (cursor) query = query.gt('rome_code', cursor)
    const rows = await checked(query)
    if (!Array.isArray(rows)) throw new Error('Inventaire ROME illisible')
    inventory.push(...rows)
    if (rows.length < 1000) break
    cursor = rows.at(-1).rome_code
  }
  const current = await readAllPages(db, 'metier_pages', '*', (query) => query.eq('catalog_kind', 'canonical'))
  const pilots = await readAllPages(db, 'metier_pages', '*', (query) => query.not('content', 'is', null))
  const existing = [...new Map([...pilots, ...current].map((page) => [page.id, page])).values()]
  const pilotIds = new Set(pilots.filter((page) => page.content?.version === 2 && !page.normalized_title.startsWith('rome:')).map((page) => page.id))
  const checkedAt = now.toISOString().slice(0, 10)
  const pages = buildRomeCatalog(reference, inventory, existing, checkedAt, options)
  const state = { id: true, reference_version: reference.version, expected_count: pages.length, synced_at: null }
  await checked(db.from('metier_catalog_state').upsert(state))
  for (let offset = 0; offset < pages.length; offset += 50) {
    await checked(db.from('metier_pages').upsert(pages.slice(offset, offset + 50), { onConflict: 'id' }))
  }
  const targetCodes = new Set(pages.map((page) => page.rome_code))
  const retired = current.filter((page) => !targetCodes.has(page.rome_code))
  for (let offset = 0; offset < retired.length; offset += 50) {
    await checked(db.from('metier_pages').update({ catalog_kind: 'legacy' }).in('id', retired.slice(offset, offset + 50).map((page) => page.id)))
  }
  await checked(db.from('metier_pages').update({ catalog_kind: 'legacy' })
    .eq('catalog_kind', 'candidate').is('rome_code', null).not('content', 'is', null))
  await checked(db.from('metier_catalog_state').update({ synced_at: now.toISOString() }).eq('id', true))
  return {
    version: reference.version, encodings: reference.encodings, canonical: pages.length,
    preservedContents: pages.filter((page) => page.content_reference_version === reference.version).length,
    historicalTitles: inventory.reduce((sum, row) => sum + row.aliases.length, 0),
    reusedPilotUrls: pages.filter((page) => pilotIds.has(page.id)).map((page) => ({
      id: page.id, title: page.title, romeCode: page.rome_code
    }))
  }
}
