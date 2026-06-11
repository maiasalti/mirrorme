import { createAdminClient } from '@/lib/supabase/admin'

export const SIGNED_URL_TTL = 3600 // seconds

export const photoPath = (userId: string, photoId: string, ext: string) =>
  `${userId}/${photoId}.${ext}`

export const tryonPath = (userId: string, tryonId: string) =>
  `${userId}/${tryonId}.png`

export async function signedUrl(bucket: 'photos' | 'generated', path: string) {
  const { data, error } = await createAdminClient()
    .storage.from(bucket)
    .createSignedUrl(path, SIGNED_URL_TTL)
  if (error) throw error
  return data.signedUrl
}

/** Download an object server-side; returns base64 bytes + mime. */
export async function downloadAsBase64(bucket: 'photos' | 'generated', path: string) {
  const { data, error } = await createAdminClient().storage.from(bucket).download(path)
  if (error || !data) throw new Error(`Storage download failed: ${error?.message}`)
  const buf = Buffer.from(await data.arrayBuffer())
  return {
    data: buf.toString('base64'),
    mimeType: data.type || 'image/jpeg',
  }
}

/** Remove every object under `${userId}/` in a bucket (paginated). */
export async function removeUserFolder(bucket: 'photos' | 'generated', userId: string) {
  const storage = createAdminClient().storage.from(bucket)
  for (;;) {
    const { data: items, error } = await storage.list(userId, { limit: 100 })
    if (error) throw error
    if (!items?.length) return
    const { error: rmError } = await storage.remove(
      items.map((i) => `${userId}/${i.name}`)
    )
    if (rmError) throw rmError
    if (items.length < 100) return
  }
}
