import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { WebSocketServer, WebSocket as WebSocketClass } from 'ws'
import { CDPClient } from './cdp-client.js'

describe('CDPClient', () => {
  let server: WebSocketServer
  let port: number

  beforeEach(async () => {
    server = new WebSocketServer({ host: '127.0.0.1', port: 0 })
    await new Promise<void>((resolve) => server.once('listening', resolve))
    port = (server.address() as any).port
  })

  afterEach(() => {
    server.close()
  })

  it('connects to a WebSocket server', async () => {
    const client = new CDPClient(`ws://127.0.0.1:${port}`)
    await expect(client.connect(2000)).resolves.toBeUndefined()
    client.close()
  })

  it('rejects on connection failure', async () => {
    const client = new CDPClient('ws://127.0.0.1:19999')
    await expect(client.connect(100)).rejects.toThrow()
  })

  it('sends a CDP command and receives a response', async () => {
    server.on('connection', (ws) => {
      ws.on('message', (raw) => {
        const msg = JSON.parse(raw.toString())
        ws.send(JSON.stringify({ id: msg.id, result: { ok: true } }))
      })
    })

    const client = new CDPClient(`ws://127.0.0.1:${port}`)
    await client.connect(2000)
    const result = await client.send('Test.command', { foo: 'bar' })
    expect(result).toEqual({ ok: true })
    client.close()
  })

  it('rejects on CDP error response', async () => {
    server.on('connection', (ws) => {
      ws.on('message', (raw) => {
        const msg = JSON.parse(raw.toString())
        ws.send(JSON.stringify({ id: msg.id, error: { code: -32601, message: 'Method not found' } }))
      })
    })

    const client = new CDPClient(`ws://127.0.0.1:${port}`)
    await client.connect(2000)
    await expect(client.send('Unknown.method')).rejects.toThrow('Method not found')
    client.close()
  })

  it('delivers CDP events to registered listeners', async () => {
    server.on('connection', (ws) => {
      ws.on('message', (raw) => {
        const msg = JSON.parse(raw.toString())
        if (msg.method === 'Runtime.enable') {
          ws.send(JSON.stringify({ id: msg.id, result: {} }))
          ws.send(JSON.stringify({ method: 'Runtime.consoleAPICalled', params: { type: 'log' } }))
        }
      })
    })

    const client = new CDPClient(`ws://127.0.0.1:${port}`)
    await client.connect(2000)
    const listener = vi.fn()
    client.on('Runtime.consoleAPICalled', listener)
    await client.send('Runtime.enable')
    await new Promise((r) => setTimeout(r, 50))
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ type: 'log' }))
    client.close()
  })

  it('unsubscribes event listeners', async () => {
    server.on('connection', (ws) => {
      ws.on('message', (raw) => {
        const msg = JSON.parse(raw.toString())
        ws.send(JSON.stringify({ id: msg.id, result: {} }))
      })
    })

    const client = new CDPClient(`ws://127.0.0.1:${port}`)
    await client.connect(2000)
    const listener = vi.fn()
    const unsub = client.on('Some.event', listener)
    unsub()
    expect(listener).not.toHaveBeenCalled()
    client.close()
  })

  it('rejects send when not connected', async () => {
    const client = new CDPClient('ws://127.0.0.1:9999')
    await expect(client.send('Test.cmd')).rejects.toThrow('not connected')
  })

  it('increments request IDs', async () => {
    let msgCount = 0
    server.on('connection', (ws) => {
      ws.on('message', (raw) => {
        const msg = JSON.parse(raw.toString())
        ws.send(JSON.stringify({ id: msg.id, result: { id: msg.id } }))
      })
    })

    const client = new CDPClient(`ws://127.0.0.1:${port}`)
    await client.connect(2000)
    const [r1, r2] = await Promise.all([
      client.send('Cmd.first'),
      client.send('Cmd.second'),
    ])
    expect(r1).toEqual({ id: 1 })
    expect(r2).toEqual({ id: 2 })
    client.close()
  })
})
