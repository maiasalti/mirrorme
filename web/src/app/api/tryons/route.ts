import { getUserId, unauthorized } from '@/lib/auth'
import { signedUrl } from '@/lib/storage'
import { createAdminClient } from '@/lib/supabase/admin'

/** Try-on history, newest first — powers the gallery and the chaining picker. */
export async function GET(req: Request) {
  const userId = await getUserId(req)
  if (!userId) return unauthorized()

  const { data: rows, error } = await createAdminClient()
    .from('tryons')
    .select('id, base_photo_id, parent_tryon_id, garment_source_url, result_storage_path, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(100)
  if (error) return Response.json({ error: error.message }, { status: 500 })

  const tryons = await Promise.all(
    rows.map(async (t) => ({
      id: t.id,
      basePhotoId: t.base_photo_id,
      parentTryonId: t.parent_tryon_id,
      garmentSourceUrl: t.garment_source_url,
      createdAt: t.created_at,
      resultUrl: await signedUrl('generated', t.result_storage_path),
    }))
  )
  return Response.json({ tryons })
}
