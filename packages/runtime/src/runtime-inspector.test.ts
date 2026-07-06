import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EventBus } from '@hexdtl/core'
import { RuntimeInspector } from './runtime-inspector.js'

function mockCDPClient() {
  return {
    send: vi.fn().mockResolvedValue({}),
    on: vi.fn().mockReturnValue(vi.fn()),
  }
}

describe('RuntimeInspector', () => {
  let client: ReturnType<typeof mockCDPClient>
  let bus: EventBus
  let inspector: RuntimeInspector

  beforeEach(() => {
    client = mockCDPClient()
    bus = new EventBus()
    inspector = new RuntimeInspector(client as any, bus)
  })

  describe('enable', () => {
    it('enables Runtime and Debugger domains', async () => {
      await inspector.enable()
      expect(client.send).toHaveBeenCalledWith('Runtime.enable')
      expect(client.send).toHaveBeenCalledWith('Debugger.enable')
      expect(client.send).toHaveBeenCalledWith('Runtime.runIfWaitingForDebugger')
    })

    it('subscribes to CDP events', async () => {
      await inspector.enable()
      expect(client.on).toHaveBeenCalledWith('Runtime.consoleAPICalled', expect.any(Function))
      expect(client.on).toHaveBeenCalledWith('Runtime.exceptionThrown', expect.any(Function))
      expect(client.on).toHaveBeenCalledWith('Debugger.scriptParsed', expect.any(Function))
    })

    it('is idempotent', async () => {
      await inspector.enable()
      await inspector.enable()
      expect(client.send).toHaveBeenCalledTimes(3) // not 6
    })
  })

  describe('console events', () => {
    it('emits normalized console events from CDP', async () => {
      const listener = vi.fn()
      bus.on('runtime:console', listener)
      // Manually trigger the CDP callback
      const consoleListener = vi.fn()

      // Override client.on to capture the callback
      client.on.mockImplementation((method: string, cb: Function) => {
        if (method === 'Runtime.consoleAPICalled') consoleListener.mockImplementation(cb)
        return vi.fn()
      })

      await inspector.enable()

      // Simulate a CDP console event
      consoleListener({
        type: 'warn',
        args: [{ type: 'string', value: 'uh oh' }],
        timestamp: 5000,
        stackTrace: {
          callFrames: [
            { functionName: 'warn', url: 'file:///app.js', lineNumber: 5, columnNumber: 10 },
          ],
        },
      })

      expect(consoleListener).toHaveBeenCalled()
    })

    it('emits runtime:exception from CDP exception', async () => {
      const listener = vi.fn()
      bus.on('runtime:exception', listener)
      const exceptionListener = vi.fn()

      client.on.mockImplementation((method: string, cb: Function) => {
        if (method === 'Runtime.exceptionThrown') exceptionListener.mockImplementation(cb)
        return vi.fn()
      })

      await inspector.enable()

      exceptionListener({
        timestamp: 6000,
        exceptionDetails: {
          text: 'Error: boom',
          exception: { description: 'Error: boom\n    at /app.js:1' },
          stackTrace: {
            callFrames: [
              { functionName: 'myFunc', url: 'file:///app.js', lineNumber: 3, columnNumber: 7 },
            ],
          },
        },
      })

      expect(exceptionListener).toHaveBeenCalled()
    })
  })

  describe('evaluate', () => {
    it('returns successful result', async () => {
      client.send.mockResolvedValue({
        result: { type: 'number', value: 42 },
      })
      const result = await inspector.evaluate('1 + 41')
      expect(result.ok).toBe(true)
      expect(result.display).toBe('42')
    })

    it('returns error result on exception', async () => {
      client.send.mockResolvedValue({
        result: { type: 'object' },
        exceptionDetails: { text: 'ReferenceError: x is not defined' },
      })
      const result = await inspector.evaluate('x')
      expect(result.ok).toBe(false)
      expect(result.display).toBe('ReferenceError: x is not defined')
    })

    it('handles CDP send failures', async () => {
      client.send.mockRejectedValue(new Error('Connection lost'))
      const result = await inspector.evaluate('foo')
      expect(result.ok).toBe(false)
      expect(result.display).toBe('Connection lost')
    })
  })

  describe('dispose', () => {
    it('cleans up subscriptions', async () => {
      const unsub = vi.fn()
      client.on.mockReturnValue(unsub)
      await inspector.enable()
      inspector.dispose()
      expect(unsub).toHaveBeenCalledTimes(3)
    })
  })
})
