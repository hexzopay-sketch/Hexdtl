import { describe, it, expect } from 'vitest'
import { beautify, quickFormat, isMinified } from './beautify.js'

describe('beautify', () => {
  it('formats minified code with semicolons', () => {
    const minified = 'const x=1;const y=2;const z=x+y;console.log(z);'
    const result = beautify(minified)
    expect(result).toContain('const x = 1;')
    expect(result).toContain('const y = 2;')
    expect(result).toContain('console.log(z);')
  })

  it('handles function declarations', () => {
    const minified = 'function add(a,b){return a+b;}'
    const result = beautify(minified)
    expect(result).toContain('function add')
    expect(result).toContain('return a + b;')
  })

  it('handles arrow functions', () => {
    const minified = 'const fn=(x)=>{return x*2;}'
    const result = beautify(minified)
    expect(result).toContain('=>')
    expect(result).toContain('return x * 2;')
  })

  it('handles string literals', () => {
    const code = 'const msg="hello world";console.log(msg);'
    const result = beautify(code)
    expect(result).toContain('"hello world"')
  })

  it('handles template literals', () => {
    const code = 'const x=`hello ${name}`;'
    const result = beautify(code)
    expect(result).toContain('`hello ${name}`')
  })

  it('preserves comments', () => {
    const code = '// comment\nconst x=1;'
    const result = beautify(code)
    expect(result).toContain('// comment')
  })

  it('decodes hex escapes when deobfuscateStrings is true', () => {
    const code = 'const x="\\x48\\x65\\x6c\\x6c\\x6f";'
    const result = beautify(code, { deobfuscateStrings: true })
    expect(result).toContain('Hello')
  })

  it('decodes unicode escapes', () => {
    const code = 'const x="\\u0048\\u0069";'
    const result = beautify(code, { deobfuscateStrings: true })
    expect(result).toContain('Hi')
  })

  it('handles empty input', () => {
    const result = beautify('')
    expect(result.trim()).toBe('')
  })

  it('handles multi-line code', () => {
    const code = 'if (true) {\n  console.log("yes");\n}'
    const result = beautify(code)
    expect(result).toContain('if (true)')
    expect(result).toContain('console.log("yes")')
  })
})

describe('quickFormat', () => {
  it('adds spaces after semicolons', () => {
    expect(quickFormat('a;b;c')).toBe('a; b; c\n')
  })

  it('adds spaces around braces', () => {
    expect(quickFormat('{foo}')).toBe('{ foo }\n')
  })

  it('normalizes line endings', () => {
    expect(quickFormat('a\r\nb')).toBe('a\nb\n')
  })

  it('handles empty input', () => {
    expect(quickFormat('')).toBe('\n')
  })

  it('adds space after commas', () => {
    expect(quickFormat('a,b,c')).toBe('a, b, c\n')
  })
})

describe('isMinified', () => {
  it('detects minified code', () => {
    expect(isMinified('const x=1;const y=2;const z=x+y;console.log(z);return{x,y,z}')).toBe(true)
  })

  it('detects non-minified code', () => {
    expect(isMinified('const x = 1;\nconst y = 2;\n')).toBe(false)
  })

  it('detects single long line as minified', () => {
    const longLine = 'x'.repeat(300)
    expect(isMinified(longLine)).toBe(true)
  })

  it('detects short non-minified code', () => {
    expect(isMinified('const x = 1;')).toBe(false)
  })
})
