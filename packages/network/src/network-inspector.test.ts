import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { EventBus } from '@hexdtl/core'
import { NetworkInspector } from './network-inspector.js'

function mockCDPClient() {
  return {
    send: vi.fn().mockResolvedValue({ result: { type: 'string', value: '[]' } }),
    on: vi.fn().mockReturnValue(vi.fn()),
  }
}

describe('NetworkInspector', () => {
  let client: ReturnType<typeof mockCDPClient>
  let bus: EventBus
  let inspector: NetworkInspector

  beforeEach(() => {
    vi.useFakeTimers()
    client = mockCDPClient()
    bus = new EventBus()
    inspector = new NetworkInspector(client as any, bus)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('enable', () => {
    it('primes the preload array via Runtime.evaluate', async () => {
      await inspector.enable()
      expect(client.send).toHaveBeenCalledWith('Runtime.evaluate', {
        expression: 'globalThis.__hexdtl_network_events__ = globalThis.__hexdtl_network_events__ || []',
      })
    })

    it('is idempotent', async () => {
      await inspector.enable()
      await inspector.enable()
      const primeCalls = client.send.mock.calls.filter(
        (c: any[]) => c[0] === 'Runtime.evaluate' && typeof c[1]?.expression === 'string' && c[1].expression.includes('__hexdtl_network_events__'),
      )
      expect(primeCalls).toHaveLength(1)
    })
  })

  describe('poll', () => {
    it('emits network:request, network:response, network:completed from preload data', async () => {
      const requestListener = vi.fn()
      const responseListener = vi.fn()
      const completedListener = vi.fn()
      bus.on('network:request', requestListener)
      bus.on('network:response', responseListener)
      bus.on('network:completed', completedListener)

      const events = [{
        id: 'evt-1',
        method: 'GET',
        url: 'https://api.example.com/data',
        requestHeaders: { Authorization: 'Bearer token' },
        statusCode: 200,
        responseHeaders: { 'content-type': 'application/json' },
        body: '{"ok":true}',
        startTime: 1000,
        endTime: 1500,
        duration: 500,
      }]

      client.send.mockResolvedValue({
        result: { type: 'string', value: JSON.stringify(events) },
      })

      await inspector.enable()
      vi.advanceTimersByTime(500)
      await Promise.resolve()

      expect(requestListener).toHaveBeenCalledWith({
        request: {
          id: 'evt-1',
          url: 'https://api.example.com/data',
          method: 'GET',
          headers: { Authorization: 'Bearer token' },
          timestamp: 1000,
        },
      })

      expect(responseListener).toHaveBeenCalledWith({
        request: expect.objectContaining({ id: 'evt-1' }),
        response: expect.objectContaining({
          statusCode: 200,
          statusText: 'OK',
        }),
      })

      expect(completedListener).toHaveBeenCalledWith({
        request: expect.objectContaining({ id: 'evt-1' }),
        response: expect.objectContaining({ statusCode: 200 }),
        decodedBody: '{"ok":true}',
        totalDurationMs: 500,
      })
    })

    it('handles failed requests without a response', async () => {
      const completedListener = vi.fn()
      bus.on('network:completed', completedListener)

      const events = [{
        id: 'evt-2',
        method: 'GET',
        url: 'https://api.example.com/fail',
        requestHeaders: {},
        statusCode: null,
        responseHeaders: null,
        body: '',
        startTime: 2000,
        endTime: 2500,
        duration: 500,
      }]

      client.send.mockResolvedValue({
        result: { type: 'string', value: JSON.stringify(events) },
      })

      await inspector.enable()
      vi.advanceTimersByTime(500)
      await Promise.resolve()

      expect(completedListener).toHaveBeenCalledWith({
        request: expect.objectContaining({ id: 'evt-2' }),
        response: undefined,
        totalDurationMs: 500,
      })
    })

    it('deduplicates events by ID', async () => {
      const completedListener = vi.fn()
      bus.on('network:completed', completedListener)

      const events = [{
        id: 'evt-3',
        method: 'GET',
        url: 'https://api.example.com/data',
        requestHeaders: {},
        statusCode: 200,
        responseHeaders: {},
        body: '',
        startTime: 3000,
        endTime: 3500,
        duration: 500,
      }]

      client.send.mockResolvedValue({
        result: { type: 'string', value: JSON.stringify(events) },
      })

      await inspector.enable()
      vi.advanceTimersByTime(500)
      await Promise.resolve()
      vi.advanceTimersByTime(500)
      await Promise.resolve()

      expect(completedListener).toHaveBeenCalledTimes(1)
    })

    it('gracefully handles empty events array', async () => {
      const completedListener = vi.fn()
      bus.on('network:completed', completedListener)

      await inspector.enable()
      vi.advanceTimersByTime(500)
      await Promise.resolve()

      expect(completedListener).not.toHaveBeenCalled()
    })
  })

  describe('dispose', () => {
    it('stops polling and clears state', async () => {
      await inspector.enable()
      inspector.dispose()
      vi.advanceTimersByTime(500)
      await Promise.resolve()
      // Only the initial prime call
      expect(client.send).toHaveBeenCalledTimes(1)
    })
  })
})
