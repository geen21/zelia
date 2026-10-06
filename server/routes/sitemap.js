import express from 'express'
import { buildFormationSlug } from '../utils/slug.js'

// Public sitemap generation for the ~130k formation_france rows.
// Mounted at `/api` (see server.js) and additionally exposed at the site
// root via nginx rewrites, because a sitemap file may only list URLs at or
// below its own path — and the formation pages live at `/formations/...`.

const ORIGIN = 'https://zelia.io'
const CHUNK_SIZE = 5000 // URLs per public sitemap file, well under the 50k limit
// Supabase/PostgREST caps rows per request at 1000 (db-max-rows) regardless of
// the requested limit, so each chunk is assembled from several DB pages.
const DB_PAGE_SIZE = 1000
const CACHE_TTL_MS = 60 * 60 * 1000 // 1 hour
const FORMATION_COLUMNS = 'id, nm, nmc, fl, etab_nom, commune'

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

function escapeXml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

export function createSitemapRouter({ db, now = Date.now }) {
  const router = express.Router()
  let countCache = { value: null, at: 0 }
  let countRequest = null
  const chunkCache = new Map()
  const chunkRequests = new Map()

  async function getFormationCount() {
    if (countCache.value != null && now() - countCache.at < CACHE_TTL_MS) {
      return countCache.value
    }
    if (!countRequest) {
      countRequest = (async () => {
        const { count, error } = await queryWithTimeoutRetry(() => db
          .from('formation_france')
          .select('id', { count: 'exact', head: true })
        )
        if (error) throw error
        if (!Number.isSafeInteger(count) || count < 0) throw new Error('Invalid formation count')
        countCache = { value: count, at: now() }
        return count
      })().finally(() => { countRequest = null })
    }
    return countRequest
  }

  async function fetchFormationChunk(chunkStart) {
    let cursor = null
    if (chunkStart > 0) {
      // Keep numbered chunks without skipping wide rows: only the indexed id
      // lookup uses OFFSET; subsequent pages seek past the previous id.
      const { data, error } = await queryWithTimeoutRetry(() => db
        .from('formation_france')
        .select('id')
        .order('id', { ascending: true })
        .range(chunkStart - 1, chunkStart - 1)
      )
      if (error) throw error
      if (!data?.length) return []
      cursor = data[0].id
    }

    const rows = []
    for (let pageOffset = 0; pageOffset < CHUNK_SIZE; pageOffset += DB_PAGE_SIZE) {
      const pageSize = Math.min(DB_PAGE_SIZE, CHUNK_SIZE - pageOffset)
      const { data, error } = await queryWithTimeoutRetry(() => {
        let query = db
          .from('formation_france')
          .select(FORMATION_COLUMNS)
          .order('id', { ascending: true })
          .limit(pageSize)
        if (cursor != null) query = query.gt('id', cursor)
        return query
      })
      if (error) throw error
      const page = data || []
      rows.push(...page)
      if (page.length < pageSize) break
      cursor = page[page.length - 1].id
    }
    return rows
  }

  async function getFormationChunkXml(chunk) {
    const cached = chunkCache.get(chunk)
    if (cached && now() - cached.at < CACHE_TTL_MS) return cached.xml
    if (!chunkRequests.has(chunk)) {
      const request = (async () => {
        const data = await fetchFormationChunk((chunk - 1) * CHUNK_SIZE)
        if (!data.length) return null

        const urls = data.map((row) => {
          const slug = buildFormationSlug(row)
          return `  <url>\n    <loc>${ORIGIN}/formations/${escapeXml(slug)}</loc>\n    <changefreq>monthly</changefreq>\n    <priority>0.6</priority>\n  </url>`
        }).join('\n')

        const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>`
        chunkCache.set(chunk, { xml, at: now() })
        return xml
      })().finally(() => { chunkRequests.delete(chunk) })
      chunkRequests.set(chunk, request)
    }
    return chunkRequests.get(chunk)
  }

  router.get('/sitemap-index.xml', async (req, res) => {
    try {
      const total = await getFormationCount()
      const chunks = Math.max(Math.ceil(total / CHUNK_SIZE), 1)
      const today = new Date(now()).toISOString().slice(0, 10)
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

      const xml = await getFormationChunkXml(chunk)
      if (!xml) return res.status(404).type('text/plain').send('Not found')

      res.set('Content-Type', 'application/xml; charset=UTF-8')
      res.set('Cache-Control', 'public, max-age=3600')
      res.send(xml)
    } catch (err) {
      console.error('Sitemap chunk error:', err)
      res.status(500).type('text/plain').send('Sitemap generation error')
    }
  })

  return router
}
