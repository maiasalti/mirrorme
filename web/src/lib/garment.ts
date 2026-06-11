import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'

/**
 * Server-side garment image acquisition. The extension sends either an
 * http(s) URL scraped from the product page or a data: URL (for blob:/canvas
 * sources). We fetch bytes ourselves — raw external URLs are never handed to
 * Gemini — and guard against SSRF: private/loopback/link-local targets are
 * rejected at every redirect hop, payloads are capped, and only image
 * content-types Gemini accepts are allowed.
 */

export const MAX_GARMENT_BYTES = 15 * 1024 * 1024
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])
const MAX_REDIRECTS = 3
const FETCH_TIMEOUT_MS = 15_000

function isPrivateV4(ip: string): boolean {
  const [a, b] = ip.split('.').map(Number)
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || // CGNAT
    (a === 169 && b === 254) || // link-local / cloud metadata
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224 // multicast + reserved
  )
}

export function isPrivateAddress(ip: string): boolean {
  const version = isIP(ip)
  if (version === 4) return isPrivateV4(ip)
  if (version === 6) {
    const v6 = ip.toLowerCase()
    if (v6 === '::' || v6 === '::1') return true
    const mapped = v6.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
    if (mapped) return isPrivateV4(mapped[1])
    if (v6.startsWith('fc') || v6.startsWith('fd')) return true // ULA fc00::/7
    if (/^fe[89ab]/.test(v6)) return true // link-local fe80::/10
    return false
  }
  return true // unparseable → treat as unsafe
}

export function parseDataUrl(url: string): { data: string; mimeType: string } {
  const match = url.match(/^data:([a-z0-9/+.-]+);base64,([A-Za-z0-9+/=]+)$/i)
  if (!match) throw new Error('Malformed data URL (must be base64-encoded)')
  const [, mimeType, data] = match
  if (!ALLOWED_MIME.has(mimeType.toLowerCase())) {
    throw new Error(`Unsupported image type: ${mimeType}`)
  }
  if (data.length * 0.75 > MAX_GARMENT_BYTES) {
    throw new Error('Garment image is too large')
  }
  return { data, mimeType: mimeType.toLowerCase() }
}

export function validateGarmentUrl(raw: string): URL {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new Error('Invalid garment URL')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`Unsupported protocol: ${url.protocol}`)
  }
  if (url.username || url.password) {
    throw new Error('URLs with credentials are not allowed')
  }
  const host = url.hostname.replace(/^\[|\]$/g, '') // unwrap v6 brackets
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) {
    throw new Error('Host not allowed')
  }
  if (isIP(host) && isPrivateAddress(host)) {
    throw new Error('Host not allowed')
  }
  return url
}

async function assertPublicHost(url: URL): Promise<void> {
  const host = url.hostname.replace(/^\[|\]$/g, '')
  if (isIP(host)) {
    if (isPrivateAddress(host)) throw new Error('Host not allowed')
    return
  }
  // Note: fetch() re-resolves DNS, so a fast-rebinding host could in theory
  // pass this check; the cap + image-only content-type keeps the blast radius
  // to "fetched an image-shaped response from inside the network".
  const addrs = await lookup(host, { all: true, verbatim: true }).catch(() => {
    throw new Error('Could not resolve garment host')
  })
  for (const { address } of addrs) {
    if (isPrivateAddress(address)) throw new Error('Host not allowed')
  }
}

export async function fetchGarmentImage(
  rawUrl: string
): Promise<{ data: string; mimeType: string }> {
  if (rawUrl.startsWith('data:')) return parseDataUrl(rawUrl)

  let url = validateGarmentUrl(rawUrl)
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertPublicHost(url)
    const res = await fetch(url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        // Some image CDNs refuse requests without a browser-ish UA.
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
        Accept: 'image/*',
      },
    })

    if ([301, 302, 303, 307, 308].includes(res.status)) {
      const location = res.headers.get('location')
      if (!location) throw new Error('Redirect without location')
      url = validateGarmentUrl(new URL(location, url).href)
      continue
    }
    if (!res.ok) throw new Error(`Garment image fetch failed (${res.status})`)

    const contentType = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
    if (!ALLOWED_MIME.has(contentType)) {
      throw new Error(`Garment URL did not return a supported image (got ${contentType || 'unknown'})`)
    }
    const declared = Number(res.headers.get('content-length') ?? 0)
    if (declared > MAX_GARMENT_BYTES) throw new Error('Garment image is too large')

    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.byteLength > MAX_GARMENT_BYTES) throw new Error('Garment image is too large')
    if (buf.byteLength === 0) throw new Error('Garment image is empty')

    return { data: buf.toString('base64'), mimeType: contentType }
  }
  throw new Error('Too many redirects')
}
