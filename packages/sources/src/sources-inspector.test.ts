import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EventBus } from '@hexdtl/core'
import { SourcesInspector } from './sources-inspector.js'

function mockCDPClient() {
  return {
    send: vi.fn(),
    on: vi.fn().mockReturnValue(vi.fn()),
  }
}

describe('SourcesInspector', () => {
  let client: ReturnType<typeof mockCDPClient>
  let bus: EventBus
  let inspector: SourcesInspector

  beforeEach(() => {
    client = mockCDPClient()
    bus = new EventBus()
    inspector = new SourcesInspector(client as any, bus)
    client.send.mockResolvedValue({})
    client.on.mockReturnValue(vi.fn())
  })

  describe('enable', () => {
    it('enables Debugger domain', async () => {
      await inspector.enable()
      expect(client.send).toHaveBeenCalledWith('Debugger.enable')
    })

    it('subscribes to Debugger.scriptParsed', async () => {
      await inspector.enable()
      expect(client.on).toHaveBeenCalledWith('Debugger.scriptParsed', expect.any(Function))
    })

    it('is idempotent', async () => {
      await inspector.enable()
      await inspector.enable()
      expect(client.send).toHaveBeenCalledTimes(1)
    })
  })

  describe('script handling', () => {
    function captureScriptHandler(): { trigger: (params: any) => void; waitForAsync: () => Promise<void> } {
      let scriptCb: Function = () => {}
      let pendingPromise: Promise<void> = Promise.resolve()

      client.on.mockImplementation((method: string, cb: Function) => {
        if (method === 'Debugger.scriptParsed') {
          scriptCb = cb
          pendingPromise = Promise.resolve()
        }
        return vi.fn()
      })

      return {
        trigger: (params: any) => {
          const result = scriptCb(params)
          if (result instanceof Promise) pendingPromise = result
        },
        waitForAsync: async () => {
          await pendingPromise
          await new Promise((r) => setTimeout(r, 5))
        },
      }
    }

    it('fetches source for parsed scripts', async () => {
      client.send.mockResolvedValue({ scriptSource: 'const x = 42;\n' })
      const busListener = vi.fn()
      bus.on('source:scriptParsed', busListener)
      const handler = captureScriptHandler()

      await inspector.enable()

      handler.trigger({
        scriptId: '1',
        url: 'file:///app/index.js',
        startLine: 0,
        startColumn: 0,
        endLine: 10,
        endColumn: 0,
        hash: 'abc123',
      })

      await handler.waitForAsync()

      expect(client.send).toHaveBeenCalledWith('Debugger.getScriptSource', { scriptId: '1' })
    })

    it('skips node: internal scripts', async () => {
      const handler = captureScriptHandler()
      await inspector.enable()

      handler.trigger({
        scriptId: '2',
        url: 'node:internal/modules/cjs/loader',
        startLine: 0,
        startColumn: 0,
        endLine: 100,
        endColumn: 0,
        hash: 'def456',
      })

      await handler.waitForAsync()

      const calls = client.send.mock.calls.filter((c: any[]) => c[0] === 'Debugger.getScriptSource')
      expect(calls).toHaveLength(0)
    })

    it('skips scripts with no url', async () => {
      const handler = captureScriptHandler()
      await inspector.enable()

      handler.trigger({
        scriptId: '3',
        url: '',
        startLine: 0,
        startColumn: 0,
        endLine: 1,
        endColumn: 0,
        hash: 'ghi789',
      })

      await handler.waitForAsync()

      const calls = client.send.mock.calls.filter((c: any[]) => c[0] === 'Debugger.getScriptSource')
      expect(calls).toHaveLength(0)
    })

    it('caches scripts for later retrieval', async () => {
      client.send.mockResolvedValue({ scriptSource: 'module.exports = 42;\n' })
      const handler = captureScriptHandler()
      await inspector.enable()

      handler.trigger({
        scriptId: '4',
        url: 'file:///app/lib.js',
        startLine: 0,
        startColumn: 0,
        endLine: 5,
        endColumn: 0,
        hash: 'jkl012',
      })

      await handler.waitForAsync()

      const script = inspector.getScript('4')
      expect(script).toBeDefined()
      expect(script!.url).toContain('lib.js')
      expect(script!.source).toBe('module.exports = 42;\n')

      const allScripts = inspector.getAllScripts()
      expect(allScripts).toHaveLength(1)

      const found = inspector.findScripts('lib')
      expect(found).toHaveLength(1)
    })

    it('handles getScriptSource failures gracefully', async () => {
      // First send (Debugger.enable) succeeds, subsequent (getScriptSource) fails
      client.send.mockResolvedValueOnce({})
      client.send.mockRejectedValueOnce(new Error('Script not available'))
      const handler = captureScriptHandler()
      await inspector.enable()

      handler.trigger({
        scriptId: '5',
        url: 'file:///app/gone.js',
        startLine: 0,
        startColumn: 0,
        endLine: 1,
        endColumn: 0,
        hash: 'mno345',
      })

      await handler.waitForAsync()

      expect(inspector.getScript('5')).toBeUndefined()
    })
  })

  describe('findScripts', () => {
    function captureScriptHandler(): { trigger: (params: any) => void; waitForAsync: () => Promise<void> } {
      let scriptCb: Function = () => {}
      let pendingPromise: Promise<void> = Promise.resolve()

      client.on.mockImplementation((method: string, cb: Function) => {
        if (method === 'Debugger.scriptParsed') {
          scriptCb = cb
          pendingPromise = Promise.resolve()
        }
        return vi.fn()
      })

      return {
        trigger: (params: any) => {
          const result = scriptCb(params)
          if (result instanceof Promise) pendingPromise = result
        },
        waitForAsync: async () => {
          await pendingPromise
          await new Promise((r) => setTimeout(r, 5))
        },
      }
    }

    it('matches by pattern', async () => {
      client.send.mockResolvedValue({ scriptSource: '' })
      const handler = captureScriptHandler()
      await inspector.enable()

      handler.trigger({ scriptId: '10', url: 'file:///app/foo.js', startLine: 0, startColumn: 0, endLine: 1, endColumn: 0, hash: 'a' })
      handler.trigger({ scriptId: '11', url: 'file:///app/bar.js', startLine: 0, startColumn: 0, endLine: 1, endColumn: 0, hash: 'b' })
      handler.trigger({ scriptId: '12', url: 'file:///app/baz.js', startLine: 0, startColumn: 0, endLine: 1, endColumn: 0, hash: 'c' })

      await handler.waitForAsync()

      const results = inspector.findScripts('ba')
      expect(results).toHaveLength(2)
      expect(results.map((s) => s.scriptId).sort()).toEqual(['11', '12'])
    })

    it('supports wildcard glob patterns', async () => {
      client.send.mockResolvedValue({ scriptSource: '' })
      const handler = captureScriptHandler()
      await inspector.enable()

      handler.trigger({ scriptId: '20', url: 'file:///app/utils/helper.js', startLine: 0, startColumn: 0, endLine: 1, endColumn: 0, hash: 'd' })

      await handler.waitForAsync()

      const results = inspector.findScripts('*helper*')
      expect(results).toHaveLength(1)
    })
  })

  describe('dispose', () => {
    it('cleans up subscriptions and cache', async () => {
      const unsub = vi.fn()
      client.on.mockReturnValue(unsub)
      await inspector.enable()
      inspector.dispose()
      expect(unsub).toHaveBeenCalledTimes(1)
      expect(inspector.getAllScripts()).toHaveLength(0)
    })
  })
})
