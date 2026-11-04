import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { preview } from 'vite'
import { startViteTestServer } from './vite-test-server.mjs'
import { resolveMetierBuild } from './build-metiers.mjs'
import { metierPagesPlugin } from './metier-vite.mjs'
import { metierSnapshot } from './fixtures/metiers.mjs'
import { buildMetierDocuments, metierDataPath } from '../src/pages/metiers/metierSeo.js'

async function workspace(t) {
  const temp = await mkdtemp(resolve(tmpdir(), 'zelia-metier-serving-'))
  t.after(() => rm(temp, { recursive: true }))
  const root = resolve(temp, 'client')
  const snapshotPath = resolve(temp, 'server', '.generated', 'metiers.json')
  await mkdir(root, { recursive: true })
  await mkdir(resolve(temp, 'server', '.generated'), { recursive: true })
  return { root, snapshotPath }
}

function address(server) {
  return `http://127.0.0.1:${server.address().port}`
}

test('ordinary builds include existing snapshots and fail before erasing an activated catalogue', async (t) => {
  const { root, snapshotPath } = await workspace(t)
  assert.deepEqual(resolveMetierBuild({ root, optional: true, env: {} }), {})
  await writeFile(snapshotPath, JSON.stringify(metierSnapshot(2, true)))
  const env = resolveMetierBuild({ root, optional: true, env: {} })
  assert.equal(env.METIER_SNAPSHOT_PATH, snapshotPath)
  assert.equal(env.METIER_PAGES_REQUIRED, 'true')
  assert.equal(env.VITE_METIER_PAGES_ENABLED, 'true')
  await mkdir(resolve(root, 'dist', 'metiers'), { recursive: true })
  const published = resolve(root, 'dist', 'metiers', 'index.html')
  await writeFile(published, 'keep-existing-pages')
  await rm(snapshotPath)
  assert.throws(() => resolveMetierBuild({ root, optional: true, env: {} }), /conservées/)
  assert.equal(await readFile(published, 'utf8'), 'keep-existing-pages')
  await writeFile(snapshotPath, '{"invalid":true}')
  assert.throws(() => resolveMetierBuild({ root, optional: true, env: {} }), /Instantané/)
  assert.equal(await readFile(published, 'utf8'), 'keep-existing-pages')
})

test('ordinary builds honor the feature flag and snapshot path in production environment files', async (t) => {
  const { root } = await workspace(t)
  await writeFile(resolve(root, '.env.production'), 'VITE_METIER_PAGES_ENABLED=true\n')
  assert.throws(() => resolveMetierBuild({ root, optional: true, env: {} }), /Instantané métiers manquant/)
  const custom = resolve(root, 'export.json')
  await writeFile(custom, JSON.stringify(metierSnapshot(2, true)))
  await writeFile(resolve(root, '.env.production'), `VITE_METIER_PAGES_ENABLED=true\nMETIER_SNAPSHOT_PATH=${custom}\n`)
  assert.equal(resolveMetierBuild({ root, optional: true, env: {} }).METIER_SNAPSHOT_PATH, custom)
})

test('development serves the validated snapshot, refreshes it and never falls back to HTML or stale data', async (t) => {
  const { root, snapshotPath } = await workspace(t)
  const snapshot = metierSnapshot(2, true)
  await writeFile(snapshotPath, JSON.stringify(snapshot))
  const server = await startViteTestServer({
    root, configFile: false, plugins: [metierPagesPlugin({ snapshotPath })],
    server: { host: '127.0.0.1', port: 0, strictPort: true, hmr: false }, logLevel: 'silent'
  })

  t.after(() => server.close())
  const base = address(server.httpServer)
  let response = await fetch(`${base}/metiers-data/index.json`)
  assert.equal(response.status, 200)
  assert.match(response.headers.get('content-type'), /application\/json/)
  assert.equal((await response.json()).entries.length, 2)
  assert.equal((await fetch(`${base}/metiers-data/inconnu/index.json`)).status, 404)
  assert.equal((await fetch(`${base}/metiers-data/index.json`, { method: 'HEAD' })).status, 200)
  assert.equal((await fetch(`${base}/metiers-data/index.json`, { method: 'POST' })).status, 405)
  await writeFile(snapshotPath, '{invalid')
  response = await fetch(`${base}/metiers-data/index.json`)
  assert.equal(response.status, 503)
  assert.match(response.headers.get('content-type'), /application\/json/)
  await response.json()
  await writeFile(snapshotPath, JSON.stringify(metierSnapshot(3, true)))
  assert.equal((await (await fetch(`${base}/metiers-data/index.json`)).json()).entries.length, 3)
})

test('real Vite preview returns JSON and genuine 404s instead of the SPA fallback', async (t) => {
  const { root, snapshotPath } = await workspace(t)
  const snapshot = metierSnapshot(2, true)
  await writeFile(snapshotPath, JSON.stringify(snapshot))
  const docs = [...buildMetierDocuments(snapshot)]
  const dist = resolve(root, 'dist')
  await mkdir(resolve(dist, 'metiers'), { recursive: true })
  await mkdir(resolve(dist, 'metiers-data'), { recursive: true })
  await writeFile(resolve(dist, 'index.html'), '<!doctype html><main>SPA fallback</main>')
  await writeFile(resolve(dist, 'metiers', 'index.html'), '<!doctype html><main>Metier directory</main>')
  await writeFile(resolve(dist, 'metiers-data', 'index.json'), JSON.stringify(docs[0]))
  const server = await preview({
    root, configFile: false, plugins: [metierPagesPlugin({ snapshotPath })],
    build: { outDir: 'dist' }, preview: { host: '127.0.0.1', port: 0, strictPort: true }, logLevel: 'silent'
  })
  t.after(() => new Promise((resolve, reject) => {
    server.httpServer.close((error) => error ? reject(error) : resolve())
    server.httpServer.closeAllConnections()
  }))
  const base = address(server.httpServer)
  const response = await fetch(`${base}/metiers-data/index.json`)
  assert.equal(response.status, 200)
  assert.match(response.headers.get('content-type'), /application\/json/)
  assert.deepEqual(await response.json(), docs[0])
  const missingData = await fetch(base + metierDataPath(docs[1].path))
  assert.equal(missingData.status, 404, 'A source snapshot must not hide missing files in a production build')
  assert.match(missingData.headers.get('content-type'), /application\/json/)
  assert.equal((await fetch(`${base}/metiers/inconnu/`)).status, 404)
  assert.equal((await fetch(`${base}/metiers`, { redirect: 'manual' })).status, 301)
  assert.match(await (await fetch(`${base}/autre-page`)).text(), /SPA fallback/)
})
