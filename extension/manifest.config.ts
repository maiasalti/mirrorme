import { defineManifest } from '@crxjs/vite-plugin'
import pkg from './package.json'

/**
 * Permissions, minimal by design (Web Store review):
 * - activeTab + scripting: inject the garment picker ONLY when the user
 *   clicks the MirrorMe action on a page. No site access otherwise.
 * - storage: persist the Supabase session + pending garment selection.
 * - identity: Google sign-in via launchWebAuthFlow.
 * - host_permissions: only our own backend + our Supabase project — no
 *   third-party site access.
 */
export function makeManifest(env: Record<string, string | undefined>) {
  const apiOrigin = new URL(env.VITE_API_BASE_URL || 'http://localhost:3000').origin
  const supabaseOrigin = env.VITE_SUPABASE_URL
    ? new URL(env.VITE_SUPABASE_URL).origin
    : null
  const clientId = env.VITE_GOOGLE_OAUTH_CLIENT_ID

  return defineManifest({
    manifest_version: 3,
    name: 'MirrorMe — virtual try-on',
    version: pkg.version,
    description: 'See it on you before you buy. Try clothing from any store on a photo of yourself.',
    icons: { '16': 'icons/16.png', '48': 'icons/48.png', '128': 'icons/128.png' },
    action: {
      default_popup: 'src/popup/index.html',
      default_title: 'MirrorMe try-on',
    },
    background: { service_worker: 'src/background.ts', type: 'module' },
    permissions: ['activeTab', 'scripting', 'storage', 'identity'],
    host_permissions: [
      `${apiOrigin}/*`,
      ...(supabaseOrigin ? [`${supabaseOrigin}/*`] : []),
    ],
    ...(clientId
      ? { oauth2: { client_id: clientId, scopes: ['openid', 'email', 'profile'] } }
      : {}),
    ...(env.VITE_CRX_PUBLIC_KEY ? { key: env.VITE_CRX_PUBLIC_KEY } : {}),
  })
}
