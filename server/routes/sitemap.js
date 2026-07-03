import express from 'express'
import { supabase } from '../config/supabase.js'
import { buildFormationSlug } from '../utils/slug.js'

// Public sitemap generation for the ~130k formation_france rows.
// Mounted at `/api` (see server.js) and additionally exposed at the site
// root via nginx rewrites, because a sitemap file may only list URLs at or
// below its own path — and the formation pages live at `/formations/...`.

const router = express.Router()

const ORIGIN = 'https://zelia.io'
const CHUNK_SIZE = 5000 // URLs per public sitemap file, well under the 50k limit
// Supabase/PostgREST caps rows per request at 1000 (db-max-rows) regardless of
// the requested .range(), so each chunk is assembled from several DB pages.
const DB_PAGE_SIZE = 1000
const CACHE_TTL_MS = 60 * 60 * 1000 // 1 hour

let countCache = { value: null, at: 0 }
const chunkCache = new Map()

function isStatementTimeout(error) {
  const message = error?.message || ''
  return error?.code === '57014' || message.includes('statement timeout') || message.includes('canceling statement')
}

// This Supabase instance occasionally cancels a query with a transient
// statement timeout (e.g. after a cold start) that succeeds on retry — the
// same pattern already handled in routes/catalog.js.
async function queryWithTimeoutRetry(queryFn) {
  const first = await queryFn()
  if (first.error && isStatementTimeout(first.error)) {
    return queryFn()
  }
  return first
}

async function getFormationCount() {
  if (countCache.value != null && Date.now() - countCache.at < CACHE_TTL_MS) {
    return countCache.value
  }
  const { count, error } = await queryWithTimeoutRetry(() => supabase
    .from('formation_france')
    .select('id', { count: 'exact', head: true })
  )
  if (error) throw error
  countCache = { value: count || 0, at: Date.now() }
  return countCache.value
}

function escapeXml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

async function fetchFormationRowsInRange(from, to) {
  const { data, error } = await queryWithTimeoutRetry(() => supabase
    .from('formation_france')
    .select('id, nm, nmc, fl, etab_nom, commune')
    .order('id', { ascending: true })
    .range(from, to)
  )
  if (error) throw error
  return data || []
}

// Fetches up to CHUNK_SIZE rows starting at `chunkStart`, paging through the
// DB in DB_PAGE_SIZE-row batches since a single request is capped at 1000.
async function fetchFormationChunk(chunkStart) {
  const rows = []
  for (let pageOffset = 0; pageOffset < CHUNK_SIZE; pageOffset += DB_PAGE_SIZE) {
    const from = chunkStart + pageOffset
    const to = Math.min(from + DB_PAGE_SIZE, chunkStart + CHUNK_SIZE) - 1
    const page = await fetchFormationRowsInRange(from, to)
    rows.push(...page)
    if (page.length < (to - from + 1)) break // reached the end of the table
  }
  return rows
}

router.get('/sitemap-index.xml', async (req, res) => {
  try {
    const total = await getFormationCount()
    const chunks = Math.max(Math.ceil(total / CHUNK_SIZE), 1)
    const today = new Date().toISOString().slice(0, 10)
    const entries = Array.from({ length: chunks }, (_, i) =>
      `  <sitemap>\n    <loc>${ORIGIN}/sitemap-formations-${i + 1}.xml</loc>\n    <lastmod>${today}</lastmod>\n  </sitemap>`
    ).join('\n')
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</sitemapindex>`

    res.set('Content-Type', 'application/xml; charset=UTF-8')
    res.set('Cache-Control', 'public, max-age=3600')
    res.send(xml)
  } catch (err) {
    console.error('Sitemap index error:', err)
    res.status(500).type('text/plain').send('Sitemap generation error')
  }
})

router.get('/sitemap-formations-:chunk.xml', async (req, res) => {
  try {
    const chunk = parseInt(req.params.chunk, 10)
    if (!Number.isFinite(chunk) || chunk < 1) {
      return res.status(404).type('text/plain').send('Not found')
    }

    const cached = chunkCache.get(chunk)
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
      res.set('Content-Type', 'application/xml; charset=UTF-8')
      res.set('Cache-Control', 'public, max-age=3600')
      return res.send(cached.xml)
    }

    const chunkStart = (chunk - 1) * CHUNK_SIZE
    const data = await fetchFormationChunk(chunkStart)

    if (!data.length) {
      return res.status(404).type('text/plain').send('Not found')
    }

    const urls = data.map((row) => {
      const slug = buildFormationSlug(row)
      return `  <url>\n    <loc>${ORIGIN}/formations/${escapeXml(slug)}</loc>\n    <changefreq>monthly</changefreq>\n    <priority>0.6</priority>\n  </url>`
    }).join('\n')

    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>`
    chunkCache.set(chunk, { xml, at: Date.now() })

    res.set('Content-Type', 'application/xml; charset=UTF-8')
    res.set('Cache-Control', 'public, max-age=3600')
    res.send(xml)
  } catch (err) {
    console.error('Sitemap chunk error:', err)
    res.status(500).type('text/plain').send('Sitemap generation error')
  }
})

export default router
