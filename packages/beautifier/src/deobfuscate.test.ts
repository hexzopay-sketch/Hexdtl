import { describe, it, expect } from 'vitest'
import { deobfuscate } from './deobfuscate.js'

describe('deobfuscate', () => {
  it('decodes hex escapes', () => {
    const result = deobfuscate('"\\x48\\x65\\x6c\\x6c\\x6f"')
    expect(result.source).toContain('Hello')
    expect(result.transforms).toContain('hex escapes')
  })

  it('decodes unicode escapes', () => {
    const result = deobfuscate('"\\u0048\\u0069"')
    expect(result.source).toContain('Hi')
  })

  it('converts hex literals to decimal', () => {
    const result = deobfuscate('var x = 0xff;')
    expect(result.source).toContain('255')
    expect(result.transforms).toContain('hex literals')
  })

  it('simplifies boolean expressions', () => {
    const result = deobfuscate('var a = !0; var b = !1;')
    expect(result.source).toContain('true')
    expect(result.source).toContain('false')
    expect(result.transforms).toContain('boolean simplification')
  })

  it('replaces void 0 with undefined', () => {
    const result = deobfuscate('var x = void 0;')
    expect(result.source).toContain('undefined')
    expect(result.transforms).toContain('void 0 -> undefined')
  })

  it('removes empty statements', () => {
    const result = deobfuscate(';;; var x = 1;')
    expect(result.source).not.toContain(';;;')
    expect(result.transforms).toContain('empty statements')
  })

  it('returns empty transforms for clean code', () => {
    const result = deobfuscate('var x = 1;')
    expect(result.transforms).toHaveLength(0)
  })
})
