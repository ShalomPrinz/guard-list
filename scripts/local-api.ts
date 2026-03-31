// Local dev server that wraps api/kv.ts so Vite can proxy /api/kv to it.
// Reads .env.local and exposes the handler on http://localhost:3001/api/kv
import { createServer } from 'node:http'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')

// Parse .env.local into process.env before importing the handler
try {
  const envFile = readFileSync(join(root, '.env.local'), 'utf-8')
  for (const line of envFile.split('\n')) {
    const match = line.match(/^([^#\s][^=]*)=(.*)$/)
    if (match) {
      const key = match[1].trim()
      const value = match[2].trim().replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1')
      if (!process.env[key]) process.env[key] = value
    }
  }
  console.log('[dev-api] Loaded .env.local')
} catch {
  console.warn('[dev-api] .env.local not found — KV calls will fail')
}

const { default: handler } = await import('../api/kv.js')

async function toWebRequest(req: IncomingMessage, port: number): Promise<Request> {
  const url = `http://localhost:${port}${req.url}`
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(chunk as Buffer)
  const body = chunks.length ? Buffer.concat(chunks) : undefined
  const headers = new Headers()
  for (const [k, v] of Object.entries(req.headers)) {
    if (v) headers.set(k, Array.isArray(v) ? v.join(', ') : v)
  }
  return new Request(url, {
    method: req.method ?? 'GET',
    headers,
    body: body?.length ? body : undefined,
  })
}

const PORT = 3001

const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  try {
    const webReq = await toWebRequest(req, PORT)
    const webRes = await handler(webReq)
    res.statusCode = webRes.status
    webRes.headers.forEach((val, key) => res.setHeader(key, val))
    res.end(Buffer.from(await webRes.arrayBuffer()))
  } catch (err) {
    console.error('[dev-api] Error:', err)
    res.statusCode = 500
    res.end('Internal Server Error')
  }
})

server.listen(PORT, () => {
  console.log(`[dev-api] Local KV API → http://localhost:${PORT}/api/kv`)
})
