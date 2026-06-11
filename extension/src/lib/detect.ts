/**
 * Pure garment-image detection logic — no DOM/chrome dependencies so it can
 * be unit-tested. The content script wires these to the live page.
 */

/** Largest candidate from a srcset string (w descriptors, then x density). */
export function pickFromSrcset(srcset: string): string | null {
  const entries = srcset
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

  let bestUrl: string | null = null
  let bestScore = -1
  for (const entry of entries) {
    const [url, descriptor] = entry.split(/\s+/)
    if (!url) continue
    let score = 0
    if (descriptor?.endsWith('w')) score = parseFloat(descriptor)
    else if (descriptor?.endsWith('x')) score = parseFloat(descriptor) * 1000
    if (score > bestScore) {
      bestScore = score
      bestUrl = url
    }
  }
  return bestUrl
}

export function resolveImgSource(img: {
  srcset?: string
  currentSrc?: string
  src?: string
}): string | null {
  if (img.srcset) {
    const fromSet = pickFromSrcset(img.srcset)
    if (fromSet) return fromSet
  }
  return img.currentSrc || img.src || null
}

/** Unwrap the first url(...) of a CSS background-image value. */
export function extractBgImageUrl(cssValue: string): string | null {
  const match = cssValue.match(/url\(\s*(['"]?)(.*?)\1\s*\)/)
  return match?.[2] || null
}

export type ImageMetrics = {
  width: number
  height: number
  top: number
  left: number
  viewportW: number
  viewportH: number
}

/**
 * Auto-detect scoring: visible on-screen area, with hard floors that exclude
 * thumbnails (<200px either side) and banner strips (aspect beyond 3:1).
 */
export function scoreImage(m: ImageMetrics): number {
  if (m.width < 200 || m.height < 200) return 0
  const aspect = m.width / m.height
  if (aspect > 3 || aspect < 1 / 3) return 0

  const visW = Math.max(0, Math.min(m.left + m.width, m.viewportW) - Math.max(m.left, 0))
  const visH = Math.max(0, Math.min(m.top + m.height, m.viewportH) - Math.max(m.top, 0))
  return visW * visH
}

type JsonLdNode = Record<string, unknown>

function imageFromNode(node: JsonLdNode): string | null {
  const types = Array.isArray(node['@type']) ? node['@type'] : [node['@type']]
  if (!types.includes('Product')) return null

  const image = node.image
  const first = Array.isArray(image) ? image[0] : image
  if (typeof first === 'string') return first
  if (first && typeof first === 'object' && typeof (first as JsonLdNode).url === 'string') {
    return (first as JsonLdNode).url as string
  }
  return null
}

/** Product.image from a JSON-LD script body (handles @graph and arrays). */
export function parseJsonLdProductImage(jsonText: string): string | null {
  let doc: unknown
  try {
    doc = JSON.parse(jsonText)
  } catch {
    return null
  }
  const nodes: JsonLdNode[] = []
  const root = doc as JsonLdNode
  if (Array.isArray(doc)) nodes.push(...(doc as JsonLdNode[]))
  else if (root && typeof root === 'object') {
    nodes.push(root)
    if (Array.isArray(root['@graph'])) nodes.push(...(root['@graph'] as JsonLdNode[]))
  }
  for (const node of nodes) {
    if (!node || typeof node !== 'object') continue
    const image = imageFromNode(node)
    if (image) return image
  }
  return null
}
