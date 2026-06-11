import { getUserId, unauthorized } from '@/lib/auth'
import { fetchGarmentImage } from '@/lib/garment'
import { GeminiError, generateTryOn } from '@/lib/gemini'
import { assertWithinQuota, recordTryon } from '@/lib/quota'
import { downloadAsBase64, signedUrl, tryonPath } from '@/lib/storage'
import { createAdminClient } from '@/lib/supabase/admin'

export const maxDuration = 120 // generation can take a while

type Body = {
  garmentImageUrl?: string
  basePhotoId?: string
  baseTryonId?: string
}

/**
 * Core try-on endpoint. Body: { garmentImageUrl, basePhotoId | baseTryonId }.
 * Passing baseTryonId chains a new garment on top of a previous result
 * (stored as parent_tryon_id). Returns { tryonId, resultUrl }.
 */
export async function POST(req: Request) {
  const userId = await getUserId(req)
  if (!userId) return unauthorized()

  const body = (await req.json().catch(() => null)) as Body | null
  const { garmentImageUrl, basePhotoId, baseTryonId } = body ?? {}
  if (typeof garmentImageUrl !== 'string' || !garmentImageUrl) {
    return Response.json({ error: 'garmentImageUrl is required' }, { status: 400 })
  }
  if (Boolean(basePhotoId) === Boolean(baseTryonId)) {
    return Response.json(
      { error: 'Provide exactly one of basePhotoId or baseTryonId' },
      { status: 400 }
    )
  }

  await assertWithinQuota(userId)

  const admin = createAdminClient()

  // Resolve the base image (the user's photo, or a previous result for chaining).
  let base: { data: string; mimeType: string }
  try {
    if (basePhotoId) {
      const { data: photo } = await admin
        .from('photos')
        .select('storage_path, user_id')
        .eq('id', basePhotoId)
        .single()
      if (!photo || photo.user_id !== userId) {
        return Response.json({ error: 'Base photo not found' }, { status: 404 })
      }
      base = await downloadAsBase64('photos', photo.storage_path)
    } else {
      const { data: parent } = await admin
        .from('tryons')
        .select('result_storage_path, user_id')
        .eq('id', baseTryonId!)
        .single()
      if (!parent || parent.user_id !== userId) {
        return Response.json({ error: 'Base try-on not found' }, { status: 404 })
      }
      base = await downloadAsBase64('generated', parent.result_storage_path)
    }
  } catch {
    return Response.json({ error: 'Could not load base image' }, { status: 500 })
  }

  let garment: { data: string; mimeType: string }
  try {
    garment = await fetchGarmentImage(garmentImageUrl)
  } catch (e) {
    return Response.json(
      { error: `Could not fetch garment image: ${(e as Error).message}` },
      { status: 400 }
    )
  }

  let result: { data: Buffer; mimeType: string }
  try {
    result = await generateTryOn({ base, garment, chained: Boolean(baseTryonId) })
  } catch (e) {
    const message = e instanceof GeminiError ? e.message : 'Image generation failed'
    console.error('tryon generation failed:', e)
    return Response.json({ error: message }, { status: 502 })
  }

  const tryonId = crypto.randomUUID()
  const path = tryonPath(userId, tryonId)
  const { error: upError } = await admin.storage
    .from('generated')
    .upload(path, result.data, { contentType: result.mimeType })
  if (upError) {
    return Response.json({ error: `Could not store result: ${upError.message}` }, { status: 500 })
  }

  const { error: insError } = await admin.from('tryons').insert({
    id: tryonId,
    user_id: userId,
    base_photo_id: basePhotoId ?? null,
    parent_tryon_id: baseTryonId ?? null,
    // data: URLs can be huge — record a marker instead of megabytes of base64.
    garment_source_url: garmentImageUrl.startsWith('data:')
      ? 'data:(captured image)'
      : garmentImageUrl.slice(0, 2000),
    result_storage_path: path,
  })
  if (insError) {
    return Response.json({ error: insError.message }, { status: 500 })
  }

  await recordTryon(userId)

  return Response.json({ tryonId, resultUrl: await signedUrl('generated', path) })
}
