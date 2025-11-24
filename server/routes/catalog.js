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
// Supports: q, typecontrat, alternance, page, page_size
router.get('/metiers/search', optionalAuth, async (req, res) => {
  try {
    const { q, typecontrat, alternance, location } = req.query
    const { page, pageSize, from, to } = getPagination(req.query)

    // Fetch only the columns used by the client and avoid expensive total counts
    // Use the column names present in your provided schema (no snake_case variants)
  const selectCols = [
      'id',
      'intitule',
      'romecode',
      'dateactualisation',
      'typecontrat',
      'lieutravail_libelle',
      'lieutravail_latitude',
      'lieutravail_longitude',
      'entreprise_nom',
      'origineoffre_urlorigine',
      'contact_urlpostulation',
      'entreprise_logo'
    ].join(',')

  let query = supabase
      .from('metiers_france')
      .select(selectCols, { count: 'none' })

    if (typecontrat) {
      query = query.eq('typecontrat', typecontrat)
    }
    if (typeof alternance !== 'undefined' && alternance !== '') {
      const boolVal = String(alternance).toLowerCase() === 'true'
      query = query.eq('alternance', boolVal)
    }
    if (q) {
      const like = `%${q}%`
      // Use a conservative set of columns known to exist across schemas to avoid 400 errors
      // Removed description and others to avoid timeouts on large datasets
      query = query.ilike('intitule', like)

      // Add date filter to improve performance on large dataset
      const days = 180 // 6 months
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
      query = query.gte('dateactualisation', since)
    }

    if (location) {
      const like = `%${location}%`
      query = query.ilike('lieutravail_libelle', like)
    }

  // Avoid expensive full scans: when no filters, constrain to a recent window
  if (!q && !typecontrat && (typeof alternance === 'undefined' || alternance === '')) {
    try {
      const days = 14 // adjust window as needed
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
      query = query.gte('dateactualisation', since)
    } catch {}
  }

  // Avoid expensive ORDER BY on huge tables when no filters are applied.
  // Apply ordering only if a filter/search is present; otherwise just use range for speed.
  const toPlusOne = from + pageSize
  const hasFilter = !!(q || typecontrat || location || (typeof alternance !== 'undefined' && alternance !== ''))
  if (hasFilter) {
    query = query
      .order('dateactualisation', { ascending: false, nullsFirst: false })
      .order('id', { ascending: false })
  }
  query = query.range(from, toPlusOne)

  const { data, error } = await query
    if (error) return res.status(400).json({ error: error.message })

    const rows = data || []
    const has_more = rows.length > pageSize
    const items = has_more ? rows.slice(0, pageSize) : rows

  res.json({ items, has_more, page, page_size: pageSize })
  } catch (err) {
    console.error('Catalog metiers search error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

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
