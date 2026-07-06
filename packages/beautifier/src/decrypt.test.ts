import { describe, it, expect, afterEach } from 'vitest'
import { decryptScript } from './decrypt.js'
import { readFile, rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { tmpdir } from 'node:os'

describe('decryptScript', () => {
  const outDir = tmpdir()

  afterEach(async () => {
    try { await rm(resolve(outDir, 'test.debugged.js')) } catch {}
  })

  it('writes decrypted source to debugged.js', async () => {
    const result = await decryptScript(
      '/some/path/test.js',
      'console.log("decrypted");',
      outDir,
    )
    expect(result.success).toBe(true)
    expect(result.outputPath).toContain('test.debugged.js')

    const content = await readFile(result.outputPath, 'utf-8')
    expect(content).toBe('console.log("decrypted");')
  })

  it('strips .js extension for output name', async () => {
    const result = await decryptScript(
      '/path/app.bundle.js',
      'var x = 1;',
      outDir,
    )
    expect(result.outputPath).toContain('app.bundle.debugged.js')
  })

  it('returns error for invalid path', async () => {
    const result = await decryptScript(
      '/nonexistent/dir/file.js',
      'code',
      '/no/such/dir',
    )
    expect(result.success).toBe(false)
    expect(result.error).toBeDefined()
  })
})
