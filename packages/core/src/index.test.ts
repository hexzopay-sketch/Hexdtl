import { describe, it, expect, vi } from 'vitest'
import { EventBus, createSession } from './index.js'
import type { InspectorEventMap } from './types.js'

describe('EventBus', () => {
  it('emits and receives typed events', () => {
    const bus = new EventBus()
    const listener = vi.fn()

    bus.on('runtime:console', listener)
    bus.emit('runtime:console', {
      level: 'log',
      args: ['hello'],
      text: 'hello',
      timestampMs: 1000,
    })

    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({ level: 'log', text: 'hello' })
    )
  })

  it('emit throws type error for unknown event', () => {
    const bus = new EventBus()
    expect(() =>
      (bus as any).emit('nonexistent:event', {})
    ).not.toThrow()
  })

  it('unsubscribes via returned function', () => {
    const bus = new EventBus()
    const listener = vi.fn()

    const unsub = bus.on('runtime:console', listener)
    unsub()
    bus.emit('runtime:console', {
      level: 'log',
      args: [],
      text: 'gone',
      timestampMs: 0,
    })

    expect(listener).not.toHaveBeenCalled()
  })

  it('once fires only once', () => {
    const bus = new EventBus()
    const listener = vi.fn()

    bus.once('connection:open', listener)
    bus.emit('connection:open', { targetUrl: 'ws://localhost:9229' })
    bus.emit('connection:open', { targetUrl: 'ws://localhost:9230' })

    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('off removes a listener', () => {
    const bus = new EventBus()
    const listener = vi.fn()

    bus.on('runtime:exception', listener)
    bus.off('runtime:exception', listener)
    bus.emit('runtime:exception', {
      message: 'test error',
      stackTrace: [],
      timestampMs: 0,
    })

    expect(listener).not.toHaveBeenCalled()
  })

  it('supports multiple listeners on same event', () => {
    const bus = new EventBus()
    const a = vi.fn()
    const b = vi.fn()

    bus.on('connection:close', a)
    bus.on('connection:close', b)
    bus.emit('connection:close', { reason: 'bye' })

    expect(a).toHaveBeenCalledTimes(1)
    expect(b).toHaveBeenCalledTimes(1)
  })

  it('sets max listeners to 100', () => {
    const bus = new EventBus()
    const listeners = Array.from({ length: 50 }, () => vi.fn())
    listeners.forEach((l) => bus.on('runtime:console', l))
    expect(() => {
      bus.emit('runtime:console', { level: 'log', args: [], text: '', timestampMs: 0 })
    }).not.toThrow()
  })
})

describe('createSession', () => {
  it('creates a session with an EventBus', () => {
    const session = createSession('ws://localhost:9229')
    expect(session.bus).toBeInstanceOf(EventBus)
    expect(session.targetUrl).toBe('ws://localhost:9229')
    expect(session.pid).toBeUndefined()
    expect(session.startedAt).toBeGreaterThan(0)
  })

  it('accepts an optional pid', () => {
    const session = createSession('ws://localhost:9229', 12345)
    expect(session.pid).toBe(12345)
  })

  it('sessions are independent', () => {
    const a = createSession('ws://a')
    const b = createSession('ws://b')
    expect(a.bus).not.toBe(b.bus)
  })
})
