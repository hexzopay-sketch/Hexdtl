import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import http from 'node:http'

describe('attachToPid', () => {
  it('rejects for non-existent PID', async () => {
    const { attachToPid } = await import('./discovery.js')
    await expect(attachToPid(9999999)).rejects.toThrow()
  })
})

describe('discovery HTTP endpoint', () => {
  let server: http.Server
  let port: number

  beforeEach(async () => {
    server = http.createServer()
    await new Promise<void>((resolve) => server.listen(0, resolve))
    port = (server.address() as any).port
  })

  afterEach(() => {
    server.close()
  })

  it('parses a JSON /json endpoint response', async () => {
    server.on('request', (req, res) => {
      if (req.url === '/json') {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify([
          {
            id: 'target-1',
            type: 'node',
            title: 'node(12345)',
            webSocketDebuggerUrl: `ws://127.0.0.1:${port}/target-1`,
          },
        ]))
      }
    })

    const body = await new Promise<string>((resolve, reject) => {
      http.get(`http://127.0.0.1:${port}/json`, (res) => {
        let data = ''
        res.on('data', (c) => (data += c))
        res.on('end', () => resolve(data))
      }).on('error', reject)
    })

    const targets = JSON.parse(body)
    expect(Array.isArray(targets)).toBe(true)
    expect(targets[0].webSocketDebuggerUrl).toContain(`ws://127.0.0.1:${port}`)
  })
})
