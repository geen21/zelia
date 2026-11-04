import { parseArgs } from 'node:util'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { loadEnv } from 'vite'
import { validateMetierSnapshot } from '../src/lib/metierContent.js'

const client = resolve(dirname(fileURLToPath(import.meta.url)), '..')

export function resolveMetierBuild({ root = client, snapshot: requested, optional = false, env = process.env } = {}) {
  const settings = { ...loadEnv('production', root, ['METIER_', 'VITE_METIER_PAGES_ENABLED']), ...env }
  const snapshot = resolve(requested || settings.METIER_SNAPSHOT_PATH || resolve(root, '..', 'server', '.generated', 'metiers.json'))
  const existingPages = existsSync(resolve(root, 'dist', 'metiers', 'index.html')) ||
    existsSync(resolve(root, 'dist', 'metiers-data', 'index.json'))
  const required = !optional || Boolean(requested || settings.METIER_SNAPSHOT_PATH) ||
    settings.METIER_PAGES_REQUIRED === 'true' || settings.VITE_METIER_PAGES_ENABLED === 'true' ||
    existsSync(snapshot) || existingPages
  if (!required) return { ...env }
  if (!existsSync(snapshot)) {
    throw new Error('Instantané métiers manquant : exporter le catalogue avant de reconstruire. Les pages existantes sont conservées.')
  }
  validateMetierSnapshot(JSON.parse(readFileSync(snapshot, 'utf8')))
  return { ...env, METIER_SNAPSHOT_PATH: snapshot, METIER_PAGES_REQUIRED: 'true', VITE_METIER_PAGES_ENABLED: 'true' }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({ options: { snapshot: { type: 'string' }, optional: { type: 'boolean' } } })
  const env = resolveMetierBuild({ snapshot: values.snapshot, optional: values.optional })
  for (const args of [[resolve(client, 'node_modules', 'vite', 'bin', 'vite.js'), 'build'], [resolve(client, 'scripts', 'prerender-seo.js')]]) {
    const result = spawnSync(process.execPath, args, { cwd: client, env, stdio: 'inherit' })
    if (result.error) throw result.error
    if (result.status !== 0) process.exit(result.status || 1)
  }
}
