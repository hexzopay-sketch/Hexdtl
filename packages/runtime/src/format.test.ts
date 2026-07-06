import { describe, it, expect } from 'vitest'
import { formatRemoteObject, formatCallFrame } from './format.js'

describe('formatRemoteObject', () => {
  it('formats undefined', () => {
    expect(formatRemoteObject(undefined)).toBe('undefined')
  })

  it('formats null object', () => {
    expect(formatRemoteObject({ type: 'object', subtype: 'null', value: null })).toBe('null')
  })

  it('formats strings', () => {
    expect(formatRemoteObject({ type: 'string', value: 'hello world' })).toBe('hello world')
  })

  it('formats numbers', () => {
    expect(formatRemoteObject({ type: 'number', value: 42 })).toBe('42')
  })

  it('formats booleans', () => {
    expect(formatRemoteObject({ type: 'boolean', value: true })).toBe('true')
  })

  it('formats bigint', () => {
    expect(formatRemoteObject({ type: 'bigint', description: '9007199254740991n' })).toBe('9007199254740991n')
  })

  it('formats arrays', () => {
    expect(formatRemoteObject({
      type: 'object',
      subtype: 'array',
      description: 'Array(3)',
    })).toBe('Array(3)')
  })

  it('formats generic objects', () => {
    expect(formatRemoteObject({
      type: 'object',
      description: '{key: "value"}',
      className: 'Object',
    })).toBe('{key: "value"}')
  })

  it('formats functions', () => {
    expect(formatRemoteObject({
      type: 'function',
      description: 'function foo() { ... }',
    })).toBe('function foo() { ... }')
  })

  it('falls back for unknown types', () => {
    expect(formatRemoteObject({ type: 'symbol', description: 'Symbol(foo)' })).toBe('Symbol(foo)')
  })

  it('handles empty string values', () => {
    expect(formatRemoteObject({ type: 'string', value: '' })).toBe('')
  })
})

describe('formatCallFrame', () => {
  it('converts CDP 0-indexed to 1-indexed', () => {
    const result = formatCallFrame({
      functionName: 'foo',
      url: 'file:///app/index.js',
      lineNumber: 4,
      columnNumber: 12,
    })
    expect(result).toEqual({
      file: '/app/index.js',
      line: 5,
      column: 13,
      functionName: 'foo',
    })
  })

  it('strips file:// prefix from urls', () => {
    const result = formatCallFrame({
      functionName: 'bar',
      url: 'file:///C:/project/app.js',
      lineNumber: 0,
      columnNumber: 0,
    })
    expect(result.file).toBe('/C:/project/app.js')
  })

  it('handles missing url', () => {
    const result = formatCallFrame({
      functionName: 'baz',
      url: '',
      lineNumber: 2,
      columnNumber: 5,
    })
    expect(result.file).toBe('<anonymous>')
  })

  it('handles missing function name', () => {
    const result = formatCallFrame({
      functionName: '',
      url: 'file:///app.js',
      lineNumber: 1,
      columnNumber: 1,
    })
    expect(result.functionName).toBe('<anonymous>')
  })
})
