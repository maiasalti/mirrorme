import { getUserId, unauthorized } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { signedUrl } from '@/lib/storage'

export async function GET(req: Request) {
  const userId = await getUserId(req)
  if (!userId) return unauthorized()

  const admin = createAdminClient()
  const { data: rows, error } = await admin
    .from('photos')
    .select('id, storage_path, is_default, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  if (error) return Response.json({ error: error.message }, { status: 500 })

  const photos = await Promise.all(
    rows.map(async (p) => ({
      id: p.id,
      isDefault: p.is_default,
      createdAt: p.created_at,
      url: await signedUrl('photos', p.storage_path),
    }))
  )
  return Response.json({ photos })
}

export async function POST(req: Request) {
  const userId = await getUserId(req)
  if (!userId) return unauthorized()

  const body = await req.json().catch(() => null)
  const storagePath: unknown = body?.storagePath
  if (typeof storagePath !== 'string' || !storagePath.startsWith(`${userId}/`) || storagePath.includes('..')) {
    return Response.json({ error: 'Invalid storagePath' }, { status: 400 })
  }

  const admin = createAdminClient()

  // First photo becomes the default automatically.
  const { count } = await admin
    .from('photos')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
  const isDefault = Boolean(body?.isDefault) || count === 0

  if (isDefault) {
    await admin.from('photos').update({ is_default: false }).eq('user_id', userId)
  }

  const { data: row, error } = await admin
    .from('photos')
    .insert({ user_id: userId, storage_path: storagePath, is_default: isDefault })
    .select('id, storage_path, is_default, created_at')
    .single()
  if (error) return Response.json({ error: error.message }, { status: 500 })

  return Response.json(
    {
      photo: {
        id: row.id,
        isDefault: row.is_default,
        createdAt: row.created_at,
        url: await signedUrl('photos', row.storage_path),
      },
    },
    { status: 201 }
  )
}
