import { crx } from '@crxjs/vite-plugin'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import { makeManifest } from './manifest.config'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react(), crx({ manifest: makeManifest(env) })],
    server: {
      // Vite 6+ default CORS blocks the extension origin in dev.
      cors: { origin: [/chrome-extension:\/\//] },
    },
  }
})
