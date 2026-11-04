import { createServer } from 'node:http'
import { once } from 'node:events'
import { createServer as createViteServer } from 'vite'

export async function startViteTestServer(config) {
  const vite = await createViteServer({
    ...config, server: { ...config.server, middlewareMode: true, hmr: false }
  })
  // Vite 5 treats port 0 as its default; let Node allocate the test port.
  const httpServer = createServer(vite.middlewares)
  try {
    const listening = once(httpServer, 'listening')
    httpServer.listen(0, '127.0.0.1')
    await listening
  } catch (error) {
    await vite.close()
    throw error
  }
  return {
    httpServer,
    async close() {
      try {
        await new Promise((resolve, reject) => {
          httpServer.close((error) => error ? reject(error) : resolve())
          httpServer.closeAllConnections()
        })
      } finally { await vite.close() }
    }
  }
}
