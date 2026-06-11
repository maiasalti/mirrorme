/// <reference types="vite/client" />

// CRXJS: importing with ?script returns the built file path for
// chrome.scripting.executeScript.
declare module '*?script' {
  const scriptPath: string
  export default scriptPath
}

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  readonly VITE_API_BASE_URL: string
  readonly VITE_GOOGLE_OAUTH_CLIENT_ID: string
  readonly VITE_CRX_PUBLIC_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
