import { describe, expect, it } from 'vitest'
import { isPrivateAddress, parseDataUrl, validateGarmentUrl } from './garment'

describe('isPrivateAddress', () => {
  const privates = [
    '10.0.0.1',
    '10.255.255.255',
    '172.16.0.1',
    '172.31.99.4',
    '192.168.1.1',
    '127.0.0.1',
    '127.8.8.8',
    '169.254.169.254', // cloud metadata
    '0.0.0.0',
    '::1',
    'fc00::1',
    'fd12:3456::1',
    'fe80::1',
    '::ffff:10.0.0.1', // v4-mapped v6
    '::ffff:192.168.0.5',
  ]
  const publics = ['142.250.4.100', '8.8.8.8', '172.32.0.1', '11.0.0.1', '2607:f8b0::1']

  it.each(privates)('blocks %s', (ip) => expect(isPrivateAddress(ip)).toBe(true))
  it.each(publics)('allows %s', (ip) => expect(isPrivateAddress(ip)).toBe(false))
})

describe('parseDataUrl', () => {
  // 1x1 transparent png
  const png =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

  it('parses a valid image data URL', () => {
    const out = parseDataUrl(`data:image/png;base64,${png}`)
    expect(out.mimeType).toBe('image/png')
    expect(out.data).toBe(png)
  })

  it('rejects non-image mime types', () => {
    expect(() => parseDataUrl('data:text/html;base64,PGI+aGk8L2I+')).toThrow()
  })

  it('rejects non-base64 data URLs', () => {
    expect(() => parseDataUrl('data:image/png,rawbytes')).toThrow()
  })

  it('rejects malformed input', () => {
    expect(() => parseDataUrl('data:image/png;base64')).toThrow()
    expect(() => parseDataUrl('nonsense')).toThrow()
  })

  it('rejects oversized payloads', () => {
    const big = 'A'.repeat(21 * 1024 * 1024)
    expect(() => parseDataUrl(`data:image/png;base64,${big}`)).toThrow(/large/i)
  })
})

describe('validateGarmentUrl', () => {
  it('accepts http and https', () => {
    expect(validateGarmentUrl('https://store.com/a.jpg').hostname).toBe('store.com')
    expect(validateGarmentUrl('http://store.com/a.jpg').hostname).toBe('store.com')
  })

  it('rejects other protocols', () => {
    for (const bad of [
      'ftp://store.com/a.jpg',
      'file:///etc/passwd',
      'chrome-extension://abc/x.png',
      'javascript:alert(1)',
    ]) {
      expect(() => validateGarmentUrl(bad)).toThrow()
    }
  })

  it('rejects URLs with embedded credentials', () => {
    expect(() => validateGarmentUrl('https://user:pass@store.com/a.jpg')).toThrow()
  })

  it('rejects raw private-IP hosts', () => {
    expect(() => validateGarmentUrl('http://127.0.0.1/x.png')).toThrow()
    expect(() => validateGarmentUrl('http://[::1]/x.png')).toThrow()
    expect(() => validateGarmentUrl('http://169.254.169.254/latest/meta-data')).toThrow()
  })
})
