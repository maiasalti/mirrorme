/** Acquire garment image bytes locally (no backend in this edition). */

import { normalizeImage } from './image'

const MAX_BYTES = 15 * 1024 * 1024
// MIME types that are definitely not images; anything ambiguous (empty,
// octet-stream — common on misconfigured CDNs) is allowed through and
// validated by decoding in normalizeImage.
const KNOWN_NON_IMAGE = /^(text\/|application\/(json|xml|xhtml|javascript|pdf)|video\/|audio\/)/

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
  const match = url.match(/^data:(image\/[a-z0-9+.-]+)(?:;[^;,]*)*;base64,([A-Za-z0-9+/=]+)$/i)
  if (!match) throw new Error('That image could not be read — try clicking a different one.')
  if (match[2].length * 0.75 > MAX_BYTES) throw new Error('That image is too large (15MB max).')
  return { mimeType: match[1].toLowerCase(), data: match[2] }
}

/**
 * data: URLs parse directly; http(s) URLs are fetched (host permission).
 * Everything is decode-validated and downscaled before going to Gemini.
 */
export async function getGarmentImage(source: string): Promise<ImagePart> {
  let blob: Blob
  if (source.startsWith('data:')) {
    parseDataUrl(source) // shape + size + image/* mime validation
    blob = await (await fetch(source)).blob()
  } else {
    const res = await fetch(source).catch(() => {
      throw new Error('Could not download that image — try selecting it again.')
    })
    if (!res.ok) throw new Error(`Could not download that image (${res.status}).`)
    blob = await res.blob()
    if (blob.size > MAX_BYTES) throw new Error('That image is too large (15MB max).')
    if (KNOWN_NON_IMAGE.test(blob.type.toLowerCase())) {
      throw new Error('That link is not an image — click the product photo itself.')
    }
  }

  const normalized = await normalizeImage(blob).catch(() => {
    throw new Error('That link is not an image — click the product photo itself.')
  })
  return { mimeType: normalized.type || 'image/jpeg', data: await blobToBase64(normalized) }
}
