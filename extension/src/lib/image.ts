/**
 * Decode + downscale images before they're stored or sent to Gemini.
 * Gemini normalizes inputs to ≤~1536px tiles, so larger pixels buy nothing —
 * they only burn the 20MB total-request budget (base64 inflates by 4/3) and
 * upload time. Works in pages AND the MV3 service worker
 * (createImageBitmap + OffscreenCanvas; no <canvas>, no FileReader).
 */

const MAX_DIM = 1536
const PASSTHROUGH_BYTES = 2_000_000 // small enough already — keep original

export async function normalizeImage(blob: Blob, maxDim = MAX_DIM): Promise<Blob> {
  let bmp: ImageBitmap
  try {
    bmp = await createImageBitmap(blob)
  } catch {
    // Doubles as content validation: bytes that don't decode aren't an image,
    // whatever the server's Content-Type claimed.
    throw new Error('That file could not be read as an image.')
  }

  const scale = Math.min(1, maxDim / Math.max(bmp.width, bmp.height))
  if (scale === 1 && blob.size <= PASSTHROUGH_BYTES && blob.type.startsWith('image/')) {
    bmp.close()
    return blob
  }

  const width = Math.max(1, Math.round(bmp.width * scale))
  const height = Math.max(1, Math.round(bmp.height * scale))
  const canvas = new OffscreenCanvas(width, height)
  const ctx = canvas.getContext('2d')!
  // Flatten transparency onto white — JPEG has no alpha and a black backdrop
  // would distort transparent product PNGs.
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)
  ctx.drawImage(bmp, 0, 0, width, height)
  bmp.close()
  return canvas.convertToBlob({ type: 'image/jpeg', quality: 0.85 })
}
