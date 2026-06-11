import { getUserId, unauthorized } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'

type Ctx = { params: Promise<{ id: string }> }

export async function DELETE(req: Request, ctx: Ctx) {
  const userId = await getUserId(req)
  if (!userId) return unauthorized()
  const { id } = await ctx.params

  const admin = createAdminClient()
  const { data: photo } = await admin
    .from('photos')
    .select('id, storage_path, user_id')
    .eq('id', id)
    .single()
  if (!photo || photo.user_id !== userId) {
    return Response.json({ error: 'Photo not found' }, { status: 404 })
  }

  const { error: rmError } = await admin.storage.from('photos').remove([photo.storage_path])
  if (rmError) return Response.json({ error: rmError.message }, { status: 500 })

  const { error } = await admin.from('photos').delete().eq('id', id)
  if (error) return Response.json({ error: error.message }, { status: 500 })

  return Response.json({ ok: true })
}

/** PATCH { isDefault: true } — make this photo the base-photo default. */
export async function PATCH(req: Request, ctx: Ctx) {
  const userId = await getUserId(req)
  if (!userId) return unauthorized()
  const { id } = await ctx.params

  const body = await req.json().catch(() => null)
  if (body?.isDefault !== true) {
    return Response.json({ error: 'Only { isDefault: true } is supported' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data: photo } = await admin
    .from('photos')
    .select('id, user_id')
    .eq('id', id)
    .single()
  if (!photo || photo.user_id !== userId) {
    return Response.json({ error: 'Photo not found' }, { status: 404 })
  }

  await admin.from('photos').update({ is_default: false }).eq('user_id', userId)
  const { error } = await admin.from('photos').update({ is_default: true }).eq('id', id)
  if (error) return Response.json({ error: error.message }, { status: 500 })

  return Response.json({ ok: true })
}
