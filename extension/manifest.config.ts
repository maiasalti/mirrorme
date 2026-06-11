import { defineManifest } from '@crxjs/vite-plugin'
import pkg from './package.json'

/**
 * Permissions (local-first edition — nothing leaves the user's machine except
 * direct calls to Google's Gemini API with the user's own key):
 * - activeTab + scripting: inject the garment picker ONLY when the user
 *   clicks the MirrorMe action. No standing access to any site.
 * - storage + unlimitedStorage: photos, settings, and try-on history live
 *   locally (chrome.storage + IndexedDB).
 * - host_permissions http(s)://*: required to download the product image the
 *   user selected (stores serve images from arbitrary CDNs) and to call
 *   generativelanguage.googleapis.com.
 */
export function makeManifest(env: Record<string, string | undefined>) {
  return defineManifest({
    manifest_version: 3,
    // Chrome 120 removed the two SW kill rules (>5min task, >30s fetch) that
    // could otherwise terminate a generation mid-flight despite the heartbeat.
    minimum_chrome_version: '120',
    name: 'MirrorMe — virtual try-on',
    version: pkg.version,
    description:
      'See it on you before you buy. Try clothing from any store on a photo of yourself — private, local, your own Gemini key.',
    icons: { '16': 'icons/16.png', '48': 'icons/48.png', '128': 'icons/128.png' },
    action: {
      default_popup: 'src/popup/index.html',
      default_title: 'MirrorMe try-on',
    },
    options_ui: { page: 'src/options/index.html', open_in_tab: true },
    background: { service_worker: 'src/background.ts', type: 'module' },
    permissions: ['activeTab', 'scripting', 'storage', 'unlimitedStorage'],
    host_permissions: ['http://*/*', 'https://*/*'],
    ...(env.VITE_CRX_PUBLIC_KEY ? { key: env.VITE_CRX_PUBLIC_KEY } : {}),
  })
}
