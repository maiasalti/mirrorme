import type { ImagePart } from './garment'

// "Nano banana" — Gemini 2.5 Flash Image (~$0.04/image, billed to the user's
// own key). Called directly from the extension via REST; no SDK, no server.
const MODEL = 'gemini-2.5-flash-image'
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`

const BASE_RULES =
  "Keep the person's face, hair, skin tone, body shape, pose, and the background exactly as they are in the first image. " +
  "Preserve the garment's exact color, pattern, texture, logos, and details from the second image. " +
  "Fit the garment naturally and realistically to the person's body and pose, with correct draping, lighting, and shadows. " +
  'Output a photorealistic image.'

export function tryOnPrompt(chained: boolean): string {
  return chained
    ? 'The first image shows a person already wearing one or more clothing items from previous try-ons. ' +
      'ADD the clothing item from the second image to their outfit, layering it naturally over or with what they are wearing. ' +
      'Keep every previously applied garment visible and unchanged unless the new garment necessarily covers it. ' +
      BASE_RULES
    : 'Take the person in the first image and the clothing item in the second image. ' +
      'Generate an image of the same person wearing that clothing item. ' +
      BASE_RULES
}

type RestPart = {
  text?: string
  inlineData?: { mimeType?: string; data?: string }
  inline_data?: { mime_type?: string; data?: string }
}

/** Find the generated image in a REST response (camelCase or snake_case). */
export function extractImage(parts: RestPart[] | undefined): { data: string; mimeType: string } | null {
  for (const part of parts ?? []) {
    const inline = part.inlineData ?? part.inline_data
    const data = inline?.data
    if (data) {
      return {
        data,
        mimeType: (part.inlineData?.mimeType ?? part.inline_data?.mime_type) || 'image/png',
      }
    }
  }
  return null
}

function base64ToBlob(base64: string, mimeType: string): Blob {
  const bytes = atob(base64)
  const arr = new Uint8Array(bytes.length)
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i)
  return new Blob([arr], { type: mimeType })
}

export async function generateTryOn(opts: {
  apiKey: string
  base: ImagePart
  garment: ImagePart
  chained: boolean
}): Promise<Blob> {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': opts.apiKey },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { text: tryOnPrompt(opts.chained) },
            { inlineData: { mimeType: opts.base.mimeType, data: opts.base.data } },
            { inlineData: { mimeType: opts.garment.mimeType, data: opts.garment.data } },
          ],
        },
      ],
    }),
  })

  if (!res.ok) {
    const body = await res.json().catch(() => null)
    const apiMessage: string | undefined = body?.error?.message
    const reasons: string[] = (body?.error?.details ?? [])
      .map((d: { reason?: string }) => d?.reason)
      .filter(Boolean)
    const keyProblem =
      reasons.some((r) => r.startsWith('API_KEY')) || /api key/i.test(apiMessage ?? '')
    if ((res.status === 400 || res.status === 403) && keyProblem) {
      throw new Error('Your Gemini API key was rejected — check it in MirrorMe settings.')
    }
    if (res.status === 403) {
      throw new Error(
        'Your Gemini key is not authorized for this API (revoked, restricted, or the ' +
          'Generative Language API is disabled) — make a fresh key at aistudio.google.com.'
      )
    }
    if (res.status === 429) {
      throw new Error('Gemini rate/quota limit hit — wait a moment, or check billing on your key.')
    }
    if (res.status === 500 || res.status === 503) {
      throw new Error('Gemini is overloaded right now — try again in a minute.')
    }
    throw new Error(apiMessage ?? `Generation failed (${res.status}).`)
  }

  const body = await res.json()
  const candidate = body?.candidates?.[0]
  const image = extractImage(candidate?.content?.parts)
  if (!image) {
    const reason: string | undefined =
      body?.promptFeedback?.blockReason ?? candidate?.finishReason
    if (reason && reason !== 'STOP') {
      throw new Error(
        `Gemini declined this one (${reason}). Swimwear and skin-heavy photos ` +
          'often trip its safety filter — a flat product shot of just the ' +
          'garment usually works better.'
      )
    }
    const text: string | undefined = candidate?.content?.parts?.find(
      (p: RestPart) => p.text
    )?.text
    throw new Error(
      text ? `No image returned: ${text.slice(0, 160)}` : 'No image returned — try again.'
    )
  }
  return base64ToBlob(image.data, image.mimeType)
}
