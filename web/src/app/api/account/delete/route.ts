import { getUserId, unauthorized } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { removeUserFolder } from '@/lib/storage'

/**
 * "Delete my photos & data": removes every stored photo and generated image,
 * all database rows, and the auth account itself.
 */
export async function POST(req: Request) {
  const userId = await getUserId(req)
  if (!userId) return unauthorized()

  const admin = createAdminClient()
  try {
    await removeUserFolder('photos', userId)
    await removeUserFolder('generated', userId)
  } catch (e) {
    return Response.json(
      { error: `Failed to delete stored images: ${(e as Error).message}` },
      { status: 500 }
    )
  }

  // tryons + photos cascade from the profile delete; do them explicitly anyway
  // so a partial failure never leaves orphaned rows behind a deleted account.
  await admin.from('tryons').delete().eq('user_id', userId)
  await admin.from('photos').delete().eq('user_id', userId)
  await admin.from('profiles').delete().eq('id', userId)

  const { error } = await admin.auth.admin.deleteUser(userId)
  if (error) return Response.json({ error: error.message }, { status: 500 })

  return Response.json({ ok: true })
}
