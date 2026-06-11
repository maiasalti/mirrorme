import { supabase } from './supabase'

/**
 * Official Supabase Chrome-extension flow: launchWebAuthFlow straight to
 * Google with response_type=id_token, then signInWithIdToken. Requires a
 * Google OAuth client of type "Chrome Extension" registered in the Supabase
 * Google provider's Client IDs (see README → Setup).
 */
export async function signInWithGoogle(): Promise<void> {
  const oauth2 = chrome.runtime.getManifest().oauth2
  if (!oauth2?.client_id) {
    throw new Error(
      'Google sign-in is not configured — set VITE_GOOGLE_OAUTH_CLIENT_ID and rebuild.'
    )
  }

  const url = new URL('https://accounts.google.com/o/oauth2/auth')
  url.searchParams.set('client_id', oauth2.client_id)
  url.searchParams.set('response_type', 'id_token')
  url.searchParams.set('access_type', 'offline')
  url.searchParams.set('redirect_uri', `https://${chrome.runtime.id}.chromiumapp.org`)
  url.searchParams.set('scope', (oauth2.scopes ?? ['openid', 'email', 'profile']).join(' '))

  const redirectedTo = await chrome.identity.launchWebAuthFlow({
    url: url.href,
    interactive: true,
  })
  if (!redirectedTo) throw new Error('Sign-in was cancelled')

  const hash = new URL(redirectedTo).hash.replace(/^#/, '')
  const idToken = new URLSearchParams(hash).get('id_token')
  if (!idToken) throw new Error('Google did not return an id_token')

  const { error } = await supabase.auth.signInWithIdToken({
    provider: 'google',
    token: idToken,
  })
  if (error) throw error
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut()
}
