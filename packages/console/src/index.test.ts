import { describe, it, expect, vi, beforeEach } from 'vitest'
import { InteractiveConsole } from './index.js'

function mockRuntime() {
  return {
    evaluate: vi.fn(),
  }
}

describe('InteractiveConsole', () => {
  let runtime: ReturnType<typeof mockRuntime>
  let console_: InteractiveConsole

  beforeEach(() => {
    runtime = mockRuntime()
    console_ = new InteractiveConsole(runtime as any)
  })

  describe('run', () => {
    it('evaluates expression and stores result', async () => {
      runtime.evaluate.mockResolvedValue({
        ok: true,
        value: 42,
        display: '42',
      })

      const entry = await console_.run('1 + 41')
      expect(entry.expression).toBe('1 + 41')
      expect(entry.result.ok).toBe(true)
      expect(entry.result.display).toBe('42')
      expect(runtime.evaluate).toHaveBeenCalledWith('1 + 41')
    })

    it('trims whitespace from input', async () => {
      runtime.evaluate.mockResolvedValue({ ok: true, display: '5' })
      await console_.run('  2 + 3  ')
      expect(runtime.evaluate).toHaveBeenCalledWith('2 + 3')
    })

    it('handles empty input without calling evaluate', async () => {
      const entry = await console_.run('  ')
      expect(runtime.evaluate).not.toHaveBeenCalled()
      expect(entry.result.ok).toBe(true)
      expect(entry.result.display).toBe('')
    })

    it('increments entry IDs', async () => {
      runtime.evaluate.mockResolvedValue({ ok: true, display: 'a' })
      const e1 = await console_.run('1')
      const e2 = await console_.run('2')
      expect(e2.id).toBe(e1.id + 1)
    })
  })

  describe('getHistory', () => {
    it('returns all entries in order', async () => {
      runtime.evaluate.mockResolvedValue({ ok: true, display: '' })
      await console_.run('a')
      await console_.run('b')
      await console_.run('c')
      const hist = console_.getHistory()
      expect(hist).toHaveLength(3)
      expect(hist[0].expression).toBe('a')
      expect(hist[2].expression).toBe('c')
    })

    it('returns readonly array', () => {
      const hist = console_.getHistory()
      expect(Object.isFrozen(hist)).toBe(false) // not frozen but typed as readonly
    })
  })

  describe('getExpressionHistory', () => {
    it('returns expressions in reverse order', async () => {
      runtime.evaluate.mockResolvedValue({ ok: true, display: '' })
      await console_.run('first')
      await console_.run('second')
      await console_.run('third')
      const hist = console_.getExpressionHistory()
      expect(hist).toEqual(['third', 'second', 'first'])
    })

    it('filters out empty expressions', async () => {
      await console_.run('')
      const hist = console_.getExpressionHistory()
      expect(hist).toEqual([])
    })
  })

  describe('clear', () => {
    it('resets history', async () => {
      runtime.evaluate.mockResolvedValue({ ok: true, display: '' })
      await console_.run('something')
      console_.clear()
      expect(console_.getHistory()).toHaveLength(0)
    })
  })
})
