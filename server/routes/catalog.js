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

// GET /api/catalog/formations/search
// Supports: q, region, departement, page, page_size
router.get('/formations/search', optionalAuth, async (req, res) => {
  try {
    const { q, region, departement } = req.query
    const { page, pageSize, from, to } = getPagination(req.query)

    let query = supabase
      .from('formation_france')
      .select('*', { count: 'exact' })

    if (region) query = query.eq('region', region)
    if (departement) query = query.eq('departement', departement)
    if (q) {
      const like = `%${q}%`
      query = query.or(
        [
          `etab_nom.ilike.${like}`,
          `code_formation.ilike.${like}`,
          `commune.ilike.${like}`,
          `departement.ilike.${like}`,
          `region.ilike.${like}`
        ].join(',')
      )
    }

    // Order: items with nm not null first (NULLS LAST), then recent by id
    query = query
      .order('nm', { ascending: true, nullsFirst: false })
      .order('id', { ascending: false })
      .range(from, to)

    const { data, error, count } = await query
    if (error) return res.status(400).json({ error: error.message })

    res.json({
      items: data || [],
      total: count ?? 0,
      page,
      page_size: pageSize
    })
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
      search_term: normalizedQuery || null,
      p_typecontrat: typecontrat || null,
      p_alternance: typeof alternance !== 'undefined' && alternance !== ''
        ? String(alternance).toLowerCase() === 'true'
        : null,
      p_location: location || null,
      p_limit: pageSize + 1,
      p_offset: from
    }

    const { data, error } = await supabase.rpc('search_metiers', rpcParams)

    if (error) {
      console.warn('Catalog metiers RPC search error:', error.message)
      // Fallback to direct query if RPC not found
      if (error.message.includes('does not exist') || error.code === '42883') {
        return fallbackMetiersSearch(req, res, normalizedQuery, typecontrat, alternance, location, page, pageSize, from)
      }
      return res.status(400).json({ error: error.message })
    }

    const rows = data || []
    const has_more = rows.length > pageSize
    const items = has_more ? rows.slice(0, pageSize) : rows

    res.json({ items, has_more, page, page_size: pageSize })
  } catch (err) {
    console.error('Catalog metiers search error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Fallback direct query if RPC function not deployed
async function fallbackMetiersSearch(req, res, normalizedQuery, typecontrat, alternance, location, page, pageSize, from) {
  const selectCols = [
    'id', 'intitule', 'romecode', 'dateactualisation', 'typecontrat',
    'lieutravail_libelle', 'entreprise_nom', 'origineoffre_urlorigine'
  ].join(',')

  const shortQuery = normalizedQuery.length > 0 && normalizedQuery.length <= 4
  const likePattern = normalizedQuery
    ? shortQuery ? `${normalizedQuery}%` : `%${normalizedQuery}%`
    : ''

  let query = supabase.from('metiers_france').select(selectCols, { count: 'none' })

  if (typecontrat) query = query.eq('typecontrat', typecontrat)
  if (typeof alternance !== 'undefined' && alternance !== '') {
    query = query.eq('alternance', String(alternance).toLowerCase() === 'true')
  }

  if (normalizedQuery) {
    query = query.ilike('intitule', likePattern)
    const days = shortQuery ? 60 : 90
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
