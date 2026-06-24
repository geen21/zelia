import express from 'express'
import { supabase } from '../config/supabase.js'
import { optionalAuth } from '../middleware/auth.js'

const router = express.Router()

// Helper: parse pagination from query
function getPagination(query) {
  const page = Math.max(parseInt(query.page || '1', 10), 1)
  const pageSize = Math.min(Math.max(parseInt(query.page_size || '20', 10), 1), 100)
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1
  return { page, pageSize, from, to }
}

function isStatementTimeout(error) {
  const message = error?.message || ''
  return error?.code === '57014' || message.includes('statement timeout') || message.includes('canceling statement')
}

const ACCENT_KEYWORD_VARIANTS = {
  ecole: ['école'],
  ecoles: ['écoles'],
  evenement: ['événement'],
  evenements: ['événements'],
  ingenierie: ['ingénierie'],
  mecanique: ['mécanique'],
  medecine: ['médecine'],
  numerique: ['numérique'],
  reseau: ['réseau'],
  reseaux: ['réseaux'],
  sante: ['santé'],
  specialisation: ['spécialisation'],
  developpement: ['développement'],
  developpeur: ['développeur'],
  electricite: ['électricité'],
  electronique: ['électronique'],
  economie: ['économie'],
  mathematiques: ['mathématiques'],
  hotellerie: ['hôtellerie']
}

const SEARCH_STOPWORDS = new Set(['avec', 'chez', 'dans', 'des', 'du', 'de', 'en', 'et', 'la', 'le', 'les', 'pour', 'sur'])
const FORMATION_SEARCH_CACHE_TTL_MS = 5 * 60 * 1000
const FORMATION_SEARCH_CACHE_MAX_ENTRIES = 250
const FORMATION_SEARCH_KEYWORD_LIMIT = 8
const FORMATION_FALLBACK_TERM_LIMIT = 2
const FORMATION_FALLBACK_COLUMNS = ['nmc', 'tc', 'etab_nom', 'code_formation', 'commune']
const FORMATION_SEARCH_COLUMNS = [
  'id',
  'nmc',
  'nm',
  'etab_nom',
  'etab_uai',
  'region',
  'departement',
  'commune',
  'tc',
  'tf',
  'fiche',
  'etab_url',
  'annee',
  'image',
  'email',
  'code_formation'
].join(',')
const formationSearchCache = new Map()

