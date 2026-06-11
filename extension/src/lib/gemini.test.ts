import { describe, expect, it } from 'vitest'
import { parseDataUrl } from './garment'
import { extractImage, tryOnPrompt } from './gemini'

describe('extractImage', () => {
  it('reads camelCase inlineData', () => {
    expect(
      extractImage([{ text: 'hi' }, { inlineData: { mimeType: 'image/png', data: 'AAAA' } }])
    ).toEqual({ data: 'AAAA', mimeType: 'image/png' })
  })

  it('reads snake_case inline_data', () => {
    expect(
      extractImage([{ inline_data: { mime_type: 'image/jpeg', data: 'BBBB' } }])
    ).toEqual({ data: 'BBBB', mimeType: 'image/jpeg' })
  })

  it('defaults mime to png and skips textless empties', () => {
    expect(extractImage([{ inlineData: { data: 'CC' } }])?.mimeType).toBe('image/png')
    expect(extractImage([{ text: 'no image' }])).toBeNull()
    expect(extractImage(undefined)).toBeNull()
  })
})

describe('parseDataUrl', () => {
  it('parses image data URLs', () => {
    expect(parseDataUrl('data:image/png;base64,QUJD')).toEqual({
      mimeType: 'image/png',
      data: 'QUJD',
    })
  })

  it('rejects non-image and malformed input', () => {
    expect(() => parseDataUrl('data:text/html;base64,QUJD')).toThrow()
    expect(() => parseDataUrl('data:image/png,raw')).toThrow()
    expect(() => parseDataUrl('nonsense')).toThrow()
  })
})

describe('tryOnPrompt', () => {
  it('chained prompt instructs adding while keeping prior garments', () => {
    expect(tryOnPrompt(true)).toMatch(/ADD the clothing item/)
    expect(tryOnPrompt(true)).toMatch(/previously applied garment/)
    expect(tryOnPrompt(false)).toMatch(/wearing that clothing item/)
  })
})
