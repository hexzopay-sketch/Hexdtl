import { describe, it, expect } from 'vitest'
import { ScreenBuffer, makeCell, cellsEqual, DEFAULT_CELL } from './screen-buffer.js'

describe('ScreenBuffer', () => {
  it('creates a buffer with given dimensions', () => {
    const buf = new ScreenBuffer(80, 24)
    expect(buf.cols).toBe(80)
    expect(buf.rows).toBe(24)
  })

  it('sets and gets cells', () => {
    const buf = new ScreenBuffer(10, 5)
    buf.set(3, 2, 'X', 1, 2, true, false, false, false)
    const cell = buf.getCell(3, 2)
    expect(cell.char).toBe('X')
    expect(cell.fg).toBe(1)
    expect(cell.bg).toBe(2)
    expect(cell.bold).toBe(true)
  })

  it('ignores out-of-bounds writes', () => {
    const buf = new ScreenBuffer(5, 5)
    buf.set(-1, 0, 'X')
    buf.set(0, -1, 'X')
    buf.set(100, 100, 'X')
    expect(buf.getCell(0, 0).char).toBe(' ')
  })

  it('writeString writes a string horizontally', () => {
    const buf = new ScreenBuffer(10, 3)
    buf.writeString(0, 1, 'Hello', 7)
    expect(buf.getCell(0, 1).char).toBe('H')
    expect(buf.getCell(4, 1).char).toBe('o')
  })

  it('fillRect fills a rectangular area', () => {
    const buf = new ScreenBuffer(10, 10)
    buf.fillRect(2, 2, 3, 2, '#', 1, 2)
    expect(buf.getCell(2, 2).char).toBe('#')
    expect(buf.getCell(4, 3).char).toBe('#')
    expect(buf.getCell(5, 2).char).toBe(' ')
  })

  it('drawBox draws box-drawing characters', () => {
    const buf = new ScreenBuffer(10, 5)
    buf.drawBox(0, 0, 10, 5)
    expect(buf.getCell(0, 0).char).toBe('┌')
    expect(buf.getCell(9, 0).char).toBe('┐')
    expect(buf.getCell(0, 4).char).toBe('└')
    expect(buf.getCell(9, 4).char).toBe('┘')
  })

  it('clears the buffer to defaults', () => {
    const buf = new ScreenBuffer(5, 5)
    buf.set(2, 2, 'X', 1)
    buf.clear()
    expect(buf.getCell(2, 2)).toEqual(DEFAULT_CELL)
  })

  it('resize preserves existing content', () => {
    const buf = new ScreenBuffer(5, 5)
    buf.set(2, 2, 'X', 1)
    buf.resize(10, 10)
    expect(buf.getCell(2, 2).char).toBe('X')
  })

  describe('diff-based rendering', () => {
    it('detects changed cells', () => {
      const buf = new ScreenBuffer(3, 1)
      buf.set(0, 0, 'A')
      buf.finalize()
      buf.set(0, 0, 'B')
      const diff = buf.diff()
      expect(diff).toContain('B')
    })

    it('returns minimal output when nothing changed', () => {
      const buf = new ScreenBuffer(3, 1)
      buf.fullRender()
      const diff = buf.diff()
      expect(diff).toBe('\x1b[0m')
    })

    it('fullRender outputs entire buffer', () => {
      const buf = new ScreenBuffer(3, 1)
      buf.set(0, 0, 'X', 1)
      buf.set(1, 0, 'Y', 2)
      buf.set(2, 0, 'Z', 3)
      const output = buf.fullRender()
      expect(output).toContain('X')
      expect(output).toContain('Y')
      expect(output).toContain('Z')
    })

    it('finalize copies current to previous', () => {
      const buf = new ScreenBuffer(3, 1)
      buf.set(0, 0, 'X', 1)
      buf.finalize()
      buf.set(0, 0, 'X', 1)
      const diff = buf.diff()
      expect(diff).toBe('\x1b[0m')
    })
  })
})

describe('makeCell', () => {
  it('creates a cell with attributes', () => {
    const cell = makeCell('A', 1, 2, true, false, false, false)
    expect(cell.char).toBe('A')
    expect(cell.fg).toBe(1)
    expect(cell.bg).toBe(2)
    expect(cell.bold).toBe(true)
  })
})

describe('cellsEqual', () => {
  it('returns true for identical cells', () => {
    const a = makeCell('X', 1, 2, true, false, false, false)
    const b = makeCell('X', 1, 2, true, false, false, false)
    expect(cellsEqual(a, b)).toBe(true)
  })

  it('returns false for different cells', () => {
    const a = makeCell('X', 1, 2, false, false, false, false)
    const b = makeCell('Y', 1, 2, false, false, false, false)
    expect(cellsEqual(a, b)).toBe(false)
  })

  it('detects style differences', () => {
    const a = makeCell('X', 1, 2, false, false, false, false)
    const b = makeCell('X', 1, 2, true, false, false, false)
    expect(cellsEqual(a, b)).toBe(false)
  })
})