function stripDiacritics(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function buildSearchKeywords(query) {
  const parts = String(query || '')
    .split(/[^\p{L}\p{N}]+/u)
    .map((part) => part.trim())
    .filter((part) => part && !SEARCH_STOPWORDS.has(stripDiacritics(part).toLowerCase()))

  if (!parts.length) return null

  const seen = new Set()
  const keywords = []
  const add = (value) => {
    const clean = String(value || '').trim()
    if (!clean || seen.has(clean.toLowerCase())) return
    seen.add(clean.toLowerCase())
    keywords.push(clean)
  }

  parts.forEach((part) => {
    add(part)
    const ascii = stripDiacritics(part).toLowerCase()
    ;(ACCENT_KEYWORD_VARIANTS[ascii] || []).forEach(add)
  })

  return keywords.slice(0, 16)
}

function buildSearchTextVariants(query) {
  const raw = String(query || '').trim()
  if (!raw) return []
  const words = raw.split(/\s+/).filter(Boolean)
  const accentWords = words.map((word) => ACCENT_KEYWORD_VARIANTS[stripDiacritics(word).toLowerCase()]?.[0] || word)
  const variants = [raw, accentWords.join(' ')]
  return Array.from(new Set(variants.filter(Boolean)))
}

function buildFormationSearchKeywords(query) {
  const keywords = buildSearchKeywords(query) || null
  return Array.isArray(keywords) && keywords.length
    ? keywords.slice(0, FORMATION_SEARCH_KEYWORD_LIMIT)
    : null
}

function escapePostgrestFilterValue(value) {
  return String(value || '').replace(/,/g, '\\,').replace(/%/g, '\\%').replace(/_/g, '\\_')
}

function makePagePayload(rows, page, pageSize) {
  const sourceRows = Array.isArray(rows) ? rows : []
  const hasMore = sourceRows.length > pageSize
  return {
    items: hasMore ? sourceRows.slice(0, pageSize) : sourceRows,
    total: null,
    has_more: hasMore,
    page,
    page_size: pageSize
  }
}

function getCachedFormationSearch(cacheKey) {
  const cached = formationSearchCache.get(cacheKey)
  if (!cached) return null
  if (Date.now() - cached.createdAt > FORMATION_SEARCH_CACHE_TTL_MS) {
    formationSearchCache.delete(cacheKey)
    return null
  }
  return cached.payload
}

function setCachedFormationSearch(cacheKey, payload) {
  if (formationSearchCache.size >= FORMATION_SEARCH_CACHE_MAX_ENTRIES) {
    const firstKey = formationSearchCache.keys().next().value
    if (firstKey) formationSearchCache.delete(firstKey)
  }
  formationSearchCache.set(cacheKey, { createdAt: Date.now(), payload })
}

function buildFormationFallbackTerms(normalizedQuery) {
  if (!normalizedQuery) return []
  return buildSearchTextVariants(normalizedQuery)
    .filter(Boolean)
    .reduce((terms, term) => {
      const normalizedTerm = term.trim().toLowerCase()
      if (normalizedTerm && !terms.some((existingTerm) => existingTerm.toLowerCase() === normalizedTerm)) {
        terms.push(term)
      }
      return terms
    }, [])
    .map((term) => term.trim())
    .filter((term) => term.length >= 2)
    .slice(0, FORMATION_FALLBACK_TERM_LIMIT)
}

async function runFormationFallbackSearch({ normalizedQuery, region, departement, from, pageSize }) {
  let query = supabase
    .from('formation_france')
    .select(FORMATION_SEARCH_COLUMNS, { count: 'none' })

  if (region) query = query.ilike('region', `%${escapePostgrestFilterValue(region)}%`)
  if (departement) {
    const safeDepartment = escapePostgrestFilterValue(departement)
    query = query.or(`departement.ilike.%${safeDepartment}%,commune.ilike.%${safeDepartment}%`)
  }

  const fallbackTerms = buildFormationFallbackTerms(normalizedQuery)
  if (fallbackTerms.length) {
    const filters = fallbackTerms.flatMap((term) => {
      const safeTerm = escapePostgrestFilterValue(term)
      return FORMATION_FALLBACK_COLUMNS.map((column) => `${column}.ilike.%${safeTerm}%`)
    })
    query = query.or(filters.join(','))
  }

  return query
    .order('annee', { ascending: false, nullsFirst: false })
    .order('id', { ascending: true })
    .range(from, from + pageSize)
}

function mergeRowsById(rows = [], nextRows = []) {
  const seen = new Set(rows.map((row) => row?.id).filter(Boolean))
  const merged = [...rows]
  for (const row of nextRows || []) {
    const key = row?.id
    if (key && seen.has(key)) continue
    if (key) seen.add(key)
    merged.push(row)
  }
  return merged
}

async function enrichMetierRows(rows = []) {
  const ids = rows.map((row) => row?.id).filter(Boolean)
  if (!ids.length) return rows

  const { data, error } = await supabase
    .from('metiers_france')
    .select([
      'id',
      'description',
      'contact_urlpostulation',
      'salaire_commentaire',
      'secteuractivitelibelle',
      'qualificationlibelle',
      'experiencelibelle',
      'dureetravaillibelle',
      'entreprise_logo',
      'contact_coordonnees1',
      'contextetravail_horaires'
    ].join(','))
    .in('id', ids)

  if (error) {
    console.warn('Catalog metiers enrichment error:', error.message)
    return rows
  }

  const detailsById = new Map((data || []).map((row) => [row.id, row]))
  return rows.map((row) => ({ ...row, ...(detailsById.get(row.id) || {}) }))
}

// GET /api/catalog/formations/search
// Supports: q, region, departement, page, page_size
router.get('/formations/search', optionalAuth, async (req, res) => {
  try {
    const { q, region, departement } = req.query
    const { page, pageSize, from } = getPagination(req.query)
    const normalizedQuery = typeof q === 'string' ? q.trim().replace(/\s+/g, ' ').slice(0, 120) : ''
    const keywords = buildFormationSearchKeywords(normalizedQuery)
    const cacheKey = JSON.stringify({ q: normalizedQuery, region: region || '', departement: departement || '', page, pageSize })
    const cachedPayload = getCachedFormationSearch(cacheKey)

    if (cachedPayload) {
      return res.json(cachedPayload)
    }

    const runFormationRpc = (keywordList, includeQuery = true) => supabase.rpc('search_formations', {
      p_keywords: keywordList,
      p_department: departement || null,
      p_region: region || null,
      p_limit: pageSize + 1,
      p_offset: from,
      ...(includeQuery ? { p_query: normalizedQuery || null } : {})
    })

    let { data: rpcData, error: rpcError } = await runFormationRpc(keywords)

    if (rpcError && /p_query|schema cache/i.test(rpcError.message || '')) {
      const retry = await runFormationRpc(keywords, false)
      rpcData = retry.data
      rpcError = retry.error
    }

    if (!rpcError) {
      const payload = makePagePayload(rpcData || [], page, pageSize)
      setCachedFormationSearch(cacheKey, payload)
      return res.json(payload)
    }

    console.warn('Catalog formations RPC search error, using fallback:', rpcError.message)

    if (isStatementTimeout(rpcError)) {
      const payload = makePagePayload([], page, pageSize)
      setCachedFormationSearch(cacheKey, payload)
      return res.json(payload)
    }

    const fallback = await runFormationFallbackSearch({ normalizedQuery, region, departement, from, pageSize })
    if (fallback.error) {
      if (isStatementTimeout(fallback.error)) {
        const payload = makePagePayload([], page, pageSize)
        setCachedFormationSearch(cacheKey, payload)
        return res.json(payload)
      }
      return res.status(400).json({ error: fallback.error.message })
    }

    const payload = makePagePayload(fallback.data || [], page, pageSize)
    setCachedFormationSearch(cacheKey, payload)
    return res.json(payload)
  } catch (err) {
    console.error('Catalog formations search error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /api/catalog/metiers/search
// Supports: q, typecontrat, alternance, location, page, page_size
// Uses the search_metiers RPC function for performance on 230k+ entries
router.get('/metiers/search', optionalAuth, async (req, res) => {
  try {
    const { q, typecontrat, alternance, location } = req.query
    const { page, pageSize, from } = getPagination(req.query)

    const rawQuery = typeof q === 'string' ? q.trim() : ''
    const normalizedQuery = rawQuery.replace(/\s+/g, ' ').slice(0, 80)

    // For performance on 230k entries, require minimum search length
    if (normalizedQuery && normalizedQuery.length < 2) {
      return res.json({ items: [], has_more: false, page, page_size: pageSize })
    }

    // Use the RPC function for optimized search (pg_trgm index + date filtering)
    const rpcParams = {
      p_typecontrat: typecontrat || null,
      p_alternance: typeof alternance !== 'undefined' && alternance !== ''
        ? String(alternance).toLowerCase() === 'true'
        : null,
      p_location: location || null,
      p_limit: pageSize + 1,
      p_offset: from
    }

    const searchTerms = normalizedQuery ? buildSearchTextVariants(normalizedQuery) : [null]
    let data = []
    let error = null

    for (const term of searchTerms) {
      const result = await supabase.rpc('search_metiers', {
        ...rpcParams,
        search_term: term || null
      })
      if (result.error) {
        error = result.error
        break
      }
      data = mergeRowsById(data, result.data || [])
      if (data.length > pageSize) break
    }

    if (error) {
      console.warn('Catalog metiers RPC search error:', error.message)
      // Fallback to direct query if RPC not found OR on timeout/cancellation
      const shouldFallback =
        error.message.includes('does not exist') ||
        isStatementTimeout(error) ||
        error.code === '42883' ||
        error.code === '57014'
      if (shouldFallback) {
        return fallbackMetiersSearch(req, res, normalizedQuery, typecontrat, alternance, location, page, pageSize, from)
      }
      return res.status(400).json({ error: error.message })
    }

    const rows = data || []
    const has_more = rows.length > pageSize
    const items = await enrichMetierRows(has_more ? rows.slice(0, pageSize) : rows)

    res.json({ items, has_more, page, page_size: pageSize })
  } catch (err) {
    console.error('Catalog metiers search error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Fallback direct query if RPC function not deployed
async function fallbackMetiersSearch(req, res, normalizedQuery, typecontrat, alternance, location, page, pageSize, from) {
  const selectCols = [
    'id', 'intitule', 'description', 'romecode', 'dateactualisation', 'typecontrat',
    'experiencelibelle', 'dureetravaillibelle', 'qualificationlibelle', 'secteuractivitelibelle',
    'lieutravail_libelle', 'entreprise_nom', 'origineoffre_urlorigine', 'contact_urlpostulation',
    'salaire_commentaire', 'entreprise_logo', 'contact_coordonnees1', 'contextetravail_horaires'
  ].join(',')

  const shortQuery = normalizedQuery.length > 0 && normalizedQuery.length <= 4
  const likePatterns = normalizedQuery
    ? buildSearchTextVariants(normalizedQuery).map((variant) => shortQuery ? `${variant}%` : `%${variant}%`)
    : []

  let query = supabase.from('metiers_france').select(selectCols, { count: 'none' })

  if (typecontrat) query = query.eq('typecontrat', typecontrat)
  if (typeof alternance !== 'undefined' && alternance !== '') {
    query = query.eq('alternance', String(alternance).toLowerCase() === 'true')
  }

  if (normalizedQuery) {
    query = query.or(likePatterns.map((pattern) => `intitule.ilike.${pattern}`).join(','))
    const days = shortQuery ? 30 : 60
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
    query = query.gte('dateactualisation', since)
  }

  if (location) query = query.ilike('lieutravail_libelle', `%${location}%`)

  if (!normalizedQuery && !typecontrat && (typeof alternance === 'undefined' || alternance === '')) {
    const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()
    query = query.gte('dateactualisation', since)
  }

  const toPlusOne = from + pageSize
  query = query
    .order('dateactualisation', { ascending: false, nullsFirst: false })
    .order('id', { ascending: false })
    .range(from, toPlusOne)

  const { data, error } = await query
  if (error) {
    console.warn('Catalog metiers fallback search error:', error.message)
    if (isStatementTimeout(error)) {
      return res.json({ items: [], has_more: false, page, page_size: pageSize })
    }
    return res.status(400).json({ error: error.message })
  }

  const rows = data || []
  const has_more = rows.length > pageSize
  const items = has_more ? rows.slice(0, pageSize) : rows
  res.json({ items, has_more, page, page_size: pageSize })
}

// Optional: simple index for catalog
router.get('/', (req, res) => {
  res.json({
    routes: {
      formations_search: '/api/catalog/formations/search',
      metiers_search: '/api/catalog/metiers/search'
    }
  })
})

export default router
