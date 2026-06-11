/** Acquire garment image bytes locally (no backend in this edition). */

const MAX_BYTES = 15 * 1024 * 1024

export type ImagePart = { data: string; mimeType: string } // base64 (no prefix)

// No FileReader here: this must also run in the MV3 service worker.
export async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let binary = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}

export function parseDataUrl(url: string): ImagePart {
  const match = url.match(/^data:(image\/[a-z0-9+.-]+);base64,([A-Za-z0-9+/=]+)$/i)
  if (!match) throw new Error('That image could not be read — try clicking a different one.')
  if (match[2].length * 0.75 > MAX_BYTES) throw new Error('That image is too large (15MB max).')
  return { mimeType: match[1].toLowerCase(), data: match[2] }
}

/** data: URLs parse directly; http(s) URLs are fetched (host permission). */
export async function getGarmentImage(source: string): Promise<ImagePart> {
  if (source.startsWith('data:')) return parseDataUrl(source)

  const res = await fetch(source).catch(() => {
    throw new Error('Could not download that image — try selecting it again.')
  })
  if (!res.ok) throw new Error(`Could not download that image (${res.status}).`)
  const blob = await res.blob()
  if (!blob.type.startsWith('image/')) {
    throw new Error('That link is not an image — click the product photo itself.')
  }
  if (blob.size > MAX_BYTES) throw new Error('That image is too large (15MB max).')
  return { mimeType: blob.type, data: await blobToBase64(blob) }
}
