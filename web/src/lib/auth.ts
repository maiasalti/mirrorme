import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

/**
 * Single auth gate for all API routes. The extension sends
 * `Authorization: Bearer <supabase access token>`; the web app relies on its
 * cookie session. Never trusts a client-supplied user id.
 */
export async function getUserId(req: Request): Promise<string | null> {
  const header = req.headers.get('authorization')
  if (header?.startsWith('Bearer ')) {
    const jwt = header.slice('Bearer '.length)
    const { data, error } = await createAdminClient().auth.getClaims(jwt)
    if (error || !data?.claims?.sub) return null
    return data.claims.sub
  }

  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  return (data?.claims?.sub as string | undefined) ?? null
}

export function unauthorized() {
  return Response.json({ error: 'Not signed in' }, { status: 401 })
}
