import { existsSync, readFileSync, statSync } from 'node:fs'
import { isAbsolute, resolve } from 'node:path'
import { buildMetierDocuments, metierDataPath } from '../src/pages/metiers/metierSeo.js'

function documentPath(pathname) {
  if (!pathname.startsWith('/metiers-data/') || !pathname.endsWith('/index.json')) return null
  const path = `/metiers/${pathname.slice('/metiers-data/'.length, -'index.json'.length)}`
  try { return metierDataPath(path) === pathname ? path : null } catch { return null }
}

function sendJson(req, res, status, value) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-cache')
  res.end(req.method === 'HEAD' ? undefined : JSON.stringify(value))
}

export function metierPagesPlugin({ snapshotPath }) {
  let cacheKey
  let documents
  let lastError
  return {
    name: 'zelia-metier-pages',
    config(_config, { command }) {
      if (command === 'serve' && existsSync(snapshotPath)) {
        return { define: { 'import.meta.env.VITE_METIER_PAGES_ENABLED': JSON.stringify('true') } }
      }
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const pathname = new URL(req.url, 'http://localhost').pathname
        if (!pathname.startsWith('/metiers-data/')) return next()
        if (!['GET', 'HEAD'].includes(req.method)) {
          res.setHeader('Allow', 'GET, HEAD')
          return sendJson(req, res, 405, { error: 'Méthode non autorisée' })
        }
        const path = documentPath(pathname)
        if (!path) return sendJson(req, res, 404, { error: 'Fiche métier introuvable' })
        try {
          const stats = statSync(snapshotPath)
          const key = `${stats.mtimeMs}:${stats.size}`
          if (key !== cacheKey) {
            const snapshot = JSON.parse(readFileSync(snapshotPath, 'utf8'))
            documents = new Map([...buildMetierDocuments(snapshot)].map((doc) => [doc.path, doc]))
            cacheKey = key
          }
          lastError = null
        } catch (error) {
          if (lastError !== error.message) server.config.logger.error(`Catalogue métiers local indisponible : ${error.message}`)
          lastError = error.message
          return sendJson(req, res, 503, { error: 'Catalogue métiers local indisponible : exporter un instantané valide.' })
        }
        const doc = documents.get(path)
        return sendJson(req, res, doc ? 200 : 404, doc || { error: 'Fiche métier introuvable' })
      })
    },
    configurePreviewServer(server) {
      const outDir = server.config.build.outDir
      const dist = isAbsolute(outDir) ? outDir : resolve(server.config.root, outDir)
      server.middlewares.use((req, res, next) => {
        const url = new URL(req.url, 'http://localhost')
        const pathname = url.pathname
        if (pathname.startsWith('/metiers-data/')) {
          const path = documentPath(pathname)
          const file = path && resolve(dist, ...pathname.split('/').filter(Boolean))
          if (!file || !existsSync(file) || !statSync(file).isFile()) {
            return sendJson(req, res, 404, { error: 'Fiche métier introuvable dans le build' })
          }
          return next()
        }
        if (pathname !== '/metiers' && !pathname.startsWith('/metiers/')) return next()
        const path = pathname.endsWith('/') ? pathname : `${pathname}/`
        let valid = true
        try { metierDataPath(path) } catch { valid = false }
        const file = valid && resolve(dist, ...path.split('/').filter(Boolean), 'index.html')
        if (!file || !existsSync(file)) {
          res.statusCode = 404
          res.setHeader('Content-Type', 'text/plain; charset=utf-8')
          return res.end('Cette fiche métier n’est pas publiée.')
        }
        if (pathname !== path) {
          res.statusCode = 301
          res.setHeader('Location', `${path}${url.search}`)
          return res.end()
        }
        return next()
      })
    }
  }
}
