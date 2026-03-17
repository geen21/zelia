import express from 'express'
import { supabase } from '../config/supabase.js'
import { authenticateToken, optionalAuth } from '../middleware/auth.js'

const router = express.Router()

// Get all formations/courses
router.get('/', optionalAuth, async (req, res) => {
  try {
    const {
      q,
      region,
      department,
      type,
      limit = 25,
      offset = 0
    } = req.query

    const parsedLimit = Math.min(Number.parseInt(limit, 10) || 25, 100)
    const parsedOffset = Math.max(Number.parseInt(offset, 10) || 0, 0)

    let query = supabase
      .from('formation_france')
      .select(
        `id,
         nm,
         nmc,
         etab_nom,
         etab_uai,
         region,
         departement,
         commune,
         tc,
         tf,
         fiche,
         etab_url,
         annee,
         dataviz,
         gti,
         gta`,
        { count: 'exact' }
      )
      .range(parsedOffset, parsedOffset + parsedLimit - 1)
      .order('annee', { ascending: false })
      .order('id', { ascending: true })

    if (region) {
      query = query.ilike('region', `%${region}%`)
    }

    if (department) {
      query = query.ilike('departement', `%${department}%`)
    }

    if (type) {
      query = query.ilike('tc', `%${type}%`)
    }

    if (q) {
      const rawWords = q
        .split(/[\s,;:/]+/)
        .map((word) => word.trim())
        .filter(Boolean)

      const sanitizedWords = Array.from(new Set(rawWords.map((word) =>
        word
          .replace(/'/g, "''")
          .replace(/,/g, '\\,')
      ).filter(Boolean)))

      const targetColumns = ['nmc', 'etab_nom', 'commune', 'departement', 'region', 'tc']

      const orFilters = []
      sanitizedWords.slice(0, 6).forEach((word) => {
        targetColumns.forEach((column) => {
          orFilters.push(`${column}.ilike.%${word}%`)
        })
      })

      if (orFilters.length === 0) {
        const fallback = q
          .trim()
          .replace(/'/g, "''")
          .replace(/,/g, '\\,')
        if (fallback) {
          targetColumns.forEach((column) => {
            orFilters.push(`${column}.ilike.%${fallback}%`)
          })
        }
      }

      if (orFilters.length > 0) {
        query = query.or(orFilters.join(','))
      }
    }

    const { data, error, count } = await query

    if (error) {
      return res.status(400).json({ error: error.message })
    }

    res.json({
      formations: data ?? [],
      total: count ?? 0,
      limit: parsedLimit,
      offset: parsedOffset
    })
  } catch (error) {
    console.error('Formations fetch error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Get formation by ID
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const { id } = req.params

    const { data, error } = await supabase
      .from('formation_france')
      .select(
        `id,
         nm,
         nmc,
         etab_nom,
         etab_uai,
         region,
         departement,
         commune,
         tc,
         tf,
         fiche,
         etab_url,
         annee,
         dataviz,
         gti,
         gta`
      )
      .eq('id', id)
      .single()

    if (error) {
      return res.status(404).json({ error: 'Formation not found' })
    }

    res.json({ formation: data })
  } catch (error) {
    console.error('Formation fetch error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Create formation (authenticated users only)
router.post('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id
    const formationData = {
      ...req.body,
      user_id: userId,
      created_at: new Date().toISOString()
    }

    const { data, error } = await supabase
      .from('formations')
      .insert([formationData])
      .select()
      .single()

    if (error) {
      return res.status(400).json({ error: error.message })
    }

    res.status(201).json({
      message: 'Formation created successfully',
      formation: data
    })
  } catch (error) {
    console.error('Formation creation error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Update formation
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params
    const userId = req.user.id
    const updateData = {
      ...req.body,
      updated_at: new Date().toISOString()
    }

    // Remove fields that shouldn't be updated
    delete updateData.id
    delete updateData.user_id
    delete updateData.created_at

    const { data, error } = await supabase
      .from('formations')
      .update(updateData)
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single()

    if (error) {
      return res.status(400).json({ error: error.message })
    }

    res.json({
      message: 'Formation updated successfully',
      formation: data
    })
  } catch (error) {
    console.error('Formation update error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Delete formation
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params
    const userId = req.user.id

    const { error } = await supabase
      .from('formations')
      .delete()
      .eq('id', id)
      .eq('user_id', userId)

    if (error) {
      return res.status(400).json({ error: error.message })
    }

    res.json({ message: 'Formation deleted successfully' })
  } catch (error) {
    console.error('Formation deletion error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Advanced search with multiple keywords (for AI-generated queries)
// Uses RPC function for optimized performance
router.post('/search', optionalAuth, async (req, res) => {
  try {
    const { keywords = [], department, region, commune, cursus_types, preference, limit = 20 } = req.body

    const parsedLimit = Math.min(Number.parseInt(limit, 10) || 20, 50)

    // Clean keywords
    const cleanKeywords = (Array.isArray(keywords) ? keywords : [])
      .map(k => String(k || '').trim().toLowerCase())
      .filter(k => k.length >= 2)
      .slice(0, 10)

    const cleanCommune = (commune || '').trim().toLowerCase()
    const cleanPreference = (preference || '').trim().toLowerCase()
    const cleanCursusTypes = (Array.isArray(cursus_types) ? cursus_types : [])
      .map(t => String(t || '').trim().toLowerCase())
      .filter(t => t.length >= 2)

    console.log('Formations search:', { keywords: cleanKeywords, department, region, commune: cleanCommune, cursus_types: cleanCursusTypes, preference: cleanPreference, limit: parsedLimit })

    // Request more results from RPC to allow post-filtering
    const rpcLimit = Math.min(parsedLimit * 5, 100)

    // Try RPC function first
    let { data, error } = await supabase
      .rpc('search_formations', {
        p_keywords: cleanKeywords.length > 0 ? cleanKeywords : null,
        p_department: department || null,
        p_region: region || null,
        p_limit: rpcLimit
      })

    if (error) {
      console.error('Formations search RPC error:', error)
      // Fallback to simple query if RPC fails
      return await fallbackSearch(req, res, cleanKeywords, department, region, parsedLimit, { commune: cleanCommune, cursus_types: cleanCursusTypes, preference: cleanPreference })
    }

    // If no results with department filter, try with commune as department
    if ((!data || data.length === 0) && cleanCommune && !department) {
      const { data: dataCom, error: errCom } = await supabase
        .rpc('search_formations', {
          p_keywords: cleanKeywords.length > 0 ? cleanKeywords : null,
          p_department: cleanCommune,
          p_region: null,
          p_limit: rpcLimit
        })
      if (!errCom && dataCom && dataCom.length > 0) {
        data = dataCom
      }
    }

    // Post-filter by commune (city match)
    if (data && data.length > 0 && cleanCommune) {
      const filtered = data.filter(d =>
        (d.commune || '').toLowerCase().includes(cleanCommune) ||
        (d.departement || '').toLowerCase().includes(cleanCommune) ||
        (d.region || '').toLowerCase().includes(cleanCommune)
      )
      if (filtered.length > 0) data = filtered
    }

    // Post-filter by cursus types (study level)
    if (data && data.length > 0 && cleanCursusTypes.length > 0) {
      const filtered = data.filter(d => {
        const tc = (d.tc || '').toLowerCase()
        return cleanCursusTypes.some(f => tc.includes(f))
      })
      if (filtered.length > 0) data = filtered
    }

    // Post-filter by public/private preference
    if (data && data.length > 0 && cleanPreference) {
      if (cleanPreference.includes('public')) {
        const filtered = data.filter(d => {
          const tc = (d.tc || '').toLowerCase()
          return !tc.includes('privé') && !tc.includes('prive')
        })
        if (filtered.length > 0) data = filtered
      } else if (cleanPreference.includes('priv')) {
        const filtered = data.filter(d => {
          const tc = (d.tc || '').toLowerCase()
          return tc.includes('privé') || tc.includes('prive')
        })
        if (filtered.length > 0) data = filtered
      }
    }

    // Only broaden search if still no results and no location was specified
    if ((!data || data.length === 0) && !cleanCommune && !department && cleanKeywords.length > 0) {
      console.log('No results and no location filter, trying broader search...')
      const { data: dataBroad, error: errBroad } = await supabase
        .rpc('search_formations', {
          p_keywords: cleanKeywords.length > 0 ? [cleanKeywords[0]] : null,
          p_department: null,
          p_region: null,
          p_limit: rpcLimit
        })
      if (!errBroad && dataBroad && dataBroad.length > 0) {
        data = dataBroad
      }
    }

    // Trim to requested limit
    data = (data || []).slice(0, parsedLimit)

    console.log('Formations search returned:', data?.length ?? 0, 'results')

    res.json({
      formations: data ?? [],
      total: data?.length ?? 0
    })
  } catch (error) {
    console.error('Formations search error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Fallback search if RPC is not available
async function fallbackSearch(req, res, keywords, department, region, limit, extraFilters = {}) {
  try {
    const { commune, cursus_types, preference } = extraFilters
    const textColumns = ['nmc', 'etab_nom', 'tc']

    let query = supabase
      .from('formation_france')
      .select(
        `id,
         nmc,
         nm,
         etab_nom,
         etab_uai,
         region,
         departement,
         commune,
         tc,
         tf,
         fiche,
         etab_url,
         annee,
         image,
         email`
      )
      .limit(limit)
      .order('annee', { ascending: false })

    // Build OR filters for keywords on text columns only
    if (keywords.length > 0) {
      const orFilters = []
      keywords.slice(0, 5).forEach((keyword) => {
        const sanitized = String(keyword).trim().replace(/'/g, "''")
        if (sanitized) {
          textColumns.forEach((column) => {
            orFilters.push(`${column}.ilike.%${sanitized}%`)
          })
        }
      })
      if (orFilters.length > 0) {
        query = query.or(orFilters.join(','))
      }
    }

    if (department) {
      query = query.ilike('departement', `%${department}%`)
    }

    if (region) {
      query = query.ilike('region', `%${region}%`)
    }

    // Apply commune filter (city)
    if (commune) {
      query = query.or(`commune.ilike.%${commune}%,departement.ilike.%${commune}%`)
    }

    // Apply cursus type filter
    if (Array.isArray(cursus_types) && cursus_types.length > 0) {
      const tcFilters = cursus_types.map(t => `tc.ilike.%${t}%`)
      query = query.or(tcFilters.join(','))
    }

    const { data: rawData, error } = await query

    if (error) {
      console.error('Formations fallback search error:', error)
      return res.status(400).json({ error: error.message })
    }

    // Post-filter by public/private preference
    let results = rawData ?? []
    if (results.length > 0 && preference) {
      if (preference.includes('public')) {
        const filtered = results.filter(d => {
          const tc = (d.tc || '').toLowerCase()
          return !tc.includes('privé') && !tc.includes('prive')
        })
        if (filtered.length > 0) results = filtered
      } else if (preference.includes('priv')) {
        const filtered = results.filter(d => {
          const tc = (d.tc || '').toLowerCase()
          return tc.includes('privé') || tc.includes('prive')
        })
        if (filtered.length > 0) results = filtered
      }
    }

    res.json({
      formations: results,
      total: results.length
    })
  } catch (err) {
    console.error('Formations fallback error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
}

export default router
