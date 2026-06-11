'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export function SignInButton() {
  const [busy, setBusy] = useState(false)

  async function signIn() {
    setBusy(true)
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${location.origin}/auth/callback` },
    })
    if (error) setBusy(false)
  }

  return (
    <button
      onClick={signIn}
      disabled={busy}
      className="bg-ink px-7 py-3.5 text-sm font-semibold uppercase tracking-widest text-paper transition-colors hover:bg-accent disabled:opacity-60"
    >
      {busy ? 'Redirecting…' : 'Sign in with Google'}
    </button>
  )
}
