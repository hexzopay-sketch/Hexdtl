import { describe, it, expect } from 'vitest'
import { deobfuscate } from './deobfuscate.js'

describe('deobfuscate', () => {
  it('decodes hex escapes', () => {
    const result = deobfuscate('"\\x48\\x65\\x6c\\x6c\\x6f"')
    expect(result.source).toContain('Hello')
    expect(result.transforms).toContain('decoded hex escapes')
  })

  it('decodes unicode escapes', () => {
    const result = deobfuscate('"\\u0048\\u0069"')
    expect(result.source).toContain('Hi')
  })

  it('converts hex literals to decimal', () => {
    const result = deobfuscate('var x = 0xff;')
    expect(result.source).toContain('255')
    expect(result.transforms).toContain('converted hex literals')
  })

  it('simplifies boolean expressions', () => {
    const result = deobfuscate('var a = !0; var b = !1;')
    expect(result.source).toContain('true')
    expect(result.source).toContain('false')
    expect(result.transforms).toContain('simplified booleans')
  })

  it('replaces void 0 with undefined', () => {
    const result = deobfuscate('var x = void 0;')
    expect(result.source).toContain('undefined')
    expect(result.transforms).toContain('replaced void 0')
  })

  it('removes empty statements', () => {
    const result = deobfuscate(';;;\nvar x = 1;')
    expect(result.source).not.toContain(';;;')
    expect(result.transforms).toContain('removed empty statements')
  })

  it('returns empty transforms for clean code', () => {
    const result = deobfuscate('var x = 1;')
    expect(result.transforms).toHaveLength(0)
  })

  it('deobfuscates production-grade obfuscated script exercising all transforms', () => {
    const obfuscated = String.raw`var _0xabc=['\u0070\x72\x6f\x64\x75\x63\x74\x69\x6f\x6e'];(function(_0x1a,_0x2b){while(!0!==!1){try{if(parseInt(_0x2b)===0x1)break;else _0x1a['push'](_0x1a['shift']())}catch(_0x3c){_0x1a['push'](_0x1a['shift']())}}})(_0xabc,0x1);void 0;var _0x1a=function(_0x2b,_0x3c){_0x2b=_0x2b-0x0;return _0xabc[_0x2b];};!0;function getConfig(_0x4d){var _0x5e=_0x4d===_0x1a('\x30\x78\x30')?'\x68\x74\x74\x70\x73\x3a\x2f\x2f\x61\x70\x69\x2e\x65\x78\x61\x6d\x70\x6c\x65\x2e\x63\x6f\x6d':'\x68\x74\x74\x70\x73\x3a\x2f\x2f\x73\x74\x61\x67\x69\x6e\x67\x2e\x61\x70\x69\x2e\x65\x78\x61\x6d\x70\x6c\x65\x2e\x63\x6f\x6d';return{'baseUrl':_0x5e,'timeout':0x7530,'retries':!0?!1:0x3,'headers':{'\x58\x2d\x41\x50\x49\x2d\x4b\x65\x79':'\x73\x6b\x2d\x61\x62\x63\x31\x32\x33','Content-Type':'\x61\x70\x70\x6c\x69\x63\x61\x74\x69\x6f\x6e\x2f\x6a\x73\x6f\x6e'}};}`

    const result = deobfuscate(obfuscated)

    // All hex escapes decoded
    expect(result.source).toContain('https://api.example.com')
    expect(result.source).toContain('https://staging.api.example.com')
    expect(result.source).toContain('X-API-Key')
    expect(result.source).toContain('sk-abc123')
    expect(result.source).toContain('application/json')

    // Unicode escape decoded
    expect(result.source).toContain('production')

    // Hex literals converted
    expect(result.source).toContain('30000')
    expect(result.source).toContain('retries')

    // Boolean simplification
    expect(result.source).toContain('true')
    expect(result.source).toContain('false')

    // void 0 replaced
    expect(result.source).toContain('undefined')

    // At least 5 of 7 transforms fired
    expect(result.transforms.length).toBeGreaterThanOrEqual(5)
    expect(result.transforms).toContain('decoded hex escapes')
    expect(result.transforms).toContain('decoded unicode escapes')
    expect(result.transforms).toContain('converted hex literals')
    expect(result.transforms).toContain('simplified booleans')
    expect(result.transforms).toContain('replaced void 0')
  })
})
