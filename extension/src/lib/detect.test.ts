import { describe, expect, it } from 'vitest'
import {
  extractBgImageUrl,
  parseJsonLdProductImage,
  pickFromSrcset,
  resolveImgSource,
  scoreImage,
} from './detect'

describe('pickFromSrcset', () => {
  it('picks the largest w descriptor', () => {
    expect(
      pickFromSrcset('a.jpg 400w, b.jpg 1200w, c.jpg 800w')
    ).toBe('b.jpg')
  })

  it('handles x density descriptors', () => {
    expect(pickFromSrcset('a.jpg 1x, b.jpg 2x')).toBe('b.jpg')
  })

  it('handles entries without descriptors', () => {
    expect(pickFromSrcset('a.jpg')).toBe('a.jpg')
  })

  it('returns null for empty input', () => {
    expect(pickFromSrcset('')).toBeNull()
    expect(pickFromSrcset('   ')).toBeNull()
  })

  it('survives commas INSIDE URLs (Cloudinary/imgix transforms)', () => {
    expect(
      pickFromSrcset(
        'https://cdn.com/c_fill,w_600/p.jpg 600w, https://cdn.com/c_fill,w_1200/p.jpg 1200w'
      )
    ).toBe('https://cdn.com/c_fill,w_1200/p.jpg')
    expect(pickFromSrcset('https://x.imgix.net/p.jpg?rect=0,0,800,600&w=900 900w')).toBe(
      'https://x.imgix.net/p.jpg?rect=0,0,800,600&w=900'
    )
  })

  it('handles comma-terminated URLs without descriptors', () => {
    expect(pickFromSrcset('a.jpg, b.jpg 800w')).toBe('b.jpg')
  })
})

describe('resolveImgSource', () => {
  it('prefers the largest srcset entry', () => {
    expect(
      resolveImgSource({ srcset: 'a.jpg 1w, big.jpg 999w', currentSrc: 'cur.jpg', src: 's.jpg' })
    ).toBe('big.jpg')
  })

  it('falls back to currentSrc, then src', () => {
    expect(resolveImgSource({ currentSrc: 'cur.jpg', src: 's.jpg' })).toBe('cur.jpg')
    expect(resolveImgSource({ src: 's.jpg' })).toBe('s.jpg')
  })

  it('returns null when nothing is set', () => {
    expect(resolveImgSource({})).toBeNull()
  })
})

describe('extractBgImageUrl', () => {
  it('unwraps url(...) with and without quotes', () => {
    expect(extractBgImageUrl('url("https://x.com/a.jpg")')).toBe('https://x.com/a.jpg')
    expect(extractBgImageUrl("url('a.jpg')")).toBe('a.jpg')
    expect(extractBgImageUrl('url(a.jpg)')).toBe('a.jpg')
  })

  it('takes the first of multiple backgrounds', () => {
    expect(extractBgImageUrl('url(a.jpg), url(b.jpg)')).toBe('a.jpg')
  })

  it('returns null for none/gradients', () => {
    expect(extractBgImageUrl('none')).toBeNull()
    expect(extractBgImageUrl('linear-gradient(red, blue)')).toBeNull()
  })
})

describe('scoreImage', () => {
  const vp = { viewportW: 1280, viewportH: 800 }

  it('scores by visible area', () => {
    const big = scoreImage({ width: 600, height: 800, top: 0, left: 0, ...vp })
    const small = scoreImage({ width: 300, height: 400, top: 0, left: 0, ...vp })
    expect(big).toBeGreaterThan(small)
  })

  it('rejects images below the 200px threshold', () => {
    expect(scoreImage({ width: 199, height: 600, top: 0, left: 0, ...vp })).toBe(0)
    expect(scoreImage({ width: 600, height: 100, top: 0, left: 0, ...vp })).toBe(0)
  })

  it('rejects extreme aspect ratios (banners)', () => {
    expect(scoreImage({ width: 1280, height: 200, top: 0, left: 0, ...vp })).toBe(0)
  })

  it('rejects fully offscreen images', () => {
    expect(scoreImage({ width: 600, height: 600, top: 2000, left: 0, ...vp })).toBe(0)
  })

  it('counts only the visible part of partially offscreen images', () => {
    const partial = scoreImage({ width: 600, height: 800, top: 400, left: 0, ...vp })
    expect(partial).toBe(600 * 400)
  })
})

describe('parseJsonLdProductImage', () => {
  it('reads image from a simple Product', () => {
    expect(
      parseJsonLdProductImage('{"@type":"Product","image":"https://x.com/p.jpg"}')
    ).toBe('https://x.com/p.jpg')
  })

  it('reads the first image from an array', () => {
    expect(
      parseJsonLdProductImage('{"@type":"Product","image":["a.jpg","b.jpg"]}')
    ).toBe('a.jpg')
  })

  it('reads ImageObject form', () => {
    expect(
      parseJsonLdProductImage('{"@type":"Product","image":{"@type":"ImageObject","url":"i.jpg"}}')
    ).toBe('i.jpg')
  })

  it('finds Product inside @graph', () => {
    const doc = JSON.stringify({
      '@graph': [{ '@type': 'WebSite' }, { '@type': 'Product', image: ['g.jpg'] }],
    })
    expect(parseJsonLdProductImage(doc)).toBe('g.jpg')
  })

  it('finds Product inside @graph wrapped in a root array (Yoast style)', () => {
    const doc = JSON.stringify([
      { '@context': 'https://schema.org', '@graph': [{ '@type': 'Product', image: 'y.jpg' }] },
    ])
    expect(parseJsonLdProductImage(doc)).toBe('y.jpg')
  })

  it('handles @type arrays', () => {
    expect(
      parseJsonLdProductImage('{"@type":["Product","Thing"],"image":"t.jpg"}')
    ).toBe('t.jpg')
  })

  it('returns null for non-product or invalid JSON', () => {
    expect(parseJsonLdProductImage('{"@type":"Article","image":"a.jpg"}')).toBeNull()
    expect(parseJsonLdProductImage('not json')).toBeNull()
  })
})
