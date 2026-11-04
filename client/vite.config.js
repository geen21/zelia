import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { metierPagesPlugin } from './scripts/metier-vite.mjs'

const client = dirname(fileURLToPath(import.meta.url))

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const snapshotPath = resolve(process.env.METIER_SNAPSHOT_PATH || env.METIER_SNAPSHOT_PATH ||
    resolve(client, '..', 'server', '.generated', 'metiers.json'))
  return {
    plugins: [react(), metierPagesPlugin({ snapshotPath })],
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: 'http://localhost:3001',
          changeOrigin: true,
          secure: false,
        },
      },
    },
  }
})
