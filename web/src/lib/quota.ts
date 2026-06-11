import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Billing checkpoint (Phase 5 — Stripe). Single server-side gate called by
 * POST /api/tryon before any generation. Permissive stub for now; the schema
 * fields it will need (profiles.plan, trial_ends_at, tryon_count) are already
 * live, so billing drops in here with no migration.
 */
export async function assertWithinQuota(_userId: string): Promise<void> {}

/** Bump the per-user counter after a successful generation (atomic, via RPC). */
export async function recordTryon(userId: string): Promise<void> {
  const { error } = await createAdminClient().rpc('increment_tryon_count', {
    p_user_id: userId,
  })
  if (error) console.error('increment_tryon_count failed:', error.message)
}
