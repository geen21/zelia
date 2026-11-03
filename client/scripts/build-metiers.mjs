import { parseArgs } from 'node:util'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { validateMetierSnapshot } from '../src/lib/metierContent.js'

const client = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const { values } = parseArgs({ options: { snapshot: { type: 'string' } } })
const snapshot = resolve(values.snapshot || resolve(client, '..', 'server', '.generated', 'metiers.json'))
validateMetierSnapshot(JSON.parse(readFileSync(snapshot, 'utf8')))
const env = { ...process.env, METIER_SNAPSHOT_PATH: snapshot, METIER_PAGES_REQUIRED: 'true', VITE_METIER_PAGES_ENABLED: 'true' }
for (const args of [[resolve(client, 'node_modules', 'vite', 'bin', 'vite.js'), 'build'], [resolve(client, 'scripts', 'prerender-seo.js')]]) {
  const result = spawnSync(process.execPath, args, { cwd: client, env, stdio: 'inherit' })
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status || 1)
}
