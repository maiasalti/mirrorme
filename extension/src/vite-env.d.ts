/// <reference types="vite/client" />

// CRXJS: importing with ?script returns the built file path for
// chrome.scripting.executeScript.
declare module '*?script' {
  const scriptPath: string
  export default scriptPath
}

interface ImportMetaEnv {
  /** Optional: pins a stable extension id during development. */
  readonly VITE_CRX_PUBLIC_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
