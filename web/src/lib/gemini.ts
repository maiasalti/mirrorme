import { GoogleGenAI } from '@google/genai'

// "Nano banana" — Gemini 2.5 Flash Image, GA model id (~$0.04/image).
const MODEL = 'gemini-2.5-flash-image'

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

export class GeminiError extends Error {}

/**
 * One generation per call — no retries, no speculative requests (cost
 * control). Throws GeminiError when the model returns no image.
 */
export async function generateTryOn(opts: {
  base: { data: string; mimeType: string }
  garment: { data: string; mimeType: string }
  chained: boolean
}): Promise<{ data: Buffer; mimeType: string }> {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! })

  const response = await ai.models.generateContent({
    model: MODEL,
    contents: [
      { text: tryOnPrompt(opts.chained) },
      { inlineData: { mimeType: opts.base.mimeType, data: opts.base.data } },
      { inlineData: { mimeType: opts.garment.mimeType, data: opts.garment.data } },
    ],
  })

  const part = response.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data)
  if (!part?.inlineData?.data) {
    const text = response.text?.slice(0, 200)
    throw new GeminiError(text ? `Model returned no image: ${text}` : 'Model returned no image')
  }
  return {
    data: Buffer.from(part.inlineData.data, 'base64'),
    mimeType: part.inlineData.mimeType ?? 'image/png',
  }
}
