import { describe, it, expect } from 'vitest'
import { rgbToAnsi256, hexToAnsi256, contrastColor, THEME, TIMING_GRADIENT } from './colors.js'

describe('rgbToAnsi256', () => {
  it('converts black to 16', () => {
    expect(rgbToAnsi256(0, 0, 0)).toBe(16)
  })

  it('converts white to 231', () => {
    expect(rgbToAnsi256(255, 255, 255)).toBe(231)
  })

  it('converts red to 196', () => {
    expect(rgbToAnsi256(255, 0, 0)).toBe(196)
  })

  it('converts green to 46', () => {
    expect(rgbToAnsi256(0, 255, 0)).toBe(46)
  })

  it('converts blue to 21', () => {
    expect(rgbToAnsi256(0, 0, 255)).toBe(21)
  })
})

describe('hexToAnsi256', () => {
  it('converts #ff0000 to red', () => {
    expect(hexToAnsi256('#ff0000')).toBe(196)
  })

  it('converts #00ff00 to green', () => {
    expect(hexToAnsi256('#00ff00')).toBe(46)
  })

  it('handles without hash prefix', () => {
    expect(hexToAnsi256('0000ff')).toBe(21)
  })
})

describe('contrastColor', () => {
  it('returns white for dark backgrounds', () => {
    expect(contrastColor(0)).toBe(7) // WHITE
    expect(contrastColor(1)).toBe(7)
  })

  it('returns black for bright backgrounds', () => {
    expect(contrastColor(8)).toBe(0) // BLACK
    expect(contrastColor(15)).toBe(0)
  })

  it('returns white for negative (default)', () => {
    expect(contrastColor(-1)).toBe(7)
  })
})

describe('THEME', () => {
  it('has all required color keys', () => {
    expect(THEME.headerBg).toBeDefined()
    expect(THEME.headerFg).toBeDefined()
    expect(THEME.feedLog).toBeDefined()
    expect(THEME.feedError).toBeDefined()
    expect(THEME.netMethodGet).toBeDefined()
    expect(THEME.promptFg).toBeDefined()
    expect(THEME.srcFile).toBeDefined()
  })
})

describe('TIMING_GRADIENT', () => {
  it('has 10 gradient colors', () => {
    expect(TIMING_GRADIENT).toHaveLength(10)
  })

  it('starts with green and ends with red', () => {
    expect(TIMING_GRADIENT[0]).toBe(2) // GREEN
    expect(TIMING_GRADIENT[9]).toBe(9) // BRIGHT_RED
  })
})
